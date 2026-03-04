"""Tests for Permissions API (read-only, admin-only endpoints)."""

from fastapi.testclient import TestClient

from app.core.config import settings


def _base() -> str:
    return f"{settings.API_V1_STR}/permissions"


# --- list_permissions ---


def test_list_permissions(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    response = client.get(
        f"{_base()}/list",
        headers=superuser_token_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert "data" in data
    assert isinstance(data["data"], list)
    assert len(data["data"]) > 0
    # Verify structure of a permission
    first = data["data"][0]
    assert "id" in first
    assert "resource_type" in first
    assert "action" in first


def test_list_permissions_unauthorized(client: TestClient) -> None:
    response = client.get(f"{_base()}/list")
    assert response.status_code == 401


def test_list_permissions_forbidden_normal_user(
    client: TestClient, normal_user_token_headers: dict[str, str]
) -> None:
    response = client.get(
        f"{_base()}/list",
        headers=normal_user_token_headers,
    )
    assert response.status_code == 403


# --- get_resource_names ---


def test_get_resource_names(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    response = client.get(
        f"{_base()}/resource-names",
        headers=superuser_token_headers,
    )
    assert response.status_code == 200
    data = response.json()
    # All 6 resource type keys must be present
    for key in (
        "datasources",
        "modules",
        "api_assignments",
        "groups",
        "macro_defs",
        "clients",
    ):
        assert key in data
        assert isinstance(data[key], list)


def test_get_resource_names_unauthorized(client: TestClient) -> None:
    response = client.get(f"{_base()}/resource-names")
    assert response.status_code == 401


def test_get_resource_names_forbidden_normal_user(
    client: TestClient, normal_user_token_headers: dict[str, str]
) -> None:
    response = client.get(
        f"{_base()}/resource-names",
        headers=normal_user_token_headers,
    )
    assert response.status_code == 403


# --- permission structure validation ---


def test_permission_has_expected_resource_types(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    response = client.get(
        f"{_base()}/list",
        headers=superuser_token_headers,
    )
    assert response.status_code == 200
    data = response.json()
    resource_types = {p["resource_type"] for p in data["data"]}
    # At least the core resource types should be present
    for rt in ("datasource", "module", "group", "api_assignment", "macro_def", "client"):
        assert rt in resource_types, f"Missing resource_type: {rt}"
