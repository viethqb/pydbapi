"""
Env module for script engine: get, get_int, get_bool (Phase 3, Task 3.3).

Read from settings or os.environ with a key whitelist to avoid leaking secrets.
"""

import os
from types import SimpleNamespace
from typing import Any

# Default whitelist: non-secret config keys
DEFAULT_ENV_WHITELIST = frozenset({
    "PROJECT_NAME",
    "ENVIRONMENT",
    "API_V1_STR",
    "EXTERNAL_DB_POOL_SIZE",
    "EXTERNAL_DB_CONNECT_TIMEOUT",
    "CACHE_ENABLED",
})


def make_env_module(
    *,
    settings: Any = None,
    env_whitelist: frozenset[str] | set[str] | None = None,
) -> Any:
    """
    Build the `env` object: get, get_int, get_bool.
    Only whitelisted keys are readable. settings can be an object with attributes or a dict.
    """
    wl = frozenset(env_whitelist) if env_whitelist is not None else DEFAULT_ENV_WHITELIST

    def _get_raw(key: str) -> Any:
        if key not in wl:
            return None
        if settings is not None:
            if isinstance(settings, dict):
                if key in settings:
                    return settings[key]
            else:
                v = getattr(settings, key, None)
                if v is not None:
                    return v
        return os.environ.get(key)

    def get(key: str, default: Any = None) -> Any:
        v = _get_raw(key)
        return default if v is None else v

    def get_int(key: str, default: int = 0) -> int:
        v = _get_raw(key)
        if v is None:
            return default
        try:
            return int(v)
        except (TypeError, ValueError):
            return default

    def get_bool(key: str, default: bool = False) -> bool:
        v = _get_raw(key)
        if v is None:
            return default
        if isinstance(v, bool):
            return v
        s = str(v).lower().strip()
        return s in ("true", "1", "yes", "on")

    return SimpleNamespace(get=get, get_int=get_int, get_bool=get_bool)
