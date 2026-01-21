"""Unit tests for gateway rate limiting: check_rate_limit (Phase 4, Task 4.2c)."""

from unittest.mock import patch

import pytest

from app.core.gateway import ratelimit
from app.core.gateway.ratelimit import check_rate_limit


@pytest.fixture(autouse=True)
def _force_memory_backend() -> None:
    """Use in-memory backend so tests don't require Redis."""
    with patch.object(ratelimit, "_get_redis", return_value=None):
        yield


def test_rate_limit_disabled() -> None:
    """When FLOW_CONTROL_RATE_LIMIT_ENABLED is False, all requests are allowed."""
    with patch("app.core.gateway.ratelimit.settings") as m:
        m.FLOW_CONTROL_RATE_LIMIT_ENABLED = False
        m.FLOW_CONTROL_RATE_LIMIT_PER_MINUTE = 60
        for _ in range(100):
            assert check_rate_limit("rl_disabled") is True


def test_rate_limit_under_limit() -> None:
    """Under the limit, all requests are allowed."""
    with patch("app.core.gateway.ratelimit.settings") as m:
        m.FLOW_CONTROL_RATE_LIMIT_ENABLED = True
        m.FLOW_CONTROL_RATE_LIMIT_PER_MINUTE = 60
        for _ in range(10):
            assert check_rate_limit("rl_under") is True


def test_rate_limit_over_limit() -> None:
    """Over the limit (61st when limit is 60), check_rate_limit returns False."""
    ratelimit._memory.clear()
    with patch("app.core.gateway.ratelimit.settings") as m:
        m.FLOW_CONTROL_RATE_LIMIT_ENABLED = True
        m.FLOW_CONTROL_RATE_LIMIT_PER_MINUTE = 60
        for i in range(60):
            assert check_rate_limit("rl_over") is True
        assert check_rate_limit("rl_over") is False
        # Still over
        assert check_rate_limit("rl_over") is False


def test_rate_limit_custom_limit() -> None:
    """With limit 2, 3rd request is denied."""
    ratelimit._memory.clear()
    with patch("app.core.gateway.ratelimit.settings") as m:
        m.FLOW_CONTROL_RATE_LIMIT_ENABLED = True
        m.FLOW_CONTROL_RATE_LIMIT_PER_MINUTE = 2
        assert check_rate_limit("rl_custom") is True
        assert check_rate_limit("rl_custom") is True
        assert check_rate_limit("rl_custom") is False


def test_rate_limit_empty_key_allowed() -> None:
    """Empty or invalid key is allowed (fail-open)."""
    with patch("app.core.gateway.ratelimit.settings") as m:
        m.FLOW_CONTROL_RATE_LIMIT_ENABLED = True
        m.FLOW_CONTROL_RATE_LIMIT_PER_MINUTE = 60
        assert check_rate_limit("") is True


def test_rate_limit_per_key() -> None:
    """Limits are per key; one key over limit does not affect another."""
    ratelimit._memory.clear()
    with patch("app.core.gateway.ratelimit.settings") as m:
        m.FLOW_CONTROL_RATE_LIMIT_ENABLED = True
        m.FLOW_CONTROL_RATE_LIMIT_PER_MINUTE = 2
        assert check_rate_limit("rl_a") is True
        assert check_rate_limit("rl_a") is True
        assert check_rate_limit("rl_a") is False
        assert check_rate_limit("rl_b") is True
        assert check_rate_limit("rl_b") is True
        assert check_rate_limit("rl_b") is False
