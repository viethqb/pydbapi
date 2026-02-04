"""Unit tests for gateway auth: verify_gateway_client (Phase 4, Task 4.2a)."""

from datetime import timedelta
from unittest.mock import Mock

from sqlmodel import Session

from app.core.security import create_access_token
from app.core.gateway.auth import verify_gateway_client
from tests.utils.client import create_random_client


def _mock_request(
    authorization: str | None = None, x_api_key: str | None = None
) -> Mock:
    m = Mock()
    m.headers = {}
    if authorization is not None:
        m.headers["Authorization"] = authorization
    if x_api_key is not None:
        m.headers["X-API-Key"] = x_api_key
    return m


def test_verify_gateway_client_bearer(db: Session) -> None:
    """Bearer JWT with sub=client_id returns AppClient."""
    c = create_random_client(db, name="bearer-test")
    token = create_access_token(
        subject=c.client_id, expires_delta=timedelta(seconds=3600)
    )
    request = _mock_request(authorization=f"Bearer {token}")

    out = verify_gateway_client(request, db)
    assert out is not None
    assert out.client_id == c.client_id
    assert out.id == c.id


def test_verify_gateway_client_raw_token(db: Session) -> None:
    """Authorization: <token> (raw token, no Bearer) works for legacy migration."""
    c = create_random_client(db, name="raw-token-test")
    token = create_access_token(
        subject=c.client_id, expires_delta=timedelta(seconds=3600)
    )
    request = _mock_request(authorization=token)

    out = verify_gateway_client(request, db)
    assert out is not None
    assert out.client_id == c.client_id
    assert out.id == c.id
