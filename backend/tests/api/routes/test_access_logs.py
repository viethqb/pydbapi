"""Tests for Access Logs API (config, list, detail, datasource options)."""

import uuid
from datetime import UTC, datetime

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.config import settings
from app.models_dbapi import AccessRecord


def _base() -> str:
    return f"{settings.API_V1_STR}/access-logs"


def _seed_access_record(
    db: Session,
    *,
    path: str = "/test/api",
    http_method: str = "GET",
    status_code: int = 200,
    ip_address: str = "127.0.0.1",
    duration_ms: int = 42,
) -> AccessRecord:
    """Seed an AccessRecord directly via SQLModel."""
    rec = AccessRecord(
        ip_address=ip_address,
        http_method=http_method,
        path=path,
        status_code=status_code,
        duration_ms=duration_ms,
        created_at=datetime.now(UTC),
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return rec


# --- config get ---


def test_get_config_default(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    response = client.get(
        f"{_base()}/config",
        headers=superuser_token_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert "datasource_id" in data
    assert "use_starrocks_audit" in data


def test_get_config_unauthorized(client: TestClient) -> None:
    response = client.get(f"{_base()}/config")
    assert response.status_code == 401


# --- config put ---


def test_update_config_null_datasource(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    """Setting datasource_id to null means use main DB."""
    response = client.put(
        f"{_base()}/config",
        headers=superuser_token_headers,
        json={"datasource_id": None, "use_starrocks_audit": False},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["datasource_id"] is None
    assert data["use_starrocks_audit"] is False


def test_update_config_invalid_datasource(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    response = client.put(
        f"{_base()}/config",
        headers=superuser_token_headers,
        json={"datasource_id": str(uuid.uuid4())},
    )
    assert response.status_code == 404
    assert "DataSource" in response.json()["detail"]


def test_update_config_unauthorized(client: TestClient) -> None:
    response = client.put(
        f"{_base()}/config",
        json={"datasource_id": None},
    )
    assert response.status_code == 401


# --- datasource options ---


def test_datasource_options(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    response = client.get(
        f"{_base()}/datasource-options",
        headers=superuser_token_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert "data" in data
    assert isinstance(data["data"], list)


def test_datasource_options_unauthorized(client: TestClient) -> None:
    response = client.get(f"{_base()}/datasource-options")
    assert response.status_code == 401


# --- list access logs ---


def test_list_access_logs_empty(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    response = client.get(
        _base(),
        headers=superuser_token_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert "data" in data
    assert "total" in data
    assert isinstance(data["data"], list)


def test_list_access_logs_with_data(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    rec = _seed_access_record(db, path="/test/seeded-log")
    response = client.get(
        _base(),
        headers=superuser_token_headers,
        params={"path__ilike": "seeded-log"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 1
    found = next((r for r in data["data"] if r["id"] == str(rec.id)), None)
    assert found is not None
    assert found["path"] == "/test/seeded-log"


def test_list_access_logs_filter_status_success(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    _seed_access_record(db, status_code=200, path="/test/success-filter")
    _seed_access_record(db, status_code=500, path="/test/fail-filter")
    response = client.get(
        _base(),
        headers=superuser_token_headers,
        params={"status": "success", "path__ilike": "filter"},
    )
    assert response.status_code == 200
    data = response.json()
    for rec in data["data"]:
        assert rec["status_code"] < 400


def test_list_access_logs_filter_status_fail(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    _seed_access_record(db, status_code=500, path="/test/fail-only")
    response = client.get(
        _base(),
        headers=superuser_token_headers,
        params={"status": "fail", "path__ilike": "fail-only"},
    )
    assert response.status_code == 200
    data = response.json()
    for rec in data["data"]:
        assert rec["status_code"] >= 400


def test_list_access_logs_filter_http_method(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    _seed_access_record(db, http_method="POST", path="/test/method-filter")
    response = client.get(
        _base(),
        headers=superuser_token_headers,
        params={"http_method": "POST", "path__ilike": "method-filter"},
    )
    assert response.status_code == 200
    data = response.json()
    for rec in data["data"]:
        assert rec["http_method"] == "POST"


def test_list_access_logs_pagination(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    for i in range(3):
        _seed_access_record(db, path=f"/test/page-{i}")
    response = client.get(
        _base(),
        headers=superuser_token_headers,
        params={"page": 1, "page_size": 2, "path__ilike": "/test/page-"},
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data["data"]) <= 2


def test_list_access_logs_unauthorized(client: TestClient) -> None:
    response = client.get(_base())
    assert response.status_code == 401


# --- detail ---


def test_get_access_log_detail(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    rec = _seed_access_record(db, path="/test/detail-log")
    response = client.get(
        f"{_base()}/{rec.id}",
        headers=superuser_token_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == str(rec.id)
    assert data["path"] == "/test/detail-log"
    assert "api_display" in data
    assert "app_client_display" in data


def test_get_access_log_detail_not_found(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    response = client.get(
        f"{_base()}/{uuid.uuid4()}",
        headers=superuser_token_headers,
    )
    assert response.status_code == 404


def test_get_access_log_detail_unauthorized(client: TestClient) -> None:
    response = client.get(f"{_base()}/{uuid.uuid4()}")
    assert response.status_code == 401
