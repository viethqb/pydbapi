"""
ApiModule management (Phase 2, Task 2.3).

Endpoints: list (POST), GET simple list, create, update, delete, detail.
"""

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import func, select

from app.api.deps import (
    CurrentUser,
    SessionDep,
    require_permission,
    require_permission_for_body_resource,
    require_permission_for_resource,
)
from app.core.permission_resources import (
    ensure_resource_permissions,
    remove_resource_permissions,
)
from app.models_permission import PermissionActionEnum, ResourceTypeEnum
from app.models import Message, User
from app.models_dbapi import ApiModule
from app.schemas_dbapi import (
    ApiModuleCreate,
    ApiModuleListIn,
    ApiModuleListOut,
    ApiModulePublic,
    ApiModuleUpdate,
)

router = APIRouter(prefix="/modules", tags=["modules"])


def _to_public(m: ApiModule) -> ApiModulePublic:
    """Build ApiModulePublic from ApiModule."""
    return ApiModulePublic(
        id=m.id,
        name=m.name,
        description=m.description,
        path_prefix=m.path_prefix,
        sort_order=m.sort_order,
        is_active=m.is_active,
        created_at=m.created_at,
        updated_at=m.updated_at,
    )


def _list_filters(stmt: Any, body: ApiModuleListIn) -> Any:
    """Apply optional filters to ApiModule select statement."""
    if body.name__ilike:
        stmt = stmt.where(ApiModule.name.ilike(f"%{body.name__ilike}%"))
    if body.is_active is not None:
        stmt = stmt.where(ApiModule.is_active == body.is_active)
    return stmt


MODULE_RESOURCE_ACTIONS = (
    PermissionActionEnum.READ,
    PermissionActionEnum.CREATE,
    PermissionActionEnum.UPDATE,
    PermissionActionEnum.DELETE,
    PermissionActionEnum.EXECUTE,
)


def _module_resource_id_from_body(
    *,
    body: ApiModuleUpdate,
    **_: Any,
) -> uuid.UUID | None:
    return body.id


def _module_resource_id_from_path(
    *,
    id: uuid.UUID,
    **_: Any,
) -> uuid.UUID | None:
    return id


@router.get(
    "",
    response_model=list[ApiModulePublic],
    dependencies=[
        Depends(require_permission(ResourceTypeEnum.MODULE, PermissionActionEnum.READ))
    ],
)
def list_modules_simple(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
) -> Any:
    """Simple list for dropdowns (no pagination)."""
    stmt = (
        select(ApiModule)
        .where(ApiModule.is_active.is_(True))
        .order_by(ApiModule.sort_order, ApiModule.name)
    )
    rows = session.exec(stmt).all()
    return [_to_public(r) for r in rows]


@router.post(
    "/list",
    response_model=ApiModuleListOut,
    dependencies=[
        Depends(require_permission(ResourceTypeEnum.MODULE, PermissionActionEnum.READ))
    ],
)
def list_modules(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    body: ApiModuleListIn,
) -> Any:
    """List modules with pagination and optional filters (name, is_active)."""
    count_stmt = _list_filters(select(func.count()).select_from(ApiModule), body)
    total = session.exec(count_stmt).one()

    stmt = _list_filters(select(ApiModule), body)
    offset = (body.page - 1) * body.page_size
    stmt = (
        stmt.order_by(ApiModule.sort_order, ApiModule.name)
        .offset(offset)
        .limit(body.page_size)
    )
    rows = session.exec(stmt).all()

    return ApiModuleListOut(data=[_to_public(r) for r in rows], total=total)


@router.post(
    "/create",
    response_model=ApiModulePublic,
    dependencies=[
        Depends(
            require_permission(ResourceTypeEnum.MODULE, PermissionActionEnum.CREATE)
        )
    ],
)
def create_module(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    body: ApiModuleCreate,
) -> Any:
    """Create a new module."""
    m = ApiModule.model_validate(body)
    session.add(m)
    ensure_resource_permissions(
        session,
        ResourceTypeEnum.MODULE,
        m.id,
        MODULE_RESOURCE_ACTIONS,
    )
    session.commit()
    session.refresh(m)
    return _to_public(m)


@router.post(
    "/update",
    response_model=ApiModulePublic,
)
def update_module(
    session: SessionDep,
    body: ApiModuleUpdate,
    _: User = Depends(
        require_permission_for_body_resource(
            ResourceTypeEnum.MODULE,
            PermissionActionEnum.UPDATE,
            ApiModuleUpdate,
            _module_resource_id_from_body,
        )
    ),
) -> Any:
    """Update an existing module."""
    m = session.get(ApiModule, body.id)
    if not m:
        raise HTTPException(status_code=404, detail="ApiModule not found")
    update = body.model_dump(exclude_unset=True, exclude={"id"})
    m.sqlmodel_update(update)
    session.add(m)
    session.commit()
    session.refresh(m)
    return _to_public(m)


@router.delete(
    "/delete/{id}",
    response_model=Message,
)
def delete_module(
    session: SessionDep,
    id: uuid.UUID,
    _: User = Depends(
        require_permission_for_resource(
            ResourceTypeEnum.MODULE,
            PermissionActionEnum.DELETE,
            resource_id_getter=_module_resource_id_from_path,
        )
    ),
) -> Any:
    """Delete a module by id (cascades to api_assignments)."""
    m = session.get(ApiModule, id)
    if not m:
        raise HTTPException(status_code=404, detail="ApiModule not found")
    remove_resource_permissions(session, ResourceTypeEnum.MODULE, id)
    session.delete(m)
    session.commit()
    return Message(message="ApiModule deleted successfully")


@router.get(
    "/{id}",
    response_model=ApiModulePublic,
    dependencies=[
        Depends(require_permission(ResourceTypeEnum.MODULE, PermissionActionEnum.READ))
    ],
)
def get_module(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    id: uuid.UUID,
) -> Any:
    """Get module detail by id."""
    m = session.get(ApiModule, id)
    if not m:
        raise HTTPException(status_code=404, detail="ApiModule not found")
    return _to_public(m)
