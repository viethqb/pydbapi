"""
Gateway resolver (Phase 4, Task 4.1).

URL pattern: /api/{path} — module is only for grouping/permissions, not in URL.
Resolves incoming path directly against api.path (module.path_prefix is ignored).
"""

import re
from uuid import UUID

from sqlmodel import Session, select

from app.models_dbapi import ApiAssignment, ApiModule, HttpMethodEnum


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


def resolve_gateway_api(
    path: str, method: str, session: Session,
) -> tuple[ApiAssignment, dict[str, str], ApiModule] | None:
    """
    Resolve /api/{path} to (ApiAssignment, path_params, ApiModule).

    Module is ONLY for grouping/permissions — path_prefix is NOT part of the URL.
    Matches incoming path directly against api.path. First match wins
    (ordered by module.sort_order, api.sort_order).
    """
    path = (path or "").strip().strip("/")
    if not path:
        return None
    try:
        method_enum = HttpMethodEnum((method or "GET").upper())
    except ValueError:
        return None

    mod_stmt = (
        select(ApiModule)
        .where(ApiModule.is_active.is_(True))
        .order_by(ApiModule.sort_order.asc(), ApiModule.id.asc())
    )
    for mod in session.exec(mod_stmt).all():
        api_stmt = (
            select(ApiAssignment)
            .where(
                ApiAssignment.module_id == mod.id,
                ApiAssignment.is_published.is_(True),
                ApiAssignment.http_method == method_enum,
            )
            .order_by(ApiAssignment.sort_order.asc(), ApiAssignment.id.asc())
        )
        for api in session.exec(api_stmt).all():
            api_path = (api.path or "").strip("/")
            try:
                rx = path_to_regex(api_path)
                m = rx.match(path)
                if m:
                    return (api, m.groupdict(), mod)
            except re.error:
                continue
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
