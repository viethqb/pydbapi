"""Tests for Token generation API (client credentials → JWT)."""

import secrets
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.config import settings
from app.core.security import get_password_hash
from app.models_dbapi import AppClient


def _base() -> str:
    return "/api/token"


def _create_client_with_known_secret(
    db: Session,
    *,
    client_id: str | None = None,
    plain_secret: str = "test-secret-12345",
    is_active: bool = True,
) -> tuple[AppClient, str]:
    """Create an AppClient with a known plaintext secret. Returns (client, plain_secret)."""
    cid = client_id or secrets.token_urlsafe(16)
    c = AppClient(
        name=f"token-test-{cid[:8]}",
        client_id=cid,
        client_secret=get_password_hash(plain_secret),
        is_active=is_active,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return c, plain_secret


# --- POST /token/generate (JSON) ---


def test_token_generate_json(client: TestClient, db: Session) -> None:
    app_client, secret = _create_client_with_known_secret(db)
    response = client.post(
        f"{_base()}/generate",
        json={
            "client_id": app_client.client_id,
            "client_secret": secret,
            "grant_type": "client_credentials",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert "expires_in" in data
    assert isinstance(data["expires_in"], int)


def test_token_generate_invalid_credentials(client: TestClient, db: Session) -> None:
    app_client, _ = _create_client_with_known_secret(db)
    response = client.post(
        f"{_base()}/generate",
        json={
            "client_id": app_client.client_id,
            "client_secret": "wrong-secret",
            "grant_type": "client_credentials",
        },
    )
    assert response.status_code == 401
    assert "Invalid" in response.json()["detail"]


def test_token_generate_nonexistent_client(client: TestClient) -> None:
    response = client.post(
        f"{_base()}/generate",
        json={
            "client_id": "does-not-exist",
            "client_secret": "whatever",
            "grant_type": "client_credentials",
        },
    )
    assert response.status_code == 401


def test_token_generate_inactive_client(client: TestClient, db: Session) -> None:
    app_client, secret = _create_client_with_known_secret(db, is_active=False)
    response = client.post(
        f"{_base()}/generate",
        json={
            "client_id": app_client.client_id,
            "client_secret": secret,
            "grant_type": "client_credentials",
        },
    )
    assert response.status_code == 401


def test_token_generate_bad_grant_type(client: TestClient, db: Session) -> None:
    app_client, secret = _create_client_with_known_secret(db)
    response = client.post(
        f"{_base()}/generate",
        json={
            "client_id": app_client.client_id,
            "client_secret": secret,
            "grant_type": "authorization_code",
        },
    )
    assert response.status_code == 400
    assert "Unsupported grant_type" in response.json()["detail"]


# --- POST /token/generate (form-encoded) ---


def test_token_generate_form(client: TestClient, db: Session) -> None:
    app_client, secret = _create_client_with_known_secret(db)
    response = client.post(
        f"{_base()}/generate",
        data={
            "client_id": app_client.client_id,
            "client_secret": secret,
            "grant_type": "client_credentials",
        },
        headers={"content-type": "application/x-www-form-urlencoded"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


# --- GET /token/generate (legacy, disabled by default) ---


def test_token_generate_get_disabled(client: TestClient, db: Session) -> None:
    app_client, secret = _create_client_with_known_secret(db)
    response = client.get(
        f"{_base()}/generate",
        params={"clientId": app_client.client_id, "secret": secret},
    )
    assert response.status_code == 403
    assert "disabled" in response.json()["detail"].lower()


def test_token_generate_get_enabled(client: TestClient, db: Session) -> None:
    app_client, secret = _create_client_with_known_secret(db)
    with patch.object(settings, "GATEWAY_TOKEN_GET_ENABLED", True):
        response = client.get(
            f"{_base()}/generate",
            params={"clientId": app_client.client_id, "secret": secret},
        )
    assert response.status_code == 200
    data = response.json()
    assert "token" in data
    assert "expireAt" in data


def test_token_generate_get_invalid_credentials(
    client: TestClient, db: Session
) -> None:
    app_client, _ = _create_client_with_known_secret(db)
    with patch.object(settings, "GATEWAY_TOKEN_GET_ENABLED", True):
        response = client.get(
            f"{_base()}/generate",
            params={"clientId": app_client.client_id, "secret": "wrong"},
        )
    assert response.status_code == 401


# --- response field validation ---


def test_token_response_fields(client: TestClient, db: Session) -> None:
    app_client, secret = _create_client_with_known_secret(db)
    response = client.post(
        f"{_base()}/generate",
        json={
            "client_id": app_client.client_id,
            "client_secret": secret,
            "grant_type": "client_credentials",
        },
    )
    assert response.status_code == 200
    data = response.json()
    # Exactly these fields
    assert set(data.keys()) == {"access_token", "token_type", "expires_in"}
    assert data["expires_in"] > 0
    assert len(data["access_token"]) > 10


def test_token_generate_default_grant_type(client: TestClient, db: Session) -> None:
    """grant_type defaults to client_credentials when not specified."""
    app_client, secret = _create_client_with_known_secret(db)
    response = client.post(
        f"{_base()}/generate",
        json={
            "client_id": app_client.client_id,
            "client_secret": secret,
        },
    )
    assert response.status_code == 200
