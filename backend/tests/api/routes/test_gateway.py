"""Tests for Gateway (Phase 4, Task 4.2a): token endpoint."""

from fastapi.testclient import TestClient

from app.core.config import settings


def _base() -> str:
    return "/token"


def test_gateway_token_success_json(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    """Create AppClient via API, then exchange client_id+secret for JWT (JSON body)."""
    # Create client with known secret
    cr = client.post(
        f"{settings.API_V1_STR}/clients/create",
        headers=superuser_token_headers,
        json={
            "name": "gw-token-test",
            "client_secret": "GatewayTestSecret123",
            "is_active": True,
        },
    )
    assert cr.status_code == 200
    client_id = cr.json()["client_id"]
    assert client_id

    # Exchange for token (JSON)
    r = client.post(
        f"{_base()}/generate",
        json={
            "client_id": client_id,
            "client_secret": "GatewayTestSecret123",
            "grant_type": "client_credentials",
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["expires_in"] == settings.GATEWAY_JWT_EXPIRE_SECONDS
    assert len(data["access_token"]) > 0


def test_gateway_token_success_form(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    """Exchange client_id+secret for JWT (form-urlencoded body)."""
    cr = client.post(
        f"{settings.API_V1_STR}/clients/create",
        headers=superuser_token_headers,
        json={
            "name": "gw-token-form-test",
            "client_secret": "FormTestSecret456",
            "is_active": True,
        },
    )
    assert cr.status_code == 200
    client_id = cr.json()["client_id"]

    r = client.post(
        f"{_base()}/generate",
        data={
            "client_id": client_id,
            "client_secret": "FormTestSecret456",
            "grant_type": "client_credentials",
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert data["token_type"] == "bearer"
    assert "access_token" in data


def test_gateway_token_invalid_client(client: TestClient) -> None:
    """Wrong client_id or client_secret -> 401."""
    r = client.post(
        f"{_base()}/generate",
        json={
            "client_id": "nonexistent-client-id-12345",
            "client_secret": "any",
        },
    )
    assert r.status_code == 401
    assert "Invalid" in r.json()["detail"]


def test_gateway_token_invalid_secret(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    """Valid client_id, wrong client_secret -> 401."""
    cr = client.post(
        f"{settings.API_V1_STR}/clients/create",
        headers=superuser_token_headers,
        json={"name": "gw-bad-secret", "client_secret": "CorrectSecret789", "is_active": True},
    )
    assert cr.status_code == 200
    client_id = cr.json()["client_id"]

    r = client.post(
        f"{_base()}/generate",
        json={"client_id": client_id, "client_secret": "WrongSecret"},
    )
    assert r.status_code == 401


def test_gateway_token_no_auth_required(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    """POST /token/generate does not require Authorization header."""
    cr = client.post(
        f"{settings.API_V1_STR}/clients/create",
        headers=superuser_token_headers,
        json={"name": "gw-no-auth", "client_secret": "NoAuthSecret111", "is_active": True},
    )
    assert cr.status_code == 200
    client_id = cr.json()["client_id"]

    # No Authorization header
    r = client.post(
        f"{_base()}/generate",
        json={"client_id": client_id, "client_secret": "NoAuthSecret111"},
    )
    assert r.status_code == 200
