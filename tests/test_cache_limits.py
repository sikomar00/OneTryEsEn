import unittest
from unittest import mock

from server import limits
from server.cache import TTLCache


class TTLCacheTest(unittest.TestCase):
    def test_get_set(self):
        c = TTLCache()
        self.assertIsNone(c.get("a"))
        c.set("a", 1)
        self.assertEqual(c.get("a"), 1)

    def test_expires(self):
        c = TTLCache(ttl=10)
        with mock.patch("server.cache.time.time", return_value=1000):
            c.set("a", 1)
        with mock.patch("server.cache.time.time", return_value=1011):
            self.assertIsNone(c.get("a"))

    def test_lru_eviction_keeps_recently_used(self):
        c = TTLCache(size=2)
        c.set("a", 1)
        c.set("b", 2)
        c.get("a")              # a 를 최근 사용으로
        c.set("c", 3)           # b 가 밀려나야 함
        self.assertIsNone(c.get("b"))
        self.assertEqual(c.get("a"), 1)
        self.assertEqual(c.get("c"), 3)


class RateLimitTest(unittest.TestCase):
    def setUp(self):
        limits._hits.clear()

    def test_blocks_after_limit_per_ip(self):
        results = [limits.rate_ok("1.1.1.1") for _ in range(limits.RATE_LIMIT + 2)]
        self.assertTrue(all(results[:limits.RATE_LIMIT]))
        self.assertEqual(results[limits.RATE_LIMIT:], [False, False])

    def test_other_ip_unaffected(self):
        for _ in range(limits.RATE_LIMIT + 1):
            limits.rate_ok("1.1.1.1")
        self.assertTrue(limits.rate_ok("2.2.2.2"))

    def test_window_slides(self):
        with mock.patch("server.limits.time.time", return_value=1000):
            for _ in range(limits.RATE_LIMIT):
                limits.rate_ok("3.3.3.3")
            self.assertFalse(limits.rate_ok("3.3.3.3"))
        with mock.patch("server.limits.time.time", return_value=1061):
            self.assertTrue(limits.rate_ok("3.3.3.3"))


if __name__ == "__main__":
    unittest.main()
