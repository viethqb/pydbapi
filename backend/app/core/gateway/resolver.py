"""
Gateway resolver (Phase 4, Task 4.1).

URL pattern: /api/{path} — module is only for grouping/permissions, not in URL.
Resolves incoming path directly against api.path (module.path_prefix is ignored).

Uses an in-process route table cache to avoid N+1 DB queries and repeated
regex compilation on every request.  Call ``invalidate_route_cache()`` when
modules or API assignments change.
"""

import functools
import logging
import re
import threading
import time
from typing import Any
from uuid import UUID

from sqlmodel import Session, select

from app.models_dbapi import ApiAssignment, ApiModule, HttpMethodEnum

_log = logging.getLogger(__name__)

_ROUTE_CACHE_TTL = 30.0  # seconds

_route_cache: list[tuple[re.Pattern[str], UUID, UUID]] | None = None
_route_cache_ts: float = 0.0
_route_cache_lock = threading.Lock()


@functools.lru_cache(maxsize=1024)
def path_to_regex(pattern: str) -> re.Pattern[str]:
    """
    Convert path pattern to regex. {name} -> (?P<name>[^/]+); rest escaped.
    E.g. "users/{id}" -> ^users/(?P<id>[^/]+)$; "list" -> ^list$
    """
    parts: list[str] = []
    for seg in re.split(r"(\{[^}]+\})", pattern):
        if re.match(r"^\{[^}]+\}$", seg):
            name = seg[1:-1]
            parts.append(
                f"(?P<{name}>[^/]+)" if name.isidentifier() else re.escape(seg)
            )
        else:
            parts.append(re.escape(seg))
    return re.compile("^" + "".join(parts) + "$")


def _build_route_table(
    session: Session,
) -> list[tuple[re.Pattern[str], str, UUID, UUID]]:
    """Build route table with a single JOIN query, sorted by priority."""
    stmt = (
        select(ApiAssignment, ApiModule)
        .join(ApiModule, ApiAssignment.module_id == ApiModule.id)
        .where(ApiModule.is_active.is_(True), ApiAssignment.is_published.is_(True))
        .order_by(
            ApiModule.sort_order.asc(),
            ApiModule.id.asc(),
            ApiAssignment.sort_order.asc(),
            ApiAssignment.id.asc(),
        )
    )
    rows = session.exec(stmt).all()
    table: list[tuple[re.Pattern[str], str, UUID, UUID]] = []
    for api, mod in rows:
        api_path = (api.path or "").strip("/")
        method_val = api.http_method.value if hasattr(api.http_method, "value") else str(api.http_method)
        try:
            rx = path_to_regex(api_path)
            table.append((rx, method_val, api.id, mod.id))
        except re.error:
            continue
    return table


def _get_route_table(
    session: Session,
) -> list[tuple[re.Pattern[str], str, UUID, UUID]]:
    """Return cached route table, rebuilding if expired."""
    global _route_cache, _route_cache_ts
    now = time.monotonic()
    if _route_cache is not None and (now - _route_cache_ts) < _ROUTE_CACHE_TTL:
        return _route_cache
    with _route_cache_lock:
        if _route_cache is not None and (now - _route_cache_ts) < _ROUTE_CACHE_TTL:
            return _route_cache
        table = _build_route_table(session)
        _route_cache = table
        _route_cache_ts = time.monotonic()
        return table


def invalidate_route_cache() -> None:
    """Call when modules or API assignments are created/updated/deleted."""
    global _route_cache, _route_cache_ts
    with _route_cache_lock:
        _route_cache = None
        _route_cache_ts = 0.0


def resolve_gateway_api(
    path: str, method: str, session: Session,
) -> tuple[ApiAssignment, dict[str, str], ApiModule] | None:
    """
    Resolve /api/{path} to (ApiAssignment, path_params, ApiModule).

    Uses cached route table (single JOIN query, compiled regexes).
    """
    path = (path or "").strip().strip("/")
    if not path:
        return None
    method_upper = (method or "GET").upper()
    try:
        HttpMethodEnum(method_upper)
    except ValueError:
        return None

    table = _get_route_table(session)
    for rx, route_method, api_id, mod_id in table:
        if route_method != method_upper:
            continue
        m = rx.match(path)
        if m:
            api = session.get(ApiAssignment, api_id)
            mod = session.get(ApiModule, mod_id)
            if api and mod:
                return (api, m.groupdict(), mod)
    return None


# ---------------------------------------------------------------------------
# Legacy helpers (kept for backward compat / tests)
# ---------------------------------------------------------------------------


def _slug(s: str) -> str:
    return re.sub(r"[^a-z0-9\-]", "-", (s or "").lower()).strip("-") or "default"


def _module_gateway_key(m: ApiModule) -> str:
    raw = (m.path_prefix or "/").strip("/")
    return raw if raw else _slug(m.name)


def resolve_module(segment: str, session: Session) -> ApiModule | None:
    if not segment or not isinstance(segment, str):
        return None
    segment = segment.strip()
    if not segment:
        return None
    stmt = (
        select(ApiModule)
        .where(ApiModule.is_active.is_(True))
        .order_by(ApiModule.sort_order.asc(), ApiModule.id.asc())
    )
    for m in session.exec(stmt).all():
        if _module_gateway_key(m) == segment:
            return m
    return None


def resolve_api_assignment(
    module_id: UUID,
    path: str,
    method: str,
    session: Session,
) -> tuple[ApiAssignment, dict[str, str]] | None:
    if not path or not isinstance(path, str):
        return None
    path = path.strip().strip("/")
    try:
        method_enum = HttpMethodEnum((method or "GET").upper())
    except ValueError:
        return None
    stmt = (
        select(ApiAssignment)
        .where(
            ApiAssignment.module_id == module_id,
            ApiAssignment.is_published.is_(True),
            ApiAssignment.http_method == method_enum,
        )
        .order_by(ApiAssignment.sort_order.asc(), ApiAssignment.id.asc())
    )
    for api in session.exec(stmt).all():
        try:
            rx = path_to_regex(api.path)
            m = rx.match(path)
            if m:
                return (api, m.groupdict())
        except re.error:
            continue
    return None
