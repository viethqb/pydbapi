"""
Permission service (Phase 2 – PERMISSION_PLAN_SUPERSET_STYLE).

has_permission(user, resource_type, action, resource_id?), get_user_permissions.
"""

from __future__ import annotations

import uuid
from sqlmodel import Session, select

from app.models import User
from app.models_permission import (
    Permission,
    PermissionActionEnum,
    ResourceTypeEnum,
    RolePermissionLink,
    UserRoleLink,
)


def _normalize_resource_type(value: ResourceTypeEnum | str) -> ResourceTypeEnum:
    if isinstance(value, ResourceTypeEnum):
        return value
    return ResourceTypeEnum(value)


def _normalize_action(value: PermissionActionEnum | str) -> PermissionActionEnum:
    if isinstance(value, PermissionActionEnum):
        return value
    return PermissionActionEnum(value)


def get_user_role_ids(session: Session, user_id: uuid.UUID) -> list[uuid.UUID]:
    """Return role IDs assigned to the user."""
    stmt = select(UserRoleLink.role_id).where(UserRoleLink.user_id == user_id)
    return list(session.exec(stmt).all())


def get_user_permissions(
    session: Session,
    user_id: uuid.UUID,
    *,
    resource_type: ResourceTypeEnum | str | None = None,
    action: PermissionActionEnum | str | None = None,
) -> list[Permission]:
    """
    Return all permissions the user has (via roles).
    Optionally filter by resource_type and/or action.
    """
    role_ids = get_user_role_ids(session, user_id)
    if not role_ids:
        return []

    stmt = (
        select(Permission)
        .join(RolePermissionLink, RolePermissionLink.permission_id == Permission.id)
        .where(RolePermissionLink.role_id.in_(role_ids))
    )
    if resource_type is not None:
        rt = _normalize_resource_type(resource_type)
        stmt = stmt.where(Permission.resource_type == rt)
    if action is not None:
        ac = _normalize_action(action)
        stmt = stmt.where(Permission.action == ac)
    return list(session.exec(stmt).unique().all())


def has_permission(
    session: Session,
    user: User,
    resource_type: ResourceTypeEnum | str,
    action: PermissionActionEnum | str,
    resource_id: uuid.UUID | None = None,
) -> bool:
    """
    Return True if the user is allowed to perform the action on the resource.

    - Superuser always has permission.
    - Otherwise: user must have a role that has a permission matching
      (resource_type, action) with resource_id is None (all resources)
      or resource_id == permission.resource_id.
    """
    if user.is_superuser:
        return True

    perms = get_user_permissions(
        session,
        user.id,
        resource_type=resource_type,
        action=action,
    )
    for p in perms:
        if p.resource_id is None:
            return True
        if resource_id is not None and p.resource_id == resource_id:
            return True
    return False


def get_my_permissions_flat(
    session: Session,
    user_id: uuid.UUID,
) -> list[dict[str, str | uuid.UUID | None]]:
    """
    Return current user's permissions as a flat list of dicts for API response.
    Each item: {"resource_type": "...", "action": "...", "resource_id": null or uuid}.
    Deduplicated by (resource_type, action, resource_id).
    """
    perms = get_user_permissions(session, user_id)
    seen: set[tuple[str, str, uuid.UUID | None]] = set()
    out: list[dict[str, str | uuid.UUID | None]] = []
    for p in perms:
        key = (p.resource_type.value, p.action.value, p.resource_id)
        if key in seen:
            continue
        seen.add(key)
        out.append(
            {
                "resource_type": p.resource_type.value,
                "action": p.action.value,
                "resource_id": p.resource_id,
            }
        )
    return out
