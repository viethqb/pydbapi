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
    Renders the block, strips leading AND/OR and surrounding whitespace,
    and prefixes with 'WHERE ' if the result is non-empty.
    """

    tags = {"where"}

    def parse(self, parser) -> nodes.CallBlock:
        token = next(parser.stream)
        lineno = token.lineno
        body = parser.parse_statements(("name:endwhere",), drop_needle=True)
        return nodes.CallBlock(
            self.call_method("_render_where", [], [], []),
            [],
            [],
            body,
        ).set_lineno(lineno)

    def _render_where(self, caller: object) -> str:
        inner = caller()
        if not inner or not isinstance(inner, str):
            return ""
        # Strip leading AND/OR and surrounding whitespace
        s = inner.strip()
        s = re.sub(r"^\s*AND\s+", "", s, flags=re.IGNORECASE)
        s = re.sub(r"^\s*OR\s+", "", s, flags=re.IGNORECASE)
        s = s.strip()
        if not s:
            return ""
        return "WHERE " + s


# List of extensions to pass to Jinja2 Environment
SQL_EXTENSIONS: list[type[Extension]] = [WhereExtension]
