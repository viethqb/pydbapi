"""
Execute rendered SQL against a DataSource (Phase 3, Task 3.2).

Uses core.pool (connect, execute, cursor_to_dicts, PoolManager).
"""

import re
from typing import Any

from app.core.pool import connect, cursor_to_dicts, execute, get_pool_manager
from app.models_dbapi import DataSource


def _is_select_like(sql: str) -> bool:
    """True if the statement is SELECT or WITH (CTE); otherwise DML (INSERT/UPDATE/DELETE etc)."""
    s = sql.strip()
    # Ignore leading semicolons and blanks
    s = re.sub(r"^[\s;]+", "", s)
    if not s:
        return True  # treat empty as select -> []
    first = s.split()[0].upper() if s.split() else ""
    return first in ("SELECT", "WITH")


def execute_sql(
    datasource: DataSource,
    sql: str,
    *,
    use_pool: bool = True,
) -> list[dict[str, Any]] | int:
    """
    Run rendered SQL against the datasource. No parameter binding; SQL is final.

    - SELECT / WITH -> list[dict] (rows)
    - INSERT / UPDATE / DELETE / etc. -> int (rowcount)

    use_pool: if True, use PoolManager.get_connection/release; else connect/close.
    """
    conn: Any = None
    try:
        if use_pool:
            pm = get_pool_manager()
            conn = pm.get_connection(datasource)
        else:
            conn = connect(datasource)

        cur = execute(conn, sql, product_type=datasource.product_type)

        if _is_select_like(sql):
            return cursor_to_dicts(cur)
        return cur.rowcount if cur.rowcount is not None else 0
    finally:
        if conn is not None:
            if use_pool:
                get_pool_manager().release(conn, datasource.id)
            else:
                try:
                    conn.close()
                except Exception:
                    pass
