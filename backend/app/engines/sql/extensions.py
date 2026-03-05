"""
Optional custom Jinja2 tags for SQL template engine (Phase 3, Task 3.2).

{% where %}: combine conditions, add WHERE and strip leading AND/OR.
{% set %} is built-in in Jinja2; no custom implementation needed.
"""

import re

from jinja2 import nodes
from jinja2.ext import Extension


class WhereExtension(Extension):
    """
    {% where %} ... {% endwhere %}
    {% where operation="OR" %} ... {% endwhere %}
    Renders the block, strips leading AND/OR and surrounding whitespace,
    and prefixes with 'WHERE ' if the result is non-empty.
    When operation="OR", replaces AND connectors between conditions with OR.
    Default operation is "AND" (existing behaviour).
    """

    tags = {"where"}

    def parse(self, parser) -> nodes.CallBlock:
        token = next(parser.stream)
        lineno = token.lineno

        # Parse optional keyword argument: operation="AND"|"OR"
        if parser.stream.current.test("name:operation"):
            next(parser.stream)
            parser.stream.expect("assign")
            operation = parser.parse_expression()
        else:
            operation = nodes.Const("AND")

        body = parser.parse_statements(("name:endwhere",), drop_needle=True)
        return nodes.CallBlock(
            self.call_method("_render_where", [operation]),
            [],
            [],
            body,
        ).set_lineno(lineno)

    def _render_where(self, operation: str, caller: object) -> str:
        inner = caller()
        if not inner or not isinstance(inner, str):
            return ""

        op = operation.upper().strip() if isinstance(operation, str) else "AND"
        if op not in ("AND", "OR"):
            op = "AND"

        # Strip leading AND/OR and surrounding whitespace
        s = inner.strip()
        s = re.sub(r"^\s*AND\s+", "", s, flags=re.IGNORECASE)
        s = re.sub(r"^\s*OR\s+", "", s, flags=re.IGNORECASE)
        s = s.strip()
        if not s:
            return ""

        if op == "OR":
            s = re.sub(r"\bAND\b", "OR", s, flags=re.IGNORECASE)

        return "WHERE " + s


# List of extensions to pass to Jinja2 Environment
SQL_EXTENSIONS: list[type[Extension]] = [WhereExtension]
