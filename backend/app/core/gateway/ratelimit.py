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

from app.core.config import settings
from app.core.redis_client import get_redis

_REDIS_KEY_PREFIX = "ratelimit:gateway:"
_memory: dict[str, list[float]] = {}
_memory_lock = threading.Lock()
_memory_last_gc: float = 0.0
_MEMORY_GC_INTERVAL = 60.0


_RATE_LIMIT_SCRIPT = """\
local key     = KEYS[1]
local cutoff  = tonumber(ARGV[1])
local now     = ARGV[2]
local limit   = tonumber(ARGV[3])
local ttl     = tonumber(ARGV[4])

redis.call('ZREMRANGEBYSCORE', key, '-inf', cutoff)
if redis.call('ZCARD', key) >= limit then
    return 0
end
redis.call('ZADD', key, now, now)
redis.call('EXPIRE', key, ttl)
return 1
"""
_rate_limit_sha: str | None = None


def _check_redis(key: str, limit: int, window_sec: float, r: "redis.Redis") -> bool:  # type: ignore[name-defined]
    global _rate_limit_sha
    k = _REDIS_KEY_PREFIX + key
    now = time.time()
    cutoff = now - window_sec
    ttl = int(window_sec) + 1
    try:
        if _rate_limit_sha is None:
            _rate_limit_sha = r.script_load(_RATE_LIMIT_SCRIPT)
        try:
            result = r.evalsha(_rate_limit_sha, 1, k, cutoff, now, limit, ttl)
        except Exception:
            # Script evicted from cache; reload once
            _rate_limit_sha = r.script_load(_RATE_LIMIT_SCRIPT)
            result = r.evalsha(_rate_limit_sha, 1, k, cutoff, now, limit, ttl)
        return result == 1
    except Exception:
        return True  # fail-open


def _gc_memory() -> None:
    """Remove empty or fully-expired keys from in-memory store."""
    global _memory_last_gc
    now = time.time()
    if (now - _memory_last_gc) < _MEMORY_GC_INTERVAL:
        return
    _memory_last_gc = now
    cutoff = now - 60.0
    dead = [k for k, v in _memory.items() if not v or v[-1] < cutoff]
    for k in dead:
        _memory.pop(k, None)


def _check_memory(key: str, limit: int, window_sec: float) -> bool:
    now = time.time()
    cutoff = now - window_sec
    with _memory_lock:
        arr = _memory.get(key, [])
        arr = [t for t in arr if t > cutoff]
        if len(arr) >= limit:
            _memory[key] = arr
            return False
        arr.append(now)
        _memory[key] = arr
        _gc_memory()
        return True


def check_rate_limit(key: str, limit: int | None = None) -> bool:
    """
    Rate limit by key. True = allow, False = over limit (caller should return 429).

    - If limit is None or <= 0: always True (no limit).
    - If FLOW_CONTROL_RATE_LIMIT_ENABLED is False: always True (kill switch).
    - Sliding window: limit requests per 60 seconds.
    - Redis: atomic sliding-window via sorted set (single Lua script).
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
    r = get_redis(decode_responses=False)
    if r is not None:
        return _check_redis(key, limit, window_sec, r)
    return _check_memory(key, limit, window_sec)
