"""
Permission list API (Phase 4 – PERMISSION_PLAN_SUPERSET_STYLE).

Endpoints: GET /list, GET /resource-names. Admin only.
"""

import uuid
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlmodel import select

from app.api.deps import CurrentUser, SessionDep, get_current_active_superuser
from app.models_dbapi import DataSource, ApiModule
from app.models_permission import Permission

router = APIRouter(prefix="/permissions", tags=["permissions"])


class PermissionPublic(BaseModel):
    """Permission in list response."""

    id: uuid.UUID
    resource_type: str
    action: str
    resource_id: uuid.UUID | None = None


class PermissionListOut(BaseModel):
    """Response for GET /permissions/list."""

    data: list[PermissionPublic]


class ResourceName(BaseModel):
    id: uuid.UUID
    name: str


class ResourceNamesOut(BaseModel):
    """Response for GET /permissions/resource-names."""

    datasources: list[ResourceName]
    modules: list[ResourceName]


@router.get(
    "/resource-names",
    response_model=ResourceNamesOut,
    dependencies=[Depends(get_current_active_superuser)],
)
def get_resource_names(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
) -> Any:
    """Return id+name for datasources and modules for permission UI labels."""
    ds_rows = session.exec(select(DataSource.id, DataSource.name)).all()
    mod_rows = session.exec(select(ApiModule.id, ApiModule.name)).all()
    return ResourceNamesOut(
        datasources=[ResourceName(id=r[0], name=r[1]) for r in ds_rows],
        modules=[ResourceName(id=r[0], name=r[1]) for r in mod_rows],
    )


@router.get(
    "/list",
    response_model=PermissionListOut,
    dependencies=[Depends(get_current_active_superuser)],
)
def list_permissions(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
) -> Any:
    """List all permissions (resource_type, action, resource_id). Admin only."""
    perms = session.exec(
        select(Permission).order_by(Permission.resource_type, Permission.action)
    ).all()
    return PermissionListOut(
        data=[
            PermissionPublic(
                id=p.id,
                resource_type=p.resource_type.value,
                action=p.action.value,
                resource_id=p.resource_id,
            )
            for p in perms
        ]
    )
