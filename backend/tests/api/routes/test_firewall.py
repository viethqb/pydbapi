"""Tests for FirewallRules API (Phase 2, Task 2.5)."""

import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.config import settings
from app.models_dbapi import FirewallRuleTypeEnum
from tests.utils.firewall import create_random_firewall_rule


def _base() -> str:
    return f"{settings.API_V1_STR}/firewall"


# --- list (POST) ---


def test_list_firewall_empty(
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


def test_list_firewall_with_data(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    create_random_firewall_rule(db, ip_range="10.0.0.1/32", description="list-me")
    response = client.post(
        f"{_base()}/list",
        headers=superuser_token_headers,
        json={"page": 1, "page_size": 10},
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data["data"]) >= 1
    assert data["total"] >= 1
    found = next(
        (r for r in data["data"] if r.get("description") == "list-me"), None
    )
    assert found is not None
    assert found["ip_range"] == "10.0.0.1/32"
    assert found["rule_type"] in ("allow", "deny")


def test_list_firewall_filter_rule_type(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    create_random_firewall_rule(db, rule_type=FirewallRuleTypeEnum.ALLOW)
    create_random_firewall_rule(db, rule_type=FirewallRuleTypeEnum.DENY)
    response = client.post(
        f"{_base()}/list",
        headers=superuser_token_headers,
        json={"page": 1, "page_size": 20, "rule_type": "allow"},
    )
    assert response.status_code == 200
    data = response.json()
    assert all(r["rule_type"] == "allow" for r in data["data"])


def test_list_firewall_filter_is_active(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    create_random_firewall_rule(db, is_active=True)
    create_random_firewall_rule(db, is_active=False)
    response = client.post(
        f"{_base()}/list",
        headers=superuser_token_headers,
        json={"page": 1, "page_size": 20, "is_active": True},
    )
    assert response.status_code == 200
    data = response.json()
    assert all(r["is_active"] is True for r in data["data"])


def test_list_firewall_unauthorized(client: TestClient) -> None:
    response = client.post(
        f"{_base()}/list",
        json={"page": 1, "page_size": 10},
    )
    assert response.status_code == 401


# --- create ---


def test_create_firewall_rule(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    payload = {
        "rule_type": "allow",
        "ip_range": "192.168.0.0/24",
        "description": "Office subnet",
        "is_active": True,
        "sort_order": 1,
    }
    response = client.post(
        f"{_base()}/create",
        headers=superuser_token_headers,
        json=payload,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["rule_type"] == payload["rule_type"]
    assert data["ip_range"] == payload["ip_range"]
    assert data["description"] == payload["description"]
    assert data["sort_order"] == payload["sort_order"]
    assert "id" in data
    assert "created_at" in data


def test_create_firewall_rule_deny(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    response = client.post(
        f"{_base()}/create",
        headers=superuser_token_headers,
        json={"rule_type": "deny", "ip_range": "0.0.0.0/0"},
    )
    assert response.status_code == 200
    assert response.json()["rule_type"] == "deny"


def test_create_firewall_rule_unauthorized(client: TestClient) -> None:
    response = client.post(
        f"{_base()}/create",
        json={"rule_type": "allow", "ip_range": "10.0.0.1/32"},
    )
    assert response.status_code == 401


def test_create_firewall_rule_invalid_rule_type(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    response = client.post(
        f"{_base()}/create",
        headers=superuser_token_headers,
        json={"rule_type": "invalid", "ip_range": "10.0.0.1/32"},
    )
    assert response.status_code == 422


# --- update ---


def test_update_firewall_rule(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    r = create_random_firewall_rule(
        db, ip_range="10.0.0.1/32", description="before", is_active=True
    )
    response = client.post(
        f"{_base()}/update",
        headers=superuser_token_headers,
        json={
            "id": str(r.id),
            "ip_range": "10.0.0.0/24",
            "description": "after",
            "is_active": False,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["ip_range"] == "10.0.0.0/24"
    assert data["description"] == "after"
    assert data["is_active"] is False
    assert data["id"] == str(r.id)


def test_update_firewall_rule_not_found(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    response = client.post(
        f"{_base()}/update",
        headers=superuser_token_headers,
        json={"id": str(uuid.uuid4()), "description": "x"},
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "Firewall rule not found"


# --- delete ---


def test_delete_firewall_rule(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    r = create_random_firewall_rule(db)
    response = client.delete(
        f"{_base()}/delete/{r.id}",
        headers=superuser_token_headers,
    )
    assert response.status_code == 200
    assert response.json()["message"] == "Firewall rule deleted successfully"


def test_delete_firewall_rule_not_found(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    response = client.delete(
        f"{_base()}/delete/{uuid.uuid4()}",
        headers=superuser_token_headers,
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "Firewall rule not found"


# --- get detail ---


def test_get_firewall_rule(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    r = create_random_firewall_rule(
        db, ip_range="172.16.0.1/32", description="detail-me"
    )
    response = client.get(
        f"{_base()}/{r.id}",
        headers=superuser_token_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["ip_range"] == "172.16.0.1/32"
    assert data["description"] == "detail-me"
    assert data["id"] == str(r.id)
    assert "created_at" in data
    assert "updated_at" in data


def test_get_firewall_rule_not_found(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    response = client.get(
        f"{_base()}/{uuid.uuid4()}",
        headers=superuser_token_headers,
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "Firewall rule not found"
