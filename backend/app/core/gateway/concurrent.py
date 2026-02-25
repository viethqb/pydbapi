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


def _acquire_redis(key: str, max_concurrent: int) -> bool:
    r = get_redis(decode_responses=False)
    if r is None:
        return True  # no Redis: allow (fail-open; in-memory used below)
    k = _CONCURRENT_KEY_PREFIX + key
    try:
        n = r.incr(k)
        if n == 1:
            r.expire(k, _KEY_TTL_SECONDS)
        if n > max_concurrent:
            r.decr(k)
            return False
        return True
    except Exception:
        return True  # on Redis error: allow (fail-open)


def _release_redis(key: str) -> None:
    r = get_redis(decode_responses=False)
    if r is None:
        return
    k = _CONCURRENT_KEY_PREFIX + key
    try:
        r.decr(k)
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
    - Redis: INCR key; if over limit, DECR and return False.
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
        _LOG.info(msg)
        if _CONCURRENT_DEBUG:
            print(msg, flush=True)
        return True
    if not client_key or not isinstance(client_key, str):
        return True
    use_redis = get_redis(decode_responses=False) is not None
    ok = (
        _acquire_redis(client_key, max_c)
        if use_redis
        else _acquire_memory(client_key, max_c)
    )
    msg = f"[concurrent] acquire client_key={ck_short} max_c={max_c} redis={use_redis} ok={ok}"
    _LOG.debug(msg)
    if _CONCURRENT_DEBUG:
        print(msg, flush=True)
    return ok


def release_concurrent_slot(client_key: str) -> None:
    """
    Release one concurrent slot. Must be called after acquire_concurrent_slot
    when the request is done (e.g. in finally). Always decrements so that
    slots are freed even when client used per-client max_concurrent and
    global FLOW_CONTROL_MAX_CONCURRENT_PER_CLIENT is 0.
    """
    if not client_key or not isinstance(client_key, str):
        return
    if get_redis(decode_responses=False) is not None:
        _release_redis(client_key)
    else:
        _release_memory(client_key)
