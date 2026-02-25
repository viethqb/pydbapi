"""
Custom Jinja2 filters for SQL template engine (Phase 3, Task 3.2).

Escape/validate to avoid SQL injection; handle None appropriately.

All filters return ``SqlSafe`` so the auto-escape ``finalize`` callback
knows the value has already been sanitised and will not double-escape it.
"""

import json
from datetime import date, datetime
from typing import Any

# Single-quote escape for SQL strings
_SQL_QUOTE_ESCAPE = str.maketrans({"'": "''"})


# ---------------------------------------------------------------------------
# SqlSafe: marker for values that have already been escaped by a filter.
# The Jinja2 finalize callback checks ``isinstance(v, SqlSafe)`` to skip
# auto-escaping when a filter was explicitly applied.
# ---------------------------------------------------------------------------


class SqlSafe(str):
    """String subclass marking a value as already SQL-escaped.

    When Jinja2's ``finalize`` sees a ``SqlSafe`` instance it passes it
    through unchanged.  Use ``| safe`` in templates as an alias.
    """


def _safe(v: str) -> SqlSafe:
    return SqlSafe(v)


# ---------------------------------------------------------------------------
# Filters
# ---------------------------------------------------------------------------


def sql_string(value: Any) -> SqlSafe:
    """
    Escape string for SQL. None -> 'NULL' (literal); otherwise single-quote escape.
    """
    if value is None:
        return _safe("NULL")
    s = str(value).translate(_SQL_QUOTE_ESCAPE)
    return _safe(f"'{s}'")


def sql_int(value: Any) -> SqlSafe:
    """
    Validate and format as integer. None -> 'NULL'.
    """
    if value is None:
        return _safe("NULL")
    try:
        return _safe(str(int(value)))
    except (TypeError, ValueError):
        return _safe("NULL")


def sql_float(value: Any) -> SqlSafe:
    """
    Validate and format as float. None -> 'NULL'.
    """
    if value is None:
        return _safe("NULL")
    try:
        return _safe(str(float(value)))
    except (TypeError, ValueError):
        return _safe("NULL")


def sql_bool(value: Any) -> SqlSafe:
    """
    Format as SQL boolean. None -> 'NULL'.
    Postgres: TRUE/FALSE; MySQL: 1/0. We use TRUE/FALSE (works in both).
    """
    if value is None:
        return _safe("NULL")
    return _safe("TRUE" if bool(value) else "FALSE")


def sql_date(value: Any) -> SqlSafe:
    """
    Format as ISO date 'YYYY-MM-DD' for DB. None -> 'NULL'.
    """
    if value is None:
        return _safe("NULL")
    d = value
    if isinstance(d, datetime):
        d = d.date()
    if isinstance(d, date):
        return _safe(f"'{d.isoformat()}'")
    if isinstance(d, str):
        # minimal validation: expect YYYY-MM-DD
        if len(d) >= 10 and d[4] == "-" and d[7] == "-":
            return _safe(f"'{d[:10]}'")
    return _safe("NULL")


def sql_datetime(value: Any) -> SqlSafe:
    """
    Format as ISO datetime for DB. None -> 'NULL'.
    """
    if value is None:
        return _safe("NULL")
    dt = value
    if isinstance(dt, str):
        # accept ISO-like string; wrap in quotes
        return _safe(f"'{dt}'")
    if isinstance(dt, (datetime, date)):
        if isinstance(dt, date) and not isinstance(dt, datetime):
            dt = datetime.combine(dt, datetime.min.time())
        return _safe(f"'{dt.isoformat()}'")
    return _safe("NULL")


def in_list(value: Any) -> SqlSafe:
    """
    Turn list/iterable into SQL IN clause: (1, 2, 3). Empty -> (SELECT 1 WHERE 1=0).
    Elements are string-escaped if not int/float/bool/None.
    """
    if value is None:
        return _safe("(SELECT 1 WHERE 1=0)")
    try:
        it = list(value)
    except (TypeError, ValueError):
        return _safe("(SELECT 1 WHERE 1=0)")
    if not it:
        return _safe("(SELECT 1 WHERE 1=0)")
    parts = []
    for v in it:
        if v is None:
            parts.append("NULL")
        elif isinstance(v, bool):
            parts.append("TRUE" if v else "FALSE")
        elif isinstance(v, (int, float)):
            parts.append(str(v))
        else:
            s = str(v).translate(_SQL_QUOTE_ESCAPE)
            parts.append(f"'{s}'")
    return _safe("(" + ", ".join(parts) + ")")


def _escape_like(s: str) -> str:
    """Escape % and _ for use in LIKE patterns."""
    return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def sql_like(value: Any) -> SqlSafe:
    """
    Escape % and _ for LIKE; wrap in quotes. None -> 'NULL'.
    Use when the full value is a LIKE pattern (contains % or _ as wildcards intentionally).
    For user input, use sql_like_start or sql_like_end, or escape manually.
    """
    if value is None:
        return _safe("NULL")
    return _safe(f"'{_escape_like(str(value))}'")


def sql_like_start(value: Any) -> SqlSafe:
    """
    Prefix match: escape user input and add trailing %. None -> 'NULL'.
    """
    if value is None:
        return _safe("NULL")
    return _safe(f"'{_escape_like(str(value))}%'")


def sql_like_end(value: Any) -> SqlSafe:
    """
    Suffix match: escape user input and add leading %. None -> 'NULL'.
    """
    if value is None:
        return _safe("NULL")
    return _safe(f"'%{_escape_like(str(value))}'")


def _json_filter(value: Any) -> SqlSafe:
    """
    JSON/JSONB: serialize to string and single-quote escape. None -> 'NULL'.
    """
    if value is None:
        return _safe("NULL")
    try:
        s = json.dumps(value, default=str)
    except (TypeError, ValueError):
        return _safe("NULL")
    s = s.translate(_SQL_QUOTE_ESCAPE)
    return _safe(f"'{s}'")


def sql_raw(value: Any) -> SqlSafe:
    """Mark a value as raw SQL — bypass auto-escape entirely.

    Use for trusted identifiers like table/column names that the API
    developer controls.  NEVER use on untrusted user input.

    Template usage: ``{{ table_name | sql_raw }}``
    """
    if value is None:
        return _safe("NULL")
    return _safe(str(value))


# ---------------------------------------------------------------------------
# Finalize callback – auto-escape for {{ }} without explicit filter
# ---------------------------------------------------------------------------


def sql_finalize(value: Any) -> str:
    """Jinja2 ``finalize`` callback: auto-escape any ``{{ }}`` output that
    was *not* processed by an explicit SQL filter (i.e. not ``SqlSafe``).

    * ``SqlSafe`` → pass through (already escaped by filter).
    * ``None`` → ``"NULL"``.
    * ``int`` / ``float`` → str (safe numeric literal).
    * ``bool`` → ``"TRUE"`` / ``"FALSE"``.
    * ``list`` / ``tuple`` → ``in_list()`` (e.g. ``(1, 2, 3)``).
    * ``dict`` → ``_json_filter()`` (JSON-serialised + quoted).
    * ``date`` / ``datetime`` → ``sql_datetime()`` / ``sql_date()``.
    * Everything else → ``sql_string()`` (single-quote + escape).
    """
    if isinstance(value, SqlSafe):
        return str(value)
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, (list, tuple)):
        return in_list(value)
    if isinstance(value, dict):
        return _json_filter(value)
    if isinstance(value, datetime):
        return sql_datetime(value)
    if isinstance(value, date):
        return sql_date(value)
    return sql_string(value)


# Collection of all filters to register in Jinja2 Environment
SQL_FILTERS: dict[str, Any] = {
    "sql_string": sql_string,
    "sql_int": sql_int,
    "sql_float": sql_float,
    "sql_bool": sql_bool,
    "sql_date": sql_date,
    "sql_datetime": sql_datetime,
    "in_list": in_list,
    "sql_like": sql_like,
    "sql_like_start": sql_like_start,
    "sql_like_end": sql_like_end,
    "json": _json_filter,
    "sql_raw": sql_raw,
    "safe": sql_raw,
}
