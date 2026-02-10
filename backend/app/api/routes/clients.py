"""
AppClient management (Phase 2, Task 2.4).

Endpoints: list (POST), create, update, delete, detail, regenerate-secret.
Client-group link (group_ids): client can only call APIs in assigned groups.
"""

import secrets
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete
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
from app.core.security import get_password_hash
from app.models import Message, User
from app.models_dbapi import ApiAssignmentGroupLink, AppClient, AppClientApiLink, AppClientGroupLink
from app.schemas_dbapi import (
    AppClientCreate,
    AppClientDetail,
    AppClientListIn,
    AppClientListOut,
    AppClientPublic,
    AppClientRegenerateSecretOut,
    AppClientUpdate,
)

router = APIRouter(prefix="/clients", tags=["clients"])

CLIENT_RESOURCE_ACTIONS = (
    PermissionActionEnum.READ,
    PermissionActionEnum.CREATE,
    PermissionActionEnum.UPDATE,
    PermissionActionEnum.DELETE,
)


def _client_resource_id_from_path(*, id: uuid.UUID, **_: object) -> uuid.UUID | None:
    return id


def _client_resource_id_from_body(
    *, body: AppClientUpdate, **_: object
) -> uuid.UUID | None:
    return body.id


def _to_public(c: AppClient) -> AppClientPublic:
    """Build AppClientPublic from AppClient (excludes client_secret)."""
    return AppClientPublic(
        id=c.id,
        name=c.name,
        client_id=c.client_id,
        description=c.description,
        rate_limit_per_minute=getattr(c, "rate_limit_per_minute", None),
        max_concurrent=getattr(c, "max_concurrent", None),
        is_active=c.is_active,
        created_at=c.created_at,
        updated_at=c.updated_at,
    )


def _list_filters(stmt: Any, body: AppClientListIn) -> Any:
    """Apply optional filters to AppClient select statement."""
    if body.name__ilike:
        stmt = stmt.where(AppClient.name.ilike(f"%{body.name__ilike}%"))
    if body.is_active is not None:
        stmt = stmt.where(AppClient.is_active == body.is_active)
    return stmt


@router.post(
    "/list",
    response_model=AppClientListOut,
    dependencies=[
        Depends(require_permission(ResourceTypeEnum.CLIENT, PermissionActionEnum.READ))
    ],
)
def list_clients(
    session: SessionDep,
    current_user: CurrentUser,
    body: AppClientListIn,
) -> Any:
    """List clients with pagination and optional filters (name, is_active)."""
    allowed_ids = get_allowed_ids(
        session, current_user, ResourceTypeEnum.CLIENT, PermissionActionEnum.READ
    )
    data, total = paginate(
        session,
        AppClient,
        body,
        filters_fn=_list_filters,
        allowed_ids=allowed_ids,
        order_by=AppClient.created_at.desc(),
        to_public=_to_public,
    )
    return AppClientListOut(data=data, total=total)


@router.post(
    "/create",
    response_model=AppClientPublic,
    dependencies=[
        Depends(
            require_permission(ResourceTypeEnum.CLIENT, PermissionActionEnum.CREATE)
        )
    ],
)
def create_client(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    body: AppClientCreate,
) -> Any:
    """Create a new client; generate client_id and hash client_secret by default.

    If ``client_id`` is provided in the request body, it will be used instead of a
    generated value (must be unique). ``client_secret`` is always hashed before
    storing.
    """
    client_id = body.client_id or secrets.token_urlsafe(16)
    hashed_secret = get_password_hash(body.client_secret)
    c = AppClient(
        name=body.name,
        client_id=client_id,
        client_secret=hashed_secret,
        description=body.description,
        rate_limit_per_minute=getattr(body, "rate_limit_per_minute", None),
        max_concurrent=getattr(body, "max_concurrent", None),
        is_active=body.is_active,
    )
    session.add(c)
    session.flush()
    ensure_resource_permissions(
        session, ResourceTypeEnum.CLIENT, c.id, CLIENT_RESOURCE_ACTIONS
    )
    session.commit()
    session.refresh(c)
    for gid in body.group_ids or []:
        session.add(AppClientGroupLink(app_client_id=c.id, api_group_id=gid))
    for aid in body.api_assignment_ids or []:
        session.add(AppClientApiLink(app_client_id=c.id, api_assignment_id=aid))
    if body.group_ids or body.api_assignment_ids:
        session.commit()
    return _to_public(c)


@router.post(
    "/update",
    response_model=AppClientPublic,
)
def update_client(
    session: SessionDep,
    body: AppClientUpdate,
    _: User = Depends(
        require_permission_for_body_resource(
            ResourceTypeEnum.CLIENT,
            PermissionActionEnum.UPDATE,
            AppClientUpdate,
            _client_resource_id_from_body,
        )
    ),
) -> Any:
    """Update an existing client (client_id and client_secret not changed here). If group_ids is set, replace links."""
    c = session.get(AppClient, body.id)
    if not c:
        raise HTTPException(status_code=404, detail="AppClient not found")
    update = body.model_dump(
        exclude_unset=True, exclude={"id", "group_ids", "api_assignment_ids"}
    )
    c.sqlmodel_update(update)
    session.add(c)
    if "group_ids" in body.model_fields_set:
        session.exec(
            delete(AppClientGroupLink).where(AppClientGroupLink.app_client_id == c.id)
        )
        for gid in body.group_ids or []:
            session.add(AppClientGroupLink(app_client_id=c.id, api_group_id=gid))
    if "api_assignment_ids" in body.model_fields_set:
        session.exec(
            delete(AppClientApiLink).where(AppClientApiLink.app_client_id == c.id)
        )
        for aid in body.api_assignment_ids or []:
            session.add(AppClientApiLink(app_client_id=c.id, api_assignment_id=aid))
    session.commit()
    session.refresh(c)
    return _to_public(c)


@router.delete(
    "/delete/{id}",
    response_model=Message,
    dependencies=[
        Depends(
            require_permission_for_resource(
                ResourceTypeEnum.CLIENT,
                PermissionActionEnum.DELETE,
                _client_resource_id_from_path,
            )
        )
    ],
)
def delete_client(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    id: uuid.UUID,
) -> Any:
    """Delete a client by id."""
    c = session.get(AppClient, id)
    if not c:
        raise HTTPException(status_code=404, detail="AppClient not found")
    remove_resource_permissions(session, ResourceTypeEnum.CLIENT, c.id)
    session.delete(c)
    session.commit()
    return Message(message="AppClient deleted successfully")


@router.post(
    "/{id}/regenerate-secret",
    response_model=AppClientRegenerateSecretOut,
    dependencies=[
        Depends(
            require_permission_for_resource(
                ResourceTypeEnum.CLIENT,
                PermissionActionEnum.UPDATE,
                _client_resource_id_from_path,
            )
        )
    ],
)
def regenerate_client_secret(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    id: uuid.UUID,
) -> Any:
    """Generate a new client_secret, hash and save; return plain secret once."""
    c = session.get(AppClient, id)
    if not c:
        raise HTTPException(status_code=404, detail="AppClient not found")
    new_secret = secrets.token_urlsafe(32)
    c.client_secret = get_password_hash(new_secret)
    session.add(c)
    session.commit()
    return AppClientRegenerateSecretOut(client_secret=new_secret)


def _to_detail(c: AppClient, session: SessionDep) -> AppClientDetail:
    """Build AppClientDetail with group_ids, api_assignment_ids, and effective_api_assignment_ids.

    ``effective_api_assignment_ids`` = union of direct links (AppClientApiLink)
    + APIs reachable through the client's groups (AppClientGroupLink ∩ ApiAssignmentGroupLink).
    This matches the exact logic in ``core.gateway.auth.client_can_access_api``.
    """
    group_ids = [link.api_group_id for link in (c.group_links or [])]
    api_assignment_ids = [link.api_assignment_id for link in (c.api_links or [])]

    # Compute effective APIs (same logic as gateway auth)
    effective_ids: set[uuid.UUID] = set(api_assignment_ids)

    if group_ids:
        # APIs reachable via the client's groups
        group_api_stmt = select(ApiAssignmentGroupLink.api_assignment_id).where(
            ApiAssignmentGroupLink.api_group_id.in_(group_ids)
        )
        group_api_ids = set(session.exec(group_api_stmt).all())
        effective_ids |= group_api_ids

    return AppClientDetail(
        id=c.id,
        name=c.name,
        client_id=c.client_id,
        description=c.description,
        rate_limit_per_minute=getattr(c, "rate_limit_per_minute", None),
        max_concurrent=getattr(c, "max_concurrent", None),
        is_active=c.is_active,
        created_at=c.created_at,
        updated_at=c.updated_at,
        group_ids=group_ids,
        api_assignment_ids=api_assignment_ids,
        effective_api_assignment_ids=sorted(effective_ids),
    )


@router.get(
    "/{id}",
    response_model=AppClientDetail,
    dependencies=[
        Depends(
            require_permission_for_resource(
                ResourceTypeEnum.CLIENT,
                PermissionActionEnum.READ,
                _client_resource_id_from_path,
            )
        )
    ],
)
def get_client(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    id: uuid.UUID,
) -> Any:
    """Get client detail by id (client_secret omitted; includes group_ids and effective API access)."""
    c = session.get(AppClient, id)
    if not c:
        raise HTTPException(status_code=404, detail="AppClient not found")
    return _to_detail(c, session)
