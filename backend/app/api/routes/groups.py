"""
ApiGroup management (Phase 2, Task 2.3).

Endpoints: list (POST), create, update, delete, detail (with api_assignment_ids).
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
from app.api.pagination import get_allowed_ids, paginate
from app.core.permission import get_user_permissions, has_permission
from app.core.permission_resources import (
    ensure_resource_permissions,
    remove_resource_permissions,
)
from app.models_permission import PermissionActionEnum, ResourceTypeEnum
from app.models import Message, User
from app.models_dbapi import ApiAssignmentGroupLink, ApiGroup
from app.schemas_dbapi import (
    ApiGroupCreate,
    ApiGroupDetail,
    ApiGroupListIn,
    ApiGroupListOut,
    ApiGroupPublic,
    ApiGroupUpdate,
)

router = APIRouter(prefix="/groups", tags=["groups"])

GROUP_RESOURCE_ACTIONS = (
    PermissionActionEnum.READ,
    PermissionActionEnum.CREATE,
    PermissionActionEnum.UPDATE,
    PermissionActionEnum.DELETE,
)


def _group_resource_id_from_path(*, id: uuid.UUID, **_: object) -> uuid.UUID | None:
    return id


def _group_resource_id_from_body(
    *, body: ApiGroupUpdate, **_: object
) -> uuid.UUID | None:
    return body.id


def _to_public(g: ApiGroup) -> ApiGroupPublic:
    """Build ApiGroupPublic from ApiGroup."""
    return ApiGroupPublic(
        id=g.id,
        name=g.name,
        description=g.description,
        is_active=g.is_active,
        created_at=g.created_at,
        updated_at=g.updated_at,
    )


def _list_filters(stmt: Any, body: ApiGroupListIn) -> Any:
    """Apply optional filters to ApiGroup select statement."""
    if body.name__ilike:
        stmt = stmt.where(ApiGroup.name.ilike(f"%{body.name__ilike}%"))
    if body.is_active is not None:
        stmt = stmt.where(ApiGroup.is_active == body.is_active)
    return stmt


@router.post(
    "/list",
    response_model=ApiGroupListOut,
    dependencies=[
        Depends(require_permission(ResourceTypeEnum.GROUP, PermissionActionEnum.READ))
    ],
)
def list_groups(
    session: SessionDep,
    current_user: CurrentUser,
    body: ApiGroupListIn,
) -> Any:
    """List groups with pagination and optional filters (name, is_active)."""
    allowed_ids = get_allowed_ids(
        session, current_user, ResourceTypeEnum.GROUP, PermissionActionEnum.READ
    )
    data, total = paginate(
        session,
        ApiGroup,
        body,
        filters_fn=_list_filters,
        allowed_ids=allowed_ids,
        order_by=ApiGroup.name,
        to_public=_to_public,
    )
    return ApiGroupListOut(data=data, total=total)


@router.post(
    "/create",
    response_model=ApiGroupPublic,
    dependencies=[
        Depends(require_permission(ResourceTypeEnum.GROUP, PermissionActionEnum.CREATE))
    ],
)
def create_group(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    body: ApiGroupCreate,
) -> Any:
    """Create a new group."""
    g = ApiGroup.model_validate(body)
    session.add(g)
    session.flush()
    ensure_resource_permissions(
        session, ResourceTypeEnum.GROUP, g.id, GROUP_RESOURCE_ACTIONS
    )
    session.commit()
    session.refresh(g)
    return _to_public(g)


@router.post(
    "/update",
    response_model=ApiGroupPublic,
)
def update_group(
    session: SessionDep,
    body: ApiGroupUpdate,
    _: User = Depends(
        require_permission_for_body_resource(
            ResourceTypeEnum.GROUP,
            PermissionActionEnum.UPDATE,
            ApiGroupUpdate,
            _group_resource_id_from_body,
        )
    ),
) -> Any:
    """Update an existing group."""
    g = session.get(ApiGroup, body.id)
    if not g:
        raise HTTPException(status_code=404, detail="ApiGroup not found")
    update = body.model_dump(exclude_unset=True, exclude={"id"})
    g.sqlmodel_update(update)
    session.add(g)
    session.commit()
    session.refresh(g)
    return _to_public(g)


@router.delete(
    "/delete/{id}",
    response_model=Message,
    dependencies=[
        Depends(
            require_permission_for_resource(
                ResourceTypeEnum.GROUP,
                PermissionActionEnum.DELETE,
                _group_resource_id_from_path,
            )
        )
    ],
)
def delete_group(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    id: uuid.UUID,
) -> Any:
    """Delete a group by id."""
    g = session.get(ApiGroup, id)
    if not g:
        raise HTTPException(status_code=404, detail="ApiGroup not found")
    remove_resource_permissions(session, ResourceTypeEnum.GROUP, g.id)
    session.delete(g)
    session.commit()
    return Message(message="ApiGroup deleted successfully")


@router.get(
    "/{id}",
    response_model=ApiGroupDetail,
    dependencies=[
        Depends(
            require_permission_for_resource(
                ResourceTypeEnum.GROUP,
                PermissionActionEnum.READ,
                _group_resource_id_from_path,
            )
        )
    ],
)
def get_group(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    id: uuid.UUID,
) -> Any:
    """Get group detail by id (includes api_assignment_ids from group_links)."""
    g = session.get(ApiGroup, id)
    if not g:
        raise HTTPException(status_code=404, detail="ApiGroup not found")

    links_stmt = select(ApiAssignmentGroupLink.api_assignment_id).where(
        ApiAssignmentGroupLink.api_group_id == id
    )
    api_assignment_ids = list(session.exec(links_stmt).all())

    return ApiGroupDetail(
        id=g.id,
        name=g.name,
        description=g.description,
        is_active=g.is_active,
        created_at=g.created_at,
        updated_at=g.updated_at,
        api_assignment_ids=api_assignment_ids,
    )
