"""Test helpers for AppClient."""

import secrets

from sqlmodel import Session

from app.core.security import get_password_hash
from app.models_dbapi import AppClient
from tests.utils.utils import random_lower_string


def create_random_client(
    db: Session,
    *,
    name: str | None = None,
    description: str | None = None,
    is_active: bool = True,
) -> AppClient:
    """Create an AppClient in the DB with generated client_id and hashed secret."""
    plain_secret = secrets.token_urlsafe(24)
    c = AppClient(
        name=name or f"client-{random_lower_string()}",
        client_id=secrets.token_urlsafe(16),
        client_secret=get_password_hash(plain_secret),
        description=description,
        is_active=is_active,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return c
