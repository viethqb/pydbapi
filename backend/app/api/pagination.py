"""
Shared pagination and permission-filtered list utilities.

Reduces duplicated count+offset+limit logic across route files.
"""

from __future__ import annotations

import uuid
from typing import Any, Protocol

from fastapi import HTTPException
from sqlmodel import Session, select
from sqlalchemy import func

from app.core.permission import get_user_permissions, has_permission
from app.models import User
from app.models_permission import PermissionActionEnum, ResourceTypeEnum


class _HasPage(Protocol):
    page: int
    page_size: int


def get_allowed_ids(
    session: Session,
    current_user: User,
    resource_type: ResourceTypeEnum | str,
    action: PermissionActionEnum | str = PermissionActionEnum.READ,
) -> list[uuid.UUID] | None:
    """
    Return ``None`` if the user has global permission (no filtering needed),
    or a list of allowed resource UUIDs for scoped permission.

    Raises 403 if the user has no permission at all.
    """
    if has_permission(session, current_user, resource_type, action, None):
        return None  # global access — no filter required

    perms = get_user_permissions(session, current_user.id)
    allowed = [
        p.resource_id
        for p in perms
        if p.resource_type == resource_type
        and p.action == action
        and p.resource_id is not None
    ]
    if not allowed:
        raise HTTPException(
            status_code=403,
            detail=f"Permission required: {resource_type}.{action}",
        )
    return allowed


def paginate(
    session: Session,
    model: Any,
    body: _HasPage,
    *,
    filters_fn: Any | None = None,
    allowed_ids: list[uuid.UUID] | None = None,
    order_by: Any = None,
    to_public: Any | None = None,
) -> tuple[list[Any], int]:
    """
    Execute count + paginated select and return ``(rows, total)``.

    Parameters
    ----------
    session : Session
    model : SQLModel class (e.g. DataSource)
    body : object with ``.page`` and ``.page_size``
    filters_fn : optional callable ``(stmt, body) -> stmt`` for WHERE filters
    allowed_ids : from ``get_allowed_ids``; filters ``model.id.in_(...)``
    order_by : SQLAlchemy order clause(s), e.g. ``Model.name`` or a tuple
    to_public : optional callable to convert each row; if None returns raw rows

    Returns
    -------
    (data_list, total_count)
    """
    # --- count ---
    count_stmt = select(func.count()).select_from(model)
    if filters_fn is not None:
        count_stmt = filters_fn(count_stmt, body)
    if allowed_ids is not None:
        count_stmt = count_stmt.where(model.id.in_(allowed_ids))
    total: int = session.exec(count_stmt).one()

    # --- data ---
    stmt = select(model)
    if filters_fn is not None:
        stmt = filters_fn(stmt, body)
    if allowed_ids is not None:
        stmt = stmt.where(model.id.in_(allowed_ids))

    offset = (body.page - 1) * body.page_size
    if order_by is not None:
        if isinstance(order_by, (list, tuple)):
            stmt = stmt.order_by(*order_by)
        else:
            stmt = stmt.order_by(order_by)
    stmt = stmt.offset(offset).limit(body.page_size)
    rows = session.exec(stmt).all()

    data = [to_public(r) for r in rows] if to_public else list(rows)
    return data, total
