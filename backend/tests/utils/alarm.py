"""Test helpers for UnifyAlarm."""

from sqlmodel import Session

from app.models_dbapi import UnifyAlarm
from tests.utils.utils import random_lower_string


def create_random_alarm(
    db: Session,
    *,
    name: str | None = None,
    alarm_type: str | None = None,
    config: dict | None = None,
    is_enabled: bool = True,
) -> UnifyAlarm:
    """Create an UnifyAlarm in the DB."""
    a = UnifyAlarm(
        name=name or f"alarm-{random_lower_string()}",
        alarm_type=alarm_type or "email",
        config=config or {"recipients": ["a@b.com"]},
        is_enabled=is_enabled,
    )
    db.add(a)
    db.commit()
    db.refresh(a)
    return a
