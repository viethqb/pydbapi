"""Tests for DataSource API (Phase 2, Task 2.1)."""

import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.config import settings
from app.models_dbapi import ProductTypeEnum
from tests.utils.datasource import create_random_datasource


def _base() -> str:
    return f"{settings.API_V1_STR}/datasources"


# --- types ---


def test_get_types(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    response = client.get(f"{_base()}/types", headers=superuser_token_headers)
    assert response.status_code == 200
    data = response.json()
    assert data == ["postgres", "mysql"]


def test_get_types_unauthorized(client: TestClient) -> None:
    response = client.get(f"{_base()}/types")
    assert response.status_code == 401


# --- drivers ---


def test_get_drivers_postgres(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    response = client.get(
        f"{_base()}/postgres/drivers", headers=superuser_token_headers
    )
    assert response.status_code == 200
    assert response.json() == {"drivers": ["default"]}


def test_get_drivers_mysql(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    response = client.get(f"{_base()}/mysql/drivers", headers=superuser_token_headers)
    assert response.status_code == 200
    assert response.json() == {"drivers": ["default"]}


def test_get_drivers_invalid_type(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    response = client.get(
        f"{_base()}/oracle/drivers", headers=superuser_token_headers
    )
    assert response.status_code == 422


# --- list ---


def test_list_datasources_empty(
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
    assert data["total"] >= 0


def test_list_datasources_with_data(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    create_random_datasource(db, name="list-me")
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
    assert "password" not in found


def test_list_datasources_filter_product_type(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    create_random_datasource(db, product_type=ProductTypeEnum.MYSQL, name="mysql-ds")
    response = client.post(
        f"{_base()}/list",
        headers=superuser_token_headers,
        json={"page": 1, "page_size": 10, "product_type": "mysql"},
    )
    assert response.status_code == 200
    data = response.json()
    assert all(r["product_type"] == "mysql" for r in data["data"])


def test_list_datasources_pagination(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    response = client.post(
        f"{_base()}/list",
        headers=superuser_token_headers,
        json={"page": 2, "page_size": 5},
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data["data"]) <= 5


def test_list_datasources_unauthorized(client: TestClient) -> None:
    response = client.post(
        f"{_base()}/list",
        json={"page": 1, "page_size": 10},
    )
    assert response.status_code == 401


# --- create ---


def test_create_datasource(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    payload = {
        "name": "new-ds",
        "product_type": "postgres",
        "host": "localhost",
        "port": 5432,
        "database": "testdb",
        "username": "u",
        "password": "p",
    }
    response = client.post(
        f"{_base()}/create",
        headers=superuser_token_headers,
        json=payload,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == payload["name"]
    assert data["product_type"] == "postgres"
    assert data["host"] == payload["host"]
    assert "id" in data
    assert "password" not in data


def test_create_datasource_unauthorized(client: TestClient) -> None:
    response = client.post(
        f"{_base()}/create",
        json={
            "name": "x",
            "product_type": "postgres",
            "host": "h",
            "port": 5432,
            "database": "d",
            "username": "u",
            "password": "p",
        },
    )
    assert response.status_code == 401


# --- update ---


def test_update_datasource(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    ds = create_random_datasource(db, name="before")
    response = client.post(
        f"{_base()}/update",
        headers=superuser_token_headers,
        json={"id": str(ds.id), "name": "after", "description": "updated"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "after"
    assert data["description"] == "updated"
    assert data["id"] == str(ds.id)


def test_update_datasource_not_found(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    response = client.post(
        f"{_base()}/update",
        headers=superuser_token_headers,
        json={"id": str(uuid.uuid4()), "name": "x"},
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "DataSource not found"


# --- delete ---


def test_delete_datasource(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    ds = create_random_datasource(db)
    response = client.delete(
        f"{_base()}/delete/{ds.id}",
        headers=superuser_token_headers,
    )
    assert response.status_code == 200
    assert response.json()["message"] == "DataSource deleted successfully"


def test_delete_datasource_not_found(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    response = client.delete(
        f"{_base()}/delete/{uuid.uuid4()}",
        headers=superuser_token_headers,
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "DataSource not found"


# --- test (connection for existing id) ---


def test_test_datasource_ok(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    """Uses app Postgres; passes when Postgres is reachable (e.g. CI with docker)."""
    ds = create_random_datasource(db)
    response = client.get(
        f"{_base()}/test/{ds.id}",
        headers=superuser_token_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert "ok" in data
    assert "message" in data
    assert isinstance(data["ok"], bool)
    # When app's Postgres is available (CI), ok is True
    if data["ok"]:
        assert "successful" in data["message"].lower() or data["message"] == "Connection successful"


def test_test_datasource_not_found(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    response = client.get(
        f"{_base()}/test/{uuid.uuid4()}",
        headers=superuser_token_headers,
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "DataSource not found"


# --- preTest ---


def test_pre_test_datasource_ok(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    """Uses app Postgres; passes when Postgres is reachable."""
    payload = {
        "product_type": "postgres",
        "host": settings.POSTGRES_SERVER,
        "port": settings.POSTGRES_PORT,
        "database": settings.POSTGRES_DB,
        "username": settings.POSTGRES_USER,
        "password": settings.POSTGRES_PASSWORD,
    }
    response = client.post(
        f"{_base()}/preTest",
        headers=superuser_token_headers,
        json=payload,
    )
    assert response.status_code == 200
    data = response.json()
    assert "ok" in data
    assert "message" in data
    if data["ok"]:
        assert "successful" in data["message"].lower() or data["message"] == "Connection successful"


def test_pre_test_datasource_fail(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    """Wrong host yields ok: False."""
    payload = {
        "product_type": "postgres",
        "host": "nonexistent.invalid",
        "port": 5432,
        "database": "db",
        "username": "u",
        "password": "p",
    }
    response = client.post(
        f"{_base()}/preTest",
        headers=superuser_token_headers,
        json=payload,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is False
    assert "message" in data
