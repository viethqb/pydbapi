"""
SQL template engine with Jinja2 (Phase 3, Task 3.2).

Renders SQL from template + params; parses parameter names from template.

Security: ``sql_finalize`` auto-escapes every ``{{ }}`` output that was
not already processed by an explicit SQL filter.  This means ``{{ name }}``
is safe by default (escaped as a quoted string).  Use type-specific
filters (``| sql_int``, ``| sql_string``, etc.) for explicit control.

Performance: Compiled Jinja2 ``Template`` objects are cached in an LRU
dict keyed by template source hash so repeated calls with the same SQL
template skip the parse phase entirely.
"""

import hashlib
import threading
from collections import OrderedDict

from jinja2 import Environment, Template, TemplateError, TemplateSyntaxError, UndefinedError, meta

from app.engines.sql.extensions import SQL_EXTENSIONS
from app.engines.sql.filters import SQL_FILTERS, sql_finalize

_SQL_ENV: Environment | None = None

_CACHE_MAX_SIZE = 512
_template_cache: OrderedDict[str, Template] = OrderedDict()
_cache_lock = threading.Lock()


def _get_sql_env() -> Environment:
    """Return the shared Jinja2 Environment for SQL (filters, extensions,
    sql_finalize auto-escape)."""
    global _SQL_ENV
    if _SQL_ENV is None:
        _SQL_ENV = Environment(
            autoescape=False,
            extensions=SQL_EXTENSIONS,
            finalize=sql_finalize,
        )
        _SQL_ENV.filters.update(SQL_FILTERS)
    return _SQL_ENV


def _compile_cached(env: Environment, source: str) -> Template:
    """Return a compiled ``Template`` from cache or compile & cache it."""
    key = hashlib.md5(source.encode(), usedforsecurity=False).hexdigest()
    with _cache_lock:
        tpl = _template_cache.get(key)
        if tpl is not None:
            _template_cache.move_to_end(key)
            return tpl
    tpl = env.from_string(source)
    with _cache_lock:
        _template_cache[key] = tpl
        if len(_template_cache) > _CACHE_MAX_SIZE:
            _template_cache.popitem(last=False)
    return tpl


class SQLTemplateEngine:
    """Renders Jinja2 SQL templates and parses parameter names."""

    def render(self, template: str, params: dict) -> str:
        """Render *template* with *params* to a final SQL string."""
        env = _get_sql_env()
        try:
            t = _compile_cached(env, template)
            return t.render(**params)
        except TemplateSyntaxError as e:
            snippet = template[:500] + "..." if len(template) > 500 else template
            hint = (
                "Tip: Don't nest {{ }} inside {% %} (e.g. use {% set x = paginate(limit, offset) %}, "
                "not {% set x = {{ paginate(limit, offset) }} %})."
            )
            raise ValueError(
                f"SQL template syntax error: {e}. "
                f"Params: {list(params.keys())}. {hint} Template preview:\n{snippet}"
            ) from e
        except UndefinedError as e:
            raise ValueError(
                f"SQL template variable not found: {e}. "
                f"Available params: {list(params.keys())}."
            ) from e
        except TemplateError as e:
            snippet = template[:500] + "..." if len(template) > 500 else template
            raise ValueError(
                f"SQL template render error: {e}. "
                f"Params: {list(params.keys())}. Template preview:\n{snippet}"
            ) from e

    def parse_parameters(self, template: str) -> list[str]:
        """Extract variable names used in ``{{ }}`` and ``{% %}`` (undeclared)."""
        env = _get_sql_env()
        ast = env.parse(template)
        names = meta.find_undeclared_variables(ast)
        return sorted(names)
