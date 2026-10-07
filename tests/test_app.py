"""실제 서버를 임시 포트에 띄워 정적 파일 서빙·보안 규칙·API 입력 검증을 확인한다 (외부 네트워크 호출 없음)."""
import http.client
import json
import threading
import unittest
from unittest import mock

from server import app, limits


class ServerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.httpd = app.Server(("127.0.0.1", 0), app.Handler)
        cls.port = cls.httpd.server_address[1]
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()

    def setUp(self):
        limits._hits.clear()

    def request(self, method, path, body=None, headers=None):
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        h = dict(headers or {})
        if body is not None:
            body = json.dumps(body).encode()
            h["Content-Type"] = "application/json"
        c.request(method, path, body=body, headers=h)
        r = c.getresponse()
        data = r.read()
        c.close()
        return r.status, r.getheader("Content-Type"), data

    # ── 정적 파일 ────────────────────────────────────
    def test_index_and_assets_have_correct_types(self):
        for path, ctype in [("/", "text/html"), ("/index.html", "text/html"),
                            ("/css/style.css", "text/css"), ("/js/main.js", "text/javascript")]:
            with self.subTest(path=path):
                status, ct, data = self.request("GET", path)
                self.assertEqual(status, 200)
                self.assertTrue(ct.startswith(ctype), ct)
                self.assertTrue(data)

    def test_all_js_modules_are_served(self):
        for name in ["util", "engines", "vocab", "render", "extras", "arena", "main"]:
            self.assertEqual(self.request("GET", "/js/%s.js" % name)[0], 200, name)

    def test_private_files_and_traversal_are_blocked(self):
        for path in ["/serve.py", "/server/config.py", "/.env", "/.env.example",
                     "/%EA%B8%B0%ED%9A%8D_%ED%95%9C%EC%9E%A5.md",
                     "/../serve.py", "/%2e%2e/serve.py", "/..%2f.env", "/js/../../serve.py",
                     "/css/", "/js", "/nope.js"]:
            with self.subTest(path=path):
                self.assertEqual(self.request("GET", path)[0], 404)

    # ── API ─────────────────────────────────────────
    def test_status_never_exposes_the_key(self):
        with mock.patch("server.app.api_key", return_value="nvapi-SECRET-VALUE"):
            status, _, data = self.request("GET", "/api/status")
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(data)["nvidia"], True)
        self.assertNotIn(b"SECRET", data)

    def test_foreign_host_header_is_rejected(self):
        self.assertEqual(self.request("GET", "/api/status", headers={"Host": "evil.example"})[0], 403)
        self.assertEqual(self.request("POST", "/api/lookup", {"text": "x"}, headers={"Host": "evil.example"})[0], 403)

    def test_lookup_validation(self):
        self.assertEqual(self.request("POST", "/api/lookup", {"text": "   "})[0], 400)
        self.assertEqual(self.request("POST", "/api/lookup", {"text": "a" * 501})[0], 400)
        c = http.client.HTTPConnection("127.0.0.1", self.port)
        c.request("POST", "/api/lookup", body=b"not json", headers={"Content-Length": "8"})
        self.assertEqual(c.getresponse().status, 400)

    def test_lookup_success_and_error_mapping(self):
        with mock.patch("server.app.call_nvidia", return_value={"source_lang": "es"}) as m:
            status, _, data = self.request("POST", "/api/lookup", {"text": "agua", "source": "auto"})
        self.assertEqual((status, json.loads(data)["source_lang"]), (200, "es"))
        m.assert_called_once_with("agua", "auto")
        with mock.patch("server.app.call_nvidia", side_effect=RuntimeError("boom")):
            status, _, data = self.request("POST", "/api/lookup", {"text": "agua"})
        self.assertEqual((status, json.loads(data)["error"]), (502, "boom"))

    def test_align_validation(self):
        self.assertEqual(self.request("POST", "/api/align", {"texts": {"en": "a"}})[0], 400)
        self.assertEqual(self.request("POST", "/api/align", {"texts": {"en": "a", "es": "b", "ko": " "}})[0], 400)
        with mock.patch("server.app.call_align", return_value={"units": []}):
            self.assertEqual(self.request("POST", "/api/align", {"texts": {"en": "a", "es": "b", "ko": "c"}})[0], 200)

    def test_wiktionary_param_validation(self):
        self.assertEqual(self.request("GET", "/api/wiktionary?word=casa&lang=xx")[0], 400)

    def test_rate_limit_returns_429(self):
        with mock.patch("server.app.call_nvidia", return_value={}):
            codes = [self.request("POST", "/api/lookup", {"text": "x"})[0] for _ in range(limits.RATE_LIMIT + 1)]
        self.assertEqual(codes[:limits.RATE_LIMIT], [200] * limits.RATE_LIMIT)
        self.assertEqual(codes[-1], 429)

    def test_unknown_routes(self):
        self.assertEqual(self.request("POST", "/api/nope", {})[0], 404)
        self.assertEqual(self.request("GET", "/api/nope")[0], 404)


class ResolveStaticTest(unittest.TestCase):
    def test_only_allowed_extensions(self):
        self.assertIsNotNone(app.resolve_static("/index.html"))
        self.assertIsNone(app.resolve_static("/../serve.py"))
        self.assertIsNone(app.resolve_static("/css"))


if __name__ == "__main__":
    unittest.main()
