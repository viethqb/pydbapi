"""
Gateway rate limiting (Phase 4, Task 4.2c): check_rate_limit.

Sliding window: N requests per minute per key (client_id or ip).
Redis (preferred) or in-memory fallback. Uses FLOW_CONTROL_RATE_LIMIT_*.

Fail-open: when Redis is unavailable or raises an error, check_rate_limit
returns True (allow). This avoids blocking traffic when Redis is down.
To fail closed (reject on Redis error), you would need a separate config.
"""

import threading
import time
import uuid

from app.core.config import settings
from app.core.redis_client import get_redis

_REDIS_KEY_PREFIX = "ratelimit:gateway:"
_memory: dict[str, list[float]] = {}
_memory_lock = threading.Lock()


def _check_redis(key: str, limit: int, window_sec: float) -> bool:
    k = _REDIS_KEY_PREFIX + key
    now = time.time()
    cutoff = now - window_sec
    r = get_redis(decode_responses=False)
    if r is None:
        return True  # no Redis: allow (in-memory will be used by caller)
    try:
        r.zremrangebyscore(k, "-inf", cutoff)
        n = r.zcard(k)
        if n >= limit:
            return False
        r.zadd(k, {str(uuid.uuid4()): now})
        r.expire(k, int(window_sec) + 1)
        return True
    except Exception:
        return True  # fail-open: on Redis error, allow


def _check_memory(key: str, limit: int, window_sec: float) -> bool:
    now = time.time()
    cutoff = now - window_sec
    with _memory_lock:
        arr = _memory.get(key, [])
        arr = [t for t in arr if t > cutoff]
        if len(arr) >= limit:
            return False
        arr.append(now)
        _memory[key] = arr
        return True


def check_rate_limit(key: str, limit: int | None = None) -> bool:
    """
    Rate limit by key. True = allow, False = over limit (caller should return 429).

    - If limit is None or <= 0: always True (no limit).
    - If FLOW_CONTROL_RATE_LIMIT_ENABLED is False: always True (kill switch).
    - Sliding window: limit requests per 60 seconds.
    - Redis: key ratelimit:gateway:{key}, sliding window via sorted set.
    - Falls back to in-memory on Redis error/unavailable.
    - In-memory: dict of timestamps; not shared across processes.
    """
    if not settings.FLOW_CONTROL_RATE_LIMIT_ENABLED:
        return True
    if limit is None or limit <= 0:
        return True
    if not key or not isinstance(key, str):
        return True
    limit = max(1, limit)
    window_sec = 60.0
    if get_redis(decode_responses=False) is not None:
        return _check_redis(key, limit, window_sec)
    return _check_memory(key, limit, window_sec)
