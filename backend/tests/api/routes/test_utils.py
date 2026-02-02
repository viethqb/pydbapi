"""Tests for /api/v1/utils routes (e.g. health-check)."""

from unittest.mock import patch

from fastapi.testclient import TestClient

from app.core.config import settings


def test_health_check_returns_200_when_ready(client: TestClient) -> None:
    """GET /health-check/ returns 200 with true when Postgres (and Redis if required) are up."""
    r = client.get(f"{settings.API_V1_STR}/utils/health-check/")
    assert r.status_code == 200
    assert r.json() is True


def test_health_check_returns_503_when_readiness_fails(client: TestClient) -> None:
    """GET /health-check/ returns 503 with envelope when readiness_check fails."""
    with patch(
        "app.api.routes.utils.readiness_check", return_value=(False, ["postgres"])
    ):
        r = client.get(f"{settings.API_V1_STR}/utils/health-check/")
    assert r.status_code == 503
    data = r.json()
    assert data.get("success") is False
    assert "data" in data
    assert "postgres" in data["data"]
