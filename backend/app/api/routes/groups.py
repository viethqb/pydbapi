"""
ApiGroup management (Phase 2, Task 2.3).

Endpoints: list (POST), create, update, delete, detail (with api_assignment_ids).
"""

import uuid
from typing import Any

from fastapi import APIRouter, HTTPException
from sqlmodel import func, select

from app.api.deps import CurrentUser, SessionDep
from app.models import Message
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


@router.post("/list", response_model=ApiGroupListOut)
def list_groups(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    body: ApiGroupListIn,
) -> Any:
    """List groups with pagination and optional filters (name, is_active)."""
    count_stmt = _list_filters(select(func.count()).select_from(ApiGroup), body)
    total = session.exec(count_stmt).one()

    stmt = _list_filters(select(ApiGroup), body)
    offset = (body.page - 1) * body.page_size
    stmt = stmt.order_by(ApiGroup.name).offset(offset).limit(body.page_size)
    rows = session.exec(stmt).all()

    return ApiGroupListOut(data=[_to_public(r) for r in rows], total=total)


@router.post("/create", response_model=ApiGroupPublic)
def create_group(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    body: ApiGroupCreate,
) -> Any:
    """Create a new group."""
    g = ApiGroup.model_validate(body)
    session.add(g)
    session.commit()
    session.refresh(g)
    return _to_public(g)


@router.post("/update", response_model=ApiGroupPublic)
def update_group(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    body: ApiGroupUpdate,
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


@router.delete("/delete/{id}", response_model=Message)
def delete_group(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    id: uuid.UUID,
) -> Any:
    """Delete a group by id."""
    g = session.get(ApiGroup, id)
    if not g:
        raise HTTPException(status_code=404, detail="ApiGroup not found")
    session.delete(g)
    session.commit()
    return Message(message="ApiGroup deleted successfully")


@router.get("/{id}", response_model=ApiGroupDetail)
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
