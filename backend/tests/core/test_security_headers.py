"""Tests for security headers middleware (#31).

Runs without database:
    uv run pytest tests/core/test_security_headers.py -v --noconftest
"""

from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.types import ASGIApp, Receive, Scope, Send

from app.main import SecurityHeadersMiddleware, _SECURITY_HEADERS


def _make_app() -> FastAPI:
    inner = FastAPI()

    @inner.get("/test")
    def _endpoint():
        return {"ok": True}

    inner.add_middleware(SecurityHeadersMiddleware)
    return inner


class TestSecurityHeaders:
    def test_all_headers_present(self):
        app = _make_app()
        client = TestClient(app)
        resp = client.get("/test")
        assert resp.status_code == 200

        for name, value in _SECURITY_HEADERS:
            header_name = name.decode()
            header_value = value.decode()
            assert resp.headers.get(header_name) == header_value, (
                f"Missing or wrong header: {header_name}"
            )

    def test_x_content_type_options(self):
        app = _make_app()
        client = TestClient(app)
        resp = client.get("/test")
        assert resp.headers["x-content-type-options"] == "nosniff"

    def test_x_frame_options(self):
        app = _make_app()
        client = TestClient(app)
        resp = client.get("/test")
        assert resp.headers["x-frame-options"] == "DENY"

    def test_referrer_policy(self):
        app = _make_app()
        client = TestClient(app)
        resp = client.get("/test")
        assert resp.headers["referrer-policy"] == "strict-origin-when-cross-origin"
