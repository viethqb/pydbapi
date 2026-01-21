"""Tests for ApiGroup API (Phase 2, Task 2.3)."""

import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.config import settings
from tests.utils.group import create_random_group


def _base() -> str:
    return f"{settings.API_V1_STR}/groups"


# --- list (POST) ---


def test_list_groups_empty(
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


def test_list_groups_with_data(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    create_random_group(db, name="list-me")
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


def test_list_groups_filter_is_active(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    create_random_group(db, name="active-grp", is_active=True)
    create_random_group(db, name="inactive-grp", is_active=False)
    response = client.post(
        f"{_base()}/list",
        headers=superuser_token_headers,
        json={"page": 1, "page_size": 20, "is_active": True},
    )
    assert response.status_code == 200
    data = response.json()
    assert all(r["is_active"] is True for r in data["data"])


def test_list_groups_unauthorized(client: TestClient) -> None:
    response = client.post(
        f"{_base()}/list",
        json={"page": 1, "page_size": 10},
    )
    assert response.status_code == 401


# --- create ---


def test_create_group(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    payload = {
        "name": "new-group",
        "description": "A group",
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
    assert "id" in data


def test_create_group_unauthorized(client: TestClient) -> None:
    response = client.post(
        f"{_base()}/create",
        json={"name": "x"},
    )
    assert response.status_code == 401


# --- update ---


def test_update_group(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    g = create_random_group(db, name="before")
    response = client.post(
        f"{_base()}/update",
        headers=superuser_token_headers,
        json={"id": str(g.id), "name": "after", "description": "updated"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "after"
    assert data["description"] == "updated"
    assert data["id"] == str(g.id)


def test_update_group_not_found(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    response = client.post(
        f"{_base()}/update",
        headers=superuser_token_headers,
        json={"id": str(uuid.uuid4()), "name": "x"},
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "ApiGroup not found"


# --- delete ---


def test_delete_group(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    g = create_random_group(db)
    response = client.delete(
        f"{_base()}/delete/{g.id}",
        headers=superuser_token_headers,
    )
    assert response.status_code == 200
    assert response.json()["message"] == "ApiGroup deleted successfully"


def test_delete_group_not_found(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    response = client.delete(
        f"{_base()}/delete/{uuid.uuid4()}",
        headers=superuser_token_headers,
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "ApiGroup not found"


# --- get detail (with api_assignment_ids) ---


def test_get_group(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    g = create_random_group(db, name="detail-me")
    response = client.get(
        f"{_base()}/{g.id}",
        headers=superuser_token_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "detail-me"
    assert data["id"] == str(g.id)
    assert "api_assignment_ids" in data
    assert data["api_assignment_ids"] == []


def test_get_group_not_found(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    response = client.get(
        f"{_base()}/{uuid.uuid4()}",
        headers=superuser_token_headers,
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "ApiGroup not found"
