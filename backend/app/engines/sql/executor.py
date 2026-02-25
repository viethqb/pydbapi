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
    s = re.sub(r"^[\s;]+", "", s)
    if not s:
        return True
    first = s.split()[0].upper() if s.split() else ""
    return first in ("SELECT", "WITH")


def _split_statements(sql: str) -> list[str]:
    """Split SQL into statements on ``;`` while respecting quoted strings.

    Handles single-quoted (``'...'``), double-quoted (``"..."``), and
    dollar-quoted (``$$...$$``) literals so that semicolons inside them
    are not treated as statement terminators.
    """
    stmts: list[str] = []
    current: list[str] = []
    i = 0
    length = len(sql)

    while i < length:
        ch = sql[i]

        if ch in ("'", '"'):
            quote = ch
            current.append(ch)
            i += 1
            while i < length:
                c = sql[i]
                current.append(c)
                if c == quote:
                    if i + 1 < length and sql[i + 1] == quote:
                        current.append(sql[i + 1])
                        i += 2
                        continue
                    i += 1
                    break
                if c == "\\" and i + 1 < length:
                    current.append(sql[i + 1])
                    i += 2
                    continue
                i += 1
            continue

        if ch == "$" and i + 1 < length and sql[i + 1] == "$":
            tag_end = sql.find("$$", i + 2)
            if tag_end == -1:
                current.append(sql[i:])
                i = length
            else:
                current.append(sql[i : tag_end + 2])
                i = tag_end + 2
            continue

        if ch == "-" and i + 1 < length and sql[i + 1] == "-":
            end = sql.find("\n", i)
            if end == -1:
                current.append(sql[i:])
                i = length
            else:
                current.append(sql[i : end + 1])
                i = end + 1
            continue

        if ch == "/" and i + 1 < length and sql[i + 1] == "*":
            end = sql.find("*/", i + 2)
            if end == -1:
                current.append(sql[i:])
                i = length
            else:
                current.append(sql[i : end + 2])
                i = end + 2
            continue

        if ch == ";":
            stmt = "".join(current).strip()
            if stmt:
                stmts.append(stmt)
            current = []
            i += 1
            continue

        current.append(ch)
        i += 1

    tail = "".join(current).strip()
    if tail:
        stmts.append(tail)
    return stmts


def execute_sql(
    datasource: DataSource,
    sql: str,
    *,
    use_pool: bool = True,
) -> list[Any]:
    """
    Run rendered SQL against the datasource. No parameter binding; SQL is final.

    Always returns a list of per-statement results (one element per statement).
    - Single statement: returns [result] (result = list[dict] for SELECT/WITH, int for DML).
    - Multiple statements (split by ';'): returns [r1, r2, ...].

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

        # Single statement: return [result] so API always gets data = [stmt1_result, ...]
        if len(statements) == 1:
            single_sql = statements[0]
            cur = execute(conn, single_sql, product_type=datasource.product_type)
            if _is_select_like(single_sql):
                return [cursor_to_dicts(cur)]
            return [cur.rowcount if cur.rowcount is not None else 0]

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
