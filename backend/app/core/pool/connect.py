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
from app.core.security import decrypt_value
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
    decrypt: bool = True,
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
    raw_password = _get(datasource, "password")

    for name, val in [
        ("host", host),
        ("database", database),
        ("username", username),
    ]:
        if val is None:
            raise ValueError(f"datasource must provide {name}")
    password = (
        decrypt_value(raw_password) if decrypt and raw_password else (raw_password or "")
    )

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
      MySQL: max_execution_time). When set, applies timeout before the query and resets after.
    Uses a single cursor for SET + query to minimise round-trips.
    """
    timeout_sec = settings.EXTERNAL_DB_STATEMENT_TIMEOUT
    apply_timeout = (
        timeout_sec is not None and timeout_sec > 0 and product_type is not None
    )

    cur = conn.cursor()
    try:
        if apply_timeout:
            timeout_ms = int(timeout_sec * 1000)
            if product_type == ProductTypeEnum.POSTGRES:
                cur.execute("SET statement_timeout = %s", (str(timeout_ms),))
            elif product_type == ProductTypeEnum.MYSQL:
                cur.execute("SET SESSION max_execution_time = %s", (timeout_ms,))
            elif product_type == ProductTypeEnum.TRINO:
                cur.execute(
                    "SET SESSION query_max_execution_time = '%ss'" % int(timeout_sec)
                )

        if params is not None:
            cur.execute(sql, params)
        else:
            cur.execute(sql)
    finally:
        if apply_timeout:
            try:
                cur.execute(
                    "SET statement_timeout = 0"
                    if product_type == ProductTypeEnum.POSTGRES
                    else "SET SESSION max_execution_time = 0"
                    if product_type == ProductTypeEnum.MYSQL
                    else "SET SESSION query_max_execution_time = '0s'"  # noqa: S608
                )
            except Exception:
                pass

    return cur


def _bool_coerce_indexes(cursor: Any) -> set[int]:
    """Return column indexes whose values should be coerced to bool.

    MySQL-family drivers (pymysql — used for MySQL and StarRocks via MySQL
    protocol) return TINYINT(1) / BOOLEAN columns as Python ints (0/1). We
    distinguish a bool column from a regular TINYINT by looking at both
    ``display_size`` (cursor.description[2]) and ``internal_size`` (index 3):

    - **MySQL** populates ``display_size`` with the declared width (1 for
      ``TINYINT(1)``, 4 for ``TINYINT(4)``); ``internal_size`` matches.
    - **StarRocks** leaves ``display_size`` as ``None`` but populates
      ``internal_size`` — only ``BOOLEAN`` columns return ``internal_size=1``;
      user-declared ``TINYINT(1)`` is normalized to ``TINYINT(4)``. So on
      StarRocks you must use ``BOOLEAN`` (not ``TINYINT(1)``) for the fix to
      detect the column — that's the canonical convention anyway.

    psycopg (Postgres) already returns native bool for BOOLEAN columns, so
    we skip detection for it.
    """
    if not settings.EXTERNAL_DB_COERCE_TINYINT_BOOL:
        return set()
    desc = getattr(cursor, "description", None)
    if not desc:
        return set()
    module = (type(cursor).__module__ or "").lower()
    # Only pymysql-family cursors — psycopg handles bool natively.
    if "pymysql" not in module:
        return set()

    PYMYSQL_TINY = 1  # pymysql FIELD_TYPE.TINY
    out: set[int] = set()
    for i, d in enumerate(desc):
        # d = (name, type_code, display_size, internal_size, precision, scale, null_ok)
        if len(d) < 4 or d[1] != PYMYSQL_TINY:
            continue
        display_size = d[2]
        internal_size = d[3]
        # Bool if either metadata says "width = 1".
        # MySQL populates both; StarRocks only populates internal_size (for BOOLEAN).
        if display_size == 1 or internal_size == 1:
            out.add(i)
    return out


def cursor_to_dicts(cursor: Any) -> list[dict[str, Any]]:
    """Convert cursor result to list of dicts.

    For pymysql-family drivers (MySQL, StarRocks) detects TINYINT(1) columns
    via ``cursor.description`` and coerces values to Python bool — see
    :func:`_bool_coerce_indexes`. psycopg / Trino cursors are untouched.
    """
    desc = cursor.description
    if not desc:
        return []
    names = [d[0] for d in desc]
    bool_idx = _bool_coerce_indexes(cursor)
    if not bool_idx:
        return [dict(zip(names, row, strict=True)) for row in cursor.fetchall()]

    out: list[dict[str, Any]] = []
    for row in cursor.fetchall():
        d = dict(zip(names, row, strict=True))
        for i in bool_idx:
            v = row[i]
            if v is not None:
                d[names[i]] = bool(v)
        out.append(d)
    return out
