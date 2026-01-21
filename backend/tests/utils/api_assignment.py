"""Test helpers for ApiAssignment."""

import uuid

from sqlmodel import Session

from app.models_dbapi import (
    ApiAssignment,
    ApiContext,
    ExecuteEngineEnum,
    HttpMethodEnum,
)
from tests.utils.module import create_random_module
from tests.utils.utils import random_lower_string


def create_random_assignment(
    db: Session,
    *,
    module_id: uuid.UUID | None = None,
    name: str | None = None,
    path: str | None = None,
    http_method: HttpMethodEnum = HttpMethodEnum.GET,
    execute_engine: ExecuteEngineEnum = ExecuteEngineEnum.SQL,
    datasource_id: uuid.UUID | None = None,
    description: str | None = None,
    is_published: bool = False,
    sort_order: int = 0,
    content: str | None = None,
) -> ApiAssignment:
    """Create an ApiAssignment in the DB. Creates a module if module_id not given."""
    if module_id is None:
        mod = create_random_module(db)
        module_id = mod.id
    a = ApiAssignment(
        module_id=module_id,
        name=name or f"api-{random_lower_string()}",
        path=path or "items",
        http_method=http_method,
        execute_engine=execute_engine,
        datasource_id=datasource_id,
        description=description,
        is_published=is_published,
        sort_order=sort_order,
    )
    db.add(a)
    db.flush()
    if content is not None:
        ctx = ApiContext(api_assignment_id=a.id, content=content)
        db.add(ctx)
    db.commit()
    db.refresh(a)
    return a
