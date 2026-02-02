"""
Shared Redis client for cache, rate limit, script cache, etc.
"""

import logging
from typing import Any

from app.core.config import settings

try:
    import redis
except ImportError:
    redis = None  # type: ignore[assignment]

_LOG = logging.getLogger(__name__)
_client: "redis.Redis | None" = None
_tried = False


def get_redis(*, decode_responses: bool = True) -> "redis.Redis | None":
    """
    Get Redis client. Returns None if redis not installed, CACHE_ENABLED is False, or connection fails.
    decode_responses=True: get() returns str (default for cache/config).
    decode_responses=False: get() returns bytes (used by ratelimit for compatibility).
    """
    global _client, _tried
    if _tried:
        return _client
    _tried = True
    if redis is None or not settings.CACHE_ENABLED:
        _client = None
        return None
    try:
        r = redis.Redis.from_url(settings.redis_url, decode_responses=decode_responses)
        r.ping()
        _client = r
        return r
    except Exception as e:
        _LOG.debug("Redis unavailable: %s", e)
        _client = None
        return None
