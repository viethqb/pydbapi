"""
Readiness check for health-check endpoint (Phase A).

Checks Postgres (app DB) and Redis (when CACHE_ENABLED or FLOW_CONTROL_RATE_LIMIT_ENABLED).
Returns (ok, list of failure messages) for the caller to return 200 or 503.
"""

from sqlmodel import Session, select

from app.core.config import settings
from app.core.db import engine

try:
    import redis
except ImportError:
    redis = None  # type: ignore[assignment]


def check_postgres() -> bool:
    """Check Postgres (app DB) by running SELECT 1. Returns True if ok."""
    try:
        with Session(engine) as session:
            session.exec(select(1)).first()
        return True
    except Exception:
        return False


def check_redis() -> bool:
    """Check Redis by PING. Returns True if ok or Redis not available (no redis lib)."""
    if redis is None:
        return True  # redis lib not installed: skip check
    try:
        r = redis.Redis.from_url(settings.redis_url, decode_responses=False)
        r.ping()
        return True
    except Exception:
        return False


def redis_required() -> bool:
    """Whether we consider Redis required for readiness (check and fail 503 if down)."""
    return bool(settings.CACHE_ENABLED or settings.FLOW_CONTROL_RATE_LIMIT_ENABLED)


def readiness_check() -> tuple[bool, list[str]]:
    """
    Run Postgres + (optionally) Redis checks.
    Returns (ok, list of failure messages). ok is False if any required check fails.
    """
    failures: list[str] = []

    if not check_postgres():
        failures.append("postgres")

    if redis_required() and not check_redis():
        failures.append("redis")

    return (len(failures) == 0, failures)
