"""
Role management (Phase 4 – PERMISSION_PLAN_SUPERSET_STYLE).

Endpoints: GET /list, POST (create), GET /{id}, PUT /{id} (update permissions). Admin only.
"""

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import delete, func, select

from app.api.deps import CurrentUser, SessionDep, get_current_active_superuser
from app.models import User, UserPublic
from app.models_permission import Role, RolePermissionLink, UserRoleLink

router = APIRouter(prefix="/roles", tags=["roles"])


class RolePublic(BaseModel):
    """Role in list response (with optional user_count for list view)."""

    id: uuid.UUID
    name: str
    description: str | None = None
    user_count: int = 0


class RoleListOut(BaseModel):
    """Response for GET /roles/list."""

    data: list[RolePublic]


class RoleDetailOut(BaseModel):
    """Response for GET /roles/{id}."""

    id: uuid.UUID
    name: str
    description: str | None = None
    permission_ids: list[uuid.UUID] = []
    user_count: int = 0


class RoleUpdateIn(BaseModel):
    """Body for PUT /roles/{id}. All optional; permission_ids replaces role's permissions."""

    name: str | None = None
    description: str | None = None
    permission_ids: list[uuid.UUID] | None = None


class RoleCreateIn(BaseModel):
    """Body for POST /roles. Create custom role."""

    name: str
    description: str | None = None
    permission_ids: list[uuid.UUID] = []


@router.post(
    "",
    response_model=RoleDetailOut,
    status_code=201,
    dependencies=[Depends(get_current_active_superuser)],
)
def create_role(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    body: RoleCreateIn,
) -> Any:
    """Create a custom role. Admin only. Name must be unique."""
    existing = session.exec(select(Role).where(Role.name == body.name)).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail="A role with this name already exists",
        )
    role = Role(name=body.name.strip(), description=body.description)
    session.add(role)
    session.flush()
    for pid in body.permission_ids:
        session.add(RolePermissionLink(role_id=role.id, permission_id=pid))
    session.commit()
    session.refresh(role)
    permission_ids = _get_role_permission_ids(session, role.id)
    user_count = _get_role_user_count(session, role.id)
    return RoleDetailOut(
        id=role.id,
        name=role.name,
        description=role.description,
        permission_ids=permission_ids,
        user_count=user_count,
    )


@router.get(
    "/list",
    response_model=RoleListOut,
    dependencies=[Depends(get_current_active_superuser)],
)
def list_roles(session: SessionDep, current_user: CurrentUser) -> Any:  # noqa: ARG001
    """List all roles with user_count. Admin only."""
    roles = session.exec(select(Role).order_by(Role.name)).all()
    return RoleListOut(
        data=[
            RolePublic(
                id=r.id,
                name=r.name,
                description=r.description,
                user_count=_get_role_user_count(session, r.id),
            )
            for r in roles
        ]
    )


def _get_role_permission_ids(
    session: SessionDep, role_id: uuid.UUID
) -> list[uuid.UUID]:
    stmt = select(RolePermissionLink.permission_id).where(
        RolePermissionLink.role_id == role_id
    )
    return list(session.exec(stmt).all())


def _get_role_user_count(session: SessionDep, role_id: uuid.UUID) -> int:
    stmt = (
        select(func.count())
        .select_from(UserRoleLink)
        .where(UserRoleLink.role_id == role_id)
    )
    return session.exec(stmt).one() or 0


class RoleUsersOut(BaseModel):
    """Response for GET /roles/{id}/users."""

    data: list[UserPublic]


@router.get(
    "/{id}/users",
    response_model=RoleUsersOut,
    dependencies=[Depends(get_current_active_superuser)],
)
def list_role_users(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    id: uuid.UUID,
) -> Any:
    """List users assigned to this role. Admin only."""
    role = session.get(Role, id)
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    stmt = (
        select(User)
        .join(UserRoleLink, UserRoleLink.user_id == User.id)
        .where(UserRoleLink.role_id == role.id)
    )
    users = session.exec(stmt).all()
    return RoleUsersOut(data=list(users))


@router.get(
    "/{id}",
    response_model=RoleDetailOut,
    dependencies=[Depends(get_current_active_superuser)],
)
def get_role(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    id: uuid.UUID,
) -> Any:
    """Get role by id with permission_ids and user_count. Admin only."""
    role = session.get(Role, id)
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    permission_ids = _get_role_permission_ids(session, role.id)
    user_count = _get_role_user_count(session, role.id)
    return RoleDetailOut(
        id=role.id,
        name=role.name,
        description=role.description,
        permission_ids=permission_ids,
        user_count=user_count,
    )


@router.put(
    "/{id}",
    response_model=RoleDetailOut,
    dependencies=[Depends(get_current_active_superuser)],
)
def update_role(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    id: uuid.UUID,
    body: RoleUpdateIn,
) -> Any:
    """Update role name, description, and/or permissions. Admin only."""
    role = session.get(Role, id)
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    if body.name is not None:
        role.name = body.name
    if body.description is not None:
        role.description = body.description
    if body.name is not None or body.description is not None:
        session.add(role)
        session.flush()

    if body.permission_ids is not None:
        session.exec(
            delete(RolePermissionLink).where(RolePermissionLink.role_id == role.id)
        )
        for pid in body.permission_ids:
            session.add(RolePermissionLink(role_id=role.id, permission_id=pid))

    session.commit()
    session.refresh(role)
    permission_ids = _get_role_permission_ids(session, role.id)
    user_count = _get_role_user_count(session, role.id)
    return RoleDetailOut(
        id=role.id,
        name=role.name,
        description=role.description,
        permission_ids=permission_ids,
        user_count=user_count,
    )


@router.delete(
    "/{id}",
    status_code=204,
    dependencies=[Depends(get_current_active_superuser)],
)
def delete_role(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    id: uuid.UUID,
) -> None:
    """Delete a role. Admin only. Unlinks all user and permission associations."""
    role = session.get(Role, id)
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    session.exec(delete(UserRoleLink).where(UserRoleLink.role_id == role.id))
    session.exec(
        delete(RolePermissionLink).where(RolePermissionLink.role_id == role.id)
    )
    session.delete(role)
    session.commit()
