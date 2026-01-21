"""
DataSource management (Phase 2, Task 2.1).

Endpoints: types, drivers, list, create, update, delete, test, preTest.
Phase 3: test/preTest use core.pool.connect + health_check.
"""

import uuid
from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from sqlmodel import func, select

from app.api.deps import CurrentUser, SessionDep
from app.core.pool import connect, health_check
from app.models import Message
from app.models_dbapi import DataSource, ProductTypeEnum
from app.schemas_dbapi import (
    DataSourceCreate,
    DataSourceListIn,
    DataSourceListOut,
    DataSourcePreTestIn,
    DataSourcePublic,
    DataSourceTestResult,
    DataSourceUpdate,
)

router = APIRouter(prefix="/datasources", tags=["datasources"])

# Supported DB types (Phase 2: postgres, mysql only)
DATASOURCE_TYPES: list[str] = [
    ProductTypeEnum.POSTGRES.value,
    ProductTypeEnum.MYSQL.value,
]

# Default driver label per type (Phase 2: single option; Phase 3: no driver layer, can remove later)
DRIVERS_BY_TYPE: dict[str, list[str]] = {
    ProductTypeEnum.POSTGRES.value: ["default"],
    ProductTypeEnum.MYSQL.value: ["default"],
}


def _test_connection(datasource: DataSource | DataSourcePreTestIn) -> tuple[bool, str]:
    """Connect, run SELECT 1, close. Uses core.pool (Phase 3)."""
    try:
        conn = connect(datasource)
        health_check(conn, datasource.product_type)
        conn.close()
        return True, "Connection successful"
    except Exception as e:
        return False, str(e)


def _to_public(ds: DataSource) -> DataSourcePublic:
    """Build DataSourcePublic from DataSource (excludes password)."""
    return DataSourcePublic(
        id=ds.id,
        name=ds.name,
        product_type=ds.product_type,
        host=ds.host,
        port=ds.port,
        database=ds.database,
        username=ds.username,
        driver_version=ds.driver_version,
        description=ds.description,
        is_active=ds.is_active,
        created_at=ds.created_at,
        updated_at=ds.updated_at,
    )


@router.get("/types", response_model=list[str])
def get_types(current_user: CurrentUser) -> Any:  # noqa: ARG001
    """List supported database types (postgres, mysql initially)."""
    return DATASOURCE_TYPES


@router.get("/{type}/drivers", response_model=dict[str, list[str]])
def get_drivers(
    current_user: CurrentUser,  # noqa: ARG001
    type: Literal["postgres", "mysql"],
) -> Any:
    """List driver versions for the given database type."""
    return {"drivers": DRIVERS_BY_TYPE.get(type, ["default"])}


def _list_filters(stmt: Any, body: DataSourceListIn) -> Any:
    """Apply optional filters to a DataSource select statement."""
    if body.product_type is not None:
        stmt = stmt.where(DataSource.product_type == body.product_type)
    if body.is_active is not None:
        stmt = stmt.where(DataSource.is_active == body.is_active)
    if body.name__ilike:
        stmt = stmt.where(DataSource.name.ilike(f"%{body.name__ilike}%"))
    return stmt


@router.post("/list", response_model=DataSourceListOut)
def list_datasources(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    body: DataSourceListIn,
) -> Any:
    """List datasources with pagination and optional filters."""
    count_stmt = _list_filters(select(func.count()).select_from(DataSource), body)
    total = session.exec(count_stmt).one()

    stmt = _list_filters(select(DataSource), body)
    offset = (body.page - 1) * body.page_size
    stmt = stmt.order_by(DataSource.name).offset(offset).limit(body.page_size)
    rows = session.exec(stmt).all()

    return DataSourceListOut(data=[_to_public(r) for r in rows], total=total)


@router.post("/create", response_model=DataSourcePublic)
def create_datasource(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    body: DataSourceCreate,
) -> Any:
    """Create a new datasource."""
    ds = DataSource.model_validate(body)
    session.add(ds)
    session.commit()
    session.refresh(ds)
    return _to_public(ds)


@router.post("/update", response_model=DataSourcePublic)
def update_datasource(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    body: DataSourceUpdate,
) -> Any:
    """Update an existing datasource."""
    ds = session.get(DataSource, body.id)
    if not ds:
        raise HTTPException(status_code=404, detail="DataSource not found")
    update = body.model_dump(exclude_unset=True, exclude={"id"})
    ds.sqlmodel_update(update)
    session.add(ds)
    session.commit()
    session.refresh(ds)
    return _to_public(ds)


@router.delete("/delete/{id}", response_model=Message)
def delete_datasource(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    id: uuid.UUID,
) -> Any:
    """Delete a datasource by id."""
    ds = session.get(DataSource, id)
    if not ds:
        raise HTTPException(status_code=404, detail="DataSource not found")
    session.delete(ds)
    session.commit()
    return Message(message="DataSource deleted successfully")


@router.get("/test/{id}", response_model=DataSourceTestResult)
def test_datasource(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    id: uuid.UUID,
) -> Any:
    """Test connection for an existing datasource."""
    ds = session.get(DataSource, id)
    if not ds:
        raise HTTPException(status_code=404, detail="DataSource not found")
    ok, message = _test_connection(ds)
    return DataSourceTestResult(ok=ok, message=message)


@router.post("/preTest", response_model=DataSourceTestResult)
def pre_test_datasource(
    current_user: CurrentUser,  # noqa: ARG001
    body: DataSourcePreTestIn,
) -> Any:
    """Test connection before saving (connection params in body)."""
    ok, message = _test_connection(body)
    return DataSourceTestResult(ok=ok, message=message)
