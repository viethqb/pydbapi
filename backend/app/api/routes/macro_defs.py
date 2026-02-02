"""
ApiMacroDef management: Jinja macro / Python function definitions for API content.

Endpoints: list (POST), create, update, delete, get detail, publish, versions.
"""

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException
from sqlmodel import func, select

from app.api.deps import CurrentUser, SessionDep
from app.models import Message
from app.models import User
from app.models_dbapi import ApiMacroDef, MacroDefVersionCommit
from app.schemas_dbapi import (
    ApiMacroDefCreate,
    ApiMacroDefDetail,
    ApiMacroDefListIn,
    ApiMacroDefListOut,
    ApiMacroDefPublic,
    ApiMacroDefPublishIn,
    ApiMacroDefUpdate,
    MacroDefVersionCommitCreate,
    MacroDefVersionCommitDetail,
    MacroDefVersionCommitListOut,
    MacroDefVersionCommitPublic,
)
from app.core.gateway.config_cache import invalidate_gateway_config
from app.models_dbapi import ApiAssignment

router = APIRouter(prefix="/macro-defs", tags=["macro-defs"])


def _to_public(m: ApiMacroDef) -> ApiMacroDefPublic:
    """Build ApiMacroDefPublic from ApiMacroDef."""
    return ApiMacroDefPublic(
        id=m.id,
        module_id=m.module_id,
        name=m.name,
        macro_type=m.macro_type,
        content=m.content,
        description=m.description,
        sort_order=m.sort_order,
        is_published=getattr(m, "is_published", False),
        published_version_id=getattr(m, "published_version_id", None),
        created_at=m.created_at,
        updated_at=m.updated_at,
    )


def _list_filters(stmt: Any, body: ApiMacroDefListIn) -> Any:
    """Apply optional filters to ApiMacroDef select statement."""
    if body.module_id is not None:
        stmt = stmt.where(ApiMacroDef.module_id == body.module_id)
    if body.macro_type is not None:
        stmt = stmt.where(ApiMacroDef.macro_type == body.macro_type)
    if body.name__ilike:
        stmt = stmt.where(ApiMacroDef.name.ilike(f"%{body.name__ilike}%"))
    return stmt


@router.get("", response_model=list[ApiMacroDefPublic])
def list_macro_defs_simple(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    module_id: uuid.UUID | None = None,
) -> Any:
    """Simple list for dropdowns (no pagination). Global + module-specific if module_id given."""
    stmt = select(ApiMacroDef).order_by(ApiMacroDef.sort_order, ApiMacroDef.name)
    if module_id is not None:
        stmt = stmt.where((ApiMacroDef.module_id.is_(None)) | (ApiMacroDef.module_id == module_id))
    rows = session.exec(stmt).all()
    return [_to_public(r) for r in rows]


@router.post("/list", response_model=ApiMacroDefListOut)
def list_macro_defs(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    body: ApiMacroDefListIn,
) -> Any:
    """List macro_defs with pagination and optional filters."""
    count_stmt = _list_filters(select(func.count()).select_from(ApiMacroDef), body)
    total = session.exec(count_stmt).one()

    stmt = _list_filters(select(ApiMacroDef), body)
    offset = (body.page - 1) * body.page_size
    stmt = stmt.order_by(ApiMacroDef.sort_order, ApiMacroDef.name).offset(offset).limit(body.page_size)
    rows = session.exec(stmt).all()

    return ApiMacroDefListOut(data=[_to_public(r) for r in rows], total=total)


@router.post("/create", response_model=ApiMacroDefPublic)
def create_macro_def(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    body: ApiMacroDefCreate,
) -> Any:
    """Create a new macro_def (Jinja or Python)."""
    m = ApiMacroDef.model_validate(body)
    session.add(m)
    session.commit()
    session.refresh(m)
    _invalidate_apis_using_module(m.module_id, session)
    return _to_public(m)


@router.post("/update", response_model=ApiMacroDefPublic)
def update_macro_def(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    body: ApiMacroDefUpdate,
) -> Any:
    """Update an existing macro_def."""
    m = session.get(ApiMacroDef, body.id)
    if not m:
        raise HTTPException(status_code=404, detail="ApiMacroDef not found")
    update = body.model_dump(exclude_unset=True, exclude={"id"})
    old_module_id = m.module_id
    m.sqlmodel_update(update)
    session.add(m)
    session.commit()
    session.refresh(m)
    _invalidate_apis_using_module(old_module_id, session)
    if m.module_id != old_module_id:
        _invalidate_apis_using_module(m.module_id, session)
    return _to_public(m)


def _count_apis_using_macro_def(m: ApiMacroDef, session) -> int:
    """Count APIs in scope for this macro_def (global = all APIs, module = APIs in that module)."""
    stmt = select(ApiAssignment)
    if m.module_id is None:
        pass
    else:
        stmt = stmt.where(ApiAssignment.module_id == m.module_id)
    return len(session.exec(stmt).all())


@router.delete("/delete/{id}", response_model=Message)
def delete_macro_def(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    id: uuid.UUID,
) -> Any:
    """Delete a macro_def by id. Fails if any API is in scope (uses this macro_def)."""
    m = session.get(ApiMacroDef, id)
    if not m:
        raise HTTPException(status_code=404, detail="ApiMacroDef not found")
    count = _count_apis_using_macro_def(m, session)
    if count > 0:
        scope = "all modules" if m.module_id is None else "its module"
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete: macro_def is in scope for {count} API(s) ({scope}). Remove or reassign those APIs first.",
        )
    module_id = m.module_id
    session.delete(m)
    session.commit()
    _invalidate_apis_using_module(module_id, session)
    return Message(message="ApiMacroDef deleted successfully")


@router.get("/{id}", response_model=ApiMacroDefDetail)
def get_macro_def(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    id: uuid.UUID,
) -> Any:
    """Get macro_def detail by id. Includes used_by_apis_count."""
    m = session.get(ApiMacroDef, id)
    if not m:
        raise HTTPException(status_code=404, detail="ApiMacroDef not found")
    base = _to_public(m)
    return ApiMacroDefDetail(
        **base.model_dump(),
        used_by_apis_count=_count_apis_using_macro_def(m, session),
    )


@router.post("/publish", response_model=ApiMacroDefPublic)
def publish_macro_def(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    body: ApiMacroDefPublishIn,
) -> Any:
    """Set is_published=True. Must provide version_id."""
    m = session.get(ApiMacroDef, body.id)
    if not m:
        raise HTTPException(status_code=404, detail="ApiMacroDef not found")
    if not body.version_id:
        raise HTTPException(status_code=400, detail="version_id is required to publish")
    version = session.get(MacroDefVersionCommit, body.version_id)
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")
    if version.api_macro_def_id != m.id:
        raise HTTPException(status_code=400, detail="Version does not belong to this macro_def")
    m.is_published = True
    m.published_version_id = body.version_id
    m.updated_at = datetime.now(timezone.utc)
    session.add(m)
    session.commit()
    session.refresh(m)
    _invalidate_apis_using_module(m.module_id, session)
    return _to_public(m)


@router.post("/unpublish", response_model=ApiMacroDefPublic)
def unpublish_macro_def(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    body: ApiMacroDefPublishIn,
) -> Any:
    """Set is_published=False."""
    m = session.get(ApiMacroDef, body.id)
    if not m:
        raise HTTPException(status_code=404, detail="ApiMacroDef not found")
    m.is_published = False
    m.updated_at = datetime.now(timezone.utc)
    session.add(m)
    session.commit()
    session.refresh(m)
    _invalidate_apis_using_module(m.module_id, session)
    return _to_public(m)


@router.post("/{id}/versions/create", response_model=MacroDefVersionCommitDetail)
def create_macro_def_version(
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
    body: MacroDefVersionCommitCreate,
) -> Any:
    """Create a new version snapshot for the macro_def."""
    m = session.get(ApiMacroDef, id)
    if not m:
        raise HTTPException(status_code=404, detail="ApiMacroDef not found")
    if not m.content:
        raise HTTPException(status_code=400, detail="Macro_def has no content to version")
    max_version = session.exec(
        select(func.max(MacroDefVersionCommit.version)).where(
            MacroDefVersionCommit.api_macro_def_id == m.id
        )
    ).one() or 0
    version = MacroDefVersionCommit(
        api_macro_def_id=m.id,
        version=max_version + 1,
        content_snapshot=m.content,
        commit_message=body.commit_message,
        committed_by_id=current_user.id,
    )
    session.add(version)
    session.commit()
    session.refresh(version)
    return MacroDefVersionCommitDetail(
        id=version.id,
        api_macro_def_id=version.api_macro_def_id,
        version=version.version,
        content_snapshot=version.content_snapshot,
        commit_message=version.commit_message,
        committed_by_id=version.committed_by_id,
        committed_by_email=current_user.email,
        committed_at=version.committed_at,
    )


@router.get("/{id}/versions", response_model=MacroDefVersionCommitListOut)
def list_macro_def_versions(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    id: uuid.UUID,
) -> Any:
    """List all versions for a macro_def."""
    m = session.get(ApiMacroDef, id)
    if not m:
        raise HTTPException(status_code=404, detail="ApiMacroDef not found")
    versions = session.exec(
        select(MacroDefVersionCommit)
        .where(MacroDefVersionCommit.api_macro_def_id == id)
        .order_by(MacroDefVersionCommit.version.desc())
    ).all()
    user_ids = {v.committed_by_id for v in versions if v.committed_by_id}
    users = {}
    if user_ids:
        user_rows = session.exec(select(User).where(User.id.in_(user_ids))).all()
        users = {u.id: u.email for u in user_rows}
    return MacroDefVersionCommitListOut(
        data=[
            MacroDefVersionCommitPublic(
                id=v.id,
                api_macro_def_id=v.api_macro_def_id,
                version=v.version,
                commit_message=v.commit_message,
                committed_by_id=v.committed_by_id,
                committed_by_email=users.get(v.committed_by_id) if v.committed_by_id else None,
                committed_at=v.committed_at,
            )
            for v in versions
        ]
    )


@router.get("/versions/{version_id}", response_model=MacroDefVersionCommitDetail)
def get_macro_def_version(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    version_id: uuid.UUID,
) -> Any:
    """Get a specific version detail including content."""
    version = session.get(MacroDefVersionCommit, version_id)
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")
    committed_by_email = None
    if version.committed_by_id:
        user = session.get(User, version.committed_by_id)
        if user:
            committed_by_email = user.email
    return MacroDefVersionCommitDetail(
        id=version.id,
        api_macro_def_id=version.api_macro_def_id,
        version=version.version,
        content_snapshot=version.content_snapshot,
        commit_message=version.commit_message,
        committed_by_id=version.committed_by_id,
        committed_by_email=committed_by_email,
        committed_at=version.committed_at,
    )


@router.post("/{id}/versions/{version_id}/restore", response_model=ApiMacroDefPublic)
def restore_macro_def_version(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    id: uuid.UUID,
    version_id: uuid.UUID,
) -> Any:
    """Restore macro_def content from a version snapshot."""
    m = session.get(ApiMacroDef, id)
    if not m:
        raise HTTPException(status_code=404, detail="ApiMacroDef not found")
    version = session.get(MacroDefVersionCommit, version_id)
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")
    if version.api_macro_def_id != id:
        raise HTTPException(status_code=400, detail="Version does not belong to this macro_def")
    m.content = version.content_snapshot
    m.updated_at = datetime.now(timezone.utc)
    session.add(m)
    session.commit()
    session.refresh(m)
    _invalidate_apis_using_module(m.module_id, session)
    return _to_public(m)


@router.delete("/versions/{version_id}", response_model=Message)
def delete_macro_def_version(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    version_id: uuid.UUID,
) -> Any:
    """Delete a version. Cannot delete if it's the published version."""
    version = session.get(MacroDefVersionCommit, version_id)
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")
    m = session.get(ApiMacroDef, version.api_macro_def_id)
    if m and m.published_version_id == version_id:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete published version. Unpublish or publish another version first.",
        )
    session.delete(version)
    session.commit()
    return Message(message="Version deleted successfully")


def _invalidate_apis_using_module(module_id: uuid.UUID | None, session) -> None:
    """Invalidate gateway config. Global macro_def (module_id=None) = all APIs; module macro_def = that module's APIs."""
    stmt = select(ApiAssignment.id)
    if module_id is not None:
        stmt = stmt.where(ApiAssignment.module_id == module_id)
    for row in session.exec(stmt).all():
        invalidate_gateway_config(row)
