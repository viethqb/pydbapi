"""
Static analysis for SQL templates — detect potential injection risks.

Scans Jinja2 SQL templates for ``{{ variable }}`` expressions that are not
piped through an explicit SQL filter (``sql_string``, ``sql_int``, etc.).

With the ``finalize`` auto-escape in place these are no longer *exploitable*,
but a warning still helps API developers use the correct type-specific filter
(e.g. ``sql_int`` for integers instead of relying on the string-based
auto-escape default).

Usage::

    warnings = check_sql_template_safety(template_content)
    # [{"variable": "name", "line": 3, "message": "..."}]
"""

import re
from typing import Any

from app.engines.sql.filters import SQL_FILTERS

_KNOWN_FILTERS = set(SQL_FILTERS.keys()) | {"int", "float", "string"}

_VAR_PATTERN = re.compile(
    r"\{\{(?P<expr>.*?)\}\}",
    re.DOTALL,
)


def _extract_filters(expr: str) -> list[str]:
    """Return filter names applied in a ``{{ expr | f1 | f2 }}`` expression."""
    parts = expr.split("|")
    if len(parts) <= 1:
        return []
    filters: list[str] = []
    for part in parts[1:]:
        name = part.strip().split("(")[0].strip()
        if name:
            filters.append(name)
    return filters


def check_sql_template_safety(template: str) -> list[dict[str, Any]]:
    """Analyse a SQL Jinja2 template and return warnings for expressions
    that don't use an explicit SQL filter.

    Each warning is a dict with ``variable``, ``line``, and ``message`` keys.

    An empty list means no issues detected.
    """
    warnings: list[dict[str, Any]] = []
    lines = template.split("\n")

    for line_no, line_text in enumerate(lines, start=1):
        for match in _VAR_PATTERN.finditer(line_text):
            expr = match.group("expr").strip()
            if not expr:
                continue
            filters = _extract_filters(expr)
            if filters:
                has_sql_filter = any(f in _KNOWN_FILTERS for f in filters)
                if has_sql_filter:
                    continue

            var_name = expr.split("|")[0].strip().split(".")[0].split("[")[0].strip()
            warnings.append(
                {
                    "variable": var_name,
                    "line": line_no,
                    "message": (
                        f"'{{{{ {var_name} }}}}' has no explicit SQL filter. "
                        f"It will be auto-escaped as a quoted string. "
                        f"Consider using a type-specific filter: "
                        f"| sql_string, | sql_int, | sql_float, | sql_datetime, etc."
                    ),
                }
            )

    return warnings
