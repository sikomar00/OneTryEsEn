"""IP별 호출 제한 (같은 와이파이 공유 시 한 사람이 내 쿼터를 독점하지 못하게)."""
import threading
import time


# 같은 와이파이에 공유할 때 한 사람이 내 NVIDIA 쿼터를 독점하지 못하게 IP별로 제한한다.
# (조회 1회 = lookup 1 + align 1 이 될 수 있어 넉넉하게 잡았다.)
RATE_LIMIT = 16          # 1분당 호출 수 (IP별, lookup+align 합산)


_hits = {}


_hits_lock = threading.Lock()


def rate_ok(ip):
    now = time.time()
    with _hits_lock:
        q = [t for t in _hits.get(ip, []) if now - t < 60]
        if len(q) >= RATE_LIMIT:
            _hits[ip] = q
            return False
        q.append(now)
        _hits[ip] = q
        if len(_hits) > 500:                       # 메모리 상한
            for k in [k for k, v in _hits.items() if not v or now - v[-1] > 60]:
                del _hits[k]
        return True
