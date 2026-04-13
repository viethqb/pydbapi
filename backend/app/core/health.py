"""
Health-check helpers for liveness and readiness probes.

Liveness  — is the process alive and not deadlocked?  (cheap, no I/O)
Readiness — can it serve traffic?  (Postgres + Redis)

Migration verification is handled by prestart.sh (runs before the app
starts), so it is intentionally excluded from the runtime readiness
probe to avoid loading the heavy alembic machinery on every poll.
"""

import logging

from sqlmodel import Session, select

from app.core.config import settings
from app.core.db import engine
from app.core.redis_client import ping as redis_ping

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Individual dependency checks
# ---------------------------------------------------------------------------


def check_postgres() -> bool:
    """Check Postgres (app DB) by running SELECT 1. Returns True if ok."""
    try:
        with Session(engine) as session:
            session.exec(select(1)).first()
        return True
    except Exception:
        return False


def check_redis() -> bool:
    """Check Redis by PING via shared client. Returns True if ok or Redis not configured."""
    return redis_ping()


def redis_required() -> bool:
    """Whether we consider Redis required for readiness (check and fail 503 if down)."""
    return bool(settings.CACHE_ENABLED or settings.FLOW_CONTROL_RATE_LIMIT_ENABLED)


# ---------------------------------------------------------------------------
# Composite probes
# ---------------------------------------------------------------------------


def liveness_check() -> tuple[bool, list[str]]:
    """
    Lightweight liveness probe — just confirms the Python process is responsive.
    No I/O, no DB calls.  Return format matches readiness_check for consistency.
    """
    return (True, [])


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
