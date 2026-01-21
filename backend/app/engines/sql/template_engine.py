"""
SQL template engine with Jinja2 (Phase 3, Task 3.2).

Renders SQL from template + params; parses parameter names from template.
"""

from jinja2 import Environment, meta

from app.engines.sql.extensions import SQL_EXTENSIONS
from app.engines.sql.filters import SQL_FILTERS

# No HTML autoescape for SQL
_SQL_ENV: Environment | None = None


def _get_sql_env() -> Environment:
    """Return the shared Jinja2 Environment for SQL (filters, extensions, no autoescape)."""
    global _SQL_ENV
    if _SQL_ENV is None:
        _SQL_ENV = Environment(
            autoescape=False,
            extensions=SQL_EXTENSIONS,
        )
        _SQL_ENV.filters.update(SQL_FILTERS)
    return _SQL_ENV


class SQLTemplateEngine:
    """
    Renders Jinja2 SQL templates and parses parameter names.
    """

    def render(self, template: str, params: dict) -> str:
        """
        Render template with params to final SQL string.
        """
        env = _get_sql_env()
        t = env.from_string(template)
        return t.render(**params)

    def parse_parameters(self, template: str) -> list[str]:
        """
        Extract variable names used in {{ ... }} and {% ... %} (undeclared in template).
        """
        env = _get_sql_env()
        ast = env.parse(template)
        names = meta.find_undeclared_variables(ast)
        return sorted(names)
