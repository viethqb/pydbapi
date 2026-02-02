"""Unit tests for gateway max concurrent per client (Phase E, 5.1)."""

from unittest.mock import patch

import pytest

from app.core.gateway import concurrent


@pytest.fixture(autouse=True)
def _force_memory_backend() -> None:
    """Use in-memory backend so tests don't require Redis."""
    with patch.object(concurrent, "_get_redis", return_value=None):
        yield


@pytest.fixture(autouse=True)
def _clear_memory() -> None:
    concurrent._memory.clear()
    yield
    concurrent._memory.clear()


def test_concurrent_disabled_when_max_zero() -> None:
    """When FLOW_CONTROL_MAX_CONCURRENT_PER_CLIENT <= 0, always allow."""
    with patch("app.core.gateway.concurrent.settings") as m:
        m.FLOW_CONTROL_MAX_CONCURRENT_PER_CLIENT = 0
        for _ in range(20):
            assert concurrent.acquire_concurrent_slot("c0") is True
        concurrent.release_concurrent_slot("c0")  # no-op when disabled


def test_concurrent_under_limit() -> None:
    """Under the limit, all acquires succeed."""
    with patch("app.core.gateway.concurrent.settings") as m:
        m.FLOW_CONTROL_MAX_CONCURRENT_PER_CLIENT = 5
        for _ in range(5):
            assert concurrent.acquire_concurrent_slot("c1") is True
        concurrent.release_concurrent_slot("c1")
        concurrent.release_concurrent_slot("c1")
        assert concurrent.acquire_concurrent_slot("c1") is True


def test_concurrent_over_limit() -> None:
    """Over the limit, acquire returns False."""
    with patch("app.core.gateway.concurrent.settings") as m:
        m.FLOW_CONTROL_MAX_CONCURRENT_PER_CLIENT = 2
        assert concurrent.acquire_concurrent_slot("c2") is True
        assert concurrent.acquire_concurrent_slot("c2") is True
        assert concurrent.acquire_concurrent_slot("c2") is False
        concurrent.release_concurrent_slot("c2")
        assert concurrent.acquire_concurrent_slot("c2") is True


def test_concurrent_release_then_acquire() -> None:
    """After release, slot can be acquired again."""
    with patch("app.core.gateway.concurrent.settings") as m:
        m.FLOW_CONTROL_MAX_CONCURRENT_PER_CLIENT = 1
        assert concurrent.acquire_concurrent_slot("c3") is True
        assert concurrent.acquire_concurrent_slot("c3") is False
        concurrent.release_concurrent_slot("c3")
        assert concurrent.acquire_concurrent_slot("c3") is True
        concurrent.release_concurrent_slot("c3")


def test_concurrent_per_key() -> None:
    """Limits are per client_key."""
    with patch("app.core.gateway.concurrent.settings") as m:
        m.FLOW_CONTROL_MAX_CONCURRENT_PER_CLIENT = 1
        assert concurrent.acquire_concurrent_slot("k_a") is True
        assert concurrent.acquire_concurrent_slot("k_a") is False
        assert concurrent.acquire_concurrent_slot("k_b") is True
        concurrent.release_concurrent_slot("k_a")
        concurrent.release_concurrent_slot("k_b")


def test_concurrent_empty_key_allowed() -> None:
    """Empty or invalid key is allowed (no crash)."""
    with patch("app.core.gateway.concurrent.settings") as m:
        m.FLOW_CONTROL_MAX_CONCURRENT_PER_CLIENT = 1
        assert concurrent.acquire_concurrent_slot("") is True
        concurrent.release_concurrent_slot("")


def test_concurrent_per_client_override() -> None:
    """When max_concurrent_override is set, it overrides global limit."""
    with patch("app.core.gateway.concurrent.settings") as m:
        m.FLOW_CONTROL_MAX_CONCURRENT_PER_CLIENT = 10
        # Override to 1: only one slot
        assert (
            concurrent.acquire_concurrent_slot("ov1", max_concurrent_override=1) is True
        )
        assert (
            concurrent.acquire_concurrent_slot("ov1", max_concurrent_override=1)
            is False
        )
        concurrent.release_concurrent_slot("ov1")
        assert (
            concurrent.acquire_concurrent_slot("ov1", max_concurrent_override=1) is True
        )
        concurrent.release_concurrent_slot("ov1")
