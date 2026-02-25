"""
Shared Redis clients for cache, rate-limit, concurrent control, etc.

All Redis connections go through this module so there is exactly one
connection per decode_responses mode (str vs bytes).
"""

import logging
import threading

from app.core.config import settings

try:
    import redis
except ImportError:
    redis = None  # type: ignore[assignment]

_LOG = logging.getLogger(__name__)

_lock = threading.Lock()
_client_str: "redis.Redis | None" = None  # decode_responses=True  (cache, config)
_client_bytes: "redis.Redis | None" = None  # decode_responses=False (ratelimit, concurrent)
_tried_str = False
_tried_bytes = False


def get_redis(*, decode_responses: bool = True) -> "redis.Redis | None":
    """Return a shared Redis client.

    * ``decode_responses=True`` (default) — returns str values. Used by
      config cache, script cache, and general-purpose callers.
    * ``decode_responses=False`` — returns bytes values. Used by
      rate-limiter and concurrent-slot modules.

    Returns ``None`` when redis is not installed, ``CACHE_ENABLED`` is
    ``False``, or the initial ping fails.
    """
    if decode_responses:
        return _get_str_client()
    return _get_bytes_client()


def _get_str_client() -> "redis.Redis | None":
    global _client_str, _tried_str
    if _tried_str:
        return _client_str
    with _lock:
        if _tried_str:
            return _client_str
        _tried_str = True
        _client_str = _create_client(decode_responses=True)
        return _client_str


def _get_bytes_client() -> "redis.Redis | None":
    global _client_bytes, _tried_bytes
    if _tried_bytes:
        return _client_bytes
    with _lock:
        if _tried_bytes:
            return _client_bytes
        _tried_bytes = True
        _client_bytes = _create_client(decode_responses=False)
        return _client_bytes


def _create_client(*, decode_responses: bool) -> "redis.Redis | None":
    if redis is None or not settings.CACHE_ENABLED:
        return None
    try:
        r = redis.Redis.from_url(
            settings.redis_url, decode_responses=decode_responses
        )
        r.ping()
        return r
    except Exception as e:
        _LOG.debug("Redis unavailable (decode_responses=%s): %s", decode_responses, e)
        return None


def ping() -> bool:
    """Quick health check — True if any Redis client can PING."""
    for client in (_client_str, _client_bytes):
        if client is not None:
            try:
                client.ping()
                return True
            except Exception:
                pass
    # No cached client yet — try creating one to test connectivity.
    c = _create_client(decode_responses=False)
    return c is not None
