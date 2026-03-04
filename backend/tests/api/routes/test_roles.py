"""Tests for Role management API (RBAC, admin-only endpoints)."""

import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.config import settings
from app.models_permission import Permission, RolePermissionLink, UserRoleLink
from tests.utils.role import create_random_role
from tests.utils.user import create_random_user


def _base() -> str:
    return f"{settings.API_V1_STR}/roles"


# --- create ---


def test_create_role(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    name = f"test-role-{uuid.uuid4().hex[:8]}"
    response = client.post(
        _base(),
        headers=superuser_token_headers,
        json={"name": name, "description": "A test role"},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == name
    assert data["description"] == "A test role"
    assert "id" in data
    assert "permission_ids" in data
    assert data["user_count"] == 0


def test_create_role_with_permissions(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    # Grab a real permission id
    perm = db.exec(select(Permission)).first()
    assert perm is not None
    name = f"role-perms-{uuid.uuid4().hex[:8]}"
    response = client.post(
        _base(),
        headers=superuser_token_headers,
        json={
            "name": name,
            "permission_ids": [str(perm.id)],
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert str(perm.id) in [str(pid) for pid in data["permission_ids"]]


def test_create_role_duplicate_name(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    role = create_random_role(db, name=f"dup-role-{uuid.uuid4().hex[:8]}")
    response = client.post(
        _base(),
        headers=superuser_token_headers,
        json={"name": role.name},
    )
    assert response.status_code == 400
    assert "already exists" in response.json()["detail"]


def test_create_role_unauthorized(client: TestClient) -> None:
    response = client.post(_base(), json={"name": "x"})
    assert response.status_code == 401


def test_create_role_forbidden_normal_user(
    client: TestClient, normal_user_token_headers: dict[str, str]
) -> None:
    response = client.post(
        _base(),
        headers=normal_user_token_headers,
        json={"name": "should-fail"},
    )
    assert response.status_code == 403


# --- list ---


def test_list_roles(
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
    # At least the seeded Admin/Dev/Viewer roles
    assert len(data["data"]) >= 3


def test_list_roles_unauthorized(client: TestClient) -> None:
    response = client.get(f"{_base()}/list")
    assert response.status_code == 401


def test_list_roles_forbidden_normal_user(
    client: TestClient, normal_user_token_headers: dict[str, str]
) -> None:
    response = client.get(
        f"{_base()}/list",
        headers=normal_user_token_headers,
    )
    assert response.status_code == 403


# --- get detail ---


def test_get_role(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    role = create_random_role(db, name=f"get-role-{uuid.uuid4().hex[:8]}")
    response = client.get(
        f"{_base()}/{role.id}",
        headers=superuser_token_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == str(role.id)
    assert data["name"] == role.name
    assert "permission_ids" in data
    assert "user_count" in data


def test_get_role_not_found(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    response = client.get(
        f"{_base()}/{uuid.uuid4()}",
        headers=superuser_token_headers,
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "Role not found"


# --- update ---


def test_update_role(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    role = create_random_role(db, name=f"upd-role-{uuid.uuid4().hex[:8]}")
    new_name = f"updated-{uuid.uuid4().hex[:8]}"
    response = client.put(
        f"{_base()}/{role.id}",
        headers=superuser_token_headers,
        json={"name": new_name, "description": "updated desc"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == new_name
    assert data["description"] == "updated desc"


def test_update_role_permissions(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    role = create_random_role(db, name=f"upd-perm-{uuid.uuid4().hex[:8]}")
    perm = db.exec(select(Permission)).first()
    assert perm is not None
    response = client.put(
        f"{_base()}/{role.id}",
        headers=superuser_token_headers,
        json={"permission_ids": [str(perm.id)]},
    )
    assert response.status_code == 200
    data = response.json()
    assert str(perm.id) in [str(pid) for pid in data["permission_ids"]]


def test_update_role_not_found(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    response = client.put(
        f"{_base()}/{uuid.uuid4()}",
        headers=superuser_token_headers,
        json={"name": "x"},
    )
    assert response.status_code == 404


# --- delete ---


def test_delete_role(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    role = create_random_role(db, name=f"del-role-{uuid.uuid4().hex[:8]}")
    response = client.delete(
        f"{_base()}/{role.id}",
        headers=superuser_token_headers,
    )
    assert response.status_code == 204


def test_delete_role_not_found(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    response = client.delete(
        f"{_base()}/{uuid.uuid4()}",
        headers=superuser_token_headers,
    )
    assert response.status_code == 404


# --- list_role_users ---


def test_list_role_users_empty(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    role = create_random_role(db, name=f"users-role-{uuid.uuid4().hex[:8]}")
    response = client.get(
        f"{_base()}/{role.id}/users",
        headers=superuser_token_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["data"] == []


def test_list_role_users_with_user(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    role = create_random_role(db, name=f"usrs-role-{uuid.uuid4().hex[:8]}")
    user = create_random_user(db)
    link = UserRoleLink(user_id=user.id, role_id=role.id)
    db.add(link)
    db.commit()
    response = client.get(
        f"{_base()}/{role.id}/users",
        headers=superuser_token_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data["data"]) >= 1
    assert any(u["id"] == str(user.id) for u in data["data"])


def test_list_role_users_not_found(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    response = client.get(
        f"{_base()}/{uuid.uuid4()}/users",
        headers=superuser_token_headers,
    )
    assert response.status_code == 404
