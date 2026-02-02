"""
Gateway config cache (Redis): cache ApiContext + VersionCommit snapshot to reduce DB load.

Caches content, params, param_validates, result_transform by api_assignment_id.
TTL configurable via GATEWAY_CONFIG_CACHE_TTL_SECONDS.
"""

import json
import logging
from typing import Any
from uuid import UUID

from sqlmodel import Session, select

from app.core.config import settings
from app.core.redis_client import get_redis
from app.models_dbapi import ApiAssignment, ApiContext, VersionCommit

_LOG = logging.getLogger(__name__)
_KEY_PREFIX = "gateway:config:"


def _cache_key(api_assignment_id: UUID) -> str:
    return f"{_KEY_PREFIX}{api_assignment_id}"


def get_gateway_config(api_assignment_id: UUID) -> dict[str, Any] | None:
    """
    Get cached gateway config for api_assignment_id. Returns None on miss or Redis unavailable.
    """
    r = get_redis()
    if r is None:
        return None
    try:
        raw = r.get(_cache_key(api_assignment_id))
        if raw is None:
            return None
        return json.loads(raw)
    except Exception as e:
        _LOG.debug("Cache get failed for %s: %s", api_assignment_id, e)
        return None


def set_gateway_config(api_assignment_id: UUID, config: dict[str, Any]) -> None:
    """Store gateway config in cache with TTL."""
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
    r = get_redis()
    if r is None:
        return
    try:
        r.delete(_cache_key(api_assignment_id))
    except Exception as e:
        _LOG.debug("Cache invalidate failed for %s: %s", api_assignment_id, e)


def load_gateway_config_from_db(
    api: ApiAssignment, session: Session
) -> dict[str, Any] | None:
    """
    Load gateway config from DB. Returns dict with content, params_definition,
    param_validates_definition, result_transform_code. Returns None if ApiContext not found.
    """
    ctx = session.exec(
        select(ApiContext).where(ApiContext.api_assignment_id == api.id)
    ).first()
    if not ctx:
        return None

    content = ctx.content
    params_definition: list[dict] | None = ctx.params if getattr(ctx, "params", None) else None
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

    return {
        "content": content,
        "params_definition": params_definition or [],
        "param_validates_definition": param_validates or [],
        "result_transform_code": result_transform,
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
