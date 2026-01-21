"""Tests for ApiModule API (Phase 2, Task 2.3)."""

import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.config import settings
from tests.utils.module import create_random_module


def _base() -> str:
    return f"{settings.API_V1_STR}/modules"


# --- simple list (GET) ---


def test_list_modules_simple_empty(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    response = client.get(_base(), headers=superuser_token_headers)
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


def test_list_modules_simple_with_data(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    create_random_module(db, name="simple-a", is_active=True)
    response = client.get(_base(), headers=superuser_token_headers)
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    found = next((r for r in data if r.get("name") == "simple-a"), None)
    assert found is not None
    assert found["is_active"] is True


def test_list_modules_simple_unauthorized(client: TestClient) -> None:
    response = client.get(_base())
    assert response.status_code == 401


# --- list (POST) ---


def test_list_modules_empty(
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


def test_list_modules_with_data(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    create_random_module(db, name="list-me")
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


def test_list_modules_filter_is_active(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    create_random_module(db, name="active-mod", is_active=True)
    create_random_module(db, name="inactive-mod", is_active=False)
    response = client.post(
        f"{_base()}/list",
        headers=superuser_token_headers,
        json={"page": 1, "page_size": 20, "is_active": True},
    )
    assert response.status_code == 200
    data = response.json()
    assert all(r["is_active"] is True for r in data["data"])


def test_list_modules_unauthorized(client: TestClient) -> None:
    response = client.post(
        f"{_base()}/list",
        json={"page": 1, "page_size": 10},
    )
    assert response.status_code == 401


# --- create ---


def test_create_module(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    payload = {
        "name": "new-module",
        "description": "A module",
        "path_prefix": "/api",
        "sort_order": 1,
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
    assert data["path_prefix"] == payload["path_prefix"]
    assert "id" in data


def test_create_module_unauthorized(client: TestClient) -> None:
    response = client.post(
        f"{_base()}/create",
        json={"name": "x"},
    )
    assert response.status_code == 401


# --- update ---


def test_update_module(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    m = create_random_module(db, name="before")
    response = client.post(
        f"{_base()}/update",
        headers=superuser_token_headers,
        json={"id": str(m.id), "name": "after", "description": "updated"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "after"
    assert data["description"] == "updated"
    assert data["id"] == str(m.id)


def test_update_module_not_found(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    response = client.post(
        f"{_base()}/update",
        headers=superuser_token_headers,
        json={"id": str(uuid.uuid4()), "name": "x"},
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "ApiModule not found"


# --- delete ---


def test_delete_module(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    m = create_random_module(db)
    response = client.delete(
        f"{_base()}/delete/{m.id}",
        headers=superuser_token_headers,
    )
    assert response.status_code == 200
    assert response.json()["message"] == "ApiModule deleted successfully"


def test_delete_module_not_found(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    response = client.delete(
        f"{_base()}/delete/{uuid.uuid4()}",
        headers=superuser_token_headers,
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "ApiModule not found"


# --- get detail ---


def test_get_module(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    m = create_random_module(db, name="detail-me")
    response = client.get(
        f"{_base()}/{m.id}",
        headers=superuser_token_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "detail-me"
    assert data["id"] == str(m.id)


def test_get_module_not_found(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    response = client.get(
        f"{_base()}/{uuid.uuid4()}",
        headers=superuser_token_headers,
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "ApiModule not found"
