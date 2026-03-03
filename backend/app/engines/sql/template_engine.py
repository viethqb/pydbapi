"""
SQL template engine with Jinja2 (Phase 3, Task 3.2).

Renders SQL from template + params; parses parameter names from template.

Security: ``sql_finalize`` auto-escapes every ``{{ }}`` output that was
not already processed by an explicit SQL filter.  This means ``{{ name }}``
is safe by default (escaped as a quoted string).  Use type-specific
filters (``| sql_int``, ``| sql_string``, etc.) for explicit control.

Macros: Jinja2 macro call results (``{{ my_macro(args) }}``) are marked
as ``SqlSafe`` so that ``sql_finalize`` passes them through without
double-escaping.  Individual ``{{ }}`` expressions inside the macro body
are still finalized normally.

Performance: Compiled Jinja2 ``Template`` objects are cached in an LRU
dict keyed by template source hash so repeated calls with the same SQL
template skip the parse phase entirely.
"""

import hashlib
import threading
from collections import OrderedDict

import jinja2.runtime
from jinja2 import Template, TemplateError, TemplateSyntaxError, UndefinedError, meta
from jinja2.sandbox import SandboxedEnvironment

from app.core.config import settings
from app.engines.sql.extensions import SQL_EXTENSIONS
from app.engines.sql.filters import SQL_FILTERS, SqlSafe, sql_finalize

_SQL_ENV: SandboxedEnvironment | None = None

_CACHE_MAX_SIZE = 512
_template_cache: OrderedDict[str, Template] = OrderedDict()
_cache_lock = threading.Lock()

# ---------------------------------------------------------------------------
# Patch Jinja2 Macro.__call__ so that macro return values are marked as
# SqlSafe.  Without this, ``{{ my_macro(args) }}`` would pass the rendered
# SQL fragment through ``sql_finalize`` → ``sql_string()`` which wraps it
# in single quotes, breaking the SQL.
#
# The patch only applies when the macro belongs to our SQL environment
# (identified by the ``_sql_safe_macros`` flag) so other Jinja2 usage in
# the process is unaffected.
# ---------------------------------------------------------------------------
_original_macro_call = jinja2.runtime.Macro.__call__


def _sql_safe_macro_call(self, *args, **kwargs):
    rv = _original_macro_call(self, *args, **kwargs)
    if isinstance(rv, str) and getattr(self._environment, "_sql_safe_macros", False):
        return SqlSafe(rv)
    return rv


jinja2.runtime.Macro.__call__ = _sql_safe_macro_call


def _get_sql_env() -> SandboxedEnvironment:
    """Return the shared Jinja2 SandboxedEnvironment for SQL (filters,
    extensions, sql_finalize auto-escape)."""
    global _SQL_ENV
    if _SQL_ENV is None:
        _SQL_ENV = SandboxedEnvironment(
            autoescape=False,
            extensions=SQL_EXTENSIONS,
            finalize=sql_finalize,
        )
        _SQL_ENV.filters.update(SQL_FILTERS)
        _SQL_ENV._sql_safe_macros = True  # type: ignore[attr-defined]
    return _SQL_ENV


def _compile_cached(env: SandboxedEnvironment, source: str) -> Template:
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
        max_src = settings.SQL_TEMPLATE_MAX_SIZE
        if max_src and len(template) > max_src:
            raise ValueError(
                f"SQL template too large ({len(template)} bytes, "
                f"limit {max_src}). Reduce template size or raise "
                f"SQL_TEMPLATE_MAX_SIZE."
            )
        env = _get_sql_env()
        try:
            t = _compile_cached(env, template)
            rendered = t.render(**params)
            max_out = settings.SQL_RENDERED_MAX_SIZE
            if max_out and len(rendered) > max_out:
                raise ValueError(
                    f"Rendered SQL too large ({len(rendered)} bytes, "
                    f"limit {max_out}). Simplify query or raise "
                    f"SQL_RENDERED_MAX_SIZE."
                )
            return rendered
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
