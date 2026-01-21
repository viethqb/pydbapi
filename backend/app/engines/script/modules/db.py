"""
DB module for script engine: query, query_one, execute, insert, update, delete (Phase 3, Task 3.3).
"""

from types import SimpleNamespace
from typing import Any

from app.core.pool import cursor_to_dicts, execute as pool_execute
from app.models_dbapi import DataSource


def make_db_module(
    *,
    datasource: DataSource,
    get_connection: Any,
    release_connection: Any,
    commit_after_dml: Any,
) -> Any:
    """
    Build the `db` object for script context: query, query_one, execute, insert, update, delete.
    get_connection() -> conn; release_connection(conn); commit_after_dml(conn).
    """

    def query(sql: str, params: dict | list | tuple | None = None) -> list[dict[str, Any]]:
        conn = get_connection()
        try:
            cur = pool_execute(conn, sql, params, product_type=datasource.product_type)
            rows = cursor_to_dicts(cur)
            commit_after_dml(conn, is_dml=False)
            return rows
        finally:
            release_connection(conn)

    def query_one(sql: str, params: dict | list | tuple | None = None) -> dict[str, Any] | None:
        rows = query(sql, params)
        return rows[0] if rows else None

    def execute(sql: str, params: dict | list | tuple | None = None) -> int:
        conn = get_connection()
        try:
            cur = pool_execute(conn, sql, params, product_type=datasource.product_type)
            rc = cur.rowcount if cur.rowcount is not None else 0
            commit_after_dml(conn, is_dml=True)
            return rc
        finally:
            release_connection(conn)

    def insert(sql: str, params: dict | list | tuple | None = None) -> int:
        return execute(sql, params)

    def update(sql: str, params: dict | list | tuple | None = None) -> int:
        return execute(sql, params)

    def delete(sql: str, params: dict | list | tuple | None = None) -> int:
        return execute(sql, params)

    return SimpleNamespace(
        query=query,
        query_one=query_one,
        execute=execute,
        insert=insert,
        update=update,
        delete=delete,
    )
