"""
Gateway config cache: two-tier (in-process + Redis) to reduce DB load.

Caches content, params, param_validates, result_transform by api_assignment_id.
TTL configurable via GATEWAY_CONFIG_CACHE_TTL_SECONDS.
"""

import json
import logging
import re
import threading
import time
from typing import Any
from uuid import UUID

from fastapi import HTTPException
from sqlmodel import Session, select

from app.core.config import settings
from app.core.redis_client import get_redis
from app.models_dbapi import (
    ApiAssignment,
    ApiContext,
    ApiMacroDef,
    MacroDefVersionCommit,
    MacroTypeEnum,
    VersionCommit,
)

_LOG = logging.getLogger(__name__)
_KEY_PREFIX = "gateway:config:"

# In-process L1 cache: {api_assignment_id: (config_dict, expires_at_monotonic)}
_LOCAL_CACHE: dict[UUID, tuple[dict[str, Any], float]] = {}
_LOCAL_LOCK = threading.Lock()
_LOCAL_TTL = 10.0  # short TTL to stay fresh while avoiding Redis on every request
_LOCAL_MAX_SIZE = 2048


def _cache_key(api_assignment_id: UUID) -> str:
    return f"{_KEY_PREFIX}{api_assignment_id}"


def _local_get(api_assignment_id: UUID) -> dict[str, Any] | None:
    entry = _LOCAL_CACHE.get(api_assignment_id)
    if entry is None:
        return None
    config, expires_at = entry
    if time.monotonic() > expires_at:
        return None
    return config


def _local_set(api_assignment_id: UUID, config: dict[str, Any]) -> None:
    with _LOCAL_LOCK:
        if len(_LOCAL_CACHE) >= _LOCAL_MAX_SIZE:
            now = time.monotonic()
            expired = [k for k, (_, exp) in _LOCAL_CACHE.items() if now > exp]
            for k in expired:
                _LOCAL_CACHE.pop(k, None)
            if len(_LOCAL_CACHE) >= _LOCAL_MAX_SIZE:
                _LOCAL_CACHE.clear()
        _LOCAL_CACHE[api_assignment_id] = (config, time.monotonic() + _LOCAL_TTL)


def _local_delete(api_assignment_id: UUID) -> None:
    _LOCAL_CACHE.pop(api_assignment_id, None)


def get_gateway_config(api_assignment_id: UUID) -> dict[str, Any] | None:
    """
    Get cached gateway config: L1 in-process, then L2 Redis.
    Returns None on miss.
    """
    local = _local_get(api_assignment_id)
    if local is not None:
        return local

    r = get_redis()
    if r is None:
        return None
    try:
        raw = r.get(_cache_key(api_assignment_id))
        if raw is None:
            return None
        config = json.loads(raw)
        _local_set(api_assignment_id, config)
        return config
    except Exception as e:
        _LOG.debug("Cache get failed for %s: %s", api_assignment_id, e)
        return None


def set_gateway_config(api_assignment_id: UUID, config: dict[str, Any]) -> None:
    """Store gateway config in L1 + L2 cache with TTL."""
    _local_set(api_assignment_id, config)

    r = get_redis()
    if r is None:
        return
    try:
        key = _cache_key(api_assignment_id)
        ttl = max(1, settings.GATEWAY_CONFIG_CACHE_TTL_SECONDS)
        r.setex(key, ttl, json.dumps(config, default=str))
    except Exception as e:
        _LOG.debug("Cache set failed for %s: %s", api_assignment_id, e)


def invalidate_gateway_config(api_assignment_id: UUID) -> None:
    """Invalidate cached config (e.g. when API/version is updated)."""
    _local_delete(api_assignment_id)

    r = get_redis()
    if r is None:
        return
    try:
        r.delete(_cache_key(api_assignment_id))
    except Exception as e:
        _LOG.debug("Cache invalidate failed for %s: %s", api_assignment_id, e)


def _get_macro_content(m: ApiMacroDef, session: Session) -> str:
    """Get macro content: published version snapshot. Macro must be published."""
    if not m.published_version_id:
        return ""
    vc = session.exec(
        select(MacroDefVersionCommit).where(
            MacroDefVersionCommit.id == m.published_version_id
        )
    ).first()
    if vc:
        return vc.content_snapshot
    return ""


def _macro_referenced_in_content(macro_name: str, content: str) -> bool:
    """True if macro_name appears in content as a whole word (e.g. call or reference)."""
    if not content or not macro_name:
        return False
    pattern = r"\b" + re.escape(macro_name) + r"\b"
    return bool(re.search(pattern, content))


def load_macros_for_api(
    api: ApiAssignment, session: Session, api_content: str = ""
) -> tuple[list[str], list[str]]:
    """
    Load Jinja and Python macros for API (global + module-specific).
    Only published macros are prepended. Raises HTTPException only for macros that are
    actually referenced in api_content but are unpublished (not for every in-scope macro).
    """
    stmt = (
        select(ApiMacroDef)
        .where(
            (ApiMacroDef.module_id.is_(None)) | (ApiMacroDef.module_id == api.module_id)
        )
        .order_by(ApiMacroDef.sort_order, ApiMacroDef.name)
    )
    macros = session.exec(stmt).all()

    # Only require published when the macro is referenced in the API content
    unpublished_referenced = [
        m
        for m in macros
        if not getattr(m, "is_published", False)
        and _macro_referenced_in_content(m.name, api_content)
    ]
    if unpublished_referenced:
        names = ", ".join(f"'{m.name}'" for m in unpublished_referenced)
        raise HTTPException(
            status_code=400,
            detail=f"Macro(s) must be published before use: {names}. Publish in API Dev > Macros.",
        )

    jinja_contents: list[str] = []
    python_contents: list[str] = []
    for m in macros:
        if not getattr(m, "is_published", False):
            continue
        content = _get_macro_content(m, session)
        if not content:
            continue
        if m.macro_type == MacroTypeEnum.JINJA:
            jinja_contents.append(content)
        else:
            python_contents.append(content)
    return jinja_contents, python_contents


def load_gateway_config_from_db(
    api: ApiAssignment, session: Session
) -> dict[str, Any] | None:
    """
    Load gateway config from DB. Returns dict with content, params_definition,
    param_validates_definition, result_transform_code, macros_jinja, macros_python.
    Returns None if ApiContext not found.
    """
    ctx = session.exec(
        select(ApiContext).where(ApiContext.api_assignment_id == api.id)
    ).first()
    if not ctx:
        return None

    content = ctx.content
    params_definition: list[dict] | None = (
        ctx.params if getattr(ctx, "params", None) else None
    )
    param_validates: list[dict] | None = getattr(ctx, "param_validates", None)
    result_transform: str | None = getattr(ctx, "result_transform", None)

    if api.published_version_id:
        vc = session.exec(
            select(VersionCommit).where(VersionCommit.id == api.published_version_id)
        ).first()
        if vc:
            content = vc.content_snapshot
            params_definition = getattr(vc, "params_snapshot", None) or []
            param_validates = getattr(vc, "param_validates_snapshot", None) or []
            result_transform = getattr(vc, "result_transform_snapshot", None)
        else:
            params_definition = params_definition or []
            param_validates = param_validates or []

    jinja_macros, python_macros = load_macros_for_api(api, session, api_content=content)

    return {
        "content": content,
        "params_definition": params_definition or [],
        "param_validates_definition": param_validates or [],
        "result_transform_code": result_transform,
        "macros_jinja": jinja_macros,
        "macros_python": python_macros,
    }


def get_or_load_gateway_config(
    api: ApiAssignment, session: Session
) -> dict[str, Any] | None:
    """
    Get gateway config from cache or load from DB. Caches on load.
    Returns None if ApiContext not found.
    """
    cached = get_gateway_config(api.id)
    if cached is not None:
        return cached
    config = load_gateway_config_from_db(api, session)
    if config is not None:
        set_gateway_config(api.id, config)
    return config
