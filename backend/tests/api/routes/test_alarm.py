"""Tests for UnifyAlarm API (Phase 2, Task 2.5)."""

import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.config import settings
from tests.utils.alarm import create_random_alarm


def _base() -> str:
    return f"{settings.API_V1_STR}/alarm"


# --- list (POST) ---


def test_list_alarm_empty(
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


def test_list_alarm_with_data(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    create_random_alarm(db, name="list-me", alarm_type="email")
    response = client.post(
        f"{_base()}/list",
        headers=superuser_token_headers,
        json={"page": 1, "page_size": 10},
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data["data"]) >= 1
    assert data["total"] >= 1
    found = next((r for r in data["data"] if r["name"] == "list-me"), None)
    assert found is not None
    assert found["alarm_type"] == "email"
    assert "config" in found


def test_list_alarm_filter_alarm_type(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    create_random_alarm(db, alarm_type="email")
    create_random_alarm(db, alarm_type="slack")
    response = client.post(
        f"{_base()}/list",
        headers=superuser_token_headers,
        json={"page": 1, "page_size": 20, "alarm_type": "slack"},
    )
    assert response.status_code == 200
    data = response.json()
    assert all(r["alarm_type"] == "slack" for r in data["data"])


def test_list_alarm_filter_is_enabled(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    create_random_alarm(db, is_enabled=True)
    create_random_alarm(db, is_enabled=False)
    response = client.post(
        f"{_base()}/list",
        headers=superuser_token_headers,
        json={"page": 1, "page_size": 20, "is_enabled": False},
    )
    assert response.status_code == 200
    data = response.json()
    assert all(r["is_enabled"] is False for r in data["data"])


def test_list_alarm_unauthorized(client: TestClient) -> None:
    response = client.post(
        f"{_base()}/list",
        json={"page": 1, "page_size": 10},
    )
    assert response.status_code == 401


# --- create ---


def test_create_alarm(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    payload = {
        "name": "new-alarm",
        "alarm_type": "email",
        "config": {"recipients": ["ops@example.com"], "subject": "Alert"},
        "is_enabled": True,
    }
    response = client.post(
        f"{_base()}/create",
        headers=superuser_token_headers,
        json=payload,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == payload["name"]
    assert data["alarm_type"] == payload["alarm_type"]
    assert data["config"] == payload["config"]
    assert data["is_enabled"] is True
    assert "id" in data
    assert "created_at" in data


def test_create_alarm_minimal(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    response = client.post(
        f"{_base()}/create",
        headers=superuser_token_headers,
        json={"name": "min-alarm", "alarm_type": "webhook"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "min-alarm"
    assert data["alarm_type"] == "webhook"
    assert isinstance(data.get("config"), dict)
    assert data["is_enabled"] is True  # default


def test_create_alarm_unauthorized(client: TestClient) -> None:
    response = client.post(
        f"{_base()}/create",
        json={"name": "x", "alarm_type": "email"},
    )
    assert response.status_code == 401


# --- update ---


def test_update_alarm(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    a = create_random_alarm(db, name="before", alarm_type="email", is_enabled=True)
    response = client.post(
        f"{_base()}/update",
        headers=superuser_token_headers,
        json={
            "id": str(a.id),
            "name": "after",
            "alarm_type": "slack",
            "config": {"channel": "#alerts"},
            "is_enabled": False,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "after"
    assert data["alarm_type"] == "slack"
    assert data["config"] == {"channel": "#alerts"}
    assert data["is_enabled"] is False
    assert data["id"] == str(a.id)


def test_update_alarm_not_found(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    response = client.post(
        f"{_base()}/update",
        headers=superuser_token_headers,
        json={"id": str(uuid.uuid4()), "name": "x"},
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "Alarm not found"


# --- delete ---


def test_delete_alarm(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    a = create_random_alarm(db)
    response = client.delete(
        f"{_base()}/delete/{a.id}",
        headers=superuser_token_headers,
    )
    assert response.status_code == 200
    assert response.json()["message"] == "Alarm deleted successfully"


def test_delete_alarm_not_found(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    response = client.delete(
        f"{_base()}/delete/{uuid.uuid4()}",
        headers=superuser_token_headers,
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "Alarm not found"


# --- get detail ---


def test_get_alarm(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    a = create_random_alarm(db, name="detail-me", alarm_type="pagerduty")
    response = client.get(
        f"{_base()}/{a.id}",
        headers=superuser_token_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "detail-me"
    assert data["alarm_type"] == "pagerduty"
    assert data["id"] == str(a.id)
    assert "config" in data
    assert "created_at" in data
    assert "updated_at" in data


def test_get_alarm_not_found(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    response = client.get(
        f"{_base()}/{uuid.uuid4()}",
        headers=superuser_token_headers,
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "Alarm not found"
