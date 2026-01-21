"""
API Assignment + ApiContext management (Phase 2, Task 2.2).

Endpoints: list, create, update, delete, get detail, publish, debug.
Phase 3: debug calls ApiExecutor.execute (SQL or SCRIPT).
"""

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException
from sqlalchemy import delete
from sqlmodel import func, select

from app.api.deps import CurrentUser, SessionDep
from app.engines import ApiExecutor
from app.models import Message
from app.models_dbapi import (
    ApiAssignment,
    ApiAssignmentGroupLink,
    ApiContext,
)
from app.schemas_dbapi import (
    ApiAssignmentCreate,
    ApiAssignmentDebugIn,
    ApiAssignmentDetail,
    ApiAssignmentListIn,
    ApiAssignmentListOut,
    ApiAssignmentPublic,
    ApiAssignmentPublishIn,
    ApiAssignmentUpdate,
    ApiContextPublic,
)

router = APIRouter(prefix="/api-assignments", tags=["api-assignments"])


def _to_public(a: ApiAssignment) -> ApiAssignmentPublic:
    """Build ApiAssignmentPublic from ApiAssignment (omit api_context)."""
    return ApiAssignmentPublic(
        id=a.id,
        module_id=a.module_id,
        name=a.name,
        path=a.path,
        http_method=a.http_method,
        execute_engine=a.execute_engine,
        datasource_id=a.datasource_id,
        description=a.description,
        is_published=a.is_published,
        sort_order=a.sort_order,
        created_at=a.created_at,
        updated_at=a.updated_at,
    )


def _to_detail(a: ApiAssignment) -> ApiAssignmentDetail:
    """Build ApiAssignmentDetail with api_context and group_ids."""
    base = _to_public(a)
    api_context: ApiContextPublic | None = None
    if a.api_context:
        api_context = ApiContextPublic(
            id=a.api_context.id,
            api_assignment_id=a.api_context.api_assignment_id,
            content=a.api_context.content,
            created_at=a.api_context.created_at,
            updated_at=a.api_context.updated_at,
        )
    group_ids = [link.api_group_id for link in (a.group_links or [])]
    return ApiAssignmentDetail(
        **base.model_dump(),
        api_context=api_context,
        group_ids=group_ids,
    )


def _list_filters(stmt: Any, body: ApiAssignmentListIn) -> Any:
    """Apply optional filters to ApiAssignment select statement."""
    if body.module_id is not None:
        stmt = stmt.where(ApiAssignment.module_id == body.module_id)
    if body.is_published is not None:
        stmt = stmt.where(ApiAssignment.is_published == body.is_published)
    if body.name__ilike:
        stmt = stmt.where(ApiAssignment.name.ilike(f"%{body.name__ilike}%"))
    if body.http_method is not None:
        stmt = stmt.where(ApiAssignment.http_method == body.http_method)
    if body.execute_engine is not None:
        stmt = stmt.where(ApiAssignment.execute_engine == body.execute_engine)
    return stmt


@router.post("/list", response_model=ApiAssignmentListOut)
def list_api_assignments(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    body: ApiAssignmentListIn,
) -> Any:
    """List API assignments with pagination and optional filters."""
    count_stmt = _list_filters(
        select(func.count()).select_from(ApiAssignment), body
    )
    total = session.exec(count_stmt).one()

    stmt = _list_filters(select(ApiAssignment), body)
    offset = (body.page - 1) * body.page_size
    stmt = (
        stmt.order_by(ApiAssignment.sort_order, ApiAssignment.name)
        .offset(offset)
        .limit(body.page_size)
    )
    rows = session.exec(stmt).all()

    return ApiAssignmentListOut(
        data=[_to_public(r) for r in rows], total=total
    )


@router.post("/create", response_model=ApiAssignmentPublic)
def create_api_assignment(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    body: ApiAssignmentCreate,
) -> Any:
    """Create API assignment; if content provided, create ApiContext (1-1). Optionally link groups."""
    assign_data = body.model_dump(exclude={"content", "group_ids"})
    a = ApiAssignment(**assign_data)
    session.add(a)
    session.flush()

    if body.content is not None:
        ctx = ApiContext(api_assignment_id=a.id, content=body.content)
        session.add(ctx)

    for gid in body.group_ids or []:
        session.add(
            ApiAssignmentGroupLink(
                api_assignment_id=a.id,
                api_group_id=gid,
            )
        )

    session.commit()
    session.refresh(a)
    return _to_public(a)


@router.post("/update", response_model=ApiAssignmentPublic)
def update_api_assignment(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    body: ApiAssignmentUpdate,
) -> Any:
    """Update API assignment; if content sent, update or create ApiContext. If group_ids sent, replace links."""
    a = session.get(ApiAssignment, body.id)
    if not a:
        raise HTTPException(status_code=404, detail="ApiAssignment not found")

    update_data = body.model_dump(
        exclude_unset=True, exclude={"id", "content", "group_ids"}
    )
    if update_data:
        a.sqlmodel_update(update_data)
        session.add(a)

    if "content" in body.model_fields_set:
        ctx = session.exec(
            select(ApiContext).where(ApiContext.api_assignment_id == a.id)
        ).first()
        if ctx:
            ctx.content = body.content or ""
            ctx.updated_at = datetime.now(timezone.utc)
            session.add(ctx)
        else:
            session.add(
                ApiContext(
                    api_assignment_id=a.id,
                    content=body.content or "",
                )
            )

    if "group_ids" in body.model_fields_set:
        session.exec(
            delete(ApiAssignmentGroupLink).where(
                ApiAssignmentGroupLink.api_assignment_id == a.id
            )
        )
        for gid in body.group_ids or []:
            session.add(
                ApiAssignmentGroupLink(
                    api_assignment_id=a.id,
                    api_group_id=gid,
                )
            )

    session.commit()
    session.refresh(a)
    return _to_public(a)


@router.post("/publish", response_model=ApiAssignmentPublic)
def publish_api_assignment(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    body: ApiAssignmentPublishIn,
) -> Any:
    """Set is_published=True for the given API assignment."""
    a = session.get(ApiAssignment, body.id)
    if not a:
        raise HTTPException(status_code=404, detail="ApiAssignment not found")
    a.is_published = True
    a.updated_at = datetime.now(timezone.utc)
    session.add(a)
    session.commit()
    session.refresh(a)
    return _to_public(a)


@router.post("/debug")
def debug_api_assignment(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    body: ApiAssignmentDebugIn,
) -> Any:
    """
    Run API (SQL or Script) for testing. Phase 3: uses ApiExecutor.

    - If body.id: load ApiAssignment + ApiContext; use content, execute_engine, datasource_id.
    - If body.content (inline): use content, execute_engine, datasource_id from body.
    Returns {"data": ...}, {"rowcount": n}, or {"error": "..."}.
    """
    content: str
    engine = body.execute_engine
    datasource_id = body.datasource_id

    if body.id is not None:
        a = session.get(ApiAssignment, body.id)
        if not a:
            raise HTTPException(status_code=404, detail="ApiAssignment not found")
        ctx = session.exec(
            select(ApiContext).where(ApiContext.api_assignment_id == a.id)
        ).first()
        content = (ctx.content if ctx else "") or ""
        if engine is None:
            engine = a.execute_engine
        if datasource_id is None:
            datasource_id = a.datasource_id
    else:
        content = body.content or ""
        if not content:
            raise HTTPException(
                status_code=400,
                detail="Either id or content is required",
            )
        if engine is None:
            raise HTTPException(
                status_code=400,
                detail="execute_engine is required when using inline content",
            )

    if (engine and engine.value == "SQL") or (engine and engine.value == "SCRIPT"):
        if datasource_id is None:
            raise HTTPException(
                status_code=400,
                detail="datasource_id is required for SQL and SCRIPT engines",
            )

    try:
        out = ApiExecutor().execute(
            engine=engine,
            content=content,
            params=body.params or {},
            datasource_id=datasource_id,
            session=session,
        )
        return out
    except Exception as e:
        return {"error": str(e)}


@router.delete("/delete/{id}", response_model=Message)
def delete_api_assignment(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    id: uuid.UUID,
) -> Any:
    """Delete API assignment (cascades ApiContext, group_links, etc.)."""
    a = session.get(ApiAssignment, id)
    if not a:
        raise HTTPException(status_code=404, detail="ApiAssignment not found")
    session.delete(a)
    session.commit()
    return Message(message="ApiAssignment deleted successfully")


@router.get("/{id}", response_model=ApiAssignmentDetail)
def get_api_assignment(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    id: uuid.UUID,
) -> Any:
    """Get API assignment detail with api_context and group_ids."""
    a = session.get(ApiAssignment, id)
    if not a:
        raise HTTPException(status_code=404, detail="ApiAssignment not found")
    return _to_detail(a)
