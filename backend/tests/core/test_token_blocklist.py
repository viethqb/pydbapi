from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock, patch

from app.core.token_blocklist import is_token_revoked, revoke_token


def test_revoke_and_check():
    """revoke_token stores the JTI and is_token_revoked finds it."""
    mock_redis = MagicMock()
    mock_redis.exists.return_value = 1

    with patch("app.core.token_blocklist.get_redis", return_value=mock_redis):
        exp = datetime.now(UTC) + timedelta(hours=1)
        result = revoke_token("test-jti-123", exp)
        assert result is True
        mock_redis.setex.assert_called_once()
        key = mock_redis.setex.call_args[0][0]
        assert key == "token:blocked:test-jti-123"

        assert is_token_revoked("test-jti-123") is True
        mock_redis.exists.assert_called_once_with("token:blocked:test-jti-123")


def test_revoke_expired_token():
    """Tokens already past expiry should not be stored."""
    mock_redis = MagicMock()
    with patch("app.core.token_blocklist.get_redis", return_value=mock_redis):
        exp = datetime.now(UTC) - timedelta(seconds=10)
        result = revoke_token("expired-jti", exp)
        assert result is False
        mock_redis.setex.assert_not_called()


def test_redis_unavailable_revoke():
    """revoke_token returns False when Redis is unavailable."""
    with patch("app.core.token_blocklist.get_redis", return_value=None):
        exp = datetime.now(UTC) + timedelta(hours=1)
        result = revoke_token("test-jti", exp)
        assert result is False


def test_redis_unavailable_check():
    """is_token_revoked fails open (returns False) when Redis is unavailable."""
    with patch("app.core.token_blocklist.get_redis", return_value=None):
        assert is_token_revoked("test-jti") is False


def test_redis_error_on_check():
    """is_token_revoked fails open on Redis exceptions."""
    mock_redis = MagicMock()
    mock_redis.exists.side_effect = ConnectionError("connection refused")

    with patch("app.core.token_blocklist.get_redis", return_value=mock_redis):
        assert is_token_revoked("test-jti") is False


def test_redis_error_on_revoke():
    """revoke_token returns False on Redis exceptions."""
    mock_redis = MagicMock()
    mock_redis.setex.side_effect = ConnectionError("connection refused")

    with patch("app.core.token_blocklist.get_redis", return_value=mock_redis):
        exp = datetime.now(UTC) + timedelta(hours=1)
        result = revoke_token("test-jti", exp)
        assert result is False
