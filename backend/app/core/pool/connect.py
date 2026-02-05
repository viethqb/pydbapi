"""
DB connection helpers for external DataSources (Phase 3, Task 3.1).

Uses psycopg (PostgreSQL), pymysql (MySQL), or trino (Trino) based on product_type.
No driver layer: libs are installed via pip; DataSource (product_type, host, ...) is enough.
"""

from typing import Any

import psycopg
import pymysql
from trino.auth import BasicAuthentication
from trino.dbapi import connect as trino_connect

from app.core.config import settings
from app.models_dbapi import ProductTypeEnum


def _get(datasource: Any, key: str) -> Any:
    """Get attribute or dict key from DataSource, dict, or Pydantic model."""
    if isinstance(datasource, dict):
        return datasource.get(key)
    return getattr(datasource, key, None)


def _resolve_product_type(
    datasource: Any, product_type: ProductTypeEnum | None
) -> ProductTypeEnum:
    pt = product_type or _get(datasource, "product_type")
    if pt is None:
        raise ValueError("product_type is required (from datasource or argument)")
    if isinstance(pt, str):
        return ProductTypeEnum(pt)
    return pt


def connect(
    datasource: Any,
    *,
    product_type: ProductTypeEnum | None = None,
) -> Any:
    """
    Open a connection to an external DB from DataSource or connection dict.

    - datasource: DataSource model, DataSourcePreTestIn, or dict with
      host, port, database, username, password, and product_type (or pass product_type=).
    - product_type: override when datasource is dict with string product_type.
    """
    pt = _resolve_product_type(datasource, product_type)
    host = _get(datasource, "host")
    port = _get(datasource, "port") or 5432
    database = _get(datasource, "database")
    username = _get(datasource, "username")
    password = _get(datasource, "password")

    for name, val in [
        ("host", host),
        ("database", database),
        ("username", username),
    ]:
        if val is None:
            raise ValueError(f"datasource must provide {name}")
    password = password if password is not None else ""

    timeout = settings.EXTERNAL_DB_CONNECT_TIMEOUT

    if pt == ProductTypeEnum.TRINO:
        use_ssl = _get(datasource, "use_ssl") in (True, "true", "1")
        if use_ssl and not (password and password.strip()):
            raise ValueError("Password is required for Trino when using SSL/HTTPS.")

    if pt == ProductTypeEnum.POSTGRES:
        return psycopg.connect(
            host=host,
            port=int(port),
            dbname=database,
            user=username,
            password=password,
            connect_timeout=timeout,
        )
    if pt == ProductTypeEnum.MYSQL:
        return pymysql.connect(
            host=host,
            port=int(port),
            database=database,
            user=username,
            password=password,
            connect_timeout=timeout,
        )
    if pt == ProductTypeEnum.TRINO:
        use_ssl = _get(datasource, "use_ssl") in (True, "true", "1")
        return trino_connect(
            host=host,
            port=int(port),
            user=username,
            auth=BasicAuthentication(username, password or ""),
            catalog=database,
            schema="default",
            source="pydbapi",
            http_scheme="https" if use_ssl else "http",
            request_timeout=timeout,
        )
    raise ValueError(f"Unsupported product_type: {pt}")


def execute(
    conn: Any,
    sql: str,
    params: dict | list | tuple | None = None,
    *,
    product_type: ProductTypeEnum | None = None,
) -> Any:
    """
    Execute SQL and return the cursor. Caller uses cursor_to_dicts(cursor) or cursor.rowcount.

    - product_type: used for EXTERNAL_DB_STATEMENT_TIMEOUT (Postgres: statement_timeout,
      MySQL: max_execution_time). When set, applies timeout in ms before the query and resets after.
    """
    timeout_sec = settings.EXTERNAL_DB_STATEMENT_TIMEOUT

    if timeout_sec is not None and timeout_sec > 0 and product_type is not None:
        timeout_ms = int(timeout_sec * 1000)
        cur_set = conn.cursor()
        try:
            if product_type == ProductTypeEnum.POSTGRES:
                cur_set.execute("SET statement_timeout = %s", (str(timeout_ms),))
            elif product_type == ProductTypeEnum.MYSQL:
                cur_set.execute("SET SESSION max_execution_time = %s", (timeout_ms,))
            elif product_type == ProductTypeEnum.TRINO:
                cur_set.execute(
                    "SET SESSION query_max_execution_time = '%ss'" % timeout_sec
                )
        finally:
            try:
                cur_set.close()
            except Exception:
                pass

    cur = conn.cursor()
    try:
        if params is not None:
            cur.execute(sql, params)
        else:
            cur.execute(sql)
    finally:
        if timeout_sec is not None and timeout_sec > 0 and product_type is not None:
            try:
                cur_reset = conn.cursor()
                if product_type == ProductTypeEnum.POSTGRES:
                    cur_reset.execute("SET statement_timeout = 0")
                elif product_type == ProductTypeEnum.MYSQL:
                    cur_reset.execute("SET SESSION max_execution_time = 0")
                elif product_type == ProductTypeEnum.TRINO:
                    cur_reset.execute("SET SESSION query_max_execution_time = '0s'")
                cur_reset.close()
            except Exception:
                pass

    return cur


def cursor_to_dicts(cursor: Any) -> list[dict[str, Any]]:
    """Convert cursor result to list of dicts. Works for both psycopg and pymysql."""
    desc = cursor.description
    if not desc:
        return []
    names = [d[0] for d in desc]
    return [dict(zip(names, row, strict=True)) for row in cursor.fetchall()]
