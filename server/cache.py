"""작은 TTL+LRU 캐시. 같은 질의를 다시 조회할 때 NVIDIA 호출(10~40초, 쿼터)을 아낀다."""
import threading
import time
from collections import OrderedDict


class TTLCache:
    def __init__(self, size=200, ttl=3600):
        self.size, self.ttl = size, ttl
        self._d = OrderedDict()
        self._lock = threading.Lock()

    def get(self, key):
        with self._lock:
            item = self._d.get(key)
            if not item:
                return None
            if time.time() - item[0] > self.ttl:
                del self._d[key]
                return None
            self._d.move_to_end(key)
            return item[1]

    def set(self, key, value):
        with self._lock:
            self._d[key] = (time.time(), value)
            self._d.move_to_end(key)
            while len(self._d) > self.size:
                self._d.popitem(last=False)


cache = TTLCache()
