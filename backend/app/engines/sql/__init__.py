"""
SQL template engine (Jinja2) for Phase 3, Task 3.2.

Exports: SQLTemplateEngine, parse_parameters, execute_sql.
"""

from app.engines.sql.executor import execute_sql
from app.engines.sql.parser import parse_parameters
from app.engines.sql.template_engine import SQLTemplateEngine

__all__ = [
    "SQLTemplateEngine",
    "parse_parameters",
    "execute_sql",
]
