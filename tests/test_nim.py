import json
import socket
import unittest
import urllib.error
from unittest import mock

from server import nim
from server.cache import cache


def good_lookup_json(src="es"):
    return json.dumps({
        "source_lang": src, "ambiguous": False,
        "translations": {"en": "water", "ko": "물"},
        "alternatives": {"en": ["H2O", "", 5, "x", "y", "z"], "ko": []},
        "pos": "noun", "example": {"en": "a", "es": "b", "ko": "c", "fr": "ignored"}, "note": "메모",
    }, ensure_ascii=False)


class ParseModelJsonTest(unittest.TestCase):
    def test_parses_fenced_json(self):
        out = nim.parse_model_json("```json\n" + good_lookup_json() + "\n```", "auto")
        self.assertEqual(out["source_lang"], "es")
        self.assertEqual(out["translations"], {"en": "water", "ko": "물"})
        self.assertEqual(out["alternatives"]["en"], ["H2O", "x", "y"])     # 빈 값·비문자열 제거, 최대 3개
        self.assertNotIn("fr", out["example"])

    def test_source_hint_overrides_model_and_clears_ambiguous(self):
        # 사용자가 입력 언어를 en 으로 강제하면 모델의 판정(es)은 무시하고, es·ko 번역을 요구한다
        d = {"source_lang": "es", "ambiguous": True, "translations": {"es": "agua", "ko": "물"}}
        out = nim.parse_model_json(json.dumps(d, ensure_ascii=False), "en")
        self.assertEqual(out["source_lang"], "en")
        self.assertFalse(out["ambiguous"])
        self.assertEqual(set(out["translations"]), {"es", "ko"})

    def test_forced_source_requires_translations_for_the_other_two(self):
        with self.assertRaises(RuntimeError):                      # en 강제인데 en·ko 번역만 온 경우
            nim.parse_model_json(good_lookup_json("es"), "en")

    def test_rejects_bad_payloads(self):
        for bad in ["no json at all",
                    '{"source_lang": "fr", "translations": {}}',
                    '{"source_lang": "es", "translations": {"en": "water"}}',      # ko 누락
                    '{"source_lang": "es", "translations": {"en": "w", "ko": " "}}']:
            with self.subTest(bad=bad):
                with self.assertRaises(RuntimeError):
                    nim.parse_model_json(bad, "auto")


class AlignParserTest(unittest.TestCase):
    TEXTS = {"en": "I watched a movie", "es": "Vi una película", "ko": "저는 영화를 봤어요"}

    def parse(self, units):
        return nim.make_align_parser(self.TEXTS)(json.dumps({"units": units}, ensure_ascii=False))

    def test_keeps_real_substrings(self):
        out = self.parse([{"en": "I", "es": "", "ko": "저는", "gloss": "나"},
                          {"en": "watched", "es": "Vi", "ko": "봤어요", "gloss": "보다"},
                          {"en": "a movie", "es": "una película", "ko": "영화를", "gloss": "영화"}])
        self.assertEqual(len(out["units"]), 3)
        self.assertEqual(out["units"][0]["es"], "")

    def test_drops_hallucinated_pieces(self):
        out = self.parse([{"en": "I", "es": "Yo", "ko": "저는"},          # "Yo" 는 문장에 없음
                          {"en": "movie", "es": "película", "ko": "영화를"}])
        self.assertEqual(out["units"][0]["es"], "")
        self.assertEqual(out["units"][1]["es"], "película")

    def test_does_not_reuse_a_piece(self):
        out = self.parse([{"en": "movie", "es": "", "ko": ""},
                          {"en": "movie", "es": "película", "ko": ""}])
        self.assertEqual(out["units"][0]["en"], "movie")
        self.assertEqual(out["units"][1]["en"], "")

    def test_needs_at_least_two_units(self):
        with self.assertRaises(RuntimeError):
            self.parse([{"en": "I", "es": "", "ko": ""}])


class FakeResp:
    def __init__(self, payload):
        self._b = json.dumps(payload).encode()

    def read(self):
        return self._b

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def chat(content):
    return FakeResp({"choices": [{"message": {"content": content}}]})


def http_error(code):
    return urllib.error.HTTPError("u", code, "x", {}, None)


class RunModelsTest(unittest.TestCase):
    def setUp(self):
        cache._d.clear()
        for target, kw in [("server.nim.api_key", {"return_value": "test-key"}),
                           ("server.nim.model_candidates", {"return_value": ["m1", "m2", "m3"]})]:
            p = mock.patch(target, **kw)
            p.start()
            self.addCleanup(p.stop)

    def run_with(self, side_effects, parse=None):
        with mock.patch("server.nim.urllib.request.urlopen", side_effect=side_effects) as uo:
            out = nim.run_models("sys", "user", parse or (lambda c: {"ok": c}))
        return out, uo

    def test_falls_back_on_410_and_timeout(self):
        out, uo = self.run_with([http_error(410), socket.timeout(), chat("fine")])
        self.assertEqual(out, {"ok": "fine", "model": "m3"})
        self.assertEqual(uo.call_count, 3)

    def test_parse_failure_goes_to_next_model(self):
        def parse(c):
            if c == "bad":
                raise RuntimeError("bad")
            return {"v": c}
        out, _ = self.run_with([chat("bad"), chat("good")], parse)
        self.assertEqual(out["model"], "m2")

    def test_auth_error_stops_immediately(self):
        with mock.patch("server.nim.urllib.request.urlopen", side_effect=[http_error(401)]) as uo:
            with self.assertRaisesRegex(RuntimeError, "거부"):
                nim.run_models("s", "u", lambda c: {})
        self.assertEqual(uo.call_count, 1)

    def test_rate_limit_error_stops_immediately(self):
        with mock.patch("server.nim.urllib.request.urlopen", side_effect=[http_error(429)]):
            with self.assertRaisesRegex(RuntimeError, "429"):
                nim.run_models("s", "u", lambda c: {})

    def test_all_models_fail_reports_each(self):
        with mock.patch("server.nim.urllib.request.urlopen",
                        side_effect=[http_error(404), http_error(410), socket.timeout()]):
            with self.assertRaisesRegex(RuntimeError, "m1.*m2.*m3"):
                nim.run_models("s", "u", lambda c: {})

    def test_missing_key(self):
        with mock.patch("server.nim.api_key", return_value=""):
            with self.assertRaisesRegex(RuntimeError, "NVIDIA_API_KEY"):
                nim.run_models("s", "u", lambda c: {})


class CachedCallsTest(unittest.TestCase):
    def setUp(self):
        cache._d.clear()
        p = mock.patch("server.nim.api_key", return_value="test-key")
        p.start()
        self.addCleanup(p.stop)

    def test_same_lookup_hits_cache_second_time(self):
        with mock.patch("server.nim.urllib.request.urlopen", side_effect=[chat(good_lookup_json())]) as uo:
            a = nim.call_nvidia("agua", "auto")
            b = nim.call_nvidia("agua", "auto")
        self.assertEqual(uo.call_count, 1)
        self.assertNotIn("cached", a)
        self.assertTrue(b["cached"])

    def test_different_hint_is_a_different_entry(self):
        with mock.patch("server.nim.urllib.request.urlopen",
                        side_effect=[chat(good_lookup_json()), chat(good_lookup_json())]) as uo:
            nim.call_nvidia("agua", "auto")
            nim.call_nvidia("agua", "es")
        self.assertEqual(uo.call_count, 2)

    def test_failures_are_not_cached(self):
        with mock.patch("server.nim.model_candidates", return_value=["m1"]):
            with mock.patch("server.nim.urllib.request.urlopen", side_effect=[http_error(404)]):
                with self.assertRaises(RuntimeError):
                    nim.call_nvidia("agua", "auto")
            with mock.patch("server.nim.urllib.request.urlopen",
                            side_effect=[chat(good_lookup_json())]) as uo:
                nim.call_nvidia("agua", "auto")
        self.assertEqual(uo.call_count, 1)


if __name__ == "__main__":
    unittest.main()
