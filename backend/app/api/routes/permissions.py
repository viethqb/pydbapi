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
from app.models_dbapi import (
    ApiAssignment,
    ApiGroup,
    ApiMacroDef,
    AppClient,
    DataSource,
    ApiModule,
)
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
    api_assignments: list[ResourceName]
    groups: list[ResourceName]
    macro_defs: list[ResourceName]
    clients: list[ResourceName]


def _full_path(path_prefix: str, path: str) -> str:
    """Build full path from module prefix and assignment path."""
    prefix = (path_prefix or "/").strip().rstrip("/")
    part = (path or "").strip().lstrip("/")
    if not prefix and not part:
        return "/"
    if not prefix:
        return f"/{part}"
    if not part:
        return f"/{prefix}"
    return f"/{prefix}/{part}"


@router.get(
    "/resource-names",
    response_model=ResourceNamesOut,
    dependencies=[Depends(get_current_active_superuser)],
)
def get_resource_names(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
) -> Any:
    """Return id+name for all permission-scoped resources for permission UI labels.
    API assignments: name = 'METHOD /full/path' (e.g. GET /api/v1/users).
    """
    ds_rows = session.exec(select(DataSource.id, DataSource.name)).all()
    mod_rows = session.exec(select(ApiModule.id, ApiModule.name)).all()
    group_rows = session.exec(select(ApiGroup.id, ApiGroup.name)).all()
    macro_rows = session.exec(select(ApiMacroDef.id, ApiMacroDef.name)).all()
    client_rows = session.exec(select(AppClient.id, AppClient.name)).all()

    api_rows = session.exec(
        select(ApiAssignment, ApiModule).join(
            ApiModule, ApiAssignment.module_id == ApiModule.id
        )
    ).all()
    api_assignments = [
        ResourceName(
            id=a.id,
            name=f"{a.http_method.value} {_full_path(m.path_prefix, a.path)}",
        )
        for a, m in api_rows
    ]

    return ResourceNamesOut(
        datasources=[ResourceName(id=r[0], name=r[1]) for r in ds_rows],
        modules=[ResourceName(id=r[0], name=r[1]) for r in mod_rows],
        api_assignments=api_assignments,
        groups=[ResourceName(id=r[0], name=r[1]) for r in group_rows],
        macro_defs=[ResourceName(id=r[0], name=r[1]) for r in macro_rows],
        clients=[ResourceName(id=r[0], name=r[1]) for r in client_rows],
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
