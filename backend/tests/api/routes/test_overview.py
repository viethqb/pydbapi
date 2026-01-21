"""Tests for Overview / Dashboard API (Phase 2, Task 2.7)."""

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.config import settings
from tests.utils.alarm import create_random_alarm
from tests.utils.api_assignment import create_random_assignment
from tests.utils.client import create_random_client
from tests.utils.datasource import create_random_datasource
from tests.utils.firewall import create_random_firewall_rule
from tests.utils.group import create_random_group
from tests.utils.module import create_random_module
from tests.utils.overview import create_random_access_record, create_random_version_commit


def _base() -> str:
    return f"{settings.API_V1_STR}/overview"


STATS_KEYS = [
    "datasources",
    "modules",
    "groups",
    "apis_total",
    "apis_published",
    "clients",
    "firewall_rules",
    "alarms",
]


# --- /overview/stats ---


def test_get_overview_stats_structure(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    """GET /overview/stats returns 200 and expected keys; values are non‑negative ints."""
    response = client.get(f"{_base()}/stats", headers=superuser_token_headers)
    assert response.status_code == 200
    data = response.json()
    for k in STATS_KEYS:
        assert k in data, f"missing key: {k}"
        assert isinstance(data[k], int), f"{k} should be int"
        assert data[k] >= 0, f"{k} should be >= 0"


def test_get_overview_stats_with_data(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    """With created entities, stats reflect at least those counts."""
    create_random_datasource(db)
    create_random_module(db)
    create_random_group(db)
    create_random_assignment(db, is_published=True)
    create_random_assignment(db, is_published=False)
    create_random_client(db)
    create_random_firewall_rule(db)
    create_random_alarm(db)

    response = client.get(f"{_base()}/stats", headers=superuser_token_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["datasources"] >= 1
    assert data["modules"] >= 1
    assert data["groups"] >= 1
    assert data["apis_total"] >= 2
    assert data["apis_published"] >= 1
    assert data["clients"] >= 1
    assert data["firewall_rules"] >= 1
    assert data["alarms"] >= 1


def test_get_overview_stats_unauthorized(client: TestClient) -> None:
    """GET /overview/stats without auth returns 401."""
    response = client.get(f"{_base()}/stats")
    assert response.status_code == 401


# --- /overview/recent-access ---


def test_get_recent_access_empty(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    """GET /overview/recent-access returns 200 and data list."""
    response = client.get(f"{_base()}/recent-access", headers=superuser_token_headers)
    assert response.status_code == 200
    data = response.json()
    assert "data" in data
    assert isinstance(data["data"], list)


def test_get_recent_access_with_data(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    """With AccessRecord, recent-access includes it; request_body is omitted."""
    create_random_access_record(db, path="/api/overview-test", status_code=201)

    response = client.get(f"{_base()}/recent-access", headers=superuser_token_headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data["data"]) >= 1
    rec = next((r for r in data["data"] if r.get("path") == "/api/overview-test"), data["data"][0])
    assert "id" in rec
    assert "api_assignment_id" in rec
    assert "app_client_id" in rec
    assert "ip_address" in rec
    assert "http_method" in rec
    assert "path" in rec
    assert "status_code" in rec
    assert "created_at" in rec
    assert "request_body" not in rec


def test_get_recent_access_limit_param(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    """GET /overview/recent-access?limit=2 returns at most 2 items."""
    create_random_access_record(db, path="/a1")
    create_random_access_record(db, path="/a2")
    create_random_access_record(db, path="/a3")

    response = client.get(
        f"{_base()}/recent-access",
        headers=superuser_token_headers,
        params={"limit": 2},
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data["data"]) <= 2


def test_get_recent_access_unauthorized(client: TestClient) -> None:
    """GET /overview/recent-access without auth returns 401."""
    response = client.get(f"{_base()}/recent-access")
    assert response.status_code == 401


# --- /overview/recent-commits ---


def test_get_recent_commits_empty(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    """GET /overview/recent-commits returns 200 and data list."""
    response = client.get(f"{_base()}/recent-commits", headers=superuser_token_headers)
    assert response.status_code == 200
    data = response.json()
    assert "data" in data
    assert isinstance(data["data"], list)


def test_get_recent_commits_with_data(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    """With VersionCommit, recent-commits includes it; content_snapshot is omitted."""
    api = create_random_assignment(db)
    create_random_version_commit(
        db,
        api_assignment_id=api.id,
        commit_message="overview-commit-msg",
        version=2,
    )

    response = client.get(f"{_base()}/recent-commits", headers=superuser_token_headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data["data"]) >= 1
    vc = next(
        (r for r in data["data"] if r.get("commit_message") == "overview-commit-msg"),
        data["data"][0],
    )
    assert "id" in vc
    assert "api_assignment_id" in vc
    assert str(vc["api_assignment_id"]) == str(api.id)
    assert "version" in vc
    assert vc["version"] == 2
    assert "commit_message" in vc
    assert "committed_at" in vc
    assert "content_snapshot" not in vc


def test_get_recent_commits_limit_param(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    """GET /overview/recent-commits?limit=2 returns at most 2 items."""
    api = create_random_assignment(db)
    create_random_version_commit(db, api_assignment_id=api.id, version=1)
    create_random_version_commit(db, api_assignment_id=api.id, version=2)
    create_random_version_commit(db, api_assignment_id=api.id, version=3)

    response = client.get(
        f"{_base()}/recent-commits",
        headers=superuser_token_headers,
        params={"limit": 2},
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data["data"]) <= 2


def test_get_recent_commits_unauthorized(client: TestClient) -> None:
    """GET /overview/recent-commits without auth returns 401."""
    response = client.get(f"{_base()}/recent-commits")
    assert response.status_code == 401
