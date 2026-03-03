"""
Gateway max concurrent per client (Phase E, 5.1).

Limits how many requests a client (client_id or ip) can have in flight at once.
Uses FLOW_CONTROL_MAX_CONCURRENT_PER_CLIENT. Redis (preferred) or in-memory.
"""

import logging
import os
import threading

from app.core.config import settings
from app.core.redis_client import get_redis

_LOG = logging.getLogger(__name__)
_CONCURRENT_DEBUG = os.environ.get("CONCURRENT_DEBUG", "").strip().lower() in (
    "1",
    "true",
    "yes",
)

_CONCURRENT_KEY_PREFIX = "concurrent:gateway:"
_KEY_TTL_SECONDS = 300  # expire key so stale slots are released if process dies
_memory: dict[str, int] = {}
_memory_lock = threading.Lock()


_ACQUIRE_SCRIPT = """\
local key = KEYS[1]
local max = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])

local n = tonumber(redis.call('GET', key) or '0')
if n >= max then
    return 0
end
redis.call('INCR', key)
redis.call('EXPIRE', key, ttl)
return 1
"""
_acquire_sha: str | None = None

# Decrement only when the counter is > 0 so a stale/expired key (created by a
# previous INCR whose TTL elapsed) is never pushed below zero.
_RELEASE_SCRIPT = """\
local key = KEYS[1]
local n = tonumber(redis.call('GET', key) or '0')
if n > 0 then
    redis.call('DECR', key)
end
"""
_release_sha: str | None = None


def _acquire_redis(key: str, max_concurrent: int, r: "redis.Redis") -> bool:  # type: ignore[name-defined]
    global _acquire_sha
    k = _CONCURRENT_KEY_PREFIX + key
    try:
        if _acquire_sha is None:
            _acquire_sha = r.script_load(_ACQUIRE_SCRIPT)
        try:
            result = r.evalsha(_acquire_sha, 1, k, max_concurrent, _KEY_TTL_SECONDS)
        except Exception:
            # Script evicted from cache; reload once
            _acquire_sha = r.script_load(_ACQUIRE_SCRIPT)
            result = r.evalsha(_acquire_sha, 1, k, max_concurrent, _KEY_TTL_SECONDS)
        return result == 1
    except Exception:
        return True  # on Redis error: allow (fail-open)


def _release_redis(key: str, r: "redis.Redis") -> None:  # type: ignore[name-defined]
    global _release_sha
    k = _CONCURRENT_KEY_PREFIX + key
    try:
        if _release_sha is None:
            _release_sha = r.script_load(_RELEASE_SCRIPT)
        try:
            r.evalsha(_release_sha, 1, k)
        except Exception:
            # Script evicted from cache; reload once
            _release_sha = r.script_load(_RELEASE_SCRIPT)
            r.evalsha(_release_sha, 1, k)
    except Exception:
        pass


def _acquire_memory(key: str, max_concurrent: int) -> bool:
    with _memory_lock:
        n = _memory.get(key, 0)
        if n >= max_concurrent:
            return False
        _memory[key] = n + 1
        return True


def _release_memory(key: str) -> None:
    with _memory_lock:
        n = _memory.get(key, 0)
        if n <= 1:
            _memory.pop(key, None)
        else:
            _memory[key] = n - 1


def acquire_concurrent_slot(
    client_key: str, max_concurrent_override: int | None = None
) -> bool:
    """
    Acquire one concurrent slot for this client. Call before running the request.

    - max_concurrent_override: per-client limit (e.g. from AppClient.max_concurrent). If set and > 0, use it; else use global FLOW_CONTROL_MAX_CONCURRENT_PER_CLIENT.
    - If effective limit <= 0: no limit (always True).
    - Empty/invalid client_key: allow (True).
    - Redis: atomic check-and-increment via Lua script (single round-trip).
    - On Redis error: allow (fail-open).
    - In-memory fallback when Redis unavailable; not shared across processes.
    """
    global_max = getattr(settings, "FLOW_CONTROL_MAX_CONCURRENT_PER_CLIENT", 0) or 0
    max_c = (
        max_concurrent_override
        if max_concurrent_override is not None and max_concurrent_override > 0
        else None
    ) or global_max
    ck_short = (
        (client_key[:20] + "...")
        if client_key and len(client_key) > 20
        else (client_key or "")
    )

    if max_c <= 0:
        msg = (
            f"[concurrent] no limit max_c={max_c} override={max_concurrent_override} "
            f"global={global_max} client_key={ck_short}"
        )
        _LOG.debug(msg)
        if _CONCURRENT_DEBUG:
            print(msg, flush=True)
        return True
    if not client_key or not isinstance(client_key, str):
        return True
    r = get_redis(decode_responses=False)
    ok = (
        _acquire_redis(client_key, max_c, r)
        if r is not None
        else _acquire_memory(client_key, max_c)
    )
    msg = f"[concurrent] acquire client_key={ck_short} max_c={max_c} redis={r is not None} ok={ok}"
    _LOG.debug(msg)
    if _CONCURRENT_DEBUG:
        print(msg, flush=True)
    return ok


def release_concurrent_slot(
    client_key: str, max_concurrent_override: int | None = None
) -> None:
    """
    Release one concurrent slot. Must be called after acquire_concurrent_slot
    when the request is done (e.g. in finally).

    ``max_concurrent_override`` must match the value passed to
    ``acquire_concurrent_slot`` so that this function can detect when the
    acquire was a no-op (effective limit <= 0) and skip the decrement.
    Skipping is critical: a spurious DECR on a key that was never INCRd
    would create a stale negative key in Redis with no TTL.
    """
    # Mirror the same no-op guard from acquire_concurrent_slot.
    global_max = getattr(settings, "FLOW_CONTROL_MAX_CONCURRENT_PER_CLIENT", 0) or 0
    max_c = (
        max_concurrent_override
        if max_concurrent_override is not None and max_concurrent_override > 0
        else None
    ) or global_max
    if max_c <= 0:
        return  # acquire was also a no-op; nothing to release

    if not client_key or not isinstance(client_key, str):
        return
    r = get_redis(decode_responses=False)
    if r is not None:
        _release_redis(client_key, r)
    else:
        _release_memory(client_key)
