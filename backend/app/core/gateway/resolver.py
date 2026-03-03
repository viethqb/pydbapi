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
from uuid import UUID

from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from app.core.config import settings
from app.models_dbapi import ApiAssignment, ApiModule, HttpMethodEnum

_log = logging.getLogger(__name__)

_ROUTE_CACHE_TTL: float = float(settings.GATEWAY_ROUTE_CACHE_TTL_SECONDS)

_RouteEntry = tuple[re.Pattern[str], str, ApiAssignment, ApiModule]

# Two-tier route index: static routes (O(1) dict lookup) and dynamic routes
# (per-method lists, reduced linear scan).
_StaticRoutes = dict[
    tuple[str, str], tuple[ApiAssignment, ApiModule]
]  # (method, path) → (api, mod)
_DynamicEntry = tuple[re.Pattern[str], ApiAssignment, ApiModule]
_DynamicRoutes = dict[str, list[_DynamicEntry]]  # method → [(regex, api, mod), ...]
_RouteIndex = tuple[_StaticRoutes, _DynamicRoutes]

_route_cache: _RouteIndex | None = None
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
) -> _RouteIndex:
    """Build two-tier route index with a single JOIN query, sorted by priority.

    Static routes (no ``{param}``) go into a dict for O(1) lookup.
    Dynamic routes (with path params) go into per-method lists.

    Eagerly loads the ``datasource`` relationship on each ApiAssignment so
    the cached objects can be used directly without a session, avoiding two
    per-request ``session.get()`` calls on resolve.
    """
    stmt = (
        select(ApiAssignment, ApiModule)
        .join(ApiModule, ApiAssignment.module_id == ApiModule.id)
        .where(ApiModule.is_active.is_(True), ApiAssignment.is_published.is_(True))
        .options(
            selectinload(ApiAssignment.datasource),
            selectinload(ApiAssignment.module),
        )
        .order_by(
            ApiModule.sort_order.asc(),
            ApiModule.id.asc(),
            ApiAssignment.sort_order.asc(),
            ApiAssignment.id.asc(),
        )
    )
    rows = session.exec(stmt).all()
    static: _StaticRoutes = {}
    dynamic: _DynamicRoutes = {}
    expunged_mod_ids: set[UUID] = set()
    for api, mod in rows:
        api_path = (api.path or "").strip("/")
        method_val = (
            api.http_method.value
            if hasattr(api.http_method, "value")
            else str(api.http_method)
        )
        # Detach from session so cached objects survive beyond the
        # building session's lifetime.  Eagerly-loaded attributes
        # (scalars + datasource + module) remain accessible.
        session.expunge(api)
        if mod.id not in expunged_mod_ids:
            session.expunge(mod)
            expunged_mod_ids.add(mod.id)
        if "{" not in api_path:
            # Static route — first match wins (priority order from ORDER BY)
            key = (method_val, api_path)
            if key not in static:
                static[key] = (api, mod)
        else:
            try:
                rx = path_to_regex(api_path)
            except re.error:
                continue
            dynamic.setdefault(method_val, []).append((rx, api, mod))
    return static, dynamic


_route_cache_rebuilding = False


def _get_route_table(
    session: Session,
) -> _RouteIndex:
    """Return cached route index, rebuilding if expired.

    When the cache is stale, exactly one thread rebuilds it while all other
    threads continue serving from the old (stale but valid) index.  This
    avoids blocking every concurrent request behind a DB query.
    """
    global _route_cache, _route_cache_ts, _route_cache_rebuilding
    now = time.monotonic()
    if _route_cache is not None and (now - _route_cache_ts) < _ROUTE_CACHE_TTL:
        return _route_cache

    # Try to become the rebuilder; losers return stale cache immediately.
    with _route_cache_lock:
        # Re-check after acquiring lock — another thread may have rebuilt.
        if _route_cache is not None and (now - _route_cache_ts) < _ROUTE_CACHE_TTL:
            return _route_cache
        if _route_cache_rebuilding:
            # Another thread is already rebuilding; serve stale.
            if _route_cache is not None:
                return _route_cache
            # No stale cache at all (first request); must wait below.
        else:
            _route_cache_rebuilding = True

    # Only the rebuilder reaches here (or the very first request).
    try:
        table = _build_route_table(session)
        with _route_cache_lock:
            _route_cache = table
            _route_cache_ts = time.monotonic()
            _route_cache_rebuilding = False
        return table
    except Exception:
        with _route_cache_lock:
            _route_cache_rebuilding = False
        # On failure, return stale cache if available.
        if _route_cache is not None:
            return _route_cache
        raise


def invalidate_route_cache() -> None:
    """Call when modules or API assignments are created/updated/deleted."""
    global _route_cache, _route_cache_ts, _route_cache_rebuilding
    with _route_cache_lock:
        _route_cache = None
        _route_cache_ts = 0.0
        _route_cache_rebuilding = False


def resolve_gateway_api(
    path: str,
    method: str,
    session: Session,
) -> tuple[ApiAssignment, dict[str, str], ApiModule] | None:
    """
    Resolve /api/{path} to (ApiAssignment, path_params, ApiModule).

    Uses a two-tier cached index: O(1) dict lookup for static routes,
    then per-method linear scan for dynamic routes with path params.
    Returns detached objects from cache — no per-request DB queries.
    """
    path = (path or "").strip().strip("/")
    if not path:
        return None
    method_upper = (method or "GET").upper()
    try:
        HttpMethodEnum(method_upper)
    except ValueError:
        return None

    static, dynamic = _get_route_table(session)

    # 1. O(1) static route lookup
    hit = static.get((method_upper, path))
    if hit is not None:
        return (hit[0], {}, hit[1])

    # 2. Per-method dynamic route scan (only routes with path params)
    for rx, api, mod in dynamic.get(method_upper, ()):
        m = rx.match(path)
        if m:
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
