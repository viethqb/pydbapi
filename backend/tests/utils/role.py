"""Test helpers for Role."""

from sqlmodel import Session

from app.models_permission import Role
from tests.utils.utils import random_lower_string


def create_random_role(
    db: Session,
    *,
    name: str | None = None,
    description: str | None = None,
) -> Role:
    """Create a Role in the DB."""
    r = Role(
        name=name or f"role-{random_lower_string()}",
        description=description,
    )
    db.add(r)
    db.commit()
    db.refresh(r)
    return r
