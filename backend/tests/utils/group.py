"""Test helpers for ApiGroup."""

from sqlmodel import Session

from app.models_dbapi import ApiGroup
from tests.utils.utils import random_lower_string


def create_random_group(
    db: Session,
    *,
    name: str | None = None,
    description: str | None = None,
    is_active: bool = True,
) -> ApiGroup:
    """Create an ApiGroup in the DB."""
    g = ApiGroup(
        name=name or f"grp-{random_lower_string()}",
        description=description,
        is_active=is_active,
    )
    db.add(g)
    db.commit()
    db.refresh(g)
    return g
