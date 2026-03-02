"""
Unit tests for auth endpoint rate limiting (require_rate_limit dependency).

Runs without database/fixtures:
    uv run python -m pytest tests/api/test_auth_ratelimit.py -v --noconftest
"""

from unittest.mock import patch

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from app.api.deps import require_rate_limit
from app.core.config import settings


def _make_app(key_prefix: str, limit: int) -> FastAPI:
    """Create a minimal FastAPI app with a single rate-limited endpoint."""
    app = FastAPI()

    @app.get(
        "/test",
        dependencies=[Depends(require_rate_limit(key_prefix, limit))],
    )
    def _endpoint():
        return {"ok": True}

    return app


class TestRequireRateLimit:
    """Tests for the require_rate_limit dependency factory."""

    def test_allows_under_limit(self):
        app = _make_app("test_allow", 5)
        client = TestClient(app)
        with patch("app.api.deps.check_rate_limit", return_value=True):
            resp = client.get("/test")
        assert resp.status_code == 200
        assert resp.json() == {"ok": True}

    def test_blocks_over_limit(self):
        app = _make_app("test_block", 5)
        client = TestClient(app)
        with patch("app.api.deps.check_rate_limit", return_value=False):
            resp = client.get("/test")
        assert resp.status_code == 429
        assert "Too many requests" in resp.json()["detail"]

    def test_different_ips_independent(self):
        """Each IP gets its own rate limit bucket."""
        app = _make_app("test_ip", 5)
        client = TestClient(app)

        calls: list[tuple[str, int]] = []

        def _capture(key: str, limit: int | None = None) -> bool:
            calls.append((key, limit))
            return True

        with (
            patch("app.api.deps.check_rate_limit", side_effect=_capture),
            patch.object(settings, "TRUSTED_PROXY_COUNT", 1),
        ):
            client.get("/test", headers={"x-forwarded-for": "1.2.3.4"})
            client.get("/test", headers={"x-forwarded-for": "5.6.7.8"})

        assert len(calls) == 2
        assert calls[0][0] == "auth:test_ip:1.2.3.4"
        assert calls[1][0] == "auth:test_ip:5.6.7.8"

    def test_limit_zero_disables(self):
        """Limit=0 means check_rate_limit returns True (no limit), so always allowed."""
        app = _make_app("test_zero", 0)
        client = TestClient(app)
        # check_rate_limit with limit<=0 returns True without touching Redis
        resp = client.get("/test")
        assert resp.status_code == 200

    def test_respects_kill_switch(self):
        """When FLOW_CONTROL_RATE_LIMIT_ENABLED=False, always allowed."""
        app = _make_app("test_kill", 1)
        client = TestClient(app)
        with patch("app.core.gateway.ratelimit.settings") as mock_settings:
            mock_settings.FLOW_CONTROL_RATE_LIMIT_ENABLED = False
            resp = client.get("/test")
        assert resp.status_code == 200

    def test_key_includes_prefix(self):
        """The rate limit key includes the 'auth:{prefix}:{ip}' format."""
        app = _make_app("login", 5)
        client = TestClient(app)

        captured_key = None

        def _capture(key: str, limit: int | None = None) -> bool:
            nonlocal captured_key
            captured_key = key
            return True

        with patch("app.api.deps.check_rate_limit", side_effect=_capture):
            client.get("/test")

        assert captured_key is not None
        assert captured_key.startswith("auth:login:")

    def test_xff_rightmost_ip(self):
        """X-Forwarded-For with TRUSTED_PROXY_COUNT=1 uses the rightmost entry."""
        app = _make_app("test_xff", 5)
        client = TestClient(app)

        captured_key = None

        def _capture(key: str, limit: int | None = None) -> bool:
            nonlocal captured_key
            captured_key = key
            return True

        with (
            patch("app.api.deps.check_rate_limit", side_effect=_capture),
            patch.object(settings, "TRUSTED_PROXY_COUNT", 1),
        ):
            client.get("/test", headers={"x-forwarded-for": "10.0.0.1, 192.168.1.1"})

        assert captured_key is not None
        assert captured_key.endswith("192.168.1.1")

    def test_xff_ignored_when_no_trusted_proxy(self):
        """With TRUSTED_PROXY_COUNT=0 (default), XFF is ignored — socket IP is used."""
        app = _make_app("test_no_proxy", 5)
        client = TestClient(app)

        captured_key = None

        def _capture(key: str, limit: int | None = None) -> bool:
            nonlocal captured_key
            captured_key = key
            return True

        with (
            patch("app.api.deps.check_rate_limit", side_effect=_capture),
            patch.object(settings, "TRUSTED_PROXY_COUNT", 0),
        ):
            client.get("/test", headers={"x-forwarded-for": "1.2.3.4"})

        assert captured_key is not None
        # XFF is ignored; TestClient socket IP is "testclient"
        assert "1.2.3.4" not in captured_key

    def test_xff_two_trusted_proxies(self):
        """With TRUSTED_PROXY_COUNT=2, use second-from-right entry."""
        app = _make_app("test_2proxy", 5)
        client = TestClient(app)

        captured_key = None

        def _capture(key: str, limit: int | None = None) -> bool:
            nonlocal captured_key
            captured_key = key
            return True

        with (
            patch("app.api.deps.check_rate_limit", side_effect=_capture),
            patch.object(settings, "TRUSTED_PROXY_COUNT", 2),
        ):
            client.get(
                "/test",
                headers={"x-forwarded-for": "spoofed, 1.2.3.4, 10.0.0.1"},
            )

        assert captured_key is not None
        assert captured_key.endswith("1.2.3.4")
