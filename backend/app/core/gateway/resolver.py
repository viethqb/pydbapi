"""
Gateway resolver (Phase 4, Task 4.1): resolve_module, resolve_api_assignment, path_to_regex.

Resolves {module} segment to ApiModule and {path} + method to ApiAssignment with path_params.
"""

import re
from uuid import UUID

from sqlmodel import Session, select

from app.models_dbapi import ApiAssignment, ApiModule, HttpMethodEnum


def _slug(s: str) -> str:
    """Normalize to lowercase alphanumeric and hyphens: for gateway_key when path_prefix is empty."""
    return re.sub(r"[^a-z0-9\-]", "-", (s or "").lower()).strip("-") or "default"


def _module_gateway_key(m: ApiModule) -> str:
    """Derive gateway URL segment from ApiModule. Plan: path_prefix.strip('/') or _slug(name)."""
    raw = (m.path_prefix or "/").strip("/")
    return raw if raw else _slug(m.name)


def path_to_regex(pattern: str) -> re.Pattern[str]:
    """
    Convert ApiAssignment.path to regex. {name} -> (?P<name>[^/]+); rest escaped.
    E.g. "users/{id}" -> ^users/(?P<id>[^/]+)$; "list" -> ^list$
    """
    parts: list[str] = []
    for seg in re.split(r"(\{[^}]+\})", pattern):
        if re.match(r"^\{[^}]+\}$", seg):
            name = seg[1:-1]
            parts.append(f"(?P<{name}>[^/]+)" if name.isidentifier() else re.escape(seg))
        else:
            parts.append(re.escape(seg))
    return re.compile("^" + "".join(parts) + "$")


def resolve_module(segment: str, session: Session) -> ApiModule | None:
    """
    Resolve URL {module} segment to ApiModule. is_active=True; match derived gateway_key.
    If multiple: sort_order, id. Returns None if not found.
    """
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
    """
    Resolve (path, method) to (ApiAssignment, path_params). path has no leading slash (e.g. users/123).
    Only is_published=True, http_method=method. First match by sort_order, id.
    """
    if not path or not isinstance(path, str):
        return None
    path = path.strip().strip("/")  # normalize: no leading/trailing /
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
