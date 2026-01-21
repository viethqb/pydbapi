"""
Custom Jinja2 filters for SQL template engine (Phase 3, Task 3.2).

Escape/validate to avoid SQL injection; handle None appropriately.
"""

import json
from datetime import date, datetime
from typing import Any

# Single-quote escape for SQL strings
_SQL_QUOTE_ESCAPE = str.maketrans({"'": "''"})


def sql_string(value: Any) -> str:
    """
    Escape string for SQL. None -> 'NULL' (literal); otherwise single-quote escape.
    """
    if value is None:
        return "NULL"
    s = str(value).translate(_SQL_QUOTE_ESCAPE)
    return f"'{s}'"


def sql_int(value: Any) -> str:
    """
    Validate and format as integer. None -> 'NULL'.
    """
    if value is None:
        return "NULL"
    try:
        return str(int(value))
    except (TypeError, ValueError):
        return "NULL"


def sql_float(value: Any) -> str:
    """
    Validate and format as float. None -> 'NULL'.
    """
    if value is None:
        return "NULL"
    try:
        return str(float(value))
    except (TypeError, ValueError):
        return "NULL"


def sql_bool(value: Any) -> str:
    """
    Format as SQL boolean. None -> 'NULL'.
    Postgres: TRUE/FALSE; MySQL: 1/0. We use TRUE/FALSE (works in both).
    """
    if value is None:
        return "NULL"
    return "TRUE" if bool(value) else "FALSE"


def sql_date(value: Any) -> str:
    """
    Format as ISO date 'YYYY-MM-DD' for DB. None -> 'NULL'.
    """
    if value is None:
        return "NULL"
    d = value
    if isinstance(d, datetime):
        d = d.date()
    if isinstance(d, date):
        return f"'{d.isoformat()}'"
    if isinstance(d, str):
        # minimal validation: expect YYYY-MM-DD
        if len(d) >= 10 and d[4] == "-" and d[7] == "-":
            return f"'{d[:10]}'"
    return "NULL"


def sql_datetime(value: Any) -> str:
    """
    Format as ISO datetime for DB. None -> 'NULL'.
    """
    if value is None:
        return "NULL"
    dt = value
    if isinstance(dt, str):
        # accept ISO-like string; wrap in quotes
        return f"'{dt}'"
    if isinstance(dt, (datetime, date)):
        if isinstance(dt, date) and not isinstance(dt, datetime):
            dt = datetime.combine(dt, datetime.min.time())
        return f"'{dt.isoformat()}'"
    return "NULL"


def in_list(value: Any) -> str:
    """
    Turn list/iterable into SQL IN clause: (1, 2, 3). Empty -> (SELECT 1 WHERE 1=0).
    Elements are string-escaped if not int/float/bool/None.
    """
    if value is None:
        return "(SELECT 1 WHERE 1=0)"
    try:
        it = list(value)
    except (TypeError, ValueError):
        return "(SELECT 1 WHERE 1=0)"
    if not it:
        return "(SELECT 1 WHERE 1=0)"
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
    return "(" + ", ".join(parts) + ")"


def _escape_like(s: str) -> str:
    """Escape % and _ for use in LIKE patterns."""
    return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def sql_like(value: Any) -> str:
    """
    Escape % and _ for LIKE; wrap in quotes. None -> 'NULL'.
    Use when the full value is a LIKE pattern (contains % or _ as wildcards intentionally).
    For user input, use sql_like_start or sql_like_end, or escape manually.
    """
    if value is None:
        return "NULL"
    return f"'{_escape_like(str(value))}'"


def sql_like_start(value: Any) -> str:
    """
    Prefix match: escape user input and add trailing %. None -> 'NULL'.
    """
    if value is None:
        return "NULL"
    return f"'{_escape_like(str(value))}%'"


def sql_like_end(value: Any) -> str:
    """
    Suffix match: escape user input and add leading %. None -> 'NULL'.
    """
    if value is None:
        return "NULL"
    return f"'%{_escape_like(str(value))}'"


def _json_filter(value: Any) -> str:
    """
    JSON/JSONB: serialize to string and single-quote escape. None -> 'NULL'.
    """
    if value is None:
        return "NULL"
    try:
        s = json.dumps(value, default=str)
    except (TypeError, ValueError):
        return "NULL"
    s = s.translate(_SQL_QUOTE_ESCAPE)
    return f"'{s}'"


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
}
