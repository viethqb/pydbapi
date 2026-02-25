"""
Gateway runner (Phase 4, Task 4.1): run API via ApiExecutor, write AccessRecord.
Uses config cache (Redis) to reduce DB load for content, params, validate, transform.

Access-log writes are dispatched to a background thread so they never add
latency to the API response.
"""

import logging
from concurrent.futures import ThreadPoolExecutor
from typing import Any
from uuid import UUID, uuid4

from fastapi import HTTPException
from sqlmodel import Session

from app.core.access_log_storage import write_access_record
from app.core.config import settings
from app.core.db import engine as main_engine
from app.core.gateway.config_cache import get_or_load_gateway_config
from app.core.param_type import ParamTypeError, validate_and_coerce_params
from app.core.param_validate import ParamValidateError, run_param_validates
from app.core.result_transform import ResultTransformError, run_result_transform
from app.engines import ApiExecutor
from app.models_dbapi import ApiAssignment

logger = logging.getLogger(__name__)

_log_pool = ThreadPoolExecutor(max_workers=2, thread_name_prefix="access-log")


# ---------------------------------------------------------------------------
# Access-log helper
# ---------------------------------------------------------------------------

class _AccessLogContext:
    """Captures the immutable per-request fields so the log call can be
    fired with just a status_code."""

    __slots__ = (
        "api_assignment_id",
        "app_client_id",
        "ip_address",
        "http_method",
        "path",
        "request_body",
        "request_headers",
        "request_params",
    )

    def __init__(
        self,
        *,
        api_assignment_id: UUID,
        app_client_id: UUID | None,
        ip: str,
        http_method: str,
        request_path: str,
        request_body: str | None,
        request_headers: str | None,
        request_params: str | None,
    ) -> None:
        self.api_assignment_id = api_assignment_id
        self.app_client_id = app_client_id
        self.ip_address = ip or "0.0.0.0"
        self.http_method = http_method
        self.path = request_path
        body: str | None = None
        if settings.GATEWAY_ACCESS_LOG_BODY and request_body:
            body = (
                request_body[:2000] + "..."
                if len(request_body) > 2000
                else request_body
            )
        self.request_body = body
        self.request_headers = request_headers
        self.request_params = request_params

    def write(self, status_code: int) -> None:
        """Fire-and-forget write in background thread."""
        _log_pool.submit(self._do_write, status_code)

    def _do_write(self, status_code: int) -> None:
        try:
            with Session(main_engine) as session:
                write_access_record(
                    main_session=session,
                    id=uuid4(),
                    api_assignment_id=self.api_assignment_id,
                    app_client_id=self.app_client_id,
                    ip_address=self.ip_address,
                    http_method=self.http_method,
                    path=self.path,
                    status_code=status_code,
                    request_body=self.request_body,
                    request_headers=self.request_headers,
                    request_params=self.request_params,
                )
        except Exception:
            logger.exception(
                "Failed to write access record",
                extra={"api_assignment_id": str(self.api_assignment_id)},
            )


def _fail(
    log_ctx: _AccessLogContext,
    status_code: int,
    detail: str,
    *,
    exc: Exception | None = None,
) -> HTTPException:
    """Log + raise HTTPException in one call."""
    log_ctx.write(status_code)
    if exc is not None:
        raise HTTPException(status_code=status_code, detail=detail) from exc
    raise HTTPException(status_code=status_code, detail=detail)


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


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
    """Load ApiContext (from cache or DB), run ApiExecutor, write AccessRecord.

    Returns result dict from executor.
    """
    log_ctx = _AccessLogContext(
        api_assignment_id=api.id,
        app_client_id=app_client_id,
        ip=ip,
        http_method=http_method,
        request_path=request_path,
        request_body=request_body,
        request_headers=request_headers,
        request_params=request_params,
    )

    config = get_or_load_gateway_config(api, session)
    if not config:
        log_ctx.write(500)
        raise RuntimeError("ApiContext not found for ApiAssignment")

    content_to_run = config["content"]
    macros_jinja: list[str] = config.get("macros_jinja") or []
    macros_python: list[str] = config.get("macros_python") or []

    if api.execute_engine.value == "SQL" and macros_jinja:
        content_to_run = "\n\n".join(macros_jinja) + "\n\n" + content_to_run
    elif api.execute_engine.value == "SCRIPT" and macros_python:
        content_to_run = "\n\n".join(macros_python) + "\n\n" + content_to_run

    params_definition: list[dict] = config.get("params_definition") or []
    param_validates_definition: list[dict] = (
        config.get("param_validates_definition") or []
    )
    result_transform_code: str | None = config.get("result_transform_code")

    # --- Validate required params ---
    if params_definition:
        missing = [
            str(pd.get("name"))
            for pd in params_definition
            if isinstance(pd, dict)
            and pd.get("is_required")
            and pd.get("name")
            and (params or {}).get(pd["name"]) in (None, "")
        ]
        if missing:
            _fail(log_ctx, 400, f"Missing required parameters: {', '.join(missing)}")

    # --- Coerce params ---
    try:
        params = validate_and_coerce_params(params_definition, params)
    except ParamTypeError as e:
        _fail(log_ctx, 400, str(e), exc=e)

    # --- Custom param validates ---
    if param_validates_definition:
        try:
            run_param_validates(
                param_validates_definition, params, macros_prepend=macros_python
            )
        except ParamValidateError as e:
            _fail(log_ctx, 400, str(e), exc=e)

    # --- Datasource active check ---
    if api.datasource_id and api.datasource and not api.datasource.is_active:
        log_ctx.write(400)
        raise RuntimeError("DataSource is inactive and cannot be used")

    # --- Execute ---
    try:
        result: dict[str, Any] = ApiExecutor().execute(
            engine=api.execute_engine,
            content=content_to_run,
            params=params,
            datasource_id=api.datasource_id,
            datasource=api.datasource,
            session=session,
            close_connection_after_execute=getattr(
                api, "close_connection_after_execute", False
            ),
        )

        if result_transform_code:
            try:
                result = run_result_transform(
                    result_transform_code,
                    result,
                    params or {},
                    macros_prepend=macros_python,
                )
            except ResultTransformError as e:
                _fail(log_ctx, 400, str(e), exc=e)

        log_ctx.write(200)
        return result
    except HTTPException:
        raise
    except Exception:
        log_ctx.write(500)
        raise
