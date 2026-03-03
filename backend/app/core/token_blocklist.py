"""Redis-backed JWT token blocklist for server-side revocation.

Stores revoked JTI (JWT ID) values in Redis with a TTL matching the token's
remaining lifetime.  Keys auto-expire — no cleanup needed.

Graceful degradation: if Redis is unavailable, the blocklist check is skipped
(fail-open), consistent with existing rate-limit and concurrent-limit behavior.
"""

import logging
from datetime import UTC, datetime

from app.core.redis_client import get_redis

_LOG = logging.getLogger(__name__)

_KEY_PREFIX = "token:blocked:"


def revoke_token(jti: str, exp: datetime) -> bool:
    """Add a JTI to the blocklist.  Returns True if stored successfully."""
    r = get_redis(decode_responses=True)
    if r is None:
        _LOG.debug("Redis unavailable — cannot revoke token %s", jti)
        return False
    ttl = int((exp - datetime.now(UTC)).total_seconds())
    if ttl <= 0:
        return False  # already expired, nothing to block
    try:
        r.setex(f"{_KEY_PREFIX}{jti}", ttl, "1")
        return True
    except Exception:
        _LOG.warning("Failed to revoke token %s", jti, exc_info=True)
        return False


def is_token_revoked(jti: str) -> bool:
    """Check whether a JTI has been revoked.  Returns False if Redis is unavailable."""
    r = get_redis(decode_responses=True)
    if r is None:
        return False  # fail-open
    try:
        return r.exists(f"{_KEY_PREFIX}{jti}") > 0
    except Exception:
        _LOG.warning("Failed to check token blocklist for %s", jti, exc_info=True)
        return False  # fail-open
