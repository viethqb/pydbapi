"""Tests for script cache module (#40: atomic set+expire).

Runs without database/Redis:
    uv run pytest tests/engines/test_cache_module.py -v --noconftest
"""

from unittest.mock import MagicMock, call

from app.engines.script.modules.cache import make_cache_module


class TestCacheSet:
    """Verify that set() uses atomic SET ... EX (not separate SET + EXPIRE)."""

    def test_set_with_ttl_uses_ex_param(self):
        mock_redis = MagicMock()
        cache = make_cache_module(cache_client=mock_redis)
        cache.set("mykey", "myval", ttl_seconds=60)

        # Should call set(key, value, ex=60) — single atomic call
        mock_redis.set.assert_called_once_with("script:mykey", "myval", ex=60)
        # Must NOT call expire separately
        mock_redis.expire.assert_not_called()

    def test_set_without_ttl_no_expire(self):
        mock_redis = MagicMock()
        cache = make_cache_module(cache_client=mock_redis)
        cache.set("mykey", "myval")

        mock_redis.set.assert_called_once_with("script:mykey", "myval")
        mock_redis.expire.assert_not_called()

    def test_set_none_client_noop(self):
        cache = make_cache_module(cache_client=None)
        # Should not raise
        cache.set("key", "val", ttl_seconds=10)


class TestCacheGet:
    def test_get_returns_decoded_bytes(self):
        mock_redis = MagicMock()
        mock_redis.get.return_value = b"hello"
        cache = make_cache_module(cache_client=mock_redis)
        assert cache.get("k") == "hello"

    def test_get_returns_none_for_missing(self):
        mock_redis = MagicMock()
        mock_redis.get.return_value = None
        cache = make_cache_module(cache_client=mock_redis)
        assert cache.get("k") is None

    def test_get_none_client_returns_none(self):
        cache = make_cache_module(cache_client=None)
        assert cache.get("k") is None


class TestCacheOps:
    def test_delete(self):
        mock_redis = MagicMock()
        cache = make_cache_module(cache_client=mock_redis)
        cache.delete("k")
        mock_redis.delete.assert_called_once_with("script:k")

    def test_exists(self):
        mock_redis = MagicMock()
        mock_redis.exists.return_value = 1
        cache = make_cache_module(cache_client=mock_redis)
        assert cache.exists("k") is True

    def test_incr(self):
        mock_redis = MagicMock()
        mock_redis.incrby.return_value = 5
        cache = make_cache_module(cache_client=mock_redis)
        assert cache.incr("k", 2) == 5
        mock_redis.incrby.assert_called_once_with("script:k", 2)

    def test_decr(self):
        mock_redis = MagicMock()
        mock_redis.decrby.return_value = 3
        cache = make_cache_module(cache_client=mock_redis)
        assert cache.decr("k", 1) == 3
        mock_redis.decrby.assert_called_once_with("script:k", 1)

    def test_custom_prefix(self):
        mock_redis = MagicMock()
        cache = make_cache_module(cache_client=mock_redis, key_prefix="custom:")
        cache.set("k", "v")
        mock_redis.set.assert_called_once_with("custom:k", "v")
