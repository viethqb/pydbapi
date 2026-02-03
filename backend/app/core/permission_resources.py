"""
Helpers for managing resource-scoped permissions (object-level).

Provides utilities to ensure permissions exist for a specific resource instance
and to clean them up when the resource is removed. Designed to be reused by
multiple resource types (modules, datasources, etc.).
"""

from __future__ import annotations

import uuid
from collections.abc import Iterable

from sqlmodel import Session, delete, select

from app.models_permission import (
    Permission,
    PermissionActionEnum,
    ResourceTypeEnum,
    RolePermissionLink,
)


def ensure_resource_permissions(
    session: Session,
    resource_type: ResourceTypeEnum,
    resource_id: uuid.UUID,
    actions: Iterable[PermissionActionEnum],
) -> list[Permission]:
    """
    Ensure permissions for the given resource/action set exist.

    Returns the Permission objects (existing or newly created). Uses a simple
    upsert strategy to stay idempotent even when called multiple times.
    """

    ensured: list[Permission] = []
    for action in actions:
        stmt = select(Permission).where(
            Permission.resource_type == resource_type,
            Permission.action == action,
            Permission.resource_id == resource_id,
        )
        perm = session.exec(stmt).first()
        if perm is None:
            perm = Permission(
                resource_type=resource_type,
                action=action,
                resource_id=resource_id,
            )
            session.add(perm)
            session.flush()
        ensured.append(perm)
    return ensured


def remove_resource_permissions(
    session: Session,
    resource_type: ResourceTypeEnum,
    resource_id: uuid.UUID,
) -> int:
    """
    Remove permissions (and role links) scoped to the resource.

    Returns the count of Permission records removed.
    """

    stmt = select(Permission.id).where(
        Permission.resource_type == resource_type,
        Permission.resource_id == resource_id,
    )
    permission_ids = [pid for pid in session.exec(stmt).all()]
    if not permission_ids:
        return 0

    session.exec(
        delete(RolePermissionLink).where(
            RolePermissionLink.permission_id.in_(permission_ids)
        )
    )
    session.exec(delete(Permission).where(Permission.id.in_(permission_ids)))
    return len(permission_ids)
