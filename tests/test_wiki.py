import unittest
from unittest import mock

from server import wiki


def definition_payload(lang_name, sections):
    return {"x": [{"partOfSpeech": pos, "language": lang_name,
                   "definitions": [{"definition": d} for d in defs]} for pos, defs in sections]}


class StripHtmlTest(unittest.TestCase):
    def test_strips_tags_and_entities(self):
        self.assertEqual(wiki.strip_html('<span class="a">dog &amp; <b>cat</b></span>  x'), "dog & cat x")


class WiktionaryTest(unittest.TestCase):
    def lookup(self, payload, word="casa", lang="es", check="house"):
        with mock.patch("server.wiki.http_json", return_value=payload):
            return wiki.wiktionary_lookup(word, lang, check)

    def test_filters_inflection_and_other_languages(self):
        payload = {"en": [{"partOfSpeech": "Noun", "language": "English", "definitions": [{"definition": "ignored"}]}],
                   "es": [{"partOfSpeech": "Noun", "language": "Spanish", "definitions": [{"definition": "house"}]},
                          {"partOfSpeech": "Verb", "language": "Spanish", "definitions": [
                              {"definition": "inflection of casar:"}, {"definition": "third-person singular"}]}]}
        out = self.lookup(payload)
        self.assertTrue(out["found"])
        self.assertEqual([e["pos"] for e in out["entries"]], ["Noun"])     # 활용형만 있는 Verb 섹션은 사라짐
        self.assertEqual(out["entries"][0]["defs"], ["house"])

    def test_confirmed_true_and_false(self):
        p = definition_payload("Spanish", [("Noun", ["house"])])
        self.assertTrue(self.lookup(p, check="house")["confirmed"])
        self.assertFalse(self.lookup(p, check="banana")["confirmed"])

    def test_confirmed_uses_whole_word_match(self):
        p = definition_payload("Spanish", [("Noun", ["a household item"])])
        self.assertFalse(self.lookup(p, check="house")["confirmed"])        # household 안의 house 는 불인정

    def test_no_confirmation_for_english_source(self):
        p = definition_payload("English", [("Noun", ["dog"])])
        self.assertNotIn("confirmed", self.lookup(p, word="dog", lang="en", check="perro"))

    def test_not_found(self):
        self.assertEqual(self.lookup(None), {"found": False})

    def test_rejects_multiword_and_odd_input(self):
        for bad in ["two words", "a/b", "x?y", "", "a" * 61]:
            with self.subTest(bad=bad):
                with self.assertRaises(RuntimeError):
                    wiki.wiktionary_lookup(bad, "es", "")


class WikipediaTest(unittest.TestCase):
    def summary(self, payload, title="House"):
        with mock.patch("server.wiki.http_json", return_value=payload):
            return wiki.wikipedia_summary(title)

    def test_standard_page_with_thumb_host(self):
        out = self.summary({"type": "standard", "title": "House", "extract": "A house is...",
                            "thumbnail": {"source": "https://thumb.wikimedia.org/x.jpg"},
                            "content_urls": {"desktop": {"page": "https://en.wikipedia.org/wiki/House"}}})
        self.assertTrue(out["found"])
        self.assertEqual(out["thumbnail"], "https://thumb.wikimedia.org/x.jpg")

    def test_untrusted_thumbnail_host_is_dropped(self):
        out = self.summary({"type": "standard", "title": "X", "extract": "text",
                            "thumbnail": {"source": "https://evil.example/x.jpg"}})
        self.assertEqual(out["thumbnail"], "")

    def test_disambiguation_and_missing_excluded(self):
        self.assertEqual(self.summary({"type": "disambiguation", "title": "X"}), {"found": False})
        self.assertEqual(self.summary(None), {"found": False})

    def test_rejects_bad_titles(self):
        for bad in ["", "a/b", "x?y", "a#b", "t" * 81]:
            with self.subTest(bad=bad):
                with self.assertRaises(RuntimeError):
                    wiki.wikipedia_summary(bad)


if __name__ == "__main__":
    unittest.main()
