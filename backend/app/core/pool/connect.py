"""
DB connection helpers for external DataSources (Phase 3, Task 3.1).

Uses psycopg (PostgreSQL) or pymysql (MySQL) based on product_type.
No driver layer: libs are installed via pip; DataSource (product_type, host, ...) is enough.
"""

from typing import Any

import psycopg
import pymysql

from app.core.config import settings
from app.models_dbapi import ProductTypeEnum


def _get(datasource: Any, key: str) -> Any:
    """Get attribute or dict key from DataSource, dict, or Pydantic model."""
    if isinstance(datasource, dict):
        return datasource.get(key)
    return getattr(datasource, key, None)


def _resolve_product_type(datasource: Any, product_type: ProductTypeEnum | None) -> ProductTypeEnum:
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

    for name, val in [("host", host), ("database", database), ("username", username), ("password", password)]:
        if val is None:
            raise ValueError(f"datasource must provide {name}")

    timeout = settings.EXTERNAL_DB_CONNECT_TIMEOUT

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
    raise ValueError(f"Unsupported product_type: {pt}")


def execute(
    conn: Any,
    sql: str,
    params: dict | list | tuple | None = None,
    *,
    product_type: ProductTypeEnum | None = None,  # noqa: ARG001  # reserved for dialect-specific behavior
) -> Any:
    """
    Execute SQL and return the cursor. Caller uses cursor_to_dicts(cursor) or cursor.rowcount.

    - product_type: reserved for dialect-specific behavior; not used for initial postgres/mysql.
    """
    cur = conn.cursor()
    if params is not None:
        cur.execute(sql, params)
    else:
        cur.execute(sql)
    return cur


def cursor_to_dicts(cursor: Any) -> list[dict[str, Any]]:
    """Convert cursor result to list of dicts. Works for both psycopg and pymysql."""
    desc = cursor.description
    if not desc:
        return []
    names = [d[0] for d in desc]
    return [dict(zip(names, row, strict=True)) for row in cursor.fetchall()]
