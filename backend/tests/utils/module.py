"""Test helpers for ApiModule."""

from sqlmodel import Session

from app.models_dbapi import ApiModule
from tests.utils.utils import random_lower_string


def create_random_module(
    db: Session,
    *,
    name: str | None = None,
    description: str | None = None,
    path_prefix: str = "/",
    sort_order: int = 0,
    is_active: bool = True,
) -> ApiModule:
    """Create an ApiModule in the DB."""
    m = ApiModule(
        name=name or f"mod-{random_lower_string()}",
        description=description,
        path_prefix=path_prefix,
        sort_order=sort_order,
        is_active=is_active,
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    return m
