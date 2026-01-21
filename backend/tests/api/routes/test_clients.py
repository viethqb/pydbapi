"""Tests for AppClient API (Phase 2, Task 2.4)."""

import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.config import settings
from tests.utils.client import create_random_client


def _base() -> str:
    return f"{settings.API_V1_STR}/clients"


# --- list (POST) ---


def test_list_clients_empty(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    response = client.post(
        f"{_base()}/list",
        headers=superuser_token_headers,
        json={"page": 1, "page_size": 10},
    )
    assert response.status_code == 200
    data = response.json()
    assert "data" in data
    assert "total" in data
    assert isinstance(data["data"], list)


def test_list_clients_with_data(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    create_random_client(db, name="list-me")
    response = client.post(
        f"{_base()}/list",
        headers=superuser_token_headers,
        json={"page": 1, "page_size": 10, "name__ilike": "list-me"},
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data["data"]) >= 1
    assert data["total"] >= 1
    found = next((r for r in data["data"] if r["name"] == "list-me"), None)
    assert found is not None
    assert "client_id" in found
    assert "client_secret" not in found


def test_list_clients_filter_is_active(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    create_random_client(db, name="active-cli", is_active=True)
    create_random_client(db, name="inactive-cli", is_active=False)
    response = client.post(
        f"{_base()}/list",
        headers=superuser_token_headers,
        json={"page": 1, "page_size": 20, "is_active": True},
    )
    assert response.status_code == 200
    data = response.json()
    assert all(r["is_active"] is True for r in data["data"])


def test_list_clients_unauthorized(client: TestClient) -> None:
    response = client.post(
        f"{_base()}/list",
        json={"page": 1, "page_size": 10},
    )
    assert response.status_code == 401


# --- create ---


def test_create_client(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    payload = {
        "name": "new-client",
        "client_secret": "mySecretPassword123",
        "description": "A test client",
        "is_active": True,
    }
    response = client.post(
        f"{_base()}/create",
        headers=superuser_token_headers,
        json=payload,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == payload["name"]
    assert data["description"] == payload["description"]
    assert "id" in data
    assert "client_id" in data
    assert "client_secret" not in data


def test_create_client_unauthorized(client: TestClient) -> None:
    response = client.post(
        f"{_base()}/create",
        json={"name": "x", "client_secret": "secret123"},
    )
    assert response.status_code == 401


def test_create_client_secret_too_short(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    response = client.post(
        f"{_base()}/create",
        headers=superuser_token_headers,
        json={"name": "x", "client_secret": "short"},
    )
    assert response.status_code == 422


# --- update ---


def test_update_client(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    c = create_random_client(db, name="before", description="old")
    response = client.post(
        f"{_base()}/update",
        headers=superuser_token_headers,
        json={"id": str(c.id), "name": "after", "description": "updated"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "after"
    assert data["description"] == "updated"
    assert data["id"] == str(c.id)
    assert data["client_id"] == c.client_id


def test_update_client_not_found(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    response = client.post(
        f"{_base()}/update",
        headers=superuser_token_headers,
        json={"id": str(uuid.uuid4()), "name": "x"},
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "AppClient not found"


# --- delete ---


def test_delete_client(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    c = create_random_client(db)
    response = client.delete(
        f"{_base()}/delete/{c.id}",
        headers=superuser_token_headers,
    )
    assert response.status_code == 200
    assert response.json()["message"] == "AppClient deleted successfully"


def test_delete_client_not_found(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    response = client.delete(
        f"{_base()}/delete/{uuid.uuid4()}",
        headers=superuser_token_headers,
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "AppClient not found"


# --- get detail ---


def test_get_client(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    c = create_random_client(db, name="detail-me")
    response = client.get(
        f"{_base()}/{c.id}",
        headers=superuser_token_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "detail-me"
    assert data["id"] == str(c.id)
    assert data["client_id"] == c.client_id
    assert "client_secret" not in data


def test_get_client_not_found(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    response = client.get(
        f"{_base()}/{uuid.uuid4()}",
        headers=superuser_token_headers,
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "AppClient not found"


# --- regenerate-secret ---


def test_regenerate_secret(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    c = create_random_client(db, name="regen-me")
    response = client.post(
        f"{_base()}/{c.id}/regenerate-secret",
        headers=superuser_token_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert "client_secret" in data
    assert "message" in data
    assert len(data["client_secret"]) > 0


def test_regenerate_secret_not_found(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    response = client.post(
        f"{_base()}/{uuid.uuid4()}/regenerate-secret",
        headers=superuser_token_headers,
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "AppClient not found"
