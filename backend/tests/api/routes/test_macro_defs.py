"""Tests for ApiMacroDef management API (CRUD + publish/unpublish + versions)."""

import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.config import settings
from app.models_dbapi import MacroTypeEnum
from tests.utils.macro_def import create_random_macro_def
from tests.utils.module import create_random_module


def _base() -> str:
    return f"{settings.API_V1_STR}/macro-defs"


# --- simple list (GET) ---


def test_list_macro_defs_simple(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    create_random_macro_def(db)
    response = client.get(_base(), headers=superuser_token_headers)
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 1


def test_list_macro_defs_simple_unauthorized(client: TestClient) -> None:
    response = client.get(_base())
    assert response.status_code == 401


# --- paginated list (POST /list) ---


def test_list_macro_defs_paginated(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    m = create_random_macro_def(db)
    response = client.post(
        f"{_base()}/list",
        headers=superuser_token_headers,
        json={"page": 1, "page_size": 10, "name__ilike": m.name},
    )
    assert response.status_code == 200
    data = response.json()
    assert "data" in data
    assert "total" in data
    assert data["total"] >= 1


# --- create ---


def test_create_macro_def(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    name = f"macro-{uuid.uuid4().hex[:8]}"
    response = client.post(
        f"{_base()}/create",
        headers=superuser_token_headers,
        json={
            "name": name,
            "macro_type": "JINJA",
            "content": "{% macro test() %}SELECT 1{% endmacro %}",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == name
    assert data["macro_type"] == "JINJA"
    assert "id" in data


def test_create_macro_def_python(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    name = f"pymacro-{uuid.uuid4().hex[:8]}"
    response = client.post(
        f"{_base()}/create",
        headers=superuser_token_headers,
        json={
            "name": name,
            "macro_type": "PYTHON",
            "content": "def helper(): return 42",
        },
    )
    assert response.status_code == 200
    assert response.json()["macro_type"] == "PYTHON"


def test_create_macro_def_with_module(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    mod = create_random_module(db)
    name = f"mod-macro-{uuid.uuid4().hex[:8]}"
    response = client.post(
        f"{_base()}/create",
        headers=superuser_token_headers,
        json={
            "name": name,
            "macro_type": "JINJA",
            "content": "{% macro m() %}SELECT 1{% endmacro %}",
            "module_id": str(mod.id),
        },
    )
    assert response.status_code == 200
    assert response.json()["module_id"] == str(mod.id)


def test_create_macro_def_unauthorized(client: TestClient) -> None:
    response = client.post(
        f"{_base()}/create",
        json={"name": "x", "macro_type": "JINJA", "content": "x"},
    )
    assert response.status_code == 401


# --- update ---


def test_update_macro_def(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    m = create_random_macro_def(db)
    new_name = f"updated-{uuid.uuid4().hex[:8]}"
    response = client.post(
        f"{_base()}/update",
        headers=superuser_token_headers,
        json={"id": str(m.id), "name": new_name, "description": "updated"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == new_name
    assert data["description"] == "updated"


def test_update_macro_def_not_found(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    response = client.post(
        f"{_base()}/update",
        headers=superuser_token_headers,
        json={"id": str(uuid.uuid4()), "name": "x"},
    )
    assert response.status_code == 404


# --- delete ---


def test_delete_macro_def(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    m = create_random_macro_def(db)
    response = client.delete(
        f"{_base()}/delete/{m.id}",
        headers=superuser_token_headers,
    )
    assert response.status_code == 200
    assert "deleted" in response.json()["message"].lower()


def test_delete_macro_def_not_found(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    response = client.delete(
        f"{_base()}/delete/{uuid.uuid4()}",
        headers=superuser_token_headers,
    )
    assert response.status_code == 404


# --- get detail ---


def test_get_macro_def(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    m = create_random_macro_def(db)
    response = client.get(
        f"{_base()}/{m.id}",
        headers=superuser_token_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == str(m.id)
    assert data["name"] == m.name
    assert "used_by_apis_count" in data


def test_get_macro_def_not_found(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    response = client.get(
        f"{_base()}/{uuid.uuid4()}",
        headers=superuser_token_headers,
    )
    assert response.status_code == 404


# --- version lifecycle ---


def test_create_version(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    m = create_random_macro_def(db)
    response = client.post(
        f"{_base()}/{m.id}/versions/create",
        headers=superuser_token_headers,
        json={"commit_message": "v1"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["api_macro_def_id"] == str(m.id)
    assert data["version"] == 1
    assert data["commit_message"] == "v1"
    assert "content_snapshot" in data


def test_create_version_not_found(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    response = client.post(
        f"{_base()}/{uuid.uuid4()}/versions/create",
        headers=superuser_token_headers,
        json={"commit_message": "x"},
    )
    assert response.status_code == 404


def test_list_versions(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    m = create_random_macro_def(db)
    # Create a version first
    client.post(
        f"{_base()}/{m.id}/versions/create",
        headers=superuser_token_headers,
        json={"commit_message": "v1"},
    )
    response = client.get(
        f"{_base()}/{m.id}/versions",
        headers=superuser_token_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert "data" in data
    assert len(data["data"]) >= 1


def test_get_version(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    m = create_random_macro_def(db)
    create_resp = client.post(
        f"{_base()}/{m.id}/versions/create",
        headers=superuser_token_headers,
        json={"commit_message": "v1"},
    )
    version_id = create_resp.json()["id"]
    response = client.get(
        f"{_base()}/versions/{version_id}",
        headers=superuser_token_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == version_id
    assert "content_snapshot" in data


def test_get_version_not_found(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    response = client.get(
        f"{_base()}/versions/{uuid.uuid4()}",
        headers=superuser_token_headers,
    )
    assert response.status_code == 404


# --- publish / unpublish ---


def test_publish_macro_def(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    m = create_random_macro_def(db)
    # Create a version
    v_resp = client.post(
        f"{_base()}/{m.id}/versions/create",
        headers=superuser_token_headers,
        json={"commit_message": "for publish"},
    )
    version_id = v_resp.json()["id"]
    # Publish
    response = client.post(
        f"{_base()}/publish",
        headers=superuser_token_headers,
        json={"id": str(m.id), "version_id": version_id},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["is_published"] is True
    assert data["published_version_id"] == version_id


def test_publish_without_version_id(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    m = create_random_macro_def(db)
    response = client.post(
        f"{_base()}/publish",
        headers=superuser_token_headers,
        json={"id": str(m.id)},
    )
    assert response.status_code == 400
    assert "version_id" in response.json()["detail"].lower()


def test_unpublish_macro_def(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    m = create_random_macro_def(db)
    # Create, publish, then unpublish
    v_resp = client.post(
        f"{_base()}/{m.id}/versions/create",
        headers=superuser_token_headers,
        json={"commit_message": "for unpublish"},
    )
    version_id = v_resp.json()["id"]
    client.post(
        f"{_base()}/publish",
        headers=superuser_token_headers,
        json={"id": str(m.id), "version_id": version_id},
    )
    response = client.post(
        f"{_base()}/unpublish",
        headers=superuser_token_headers,
        json={"id": str(m.id)},
    )
    assert response.status_code == 200
    assert response.json()["is_published"] is False


# --- restore version ---


def test_restore_version(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    m = create_random_macro_def(db, content="original content")
    v_resp = client.post(
        f"{_base()}/{m.id}/versions/create",
        headers=superuser_token_headers,
        json={"commit_message": "snapshot"},
    )
    version_id = v_resp.json()["id"]
    # Update content
    client.post(
        f"{_base()}/update",
        headers=superuser_token_headers,
        json={"id": str(m.id), "content": "modified content"},
    )
    # Restore
    response = client.post(
        f"{_base()}/{m.id}/versions/{version_id}/restore",
        headers=superuser_token_headers,
    )
    assert response.status_code == 200
    assert response.json()["content"] == "original content"


# --- revert to draft ---


def test_revert_to_draft(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    m = create_random_macro_def(db)
    v_resp = client.post(
        f"{_base()}/{m.id}/versions/create",
        headers=superuser_token_headers,
        json={"commit_message": "draft-test"},
    )
    version_id = v_resp.json()["id"]
    # Publish then unpublish to allow revert
    client.post(
        f"{_base()}/publish",
        headers=superuser_token_headers,
        json={"id": str(m.id), "version_id": version_id},
    )
    client.post(
        f"{_base()}/unpublish",
        headers=superuser_token_headers,
        json={"id": str(m.id)},
    )
    response = client.post(
        f"{_base()}/versions/{version_id}/revert-to-draft",
        headers=superuser_token_headers,
    )
    assert response.status_code == 200
    assert "draft" in response.json()["message"].lower()


def test_revert_to_draft_while_published(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    m = create_random_macro_def(db)
    v_resp = client.post(
        f"{_base()}/{m.id}/versions/create",
        headers=superuser_token_headers,
        json={"commit_message": "block-revert"},
    )
    version_id = v_resp.json()["id"]
    client.post(
        f"{_base()}/publish",
        headers=superuser_token_headers,
        json={"id": str(m.id), "version_id": version_id},
    )
    response = client.post(
        f"{_base()}/versions/{version_id}/revert-to-draft",
        headers=superuser_token_headers,
    )
    assert response.status_code == 400
    assert "published" in response.json()["detail"].lower()


# --- delete version ---


def test_delete_version(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    m = create_random_macro_def(db)
    v_resp = client.post(
        f"{_base()}/{m.id}/versions/create",
        headers=superuser_token_headers,
        json={"commit_message": "to-delete"},
    )
    version_id = v_resp.json()["id"]
    response = client.delete(
        f"{_base()}/versions/{version_id}",
        headers=superuser_token_headers,
    )
    assert response.status_code == 200
    assert "deleted" in response.json()["message"].lower()


def test_delete_published_version(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    m = create_random_macro_def(db)
    v_resp = client.post(
        f"{_base()}/{m.id}/versions/create",
        headers=superuser_token_headers,
        json={"commit_message": "published-ver"},
    )
    version_id = v_resp.json()["id"]
    client.post(
        f"{_base()}/publish",
        headers=superuser_token_headers,
        json={"id": str(m.id), "version_id": version_id},
    )
    response = client.delete(
        f"{_base()}/versions/{version_id}",
        headers=superuser_token_headers,
    )
    assert response.status_code == 400
    assert "published" in response.json()["detail"].lower()


def test_delete_version_not_found(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    response = client.delete(
        f"{_base()}/versions/{uuid.uuid4()}",
        headers=superuser_token_headers,
    )
    assert response.status_code == 404
