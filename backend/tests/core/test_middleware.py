"""Tests for RequestContextMiddleware (X-Request-ID generation and echo)."""

from fastapi.testclient import TestClient

from app.main import app


def test_request_id_generated() -> None:
    """When no X-Request-ID is sent, one should be generated and returned."""
    with TestClient(app) as c:
        response = c.get("/api/v1/utils/health-check/")
        assert response.status_code == 200
        request_id = response.headers.get("x-request-id")
        assert request_id is not None
        assert len(request_id) > 0


def test_request_id_echoed() -> None:
    """When X-Request-ID is sent, it should be echoed back."""
    with TestClient(app) as c:
        custom_id = "test-correlation-id-12345"
        response = c.get(
            "/api/v1/utils/health-check/",
            headers={"X-Request-ID": custom_id},
        )
        assert response.status_code == 200
        assert response.headers.get("x-request-id") == custom_id
