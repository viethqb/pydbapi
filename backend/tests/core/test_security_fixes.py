"""Tests for security hardening fixes (#25-#33, #42).

Covers: token type claims, password reset token, CORS config, XFF trust,
access token lifetime, password reset expiry.

Runs without database:
    uv run pytest tests/core/test_security_fixes.py -v --noconftest
"""

from datetime import timedelta
from unittest.mock import patch

import jwt
import pytest

from app.core.config import settings
from app.core.security import (
    ALGORITHM,
    TOKEN_TYPE_DASHBOARD,
    TOKEN_TYPE_GATEWAY,
    TOKEN_TYPE_PASSWORD_RESET,
    create_access_token,
)
from app.utils import generate_password_reset_token, verify_password_reset_token


# ---------------------------------------------------------------------------
# #25: Access token lifetime reduced to 1 day
# ---------------------------------------------------------------------------


class TestAccessTokenLifetime:
    def test_default_is_one_day(self):
        assert settings.ACCESS_TOKEN_EXPIRE_MINUTES == 60 * 24  # 1440 minutes = 1 day

    def test_token_contains_exp_claim(self):
        token = create_access_token("user1", timedelta(minutes=60))
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
        assert "exp" in payload


# ---------------------------------------------------------------------------
# #33: Password reset token type claim
# ---------------------------------------------------------------------------


class TestPasswordResetTokenTypeClaim:
    def test_generate_includes_type_claim(self):
        token = generate_password_reset_token("test@example.com")
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
        assert payload["type"] == TOKEN_TYPE_PASSWORD_RESET
        assert payload["sub"] == "test@example.com"

    def test_verify_accepts_valid_token(self):
        token = generate_password_reset_token("valid@example.com")
        email = verify_password_reset_token(token)
        assert email == "valid@example.com"

    def test_verify_rejects_dashboard_token(self):
        """Dashboard tokens must NOT be accepted as password reset tokens."""
        token = create_access_token(
            "user@example.com",
            timedelta(hours=1),
            token_type=TOKEN_TYPE_DASHBOARD,
        )
        result = verify_password_reset_token(token)
        assert result is None

    def test_verify_rejects_gateway_token(self):
        """Gateway tokens must NOT be accepted as password reset tokens."""
        token = create_access_token(
            "client_id_123",
            timedelta(hours=1),
            token_type=TOKEN_TYPE_GATEWAY,
        )
        result = verify_password_reset_token(token)
        assert result is None

    def test_verify_rejects_token_without_type(self):
        """Tokens without a type claim (legacy) must be rejected."""
        payload = {"exp": 9999999999, "nbf": 0, "sub": "test@example.com"}
        token = jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)
        result = verify_password_reset_token(token)
        assert result is None


# ---------------------------------------------------------------------------
# #33: create_access_token includes type claim
# ---------------------------------------------------------------------------


class TestCreateAccessTokenType:
    def test_default_type_is_dashboard(self):
        token = create_access_token("sub", timedelta(hours=1))
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
        assert payload["type"] == TOKEN_TYPE_DASHBOARD

    def test_gateway_type(self):
        token = create_access_token("sub", timedelta(hours=1), token_type=TOKEN_TYPE_GATEWAY)
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
        assert payload["type"] == TOKEN_TYPE_GATEWAY


# ---------------------------------------------------------------------------
# #42: Password reset token expiry reduced to 1 hour
# ---------------------------------------------------------------------------


class TestPasswordResetExpiry:
    def test_default_is_one_hour(self):
        assert settings.EMAIL_RESET_TOKEN_EXPIRE_HOURS == 1


# ---------------------------------------------------------------------------
# #27: TRUSTED_PROXY_COUNT default
# ---------------------------------------------------------------------------


class TestTrustedProxyCount:
    def test_default_is_zero(self):
        """By default, XFF headers are ignored."""
        assert settings.TRUSTED_PROXY_COUNT == 0
