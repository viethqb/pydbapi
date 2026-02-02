"""
AppClient management (Phase 2, Task 2.4).

Endpoints: list (POST), create, update, delete, detail, regenerate-secret.
Client-group link (group_ids): client can only call APIs in assigned groups.
"""

import secrets
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException
from sqlalchemy import delete
from sqlmodel import func, select

from app.api.deps import CurrentUser, SessionDep
from app.core.security import get_password_hash
from app.models import Message
from app.models_dbapi import AppClient, AppClientApiLink, AppClientGroupLink
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


@router.post("/list", response_model=AppClientListOut)
def list_clients(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    body: AppClientListIn,
) -> Any:
    """List clients with pagination and optional filters (name, is_active)."""
    count_stmt = _list_filters(select(func.count()).select_from(AppClient), body)
    total = session.exec(count_stmt).one()

    stmt = _list_filters(select(AppClient), body)
    offset = (body.page - 1) * body.page_size
    stmt = (
        stmt.order_by(AppClient.created_at.desc()).offset(offset).limit(body.page_size)
    )
    rows = session.exec(stmt).all()

    return AppClientListOut(data=[_to_public(r) for r in rows], total=total)


@router.post("/create", response_model=AppClientPublic)
def create_client(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    body: AppClientCreate,
) -> Any:
    """Create a new client; generate client_id and hash client_secret. Optionally assign group_ids."""
    client_id = secrets.token_urlsafe(16)
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
    session.commit()
    session.refresh(c)
    for gid in body.group_ids or []:
        session.add(AppClientGroupLink(app_client_id=c.id, api_group_id=gid))
    for aid in body.api_assignment_ids or []:
        session.add(AppClientApiLink(app_client_id=c.id, api_assignment_id=aid))
    if body.group_ids or body.api_assignment_ids:
        session.commit()
    return _to_public(c)


@router.post("/update", response_model=AppClientPublic)
def update_client(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    body: AppClientUpdate,
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


@router.delete("/delete/{id}", response_model=Message)
def delete_client(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    id: uuid.UUID,
) -> Any:
    """Delete a client by id."""
    c = session.get(AppClient, id)
    if not c:
        raise HTTPException(status_code=404, detail="AppClient not found")
    session.delete(c)
    session.commit()
    return Message(message="AppClient deleted successfully")


@router.post("/{id}/regenerate-secret", response_model=AppClientRegenerateSecretOut)
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


def _to_detail(c: AppClient) -> AppClientDetail:
    """Build AppClientDetail with group_ids and api_assignment_ids."""
    group_ids = [link.api_group_id for link in (c.group_links or [])]
    api_assignment_ids = [link.api_assignment_id for link in (c.api_links or [])]
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
    )


@router.get("/{id}", response_model=AppClientDetail)
def get_client(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    id: uuid.UUID,
) -> Any:
    """Get client detail by id (client_secret omitted; includes group_ids for API access)."""
    c = session.get(AppClient, id)
    if not c:
        raise HTTPException(status_code=404, detail="AppClient not found")
    return _to_detail(c)
