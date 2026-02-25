"""
Access logs admin: config (external DB), list with filters, detail.

When AccessLogConfig.datasource_id is set, logs are stored in that DataSource.
"""

import uuid as uuid_mod
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlmodel import Session as SMSession, func, select

from app.api.deps import CurrentUser, SessionDep, require_permission
from app.core.access_log_storage import (
    clear_log_engine_cache,
    get_log_engine,
    get_log_engine_for_reading,
)
from app.models import Message
from app.models_dbapi import (
    ACCESS_LOG_CONFIG_ROW_ID,
    AccessLogConfig,
    AccessRecord,
    ApiAssignment,
    ApiAssignmentGroupLink,
    AppClient,
    DataSource,
    ProductTypeEnum,
)
from app.models_permission import PermissionActionEnum, ResourceTypeEnum
from app.schemas_dbapi import (
    AccessLogConfigPublic,
    AccessLogConfigUpdate,
    AccessLogDatasourceOption,
    AccessLogDatasourceOptionsOut,
    AccessRecordDetail,
    AccessRecordPublic,
    AccessLogListOut,
)

router = APIRouter(prefix="/access-logs", tags=["access-logs"])

TRUNCATE_LIST_LEN = 200


def _truncate(s: str | None, max_len: int = TRUNCATE_LIST_LEN) -> str | None:
    if s is None:
        return None
    if len(s) <= max_len:
        return s
    return s[:max_len] + "..."


def _to_public(r: AccessRecord) -> AccessRecordPublic:
    return AccessRecordPublic(
        id=r.id,
        api_assignment_id=r.api_assignment_id,
        app_client_id=r.app_client_id,
        ip_address=r.ip_address,
        http_method=r.http_method,
        path=r.path,
        status_code=r.status_code,
        created_at=r.created_at,
        duration_ms=getattr(r, "duration_ms", None),
        request_body=_truncate(r.request_body),
        request_headers=_truncate(r.request_headers),
        request_params=_truncate(r.request_params),
    )


@router.get(
    "/datasource-options",
    response_model=AccessLogDatasourceOptionsOut,
    dependencies=[
        Depends(require_permission(ResourceTypeEnum.ACCESS_LOG, PermissionActionEnum.READ))
    ],
)
def get_access_log_datasource_options(
    session: SessionDep,
    current_user: CurrentUser,
) -> AccessLogDatasourceOptionsOut:
    """List datasources suitable for access log storage (postgres/mysql, active). For dropdown; no DATASOURCE read required."""
    stmt = select(DataSource).where(
        DataSource.is_active == True,
        DataSource.product_type.in_([ProductTypeEnum.POSTGRES, ProductTypeEnum.MYSQL]),
    ).order_by(DataSource.name)
    rows = session.exec(stmt).all()
    return AccessLogDatasourceOptionsOut(
        data=[
            AccessLogDatasourceOption(
                id=ds.id,
                name=ds.name,
                product_type=ds.product_type.value,
            )
            for ds in rows
        ]
    )


@router.get(
    "/config",
    response_model=AccessLogConfigPublic,
    dependencies=[
        Depends(require_permission(ResourceTypeEnum.ACCESS_LOG, PermissionActionEnum.READ))
    ],
)
def get_access_log_config(session: SessionDep, current_user: CurrentUser) -> AccessLogConfigPublic:
    """Get current access log storage: null = main DB, else DataSource id; use_starrocks_audit for MySQL."""
    config = session.get(AccessLogConfig, ACCESS_LOG_CONFIG_ROW_ID)
    if not config:
        return AccessLogConfigPublic(datasource_id=None, use_starrocks_audit=False)
    return AccessLogConfigPublic(
        datasource_id=config.datasource_id,
        use_starrocks_audit=getattr(config, "use_starrocks_audit", False),
    )


@router.put(
    "/config",
    response_model=AccessLogConfigPublic,
    dependencies=[
        Depends(require_permission(ResourceTypeEnum.ACCESS_LOG, PermissionActionEnum.UPDATE))
    ],
)
def update_access_log_config(
    body: AccessLogConfigUpdate,
    session: SessionDep,
    current_user: CurrentUser,
) -> AccessLogConfigPublic:
    """Set which DataSource stores access logs. Requires access_log update. Null = main DB. use_starrocks_audit only for MySQL."""
    if body.datasource_id is not None:
        ds = session.get(DataSource, body.datasource_id)
        if not ds:
            raise HTTPException(status_code=404, detail="DataSource not found")
        if not ds.is_active:
            raise HTTPException(
                status_code=400,
                detail="DataSource is inactive; choose an active one for access logs.",
            )
        if ds.product_type not in (ProductTypeEnum.POSTGRES, ProductTypeEnum.MYSQL):
            raise HTTPException(
                status_code=400,
                detail="Access log storage supports only PostgreSQL and MySQL (or compatible e.g. StarRocks).",
            )
        use_sr = body.use_starrocks_audit
        if use_sr and ds.product_type != ProductTypeEnum.MYSQL:
            use_sr = False
    else:
        use_sr = False
    config = session.get(AccessLogConfig, ACCESS_LOG_CONFIG_ROW_ID)
    if not config:
        config = AccessLogConfig(
            id=ACCESS_LOG_CONFIG_ROW_ID,
            datasource_id=body.datasource_id,
            use_starrocks_audit=use_sr,
        )
        session.add(config)
    else:
        old_id = str(config.datasource_id) if config.datasource_id else None
        config.datasource_id = body.datasource_id
        config.use_starrocks_audit = use_sr
        clear_log_engine_cache(old_id)
    session.commit()
    session.refresh(config)
    return AccessLogConfigPublic(
        datasource_id=config.datasource_id,
        use_starrocks_audit=getattr(config, "use_starrocks_audit", False),
    )


def _resolve_display_names(
    main_session: SessionDep,
    api_assignment_id: uuid_mod.UUID | None,
    app_client_id: uuid_mod.UUID | None,
) -> tuple[str | None, str | None]:
    """Return (api_display, app_client_display) for detail view. Uses main DB only."""
    api_display: str | None = None
    app_client_display: str | None = None
    if api_assignment_id:
        api = main_session.get(ApiAssignment, api_assignment_id)
        if api and api.module:
            prefix = (api.module.path_prefix or "/").strip("/")
            p = (api.path or "").strip("/")
            full_path = f"/{prefix}/{p}".replace("//", "/").strip("/") or "/"
            api_display = f"{getattr(api, 'http_method', None) or 'GET'} /{full_path}"
        elif api:
            api_display = getattr(api, "name", None) or f"{getattr(api, 'http_method', 'GET')} {getattr(api, 'path', '')}"
        else:
            api_display = str(api_assignment_id)
    if app_client_id:
        client = main_session.get(AppClient, app_client_id)
        app_client_display = client.name if client else str(app_client_id)
    return api_display, app_client_display


def _get_log_session_and_mode(session: SessionDep):
    """Return (session, is_main, use_starrocks_audit, engine). engine is set when use_starrocks_audit."""
    engine, use_main, use_starrocks_audit = get_log_engine_for_reading(session)
    if use_main:
        return session, True, False, None
    if use_starrocks_audit:
        return None, False, True, engine
    return SMSession(engine), False, False, engine


@router.get(
    "",
    response_model=AccessLogListOut,
    dependencies=[
        Depends(require_permission(ResourceTypeEnum.ACCESS_LOG, PermissionActionEnum.READ))
    ],
)
def list_access_logs(
    session: SessionDep,
    current_user: CurrentUser,
    api_assignment_id: str | None = Query(None, description="Filter by API assignment UUID"),
    module_id: str | None = Query(None, description="Filter by module UUID (resolves to API assignment ids)"),
    group_id: str | None = Query(None, description="Filter by group UUID (resolves to API assignment ids)"),
    app_client_id: str | None = Query(None, description="Filter by app client UUID"),
    path__ilike: str | None = Query(None, description="Filter by path (substring)"),
    http_method: str | None = Query(None, description="Filter by HTTP method (GET, POST, ...)"),
    ip_address: str | None = Query(None, description="Filter by client IP"),
    time_from: datetime | None = Query(None, description="From (inclusive)"),
    time_to: datetime | None = Query(None, description="To (inclusive)"),
    status: str | None = Query(None, description="all | success | fail"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> AccessLogListOut:
    """List access logs with filters. Paginated."""
    from app.core.starrocks_audit import read_starrocks_audit_list

    # Resolve module/group filters to api_assignment_id list from MAIN DB
    api_ids_from_module: set[uuid_mod.UUID] | None = None
    api_ids_from_group: set[uuid_mod.UUID] | None = None
    if module_id:
        try:
            mid = uuid_mod.UUID(module_id)
            rows = session.exec(select(ApiAssignment.id).where(ApiAssignment.module_id == mid)).all()
            api_ids_from_module = {r for r in rows if r}
        except (ValueError, TypeError):
            api_ids_from_module = set()
    if group_id:
        try:
            gid = uuid_mod.UUID(group_id)
            rows = session.exec(
                select(ApiAssignmentGroupLink.api_assignment_id).where(ApiAssignmentGroupLink.api_group_id == gid)
            ).all()
            api_ids_from_group = {r for r in rows if r}
        except (ValueError, TypeError):
            api_ids_from_group = set()

    api_ids_filter: set[uuid_mod.UUID] | None = None
    if api_ids_from_module is not None and api_ids_from_group is not None:
        api_ids_filter = api_ids_from_module.intersection(api_ids_from_group)
    elif api_ids_from_module is not None:
        api_ids_filter = api_ids_from_module
    elif api_ids_from_group is not None:
        api_ids_filter = api_ids_from_group

    log_session, is_main, use_starrocks_audit, engine = _get_log_session_and_mode(session)
    if use_starrocks_audit and engine is not None:
        api_assignment_ids: list[str] | None = None
        if api_ids_filter is not None:
            api_assignment_ids = [str(x) for x in api_ids_filter]
        rows_raw, total = read_starrocks_audit_list(
            engine,
            api_assignment_id=api_assignment_id,
            api_assignment_ids=api_assignment_ids,
            app_client_id=app_client_id,
            path__ilike=path__ilike,
            http_method=http_method,
            ip_address=ip_address,
            time_from=time_from,
            time_to=time_to,
            status=status,
            page=page,
            page_size=page_size,
        )
        data = []
        for r in rows_raw:
            _id = r.get("id")
            data.append(
                AccessRecordPublic(
                    id=uuid_mod.UUID(_id) if isinstance(_id, str) else _id,
                    api_assignment_id=uuid_mod.UUID(r["api_assignment_id"]) if r.get("api_assignment_id") else None,
                    app_client_id=uuid_mod.UUID(r["app_client_id"]) if r.get("app_client_id") else None,
                    ip_address=r.get("ip_address") or "",
                    http_method=r.get("http_method") or "GET",
                    path=r.get("path") or "",
                    status_code=int(r["status_code"]) if r.get("status_code") is not None else 0,
                    created_at=r["created_at"],
                    duration_ms=r.get("duration_ms"),
                    request_body=_truncate(r.get("request_body")),
                    request_headers=_truncate(r.get("request_headers")),
                    request_params=_truncate(r.get("request_params")),
                )
            )
        return AccessLogListOut(data=data, total=total)
    try:
        stmt = select(AccessRecord)
        count_stmt = select(func.count()).select_from(AccessRecord)
        if api_assignment_id is not None:
            try:
                aid = uuid_mod.UUID(api_assignment_id)
                stmt = stmt.where(AccessRecord.api_assignment_id == aid)
                count_stmt = count_stmt.where(AccessRecord.api_assignment_id == aid)
            except (ValueError, TypeError):
                pass
        if app_client_id is not None:
            try:
                cid = uuid_mod.UUID(app_client_id)
                stmt = stmt.where(AccessRecord.app_client_id == cid)
                count_stmt = count_stmt.where(AccessRecord.app_client_id == cid)
            except (ValueError, TypeError):
                pass
        if path__ilike is not None and path__ilike.strip():
            stmt = stmt.where(AccessRecord.path.ilike(f"%{path__ilike.strip()}%"))
            count_stmt = count_stmt.where(AccessRecord.path.ilike(f"%{path__ilike.strip()}%"))
        if api_ids_filter is not None:
            if len(api_ids_filter) == 0:
                # No API assignments match module/group filter
                return AccessLogListOut(data=[], total=0)
            stmt = stmt.where(AccessRecord.api_assignment_id.in_(api_ids_filter))
            count_stmt = count_stmt.where(AccessRecord.api_assignment_id.in_(api_ids_filter))
        if http_method is not None and http_method.strip():
            stmt = stmt.where(AccessRecord.http_method == http_method.strip().upper())
            count_stmt = count_stmt.where(AccessRecord.http_method == http_method.strip().upper())
        if ip_address is not None and ip_address.strip():
            stmt = stmt.where(AccessRecord.ip_address == ip_address.strip())
            count_stmt = count_stmt.where(AccessRecord.ip_address == ip_address.strip())
        if time_from is not None:
            stmt = stmt.where(AccessRecord.created_at >= time_from)
            count_stmt = count_stmt.where(AccessRecord.created_at >= time_from)
        if time_to is not None:
            stmt = stmt.where(AccessRecord.created_at <= time_to)
            count_stmt = count_stmt.where(AccessRecord.created_at <= time_to)
        if status == "success":
            stmt = stmt.where(AccessRecord.status_code < 400)
            count_stmt = count_stmt.where(AccessRecord.status_code < 400)
        elif status == "fail":
            stmt = stmt.where(AccessRecord.status_code >= 400)
            count_stmt = count_stmt.where(AccessRecord.status_code >= 400)
        total = log_session.exec(count_stmt).one() or 0
        stmt = stmt.order_by(AccessRecord.created_at.desc())
        stmt = stmt.offset((page - 1) * page_size).limit(page_size)
        rows = log_session.exec(stmt).all()
        return AccessLogListOut(data=[_to_public(r) for r in rows], total=total)
    finally:
        if log_session is not None and log_session is not session:
            log_session.close()


@router.get(
    "/{log_id}",
    response_model=AccessRecordDetail,
    dependencies=[
        Depends(require_permission(ResourceTypeEnum.ACCESS_LOG, PermissionActionEnum.READ))
    ],
)
def get_access_log_detail(
    log_id: str,
    session: SessionDep,
    current_user: CurrentUser,
) -> AccessRecordDetail:
    """Get one access log by id (includes request_body)."""
    from app.core.starrocks_audit import read_starrocks_audit_detail

    try:
        lid = uuid_mod.UUID(log_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=404, detail="Not found")
    log_session, is_main, use_starrocks_audit, engine = _get_log_session_and_mode(session)
    if use_starrocks_audit and engine is not None:
        out = read_starrocks_audit_detail(engine, log_id)
        if not out:
            raise HTTPException(status_code=404, detail="Not found")
        aa_id = uuid_mod.UUID(out["api_assignment_id"]) if out.get("api_assignment_id") else None
        ac_id = uuid_mod.UUID(out["app_client_id"]) if out.get("app_client_id") else None
        api_display, app_client_display = _resolve_display_names(session, aa_id, ac_id)
        return AccessRecordDetail(
            id=uuid_mod.UUID(out["id"]) if isinstance(out["id"], str) else out["id"],
            api_assignment_id=aa_id,
            app_client_id=ac_id,
            ip_address=out.get("ip_address") or "",
            http_method=out.get("http_method") or "GET",
            path=out.get("path") or "",
            status_code=out.get("status_code", 200),
            request_body=out.get("request_body"),
            request_headers=out.get("request_headers"),
            request_params=out.get("request_params"),
            created_at=out["created_at"],
            duration_ms=out.get("duration_ms"),
            api_display=api_display,
            app_client_display=app_client_display,
        )
    try:
        rec = log_session.get(AccessRecord, lid)
        if not rec:
            raise HTTPException(status_code=404, detail="Not found")
        api_display, app_client_display = _resolve_display_names(session, rec.api_assignment_id, rec.app_client_id)
        return AccessRecordDetail(
            id=rec.id,
            api_assignment_id=rec.api_assignment_id,
            app_client_id=rec.app_client_id,
            ip_address=rec.ip_address,
            http_method=rec.http_method,
            path=rec.path,
            status_code=rec.status_code,
            request_body=rec.request_body,
            request_headers=rec.request_headers,
            request_params=rec.request_params,
            created_at=rec.created_at,
            duration_ms=getattr(rec, "duration_ms", None),
            api_display=api_display,
            app_client_display=app_client_display,
        )
    finally:
        if log_session is not None and log_session is not session:
            log_session.close()


# DDL for access_record table without FK (for external DB)
DDL_ACCESS_RECORD_POSTGRES = """
CREATE TABLE IF NOT EXISTS access_record (
    id UUID PRIMARY KEY,
    api_assignment_id UUID,
    app_client_id UUID,
    ip_address VARCHAR(64) NOT NULL,
    http_method VARCHAR(16) NOT NULL,
    path VARCHAR(512) NOT NULL,
    status_code INTEGER NOT NULL DEFAULT 0,
    request_body TEXT,
    request_headers TEXT,
    request_params TEXT,
    created_at TIMESTAMP NOT NULL,
    duration_ms INTEGER NULL
);
CREATE INDEX IF NOT EXISTS ix_access_record_created_at ON access_record (created_at);
CREATE INDEX IF NOT EXISTS ix_access_record_api_assignment_id ON access_record (api_assignment_id);
CREATE INDEX IF NOT EXISTS ix_access_record_app_client_id ON access_record (app_client_id);
"""

DDL_ACCESS_RECORD_MYSQL = """
CREATE TABLE IF NOT EXISTS access_record (
    id CHAR(36) PRIMARY KEY,
    api_assignment_id CHAR(36),
    app_client_id CHAR(36),
    ip_address VARCHAR(64) NOT NULL,
    http_method VARCHAR(16) NOT NULL,
    path VARCHAR(512) NOT NULL,
    status_code INT NOT NULL DEFAULT 0,
    request_body TEXT,
    request_headers TEXT,
    request_params TEXT,
    created_at DATETIME(6) NOT NULL,
    duration_ms INT NULL,
    INDEX ix_access_record_created_at (created_at),
    INDEX ix_access_record_api_assignment_id (api_assignment_id),
    INDEX ix_access_record_app_client_id (app_client_id)
);
"""


@router.post(
    "/init-external-table",
    response_model=Message,
    dependencies=[
        Depends(require_permission(ResourceTypeEnum.ACCESS_LOG, PermissionActionEnum.UPDATE))
    ],
)
def init_external_access_log_table(
    session: SessionDep,
    current_user: CurrentUser,
) -> Message:
    """
    Create access_record table (or StarRocks audit schema) in the configured external DataSource.
    Requires access_log update. No-op if using main DB.
    When use_starrocks_audit is True, creates starrocks_audit_db__ and pydbapi_access_log_tbl__ table.
    """
    from app.core.starrocks_audit import DDL_STARROCKS_AUDIT

    config = session.get(AccessLogConfig, ACCESS_LOG_CONFIG_ROW_ID)
    if not config or not config.datasource_id:
        return Message(message="Access log uses main DB; no external table to create.")
    ds = session.get(DataSource, config.datasource_id)
    if not ds:
        raise HTTPException(status_code=404, detail="DataSource not found")
    use_sr = getattr(config, "use_starrocks_audit", False) and ds.product_type == ProductTypeEnum.MYSQL
    if use_sr:
        ddl = DDL_STARROCKS_AUDIT
    else:
        pt = ds.product_type
        if pt == ProductTypeEnum.POSTGRES:
            ddl = DDL_ACCESS_RECORD_POSTGRES
        elif pt == ProductTypeEnum.MYSQL:
            ddl = DDL_ACCESS_RECORD_MYSQL
        else:
            raise HTTPException(
                status_code=400,
                detail="Only PostgreSQL and MySQL are supported for external access log table.",
            )
    engine = get_log_engine(ds)
    for part in ddl.strip().split(";"):
        part = part.strip()
        if part:
            with engine.connect() as conn:
                conn.execute(text(part))
                conn.commit()
    if use_sr:
        return Message(message="StarRocks audit database and table created or already exist.")
    return Message(message="External access_record table created or already exists.")
