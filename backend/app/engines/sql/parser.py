"""
Parse parameter names from a Jinja2 SQL template (Phase 3, Task 3.2).

Re-exports parse_parameters from template_engine (uses Jinja2 meta.find_undeclared_variables).
"""

from app.engines.sql.template_engine import SQLTemplateEngine


def parse_parameters(template: str) -> list[str]:
    """
    Extract variable names used in {{ ... }} and {% ... %} (undeclared in template).

    Returns a list of parameter names that should be provided in params for render().
    """
    return SQLTemplateEngine().parse_parameters(template)
