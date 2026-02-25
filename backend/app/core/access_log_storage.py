"""
Access log storage: main DB vs external DataSource.

When AccessLogConfig.datasource_id is set, access_record rows are written to
that DataSource (e.g. StarRocks, MySQL, Postgres). Otherwise use main DB.
When use_starrocks_audit is True and datasource is MySQL, writes go to
starrocks_audit_db__.pydbapi_access_log_tbl__ via starrocks_audit module.
"""

from typing import Any
from urllib.parse import quote_plus
from uuid import UUID

from sqlalchemy import create_engine
from sqlmodel import Session, select

from app.core.db import engine as main_engine
from app.models_dbapi import (
    ACCESS_LOG_CONFIG_ROW_ID,
    AccessLogConfig,
    AccessRecord,
    DataSource,
    ProductTypeEnum,
)


def _build_database_url(datasource: DataSource) -> str:
    """Build SQLAlchemy URL for the given DataSource (postgres or mysql)."""
    pt = datasource.product_type
    if isinstance(pt, str):
        pt = ProductTypeEnum(pt)
    user = quote_plus(datasource.username)
    password = quote_plus(datasource.password or "")
    host = datasource.host
    port = datasource.port or (5432 if pt == ProductTypeEnum.POSTGRES else 3306)
    database = datasource.database or ""
    if pt == ProductTypeEnum.POSTGRES:
        return f"postgresql+psycopg://{user}:{password}@{host}:{port}/{database}"
    if pt == ProductTypeEnum.MYSQL:
        return f"mysql+pymysql://{user}:{password}@{host}:{port}/{database}"
    raise ValueError(f"Access log storage only supports postgres and mysql, got {pt}")


# Cache engine by datasource_id so we don't create a new engine per request.
_log_engine_cache: dict[str, Any] = {}


def get_log_engine(datasource: DataSource):
    """Get or create SQLAlchemy engine for the given DataSource (cached)."""
    key = str(datasource.id)
    if key not in _log_engine_cache:
        url = _build_database_url(datasource)
        _log_engine_cache[key] = create_engine(
            url,
            pool_pre_ping=True,
            pool_size=2,
            max_overflow=2,
        )
    return _log_engine_cache[key]


def clear_log_engine_cache(datasource_id: str | None = None) -> None:
    """Clear cached log engine(s). Call when access log config changes."""
    if datasource_id is None:
        _log_engine_cache.clear()
    else:
        _log_engine_cache.pop(datasource_id, None)


def get_log_session_context(main_session: Session) -> Session:
    """
    Return the session to use for access_record.
    If external: returns a new Session(log_engine) that caller must close,
    or use as context manager. For simplicity we return a session that
    must be used and closed by caller.
    """
    config = main_session.exec(
        select(AccessLogConfig).where(AccessLogConfig.id == ACCESS_LOG_CONFIG_ROW_ID)
    ).first()
    if not config or not config.datasource_id:
        return main_session
    ds = main_session.get(DataSource, config.datasource_id)
    if not ds or not ds.is_active:
        return main_session
    log_engine = get_log_engine(ds)
    return Session(log_engine)


def get_log_engine_for_reading(main_session: Session):
    """
    Return (engine, use_main, use_starrocks_audit).
    use_main=True: use main DB/session for access_record table.
    use_main=False, use_starrocks_audit=False: use external engine + access_record table.
    use_main=False, use_starrocks_audit=True: use external engine + StarRocks audit table.
    """
    config = main_session.exec(
        select(AccessLogConfig).where(AccessLogConfig.id == ACCESS_LOG_CONFIG_ROW_ID)
    ).first()
    if not config or not config.datasource_id:
        return main_engine, True, False
    ds = main_session.get(DataSource, config.datasource_id)
    if not ds or not ds.is_active:
        return main_engine, True, False
    use_sr = getattr(config, "use_starrocks_audit", False) and (
        ds.product_type == ProductTypeEnum.MYSQL
        or (isinstance(ds.product_type, str) and ds.product_type == "mysql")
    )
    return get_log_engine(ds), False, use_sr


def get_access_log_config_and_datasource(main_session: Session) -> tuple[AccessLogConfig | None, DataSource | None]:
    """Return (config, datasource). Either can be None."""
    config = main_session.get(AccessLogConfig, ACCESS_LOG_CONFIG_ROW_ID)
    if not config or not config.datasource_id:
        return config, None
    ds = main_session.get(DataSource, config.datasource_id)
    return config, ds


def write_access_record(
    main_session: Session,
    *,
    id: UUID,
    api_assignment_id: UUID,
    app_client_id: UUID | None,
    ip_address: str,
    http_method: str,
    path: str,
    status_code: int,
    request_body: str | None = None,
    request_headers: str | None = None,
    request_params: str | None = None,
    duration_ms: int | None = None,
) -> None:
    """
    Write one access record. Uses main DB, external access_record table,
    or StarRocks audit table depending on config.
    """
    from datetime import datetime, timezone

    config, ds = get_access_log_config_and_datasource(main_session)
    if not config or not config.datasource_id or not ds or not ds.is_active:
        rec = AccessRecord(
            id=id,
            api_assignment_id=api_assignment_id,
            app_client_id=app_client_id,
            ip_address=ip_address,
            http_method=http_method,
            path=path,
            status_code=status_code,
            request_body=request_body,
            request_headers=request_headers,
            request_params=request_params,
            duration_ms=duration_ms,
        )
        main_session.add(rec)
        main_session.commit()
        return

    use_starrocks = getattr(config, "use_starrocks_audit", False) and (
        ds.product_type == ProductTypeEnum.MYSQL
        or (isinstance(ds.product_type, str) and ds.product_type == "mysql")
    )
    if use_starrocks:
        from app.core.starrocks_audit import write_starrocks_audit_row

        engine = get_log_engine(ds)
        write_starrocks_audit_row(
            engine,
            id=id,
            api_assignment_id=api_assignment_id,
            app_client_id=app_client_id,
            ip_address=ip_address,
            http_method=http_method,
            path=path,
            status_code=status_code,
            request_body=request_body,
            request_headers=request_headers,
            request_params=request_params,
            created_at=datetime.now(timezone.utc),
            duration_ms=duration_ms,
        )
        return

    log_session = get_log_session_context(main_session)
    try:
        rec = AccessRecord(
            id=id,
            api_assignment_id=api_assignment_id,
            app_client_id=app_client_id,
            ip_address=ip_address,
            http_method=http_method,
            path=path,
            status_code=status_code,
            request_body=request_body,
            request_headers=request_headers,
            request_params=request_params,
            duration_ms=duration_ms,
        )
        log_session.add(rec)
        log_session.commit()
    finally:
        if log_session is not main_session:
            log_session.close()
