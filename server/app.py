"""HTTP 서버: 정적 파일(web/) 서빙 + /api/* 프록시."""
import argparse
import http.server
import json
import os
import socket
import threading
import urllib.parse
import urllib.request
import webbrowser

from .config import LANGS, MAX_CHARS, WEB_DIR, api_key, model_name
from .limits import RATE_LIMIT, rate_ok
from .nim import call_align, call_nvidia
from .wiki import wikipedia_summary, wiktionary_lookup


# 정적 파일은 web/ 안의 이 확장자만 내보낸다 (기획서·.env·서버 소스 노출 방지).
# 확장자별 타입을 직접 지정한다: Windows 레지스트리 설정에 따라 .js 가 text/plain 으로 나가면 ES 모듈이 막힌다.
STATIC_TYPES = {".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
                ".js": "text/javascript; charset=utf-8"}


def resolve_static(url_path):
    """URL 경로 -> (파일 경로, Content-Type). web/ 밖이거나 허용 확장자가 아니면 None."""
    rel = urllib.parse.unquote(url_path).lstrip("/") or "index.html"
    root = os.path.realpath(WEB_DIR)
    full = os.path.realpath(os.path.join(root, rel))
    try:
        if os.path.commonpath([full, root]) != root:
            return None
    except ValueError:                      # 다른 드라이브 등
        return None
    ctype = STATIC_TYPES.get(os.path.splitext(full)[1].lower())
    if not ctype or not os.path.isfile(full):
        return None
    return full, ctype


class Handler(http.server.BaseHTTPRequestHandler):
    def host_ok(self):
        host = (self.headers.get("Host") or "").split(":")[0]
        return self.server.lan or host in ("localhost", "127.0.0.1", "[::1]")

    def send_json(self, code, obj):
        data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if not self.host_ok():
            return self.send_json(403, {"error": "허용되지 않은 Host"})
        path = self.path.split("?")[0]
        if path == "/api/status":
            return self.send_json(200, {"nvidia": bool(api_key()), "model": model_name()})
        if path in ("/api/wiktionary", "/api/wikipedia"):
            qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            g = lambda k: (qs.get(k) or [""])[0]
            try:
                if path == "/api/wiktionary":
                    if g("lang") not in LANGS:
                        return self.send_json(400, {"error": "lang 오류"})
                    return self.send_json(200, wiktionary_lookup(g("word"), g("lang"), g("check")))
                return self.send_json(200, wikipedia_summary(g("title")))
            except RuntimeError as e:
                return self.send_json(502, {"error": str(e)})
        found = resolve_static(path)
        if not found:
            return self.send_json(404, {"error": "not found"})
        with open(found[0], "rb") as f:
            data = f.read()
        self.send_response(200)
        self.send_header("Content-Type", found[1])
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        if not self.host_ok():
            return self.send_json(403, {"error": "허용되지 않은 Host"})
        route = self.path.split("?")[0]
        if route in ("/api/lookup", "/api/align") and not rate_ok(self.client_address[0]):
            return self.send_json(429, {"error": "너무 자주 조회했어요. 잠시 후 다시 시도해 주세요. (1분에 %d회까지)" % RATE_LIMIT})
        if route == "/api/align":
            return self.handle_align()
        if route != "/api/lookup":
            return self.send_json(404, {"error": "not found"})
        try:
            n = int(self.headers.get("Content-Length") or 0)
            if n <= 0 or n > 8192:
                raise ValueError
            req = json.loads(self.rfile.read(n).decode("utf-8"))
            text = str(req.get("text", "")).strip()
            hint = req.get("source", "auto")
        except (ValueError, json.JSONDecodeError, UnicodeDecodeError):
            return self.send_json(400, {"error": "잘못된 요청"})
        if not text:
            return self.send_json(400, {"error": "입력이 비어 있음"})
        if len(text) > MAX_CHARS:
            return self.send_json(400, {"error": "입력은 %d자 이하여야 합니다" % MAX_CHARS})
        try:
            return self.send_json(200, call_nvidia(text, hint))
        except RuntimeError as e:
            return self.send_json(502, {"error": str(e)})

    def handle_align(self):
        try:
            n = int(self.headers.get("Content-Length") or 0)
            if n <= 0 or n > 8192:
                raise ValueError
            texts = json.loads(self.rfile.read(n).decode("utf-8")).get("texts")
            if not isinstance(texts, dict) or any(
                    not isinstance(texts.get(l), str) or not texts[l].strip() or len(texts[l]) > MAX_CHARS
                    for l in LANGS):
                raise ValueError
            texts = {l: texts[l].strip() for l in LANGS}
        except (ValueError, json.JSONDecodeError, UnicodeDecodeError):
            return self.send_json(400, {"error": "잘못된 요청"})
        try:
            return self.send_json(200, call_align(texts))
        except RuntimeError as e:
            return self.send_json(502, {"error": str(e)})

    def log_message(self, fmt, *args):  # 입력 문장이 콘솔에 쌓이지 않게 요청 줄을 생략
        pass


class Server(http.server.ThreadingHTTPServer):
    allow_reuse_address = True
    lan = False


def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"
    finally:
        s.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lan", action="store_true", help="같은 네트워크의 다른 기기에도 열기")
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--no-browser", action="store_true")
    ap.add_argument("--list-models", action="store_true", help="현재 제공 중인 NVIDIA 모델 ID 출력 후 종료")
    args = ap.parse_args()

    if args.list_models:
        with urllib.request.urlopen("https://integrate.api.nvidia.com/v1/models", timeout=20) as r:
            for m in sorted(x["id"] for x in json.loads(r.read().decode("utf-8"))["data"]):
                print(m)
        return

    bind = "0.0.0.0" if args.lan else "127.0.0.1"
    try:
        httpd = Server((bind, args.port), Handler)
    except OSError as e:
        raise SystemExit("포트 %d 를 열 수 없음: %s\n--port 로 다른 포트를 지정하세요." % (args.port, e))
    httpd.lan = args.lan

    url = "http://localhost:%d" % args.port
    print("=" * 56)
    print(" 내 브라우저용 주소 :", url)
    if args.lan:
        print(" 같은 와이파이용    : http://%s:%d" % (get_local_ip(), args.port))
        print(" [경고] LAN 공개 중 — 누구나 내 NVIDIA 키 쿼터를 쓸 수 있습니다")
    print(" NVIDIA 키          :", "설정됨 (모델 %s)" % model_name() if api_key()
          else "없음 → .env 에 NVIDIA_API_KEY=... 추가 (지금은 MyMemory 대체 모드)")
    print(" 종료: Ctrl + C")
    print("=" * 56)
    if not args.no_browser:
        threading.Timer(1.0, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n서버를 종료합니다.")
