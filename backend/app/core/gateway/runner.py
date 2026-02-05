"""
Gateway runner (Phase 4, Task 4.1): run API via ApiExecutor, write AccessRecord.
Uses config cache (Redis) to reduce DB load for content, params, validate, transform.
"""

from uuid import UUID

from sqlmodel import Session

from app.core.config import settings
from fastapi import HTTPException

from app.core.access_log_storage import write_access_record
from app.core.gateway.config_cache import get_or_load_gateway_config
from app.core.param_type import ParamTypeError, validate_and_coerce_params
from app.core.param_validate import ParamValidateError, run_param_validates
from app.core.result_transform import ResultTransformError, run_result_transform
from app.engines import ApiExecutor
from app.models_dbapi import ApiAssignment


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
    request_headers: str | None = None,
    request_params: str | None = None,
) -> None:
    from uuid import uuid4

    body: str | None = None
    if settings.GATEWAY_ACCESS_LOG_BODY and request_body:
        body = request_body[:2000] + "..." if len(request_body) > 2000 else request_body
    write_access_record(
        main_session=session,
        id=uuid4(),
        api_assignment_id=api_assignment_id,
        app_client_id=app_client_id,
        ip_address=ip_address,
        http_method=http_method,
        path=path,
        status_code=status_code,
        request_body=body,
        request_headers=request_headers,
        request_params=request_params,
    )


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
    request_headers: str | None = None,
    request_params: str | None = None,
) -> dict:
    """
    Load ApiContext (from cache or DB), run ApiExecutor, write AccessRecord.
    Returns result dict from executor.
    On success: AccessRecord 200. On exception: AccessRecord 500, then re-raise.
    """
    config = get_or_load_gateway_config(api, session)
    if not config:
        _write_access_record(
            session,
            api_assignment_id=api.id,
            app_client_id=app_client_id,
            ip_address=ip or "0.0.0.0",
            http_method=http_method,
            path=request_path,
            status_code=500,
            request_body=request_body,
            request_headers=request_headers,
            request_params=request_params,
        )
        raise RuntimeError("ApiContext not found for ApiAssignment")

    content_to_run = config["content"]
    macros_jinja: list[str] = config.get("macros_jinja") or []
    macros_python: list[str] = config.get("macros_python") or []

    # Prepend macros to content for SQL (Jinja) or SCRIPT (Python)
    if api.execute_engine.value == "SQL" and macros_jinja:
        content_to_run = "\n\n".join(macros_jinja) + "\n\n" + content_to_run
    elif api.execute_engine.value == "SCRIPT" and macros_python:
        content_to_run = "\n\n".join(macros_python) + "\n\n" + content_to_run

    params_definition: list[dict] = config.get("params_definition") or []
    param_validates_definition: list[dict] = (
        config.get("param_validates_definition") or []
    )
    result_transform_code: str | None = config.get("result_transform_code")

    # Validate required parameters if params definition exists
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
                request_headers=request_headers,
                request_params=request_params,
            )
            raise HTTPException(
                status_code=400,
                detail=f"Missing required parameters: {', '.join(missing_params)}",
            )

    # Validate and coerce params by data_type (params_definition)
    try:
        params = validate_and_coerce_params(params_definition, params)
    except ParamTypeError as e:
        _write_access_record(
            session,
            api_assignment_id=api.id,
            app_client_id=app_client_id,
            ip_address=ip or "0.0.0.0",
            http_method=http_method,
            path=request_path,
            status_code=400,
            request_body=request_body,
            request_headers=request_headers,
            request_params=request_params,
        )
        raise HTTPException(status_code=400, detail=str(e)) from e

    # Param validate (Python scripts) if configured; prepend macros so validate can use macro helpers
    if param_validates_definition:
        try:
            run_param_validates(
                param_validates_definition,
                params,
                macros_prepend=macros_python,
            )
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
                request_headers=request_headers,
                request_params=request_params,
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
                request_headers=request_headers,
                request_params=request_params,
            )
            raise RuntimeError("DataSource is inactive and cannot be used")

    try:
        close_connection_after_execute = getattr(
            api, "close_connection_after_execute", False
        )
        result = ApiExecutor().execute(
            engine=api.execute_engine,
            content=content_to_run,
            params=params,
            datasource_id=api.datasource_id,
            datasource=api.datasource,
            session=session,
            close_connection_after_execute=close_connection_after_execute,
        )
        # Result transform (Python) if configured; prepend macros so transform can use macro helpers
        if result_transform_code:
            try:
                result = run_result_transform(
                    result_transform_code,
                    result,
                    params or {},
                    macros_prepend=macros_python,
                )
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
                    request_headers=request_headers,
                    request_params=request_params,
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
            request_headers=request_headers,
            request_params=request_params,
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
            request_headers=request_headers,
            request_params=request_params,
        )
        raise
