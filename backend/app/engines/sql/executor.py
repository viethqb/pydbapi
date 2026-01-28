"""
Execute rendered SQL against a DataSource (Phase 3, Task 3.2).

Supports:
- Single statement: returns list[dict] (SELECT/WITH) or int (rowcount for DML)
- Multiple statements separated by ';': returns list of results, e.g.
  - [[{...}, {...}], [{...}]] for multiple SELECTs
  - [rowcount1, [{...}], rowcount3] for mixed DML/SELECT

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


def _split_statements(sql: str) -> list[str]:
    """
    Naively split SQL string into statements by ';'.

    This is intentionally simple and assumes semicolons only appear as
    statement terminators, not inside string literals.
    """
    parts = [s.strip() for s in sql.split(";")]
    return [p for p in parts if p]


def execute_sql(
    datasource: DataSource,
    sql: str,
    *,
    use_pool: bool = True,
) -> list[dict[str, Any]] | int | list[Any]:
    """
    Run rendered SQL against the datasource. No parameter binding; SQL is final.

    - Single statement:
      - SELECT / WITH -> list[dict] (rows)
      - INSERT / UPDATE / DELETE / etc. -> int (rowcount)
    - Multiple statements separated by ';':
      - returns list of per-statement results, where each element is either
        list[dict] (for SELECT/WITH) or int (rowcount for DML).

    use_pool: if True, use PoolManager.get_connection/release; else connect/close.
    """
    conn: Any = None
    try:
        if use_pool:
            pm = get_pool_manager()
            conn = pm.get_connection(datasource)
        else:
            conn = connect(datasource)

        statements = _split_statements(sql)

        # Single-statement behavior (backwards compatible)
        if len(statements) == 1:
            single_sql = statements[0]
            cur = execute(conn, single_sql, product_type=datasource.product_type)
            if _is_select_like(single_sql):
                return cursor_to_dicts(cur)
            return cur.rowcount if cur.rowcount is not None else 0

        # Multi-statement: execute sequentially and collect results
        results: list[Any] = []
        for stmt in statements:
            cur = execute(conn, stmt, product_type=datasource.product_type)
            if _is_select_like(stmt):
                results.append(cursor_to_dicts(cur))
            else:
                results.append(cur.rowcount if cur.rowcount is not None else 0)
        return results
    except Exception:
        # If execution fails, rollback transaction before releasing connection
        if conn is not None:
            try:
                conn.rollback()
            except Exception:
                pass
        raise
    finally:
        if conn is not None:
            if use_pool:
                get_pool_manager().release(conn, datasource.id)
            else:
                try:
                    conn.close()
                except Exception:
                    pass
