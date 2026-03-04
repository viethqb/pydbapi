"""Test helpers for ApiMacroDef."""

import uuid

from sqlmodel import Session

from app.models_dbapi import ApiMacroDef, MacroTypeEnum
from tests.utils.utils import random_lower_string


def create_random_macro_def(
    db: Session,
    *,
    module_id: uuid.UUID | None = None,
    name: str | None = None,
    macro_type: MacroTypeEnum = MacroTypeEnum.JINJA,
    content: str = "{% macro test_macro() %}SELECT 1{% endmacro %}",
    description: str | None = None,
) -> ApiMacroDef:
    """Create an ApiMacroDef in the DB."""
    m = ApiMacroDef(
        module_id=module_id,
        name=name or f"macro-{random_lower_string()}",
        macro_type=macro_type,
        content=content,
        description=description,
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    return m
