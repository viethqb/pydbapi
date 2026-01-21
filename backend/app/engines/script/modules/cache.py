"""
Cache module for script engine: get, set, delete, exists, incr, decr (Phase 3, Task 3.3).

Backend: Redis. Key prefix `script:` to separate namespace. No-op when cache_client is None.
"""

from types import SimpleNamespace
from typing import Any

CACHE_KEY_PREFIX = "script:"


def make_cache_module(
    *,
    cache_client: Any = None,
    key_prefix: str = CACHE_KEY_PREFIX,
) -> Any:
    """Build the `cache` object. If cache_client is None, operations no-op or return safe defaults."""

    def _key(k: str) -> str:
        return key_prefix + str(k)

    def get(key: str) -> Any:
        if cache_client is None:
            return None
        v = cache_client.get(_key(key))
        if v is None:
            return None
        if isinstance(v, bytes):
            return v.decode("utf-8", errors="replace")
        return v

    def set(key: str, value: str | int | float | bool, ttl_seconds: int | None = None) -> None:
        if cache_client is None:
            return
        k = _key(key)
        cache_client.set(k, value)
        if ttl_seconds is not None:
            cache_client.expire(k, ttl_seconds)

    def delete(key: str) -> None:
        if cache_client is None:
            return
        cache_client.delete(_key(key))

    def exists(key: str) -> bool:
        if cache_client is None:
            return False
        return bool(cache_client.exists(_key(key)))

    def incr(key: str, amount: int = 1) -> int:
        if cache_client is None:
            return 0
        k = _key(key)
        return int(cache_client.incrby(k, amount))

    def decr(key: str, amount: int = 1) -> int:
        if cache_client is None:
            return 0
        k = _key(key)
        return int(cache_client.decrby(k, amount))

    return SimpleNamespace(
        get=get, set=set, delete=delete, exists=exists, incr=incr, decr=decr
    )
