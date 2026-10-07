"""Wiktionary / Wikipedia (키 불필요, 읽기 전용). 브라우저가 아니라 서버가 호출한다."""
import html
import json
import re
import socket
import threading
import urllib.error
import urllib.parse
import urllib.request

from .config import LANG_NAME


# ---------------------------------------------------------------
# Wiktionary / Wikipedia (키 불필요, 읽기 전용). 브라우저가 아니라 서버가 호출한다.
# ---------------------------------------------------------------
WIKI_UA = "OneTryEsEn/1.0 (local language-learning tool)"


_cache = {}


_cache_lock = threading.Lock()


def http_json(url, timeout=10):
    with _cache_lock:
        if url in _cache:
            return _cache[url]
    req = urllib.request.Request(url, headers={"User-Agent": WIKI_UA, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            data = json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code == 404:
            data = None
        else:
            raise RuntimeError("외부 사전 오류 (%d)" % e.code)
    except (urllib.error.URLError, socket.timeout, TimeoutError, json.JSONDecodeError):
        raise RuntimeError("외부 사전에 연결하지 못함")
    with _cache_lock:
        if len(_cache) > 300:
            _cache.clear()
        _cache[url] = data
    return data


def strip_html(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", s or ""))).strip()


def wiktionary_lookup(word, lang, check):
    word = word.strip()
    if not word or len(word) > 60 or re.search(r"[\s/\\?#]", word):
        raise RuntimeError("단어 하나만 조회할 수 있어요")
    data = None
    for w in dict.fromkeys([word, word.lower()]):
        data = http_json("https://en.wiktionary.org/api/rest_v1/page/definition/" + urllib.parse.quote(w, safe=""))
        if data:
            break
    if not data:
        return {"found": False}
    entries = []
    for sections in data.values():
        for sec in sections:
            if sec.get("language") != LANG_NAME[lang]:
                continue
            defs = []
            for d in sec.get("definitions", []):
                t = strip_html(d.get("definition", ""))
                # 동사 활용형 안내("inflection of …", "third-person singular …")는 학습에 방해라 제외
                if t and not re.match(r"(inflection|(first|second|third)-person|.*\bform of\b)", t, re.I):
                    defs.append(t[:200])
                if len(defs) >= 3:
                    break
            if defs:
                entries.append({"pos": sec.get("partOfSpeech", ""), "defs": defs})
    entries = entries[:4]
    if not entries:
        return {"found": False}
    out = {"found": True, "entries": entries, "url": "https://en.wiktionary.org/wiki/" + urllib.parse.quote(word, safe="")}
    # 모델 번역(영어)이 사전 정의에 실제로 나오는지 대조 — 영어 외 입력일 때만 의미가 있다.
    if check and lang != "en":
        blob = " ".join(" ".join(e["defs"]) for e in entries).lower()
        out["confirmed"] = re.search(r"\b" + re.escape(check.strip().lower()) + r"\b", blob) is not None
    return out


def wikipedia_summary(title):
    title = title.strip()
    if not title or len(title) > 80 or re.search(r"[/\\?#]", title):
        raise RuntimeError("잘못된 제목")
    d = http_json("https://en.wikipedia.org/api/rest_v1/page/summary/" + urllib.parse.quote(title.replace(" ", "_"), safe=""))
    if not d or d.get("type") != "standard":      # 404, 동음이의(disambiguation) 제외
        return {"found": False}
    thumb = (d.get("thumbnail") or {}).get("source", "")
    if not re.match(r"https://(upload|thumb)\.wikimedia\.org/", thumb):
        thumb = ""
    extract = (d.get("extract") or "").strip()
    return {
        "found": bool(thumb or extract),
        "title": d.get("title", title),
        "extract": extract[:240],
        "thumbnail": thumb,
        "url": ((d.get("content_urls") or {}).get("desktop") or {}).get("page", ""),
    }
