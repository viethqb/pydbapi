"""Tests for ApiAssignment API (Phase 2, Task 2.2)."""

import uuid

from fastapi.testclient import TestClient

from app.core.config import settings
from app.models_dbapi import ExecuteEngineEnum, HttpMethodEnum
from tests.utils.api_assignment import create_random_assignment
from tests.utils.module import create_random_module


def _base() -> str:
    return f"{settings.API_V1_STR}/api-assignments"


# --- list (POST) ---


def test_list_api_assignments_empty(
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


def test_list_api_assignments_with_data(
    client: TestClient, superuser_token_headers: dict[str, str], db
) -> None:
    create_random_assignment(db, name="list-me", path="items")
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
    assert found["path"] == "items"


def test_list_api_assignments_filter_is_published(
    client: TestClient, superuser_token_headers: dict[str, str], db
) -> None:
    create_random_assignment(db, name="pub-a", is_published=True)
    create_random_assignment(db, name="draft-b", is_published=False)
    response = client.post(
        f"{_base()}/list",
        headers=superuser_token_headers,
        json={"page": 1, "page_size": 20, "is_published": True},
    )
    assert response.status_code == 200
    data = response.json()
    assert all(r["is_published"] is True for r in data["data"])


def test_list_api_assignments_unauthorized(client: TestClient) -> None:
    response = client.post(
        f"{_base()}/list",
        json={"page": 1, "page_size": 10},
    )
    assert response.status_code == 401


# --- create ---


def test_create_api_assignment(
    client: TestClient, superuser_token_headers: dict[str, str], db
) -> None:
    m = create_random_module(db, name="mod-for-api")
    payload = {
        "module_id": str(m.id),
        "name": "new-api",
        "path": "users",
        "http_method": HttpMethodEnum.GET.value,
        "execute_engine": ExecuteEngineEnum.SQL.value,
        "description": "Fetch users",
        "sort_order": 1,
        "content": "SELECT 1",
        "group_ids": [],
    }
    response = client.post(
        f"{_base()}/create",
        headers=superuser_token_headers,
        json=payload,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "new-api"
    assert data["path"] == "users"
    assert data["is_published"] is False
    assert "id" in data


def test_create_api_assignment_with_content(
    client: TestClient, superuser_token_headers: dict[str, str], db
) -> None:
    m = create_random_module(db, name="mod-ctx")
    payload = {
        "module_id": str(m.id),
        "name": "api-with-ctx",
        "path": "test",
        "http_method": HttpMethodEnum.POST.value,
        "execute_engine": ExecuteEngineEnum.SQL.value,
        "content": "SELECT * FROM t",
    }
    response = client.post(
        f"{_base()}/create",
        headers=superuser_token_headers,
        json=payload,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "api-with-ctx"
    # GET detail should include api_context
    get_r = client.get(
        f"{_base()}/{data['id']}",
        headers=superuser_token_headers,
    )
    assert get_r.status_code == 200
    detail = get_r.json()
    assert detail.get("api_context") is not None
    assert detail["api_context"]["content"] == "SELECT * FROM t"


def test_create_api_assignment_unauthorized(client: TestClient, db) -> None:
    m = create_random_module(db)
    response = client.post(
        f"{_base()}/create",
        json={
            "module_id": str(m.id),
            "name": "x",
            "path": "y",
            "http_method": "GET",
            "execute_engine": "SQL",
        },
    )
    assert response.status_code == 401


# --- update ---


def test_update_api_assignment(
    client: TestClient, superuser_token_headers: dict[str, str], db
) -> None:
    a = create_random_assignment(db, name="before", path="old")
    response = client.post(
        f"{_base()}/update",
        headers=superuser_token_headers,
        json={"id": str(a.id), "name": "after", "path": "new", "description": "updated"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "after"
    assert data["path"] == "new"
    assert data["description"] == "updated"


def test_update_api_assignment_not_found(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    response = client.post(
        f"{_base()}/update",
        headers=superuser_token_headers,
        json={"id": str(uuid.uuid4()), "name": "x"},
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "ApiAssignment not found"


# --- delete ---


def test_delete_api_assignment(
    client: TestClient, superuser_token_headers: dict[str, str], db
) -> None:
    a = create_random_assignment(db)
    response = client.delete(
        f"{_base()}/delete/{a.id}",
        headers=superuser_token_headers,
    )
    assert response.status_code == 200
    assert response.json()["message"] == "ApiAssignment deleted successfully"


def test_delete_api_assignment_not_found(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    response = client.delete(
        f"{_base()}/delete/{uuid.uuid4()}",
        headers=superuser_token_headers,
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "ApiAssignment not found"


# --- get detail ---


def test_get_api_assignment(
    client: TestClient, superuser_token_headers: dict[str, str], db
) -> None:
    a = create_random_assignment(db, name="detail-me", path="x", content="SELECT 1")
    response = client.get(
        f"{_base()}/{a.id}",
        headers=superuser_token_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "detail-me"
    assert data["id"] == str(a.id)
    assert "api_context" in data
    assert data["api_context"] is not None
    assert data["api_context"]["content"] == "SELECT 1"
    assert "group_ids" in data
    assert data["group_ids"] == []


def test_get_api_assignment_not_found(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    response = client.get(
        f"{_base()}/{uuid.uuid4()}",
        headers=superuser_token_headers,
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "ApiAssignment not found"


# --- publish ---


def test_publish_api_assignment(
    client: TestClient, superuser_token_headers: dict[str, str], db
) -> None:
    a = create_random_assignment(db, name="to-publish", is_published=False)
    response = client.post(
        f"{_base()}/publish",
        headers=superuser_token_headers,
        json={"id": str(a.id)},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["is_published"] is True
    assert data["name"] == "to-publish"


def test_publish_api_assignment_not_found(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    response = client.post(
        f"{_base()}/publish",
        headers=superuser_token_headers,
        json={"id": str(uuid.uuid4())},
    )
    assert response.status_code == 404


# --- debug (Phase 3: ApiExecutor) ---


def test_debug_api_assignment_missing_datasource_id_returns_400(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    """Inline debug with SQL but no datasource_id returns 400."""
    response = client.post(
        f"{_base()}/debug",
        headers=superuser_token_headers,
        json={"content": "SELECT 1", "execute_engine": "SQL"},
    )
    assert response.status_code == 400
    assert "datasource_id" in response.json()["detail"]


def test_debug_api_assignment_missing_content_or_id_returns_400(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    """Inline debug with no content and no id returns 400."""
    response = client.post(
        f"{_base()}/debug",
        headers=superuser_token_headers,
        json={"execute_engine": "SQL", "datasource_id": "00000000-0000-0000-0000-000000000001"},
    )
    assert response.status_code == 400
    assert "id or content" in response.json()["detail"]


def test_debug_api_assignment_by_id_not_found_returns_404(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    response = client.post(
        f"{_base()}/debug",
        headers=superuser_token_headers,
        json={"id": str(uuid.uuid4())},
    )
    assert response.status_code == 404
    assert "ApiAssignment not found" in response.json()["detail"]
