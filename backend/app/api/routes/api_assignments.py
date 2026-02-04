"""
API Assignment + ApiContext management (Phase 2, Task 2.2).

Endpoints: list, create, update, delete, get detail, publish, debug.
Phase 3: debug calls ApiExecutor.execute (SQL or SCRIPT).
"""

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy import delete
from sqlmodel import Session, func, select

from app.api.deps import (
    CurrentUser,
    SessionDep,
    require_permission,
    require_permission_for_body_resource,
    require_permission_for_resource,
)
from app.core.permission import get_user_permissions, has_permission
from app.core.permission_resources import (
    ensure_resource_permissions,
    remove_resource_permissions,
)
from app.models_permission import PermissionActionEnum, ResourceTypeEnum
from app.engines import ApiExecutor
from app.models import Message
from app.models import User
from app.models_dbapi import (
    ApiAssignment,
    ApiAssignmentGroupLink,
    ApiContext,
    VersionCommit,
)
from app.core.param_type import ParamTypeError, validate_and_coerce_params
from app.core.param_validate import ParamValidateError, run_param_validates
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
    VersionCommitCreate,
    VersionCommitDetail,
    VersionCommitListOut,
    VersionCommitPublic,
)
from app.core.result_transform import ResultTransformError, run_result_transform
from app.core.gateway.config_cache import invalidate_gateway_config, load_macros_for_api
from app.core.gateway.request_response import normalize_api_result

router = APIRouter(prefix="/api-assignments", tags=["api-assignments"])

API_ASSIGNMENT_RESOURCE_ACTIONS = (
    PermissionActionEnum.READ,
    PermissionActionEnum.CREATE,
    PermissionActionEnum.UPDATE,
    PermissionActionEnum.DELETE,
    PermissionActionEnum.EXECUTE,
)


def _api_assignment_resource_id_from_path(
    *,
    session: Session,
    id: uuid.UUID | None = None,
    version_id: uuid.UUID | None = None,
    **_: Any,
) -> uuid.UUID | None:
    """Resolve api_assignment id from path: id directly, or from version_id via VersionCommit."""
    if id is not None:
        return id
    if version_id is not None:
        version = session.get(VersionCommit, version_id)
        return version.api_assignment_id if version else None
    return None


def _api_assignment_resource_id_from_body(
    *,
    body: Any,
    **_: Any,
) -> uuid.UUID | None:
    """Get api_assignment id from body (update/publish/debug)."""
    return getattr(body, "id", None)


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
        published_version_id=a.published_version_id,
        access_type=a.access_type,
        rate_limit_per_minute=getattr(a, "rate_limit_per_minute", None),
        close_connection_after_execute=getattr(
            a, "close_connection_after_execute", False
        ),
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
            params=a.api_context.params,
            param_validates=a.api_context.param_validates,
            result_transform=a.api_context.result_transform,
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


@router.post(
    "/list",
    response_model=ApiAssignmentListOut,
    dependencies=[
        Depends(
            require_permission(
                ResourceTypeEnum.API_ASSIGNMENT, PermissionActionEnum.READ
            )
        )
    ],
)
def list_api_assignments(
    session: SessionDep,
    current_user: CurrentUser,
    body: ApiAssignmentListIn,
) -> Any:
    """List API assignments with pagination and optional filters."""
    allowed_ids: list[uuid.UUID] | None = None
    if not has_permission(
        session,
        current_user,
        ResourceTypeEnum.API_ASSIGNMENT,
        PermissionActionEnum.READ,
        None,
    ):
        perms = get_user_permissions(session, current_user.id)
        allowed_ids = [
            p.resource_id
            for p in perms
            if p.resource_type == ResourceTypeEnum.API_ASSIGNMENT
            and p.action == PermissionActionEnum.READ
            and p.resource_id is not None
        ]
        if not allowed_ids:
            raise HTTPException(
                status_code=403,
                detail="Permission required: api_assignment.read",
            )

    count_stmt = _list_filters(select(func.count()).select_from(ApiAssignment), body)
    if allowed_ids is not None:
        count_stmt = count_stmt.where(ApiAssignment.id.in_(allowed_ids))
    total = session.exec(count_stmt).one()

    stmt = _list_filters(select(ApiAssignment), body)
    if allowed_ids is not None:
        stmt = stmt.where(ApiAssignment.id.in_(allowed_ids))
    offset = (body.page - 1) * body.page_size
    stmt = (
        stmt.order_by(ApiAssignment.sort_order, ApiAssignment.name)
        .offset(offset)
        .limit(body.page_size)
    )
    rows = session.exec(stmt).all()

    return ApiAssignmentListOut(data=[_to_public(r) for r in rows], total=total)


@router.post(
    "/create",
    response_model=ApiAssignmentPublic,
    dependencies=[
        Depends(
            require_permission(
                ResourceTypeEnum.API_ASSIGNMENT, PermissionActionEnum.CREATE
            )
        )
    ],
)
def create_api_assignment(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    body: ApiAssignmentCreate,
) -> Any:
    """Create API assignment; if content provided, create ApiContext (1-1). Optionally link groups."""
    if body.execute_engine.value in ("SQL", "SCRIPT") and not body.datasource_id:
        raise HTTPException(
            status_code=400,
            detail="DataSource is required for SQL and SCRIPT engines.",
        )
    assign_data = body.model_dump(
        exclude={
            "content",
            "group_ids",
            "params",
            "param_validates",
            "result_transform",
        }
    )
    a = ApiAssignment(**assign_data)
    session.add(a)
    session.flush()

    # Create ApiContext if content, params, validators or result_transform provided
    if (
        body.content is not None
        or body.params
        or body.param_validates
        or body.result_transform
    ):
        # Store params as JSON in ApiContext if provided
        params_dict = None
        if body.params:
            params_dict = [
                {
                    "name": p.name,
                    "location": p.location,
                    "data_type": p.data_type,
                    "is_required": p.is_required,
                    "validate_type": p.validate_type,
                    "validate": p.validate,
                    "validate_message": p.validate_message,
                    "default_value": p.default_value,
                    "description": getattr(p, "description", None),
                }
                for p in body.params
            ]
        param_validates_dict = None
        if body.param_validates:
            param_validates_dict = [
                {
                    "name": pv.name,
                    "validation_script": pv.validation_script,
                    "message_when_fail": pv.message_when_fail,
                }
                for pv in body.param_validates
            ]
        ctx = ApiContext(
            api_assignment_id=a.id,
            content=body.content or "",
            params=params_dict,
            param_validates=param_validates_dict,
            result_transform=body.result_transform or None,
        )
        session.add(ctx)

    for gid in body.group_ids or []:
        session.add(
            ApiAssignmentGroupLink(
                api_assignment_id=a.id,
                api_group_id=gid,
            )
        )

    ensure_resource_permissions(
        session,
        ResourceTypeEnum.API_ASSIGNMENT,
        a.id,
        API_ASSIGNMENT_RESOURCE_ACTIONS,
    )
    session.commit()
    session.refresh(a)
    return _to_public(a)


@router.post(
    "/update",
    response_model=ApiAssignmentPublic,
)
def update_api_assignment(
    session: SessionDep,
    body: ApiAssignmentUpdate,
    _: User = Depends(
        require_permission_for_body_resource(
            ResourceTypeEnum.API_ASSIGNMENT,
            PermissionActionEnum.UPDATE,
            ApiAssignmentUpdate,
            _api_assignment_resource_id_from_body,
        )
    ),
) -> Any:
    """Update API assignment; if content sent, update or create ApiContext. If group_ids sent, replace links."""
    a = session.get(ApiAssignment, body.id)
    if not a:
        raise HTTPException(status_code=404, detail="ApiAssignment not found")

    # Ensure SQL/SCRIPT engines have a datasource (use body values if set, else current)
    body_set = body.model_dump(exclude_unset=True)
    engine = (
        body.execute_engine if body.execute_engine is not None else a.execute_engine
    )
    ds_id = body.datasource_id if "datasource_id" in body_set else a.datasource_id
    if engine.value in ("SQL", "SCRIPT") and not ds_id:
        raise HTTPException(
            status_code=400,
            detail="DataSource is required for SQL and SCRIPT engines.",
        )

    update_data = body.model_dump(
        exclude_unset=True,
        exclude={
            "id",
            "content",
            "group_ids",
            "params",
            "param_validates",
            "result_transform",
        },
    )
    if update_data:
        a.sqlmodel_update(update_data)
        session.add(a)

    if (
        "content" in body.model_fields_set
        or "params" in body.model_fields_set
        or "param_validates" in body.model_fields_set
        or "result_transform" in body.model_fields_set
    ):
        ctx = session.exec(
            select(ApiContext).where(ApiContext.api_assignment_id == a.id)
        ).first()
        if ctx:
            if "content" in body.model_fields_set:
                ctx.content = body.content or ""
            if "params" in body.model_fields_set:
                params_dict = None
                if body.params:
                    params_dict = [
                        {
                            "name": p.name,
                            "location": p.location,
                            "data_type": p.data_type,
                            "is_required": p.is_required,
                            "validate_type": p.validate_type,
                            "validate": p.validate,
                            "validate_message": p.validate_message,
                            "default_value": p.default_value,
                            "description": getattr(p, "description", None),
                        }
                        for p in body.params
                    ]
                ctx.params = params_dict
            if "param_validates" in body.model_fields_set:
                param_validates_dict = None
                if body.param_validates:
                    param_validates_dict = [
                        {
                            "name": pv.name,
                            "validation_script": pv.validation_script,
                            "message_when_fail": pv.message_when_fail,
                        }
                        for pv in body.param_validates
                    ]
                ctx.param_validates = param_validates_dict
            if "result_transform" in body.model_fields_set:
                ctx.result_transform = body.result_transform or None
            ctx.updated_at = datetime.now(timezone.utc)
            session.add(ctx)
        else:
            params_dict = None
            if body.params:
                params_dict = [
                    {
                        "name": p.name,
                        "location": p.location,
                        "data_type": p.data_type,
                        "is_required": p.is_required,
                        "validate_type": p.validate_type,
                        "validate": p.validate,
                        "validate_message": p.validate_message,
                        "default_value": p.default_value,
                        "description": getattr(p, "description", None),
                    }
                    for p in body.params
                ]
            param_validates_dict = None
            if body.param_validates:
                param_validates_dict = [
                    {
                        "name": pv.name,
                        "validation_script": pv.validation_script,
                        "message_when_fail": pv.message_when_fail,
                    }
                    for pv in body.param_validates
                ]
            session.add(
                ApiContext(
                    api_assignment_id=a.id,
                    content=body.content or "",
                    params=params_dict,
                    param_validates=param_validates_dict,
                    result_transform=body.result_transform or None,
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
    if (
        "content" in body.model_fields_set
        or "params" in body.model_fields_set
        or "param_validates" in body.model_fields_set
        or "result_transform" in body.model_fields_set
    ):
        invalidate_gateway_config(a.id)
    session.refresh(a)
    return _to_public(a)


@router.post(
    "/publish",
    response_model=ApiAssignmentPublic,
)
def publish_api_assignment(
    session: SessionDep,
    body: ApiAssignmentPublishIn,
    _: User = Depends(
        require_permission_for_body_resource(
            ResourceTypeEnum.API_ASSIGNMENT,
            PermissionActionEnum.UPDATE,
            ApiAssignmentPublishIn,
            _api_assignment_resource_id_from_body,
        )
    ),
) -> Any:
    """Set is_published=True for the given API assignment. Must provide version_id."""
    a = session.get(ApiAssignment, body.id)
    if not a:
        raise HTTPException(status_code=404, detail="ApiAssignment not found")

    # version_id is required for publish
    if not body.version_id:
        raise HTTPException(status_code=400, detail="version_id is required to publish")

    version = session.get(VersionCommit, body.version_id)
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")
    if version.api_assignment_id != a.id:
        raise HTTPException(
            status_code=400, detail="Version does not belong to this API"
        )

    a.published_version_id = body.version_id
    a.is_published = True
    a.updated_at = datetime.now(timezone.utc)
    session.add(a)
    session.commit()
    invalidate_gateway_config(a.id)
    session.refresh(a)
    return _to_public(a)


@router.post(
    "/unpublish",
    response_model=ApiAssignmentPublic,
)
def unpublish_api_assignment(
    session: SessionDep,
    body: ApiAssignmentPublishIn,
    _: User = Depends(
        require_permission_for_body_resource(
            ResourceTypeEnum.API_ASSIGNMENT,
            PermissionActionEnum.UPDATE,
            ApiAssignmentPublishIn,
            _api_assignment_resource_id_from_body,
        )
    ),
) -> Any:
    """Set is_published=False for the given API assignment."""
    a = session.get(ApiAssignment, body.id)
    if not a:
        raise HTTPException(status_code=404, detail="ApiAssignment not found")
    a.is_published = False
    # Keep published_version_id when unpublishing (don't clear it)
    a.updated_at = datetime.now(timezone.utc)
    session.add(a)
    session.commit()
    invalidate_gateway_config(a.id)
    session.refresh(a)
    return _to_public(a)


def _debug_error_response(status_code: int, detail: str) -> JSONResponse:
    """Return standard envelope { success: false, message, data: [] } for debug errors."""
    return JSONResponse(
        status_code=status_code,
        content={"success": False, "message": str(detail), "data": []},
    )


@router.post(
    "/debug",
)
def debug_api_assignment(
    session: SessionDep,
    body: ApiAssignmentDebugIn,
    _: User = Depends(
        require_permission_for_body_resource(
            ResourceTypeEnum.API_ASSIGNMENT,
            PermissionActionEnum.EXECUTE,
            ApiAssignmentDebugIn,
            _api_assignment_resource_id_from_body,
        )
    ),
) -> Any:
    """
    Run API (SQL or Script) for testing. Phase 3: uses ApiExecutor.

    - If body.id: load ApiAssignment + ApiContext; use content, execute_engine, datasource_id.
    - If body.content (inline): use content, execute_engine, datasource_id from body.
    Returns same format as gateway: { success, message, data }; errors use same envelope.
    """
    content: str = ""
    engine = body.execute_engine
    datasource_id = body.datasource_id
    params_definition: list[dict] | None = None
    python_m: list[str] = []
    a = None

    if body.id is not None:
        a = session.get(ApiAssignment, body.id)
        if not a:
            return _debug_error_response(404, "ApiAssignment not found")
        ctx = session.exec(
            select(ApiContext).where(ApiContext.api_assignment_id == a.id)
        ).first()
        # Use content from body if provided (for testing edited content), otherwise from DB
        content = (
            body.content
            if body.content is not None
            else ((ctx.content if ctx else "") or "")
        )
        # Prepend macros (same as runtime) so content can call them
        jinja_m, python_m = load_macros_for_api(a, session, api_content=content)
        if engine and engine.value == "SQL" and jinja_m:
            content = "\n\n".join(jinja_m) + "\n\n" + content
        elif engine and engine.value == "SCRIPT" and python_m:
            content = "\n\n".join(python_m) + "\n\n" + content
        if ctx and ctx.params:
            params_definition = ctx.params
        if engine is None:
            engine = a.execute_engine
        if datasource_id is None:
            datasource_id = a.datasource_id
    else:
        content = body.content or ""
        if not content:
            return _debug_error_response(400, "Either id or content is required")
        if engine is None:
            return _debug_error_response(
                400, "execute_engine is required when using inline content"
            )

    if (engine and engine.value == "SQL") or (engine and engine.value == "SCRIPT"):
        if datasource_id is None:
            return _debug_error_response(
                400, "datasource_id is required for SQL and SCRIPT engines"
            )
        # Check if datasource is active
        from app.models_dbapi import DataSource

        datasource = session.get(DataSource, datasource_id)
        if not datasource:
            return _debug_error_response(404, "DataSource not found")
        if not datasource.is_active:
            return _debug_error_response(
                400, "DataSource is inactive and cannot be used"
            )

    # Validate required parameters if params definition exists
    if params_definition:
        provided_params = body.params or {}
        missing_params = []
        for param_def in params_definition:
            if isinstance(param_def, dict):
                param_name = param_def.get("name")
                is_required = param_def.get("is_required", False)
                if is_required and param_name:
                    # Check if parameter is provided and not empty
                    param_value = provided_params.get(param_name)
                    if param_value is None or param_value == "":
                        missing_params.append(param_name)

        if missing_params:
            return _debug_error_response(
                400, f"Missing required parameters: {', '.join(missing_params)}"
            )

    # Validate and coerce params by data_type
    params_to_use = body.params or {}
    if params_definition:
        try:
            params_to_use = validate_and_coerce_params(params_definition, params_to_use)
        except ParamTypeError as e:
            return _debug_error_response(400, str(e))

    # Param validate (Python scripts) if configured on ApiContext; prepend macros (same as runtime)
    if body.id is not None and ctx and getattr(ctx, "param_validates", None):
        try:
            run_param_validates(
                ctx.param_validates,
                params_to_use,
                macros_prepend=python_m,
            )
        except ParamValidateError as e:
            return _debug_error_response(400, str(e))

    try:
        out = ApiExecutor().execute(
            engine=engine,
            content=content,
            params=params_to_use,
            datasource_id=datasource_id,
            session=session,
        )
        # Result transform (Python) if configured on ApiContext; prepend macros (same as runtime)
        if body.id is not None and ctx and getattr(ctx, "result_transform", None):
            try:
                out = run_result_transform(
                    ctx.result_transform,
                    out,
                    params_to_use,
                    macros_prepend=python_m,
                )
            except ResultTransformError as e:
                return _debug_error_response(400, str(e))
        # Same format as gateway: SQL -> { data: rows }; SCRIPT -> { success, message, data } at top level
        engine_value = engine.value if engine and hasattr(engine, "value") else None
        return normalize_api_result(out, engine_value)
    except Exception as e:
        # Same envelope as gateway errors: { success, message, data }; debug details in data
        error_msg = str(e)
        return {
            "success": False,
            "message": error_msg,
            "data": [
                {
                    "error_type": type(e).__name__,
                    "content_preview": content[:200] if content else None,
                    "params": params_to_use,
                }
            ],
        }


@router.delete(
    "/delete/{id}",
    response_model=Message,
    dependencies=[
        Depends(
            require_permission_for_resource(
                ResourceTypeEnum.API_ASSIGNMENT,
                PermissionActionEnum.DELETE,
                _api_assignment_resource_id_from_path,
            )
        )
    ],
)
def delete_api_assignment(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    id: uuid.UUID,
) -> Any:
    """Delete API assignment (cascades ApiContext, group_links, etc.)."""
    a = session.get(ApiAssignment, id)
    if not a:
        raise HTTPException(status_code=404, detail="ApiAssignment not found")
    remove_resource_permissions(session, ResourceTypeEnum.API_ASSIGNMENT, a.id)
    session.delete(a)
    session.commit()
    return Message(message="ApiAssignment deleted successfully")


@router.get(
    "/{id}",
    response_model=ApiAssignmentDetail,
    dependencies=[
        Depends(
            require_permission_for_resource(
                ResourceTypeEnum.API_ASSIGNMENT,
                PermissionActionEnum.READ,
                _api_assignment_resource_id_from_path,
            )
        )
    ],
)
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


@router.post(
    "/{id}/versions/create",
    response_model=VersionCommitDetail,
    dependencies=[
        Depends(
            require_permission_for_resource(
                ResourceTypeEnum.API_ASSIGNMENT,
                PermissionActionEnum.UPDATE,
                _api_assignment_resource_id_from_path,
            )
        )
    ],
)
def create_version(
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
    body: VersionCommitCreate,
) -> Any:
    """Create a new version snapshot for the API (content + params + validations + transform)."""
    a = session.get(ApiAssignment, id)
    if not a:
        raise HTTPException(status_code=404, detail="ApiAssignment not found")

    # Get current content from ApiContext
    ctx = session.exec(
        select(ApiContext).where(ApiContext.api_assignment_id == a.id)
    ).first()

    if not ctx or not ctx.content:
        raise HTTPException(
            status_code=400,
            detail="API has no content to version. Please add content first.",
        )

    # Get the next version number
    max_version = (
        session.exec(
            select(func.max(VersionCommit.version)).where(
                VersionCommit.api_assignment_id == a.id
            )
        ).one()
        or 0
    )

    # Create new version
    version = VersionCommit(
        api_assignment_id=a.id,
        version=max_version + 1,
        content_snapshot=ctx.content,
        params_snapshot=getattr(ctx, "params", None),
        param_validates_snapshot=getattr(ctx, "param_validates", None),
        result_transform_snapshot=getattr(ctx, "result_transform", None),
        commit_message=body.commit_message,
        committed_by_id=current_user.id,
    )
    session.add(version)
    session.commit()
    session.refresh(version)

    return VersionCommitDetail(
        id=version.id,
        api_assignment_id=version.api_assignment_id,
        version=version.version,
        content_snapshot=version.content_snapshot,
        params_snapshot=version.params_snapshot,
        param_validates_snapshot=version.param_validates_snapshot,
        result_transform_snapshot=version.result_transform_snapshot,
        commit_message=version.commit_message,
        committed_by_id=version.committed_by_id,
        committed_by_email=current_user.email,
        committed_at=version.committed_at,
    )


@router.get(
    "/{id}/versions",
    response_model=VersionCommitListOut,
    dependencies=[
        Depends(
            require_permission(
                ResourceTypeEnum.API_ASSIGNMENT, PermissionActionEnum.READ
            )
        )
    ],
)
def list_versions(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    id: uuid.UUID,
) -> Any:
    """List all versions for an API assignment."""
    a = session.get(ApiAssignment, id)
    if not a:
        raise HTTPException(status_code=404, detail="ApiAssignment not found")

    versions = session.exec(
        select(VersionCommit)
        .where(VersionCommit.api_assignment_id == id)
        .order_by(VersionCommit.version.desc())
    ).all()

    # Get user emails for all committed_by_ids
    user_ids = {v.committed_by_id for v in versions if v.committed_by_id}
    users = {}
    if user_ids:
        user_rows = session.exec(select(User).where(User.id.in_(user_ids))).all()
        users = {user.id: user.email for user in user_rows}

    return VersionCommitListOut(
        data=[
            VersionCommitPublic(
                id=v.id,
                api_assignment_id=v.api_assignment_id,
                version=v.version,
                commit_message=v.commit_message,
                committed_by_id=v.committed_by_id,
                committed_by_email=(
                    users.get(v.committed_by_id) if v.committed_by_id else None
                ),
                committed_at=v.committed_at,
            )
            for v in versions
        ]
    )


@router.get(
    "/versions/{version_id}",
    response_model=VersionCommitDetail,
    dependencies=[
        Depends(
            require_permission_for_resource(
                ResourceTypeEnum.API_ASSIGNMENT,
                PermissionActionEnum.READ,
                _api_assignment_resource_id_from_path,
            )
        )
    ],
)
def get_version(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    version_id: uuid.UUID,
) -> Any:
    """Get a specific version detail including content."""
    version = session.get(VersionCommit, version_id)
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")

    # Get user email if committed_by_id exists
    committed_by_email = None
    if version.committed_by_id:
        user = session.get(User, version.committed_by_id)
        if user:
            committed_by_email = user.email

    return VersionCommitDetail(
        id=version.id,
        api_assignment_id=version.api_assignment_id,
        version=version.version,
        content_snapshot=version.content_snapshot,
        params_snapshot=getattr(version, "params_snapshot", None),
        param_validates_snapshot=getattr(version, "param_validates_snapshot", None),
        result_transform_snapshot=getattr(version, "result_transform_snapshot", None),
        commit_message=version.commit_message,
        committed_by_id=version.committed_by_id,
        committed_by_email=committed_by_email,
        committed_at=version.committed_at,
    )


@router.post(
    "/{id}/versions/{version_id}/restore",
    response_model=ApiAssignmentDetail,
    dependencies=[
        Depends(
            require_permission_for_resource(
                ResourceTypeEnum.API_ASSIGNMENT,
                PermissionActionEnum.UPDATE,
                _api_assignment_resource_id_from_path,
            )
        )
    ],
)
def restore_version(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    id: uuid.UUID,
    version_id: uuid.UUID,
) -> Any:
    """Restore API dev config from a version snapshot. Overwrites current ApiContext with version's content, params, param_validates, result_transform."""
    a = session.get(ApiAssignment, id)
    if not a:
        raise HTTPException(status_code=404, detail="ApiAssignment not found")
    version = session.get(VersionCommit, version_id)
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")
    if version.api_assignment_id != id:
        raise HTTPException(
            status_code=400, detail="Version does not belong to this API"
        )

    ctx = session.exec(
        select(ApiContext).where(ApiContext.api_assignment_id == a.id)
    ).first()
    content = version.content_snapshot
    params = getattr(version, "params_snapshot", None)
    param_validates = getattr(version, "param_validates_snapshot", None)
    result_transform = getattr(version, "result_transform_snapshot", None)

    if ctx:
        ctx.content = content
        ctx.params = params
        ctx.param_validates = param_validates
        ctx.result_transform = result_transform
        ctx.updated_at = datetime.now(timezone.utc)
        session.add(ctx)
    else:
        session.add(
            ApiContext(
                api_assignment_id=a.id,
                content=content,
                params=params,
                param_validates=param_validates,
                result_transform=result_transform,
            )
        )

    session.commit()
    invalidate_gateway_config(a.id)
    a = session.get(ApiAssignment, id)
    return _to_detail(a)


@router.post(
    "/versions/{version_id}/revert-to-draft",
    response_model=Message,
    dependencies=[
        Depends(
            require_permission_for_resource(
                ResourceTypeEnum.API_ASSIGNMENT,
                PermissionActionEnum.UPDATE,
                _api_assignment_resource_id_from_path,
            )
        )
    ],
)
def revert_version_to_draft(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    version_id: uuid.UUID,
) -> Any:
    """Clear published_version_id for this version (revert to draft). Only allowed when API is not published."""
    version = session.get(VersionCommit, version_id)
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")

    a = session.get(ApiAssignment, version.api_assignment_id)
    if not a:
        raise HTTPException(status_code=404, detail="ApiAssignment not found")
    if a.is_published:
        raise HTTPException(
            status_code=400,
            detail="Cannot revert version to draft when API is published. Unpublish first.",
        )
    if a.published_version_id == version_id:
        a.published_version_id = None
        a.updated_at = datetime.now(timezone.utc)
        session.add(a)
        session.commit()
    return Message(message="Version reverted to draft")


@router.delete(
    "/versions/{version_id}",
    response_model=Message,
    dependencies=[
        Depends(
            require_permission_for_resource(
                ResourceTypeEnum.API_ASSIGNMENT,
                PermissionActionEnum.DELETE,
                _api_assignment_resource_id_from_path,
            )
        )
    ],
)
def delete_version(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    version_id: uuid.UUID,
) -> Any:
    """Delete a version. Cannot delete if it's the published version."""
    version = session.get(VersionCommit, version_id)
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")

    # Check if this version is published
    api_assignment = session.get(ApiAssignment, version.api_assignment_id)
    if api_assignment and api_assignment.published_version_id == version_id:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete published version. Please unpublish or publish another version first.",
        )

    session.delete(version)
    session.commit()
    return Message(message="Version deleted successfully")
