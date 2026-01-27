"""
Gateway runner (Phase 4, Task 4.1): run API via ApiExecutor, write AccessRecord.
"""

from uuid import UUID

from sqlmodel import Session, select

from app.core.config import settings
from app.engines import ApiExecutor
from app.models_dbapi import AccessRecord, ApiAssignment, ApiContext


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
            content=ctx.content,
            params=params,
            datasource_id=api.datasource_id,
            datasource=api.datasource,
            session=session,
        )
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
