"""Unit tests for gateway auth: verify_gateway_client (Phase 4, Task 4.2a)."""

from datetime import timedelta

from sqlmodel import Session

from app.core.gateway.auth import verify_gateway_client
from app.core.security import (
    TOKEN_TYPE_DASHBOARD,
    TOKEN_TYPE_GATEWAY,
    create_access_token,
)
from tests.utils.client import create_random_client


def test_verify_gateway_client_bearer(db: Session) -> None:
    """Bearer JWT with sub=client_id returns AppClient."""
    c = create_random_client(db, name="bearer-test")
    token = create_access_token(
        subject=c.client_id,
        expires_delta=timedelta(seconds=3600),
        token_type=TOKEN_TYPE_GATEWAY,
    )
    out = verify_gateway_client(f"Bearer {token}", db)
    assert out is not None
    assert out.client_id == c.client_id
    assert out.id == c.id


def test_verify_gateway_client_raw_token(db: Session) -> None:
    """Authorization: <token> (raw token, no Bearer) works for legacy migration."""
    c = create_random_client(db, name="raw-token-test")
    token = create_access_token(
        subject=c.client_id,
        expires_delta=timedelta(seconds=3600),
        token_type=TOKEN_TYPE_GATEWAY,
    )
    out = verify_gateway_client(token, db)
    assert out is not None
    assert out.client_id == c.client_id
    assert out.id == c.id


def test_verify_gateway_client_rejects_dashboard_token(db: Session) -> None:
    """Dashboard tokens must not be accepted as gateway tokens."""
    c = create_random_client(db, name="cross-use-test")
    token = create_access_token(
        subject=c.client_id,
        expires_delta=timedelta(seconds=3600),
        token_type=TOKEN_TYPE_DASHBOARD,
    )
    out = verify_gateway_client(f"Bearer {token}", db)
    assert out is None


def test_verify_gateway_client_empty_header(db: Session) -> None:
    """Empty auth header returns None."""
    out = verify_gateway_client("", db)
    assert out is None


def test_verify_gateway_client_none_header(db: Session) -> None:
    """None auth header returns None."""
    out = verify_gateway_client("", db)
    assert out is None
