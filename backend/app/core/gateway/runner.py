"""
Gateway runner (Phase 4, Task 4.1): run API via ApiExecutor, write AccessRecord.
"""

from uuid import UUID

from sqlmodel import Session, select

from app.core.config import settings
from fastapi import HTTPException

from app.core.param_validate import ParamValidateError, run_param_validates
from app.core.result_transform import ResultTransformError, run_result_transform
from app.engines import ApiExecutor
from app.models_dbapi import AccessRecord, ApiAssignment, ApiContext, VersionCommit


def _write_access_record(
    session: Session,
    *,
    api_assignment_id: UUID,
    app_client_id: UUID | None,
    ip_address: str,
    http_method: str,
    path: str,
    status_code: int,
    request_body: str | None = None,
) -> None:
    body: str | None = None
    if settings.GATEWAY_ACCESS_LOG_BODY and request_body:
        body = request_body[:2000] + "..." if len(request_body) > 2000 else request_body
    rec = AccessRecord(
        api_assignment_id=api_assignment_id,
        app_client_id=app_client_id,
        ip_address=ip_address,
        http_method=http_method,
        path=path,
        status_code=status_code,
        request_body=body,
    )
    session.add(rec)
    session.commit()


def run(
    api: ApiAssignment,
    params: dict,
    *,
    session: Session,
    app_client_id: UUID | None = None,
    ip: str = "",
    http_method: str = "GET",
    request_path: str = "",
    request_body: str | None = None,
) -> dict:
    """
    Load ApiContext, run ApiExecutor, write AccessRecord. Returns result dict from executor.
    On success: AccessRecord 200. On exception: AccessRecord 500, then re-raise.
    """
    ctx = session.exec(
        select(ApiContext).where(ApiContext.api_assignment_id == api.id)
    ).first()
    if not ctx:
        _write_access_record(
            session,
            api_assignment_id=api.id,
            app_client_id=app_client_id,
            ip_address=ip or "0.0.0.0",
            http_method=http_method,
            path=request_path,
            status_code=500,
            request_body=request_body,
        )
        raise RuntimeError("ApiContext not found for ApiAssignment")

    # Prefer published version snapshot when available.
    # Backward-compatible fallback: if snapshot fields are missing/null, use current ApiContext fields.
    content_to_run = ctx.content
    params_definition = ctx.params if getattr(ctx, "params", None) else None
    param_validates_definition = getattr(ctx, "param_validates", None)
    result_transform_code = getattr(ctx, "result_transform", None)

    if api.published_version_id:
        vc = session.exec(
            select(VersionCommit).where(VersionCommit.id == api.published_version_id)
        ).first()
        if not vc:
            _write_access_record(
                session,
                api_assignment_id=api.id,
                app_client_id=app_client_id,
                ip_address=ip or "0.0.0.0",
                http_method=http_method,
                path=request_path,
                status_code=500,
                request_body=request_body,
            )
            raise RuntimeError("Published VersionCommit not found for ApiAssignment")

        content_to_run = vc.content_snapshot
        if getattr(vc, "params_snapshot", None) is not None:
            params_definition = vc.params_snapshot
        if getattr(vc, "param_validates_snapshot", None) is not None:
            param_validates_definition = vc.param_validates_snapshot
        if getattr(vc, "result_transform_snapshot", None) is not None:
            result_transform_code = vc.result_transform_snapshot

    # Validate required parameters if params definition exists on ApiContext
    if params_definition:
        missing_params: list[str] = []
        for param_def in params_definition:
            if isinstance(param_def, dict):
                param_name = param_def.get("name")
                is_required = param_def.get("is_required", False)
                if is_required and param_name:
                    param_value = (params or {}).get(param_name)
                    if param_value is None or param_value == "":
                        missing_params.append(str(param_name))
        if missing_params:
            _write_access_record(
                session,
                api_assignment_id=api.id,
                app_client_id=app_client_id,
                ip_address=ip or "0.0.0.0",
                http_method=http_method,
                path=request_path,
                status_code=400,
                request_body=request_body,
            )
            raise HTTPException(
                status_code=400,
                detail=f"Missing required parameters: {', '.join(missing_params)}",
            )

    # Param validate (Python scripts) if configured
    if param_validates_definition:
        try:
            run_param_validates(param_validates_definition, params)
        except ParamValidateError as e:
            _write_access_record(
                session,
                api_assignment_id=api.id,
                app_client_id=app_client_id,
                ip_address=ip or "0.0.0.0",
                http_method=http_method,
                path=request_path,
                status_code=400,
                request_body=request_body,
            )
            raise HTTPException(status_code=400, detail=str(e)) from e

    # Check if datasource is active (if API uses a datasource)
    if api.datasource_id and api.datasource:
        if not api.datasource.is_active:
            _write_access_record(
                session,
                api_assignment_id=api.id,
                app_client_id=app_client_id,
                ip_address=ip or "0.0.0.0",
                http_method=http_method,
                path=request_path,
                status_code=400,
                request_body=request_body,
            )
            raise RuntimeError("DataSource is inactive and cannot be used")

    try:
        result = ApiExecutor().execute(
            engine=api.execute_engine,
            content=content_to_run,
            params=params,
            datasource_id=api.datasource_id,
            datasource=api.datasource,
            session=session,
        )
        # Result transform (Python) if configured
        if result_transform_code:
            try:
                result = run_result_transform(result_transform_code, result, params or {})
            except ResultTransformError as e:
                _write_access_record(
                    session,
                    api_assignment_id=api.id,
                    app_client_id=app_client_id,
                    ip_address=ip or "0.0.0.0",
                    http_method=http_method,
                    path=request_path,
                    status_code=400,
                    request_body=request_body,
                )
                raise HTTPException(status_code=400, detail=str(e)) from e

        _write_access_record(
            session,
            api_assignment_id=api.id,
            app_client_id=app_client_id,
            ip_address=ip or "0.0.0.0",
            http_method=http_method,
            path=request_path,
            status_code=200,
            request_body=request_body,
        )
        return result
    except Exception:
        _write_access_record(
            session,
            api_assignment_id=api.id,
            app_client_id=app_client_id,
            ip_address=ip or "0.0.0.0",
            http_method=http_method,
            path=request_path,
            status_code=500,
            request_body=request_body,
        )
        raise
