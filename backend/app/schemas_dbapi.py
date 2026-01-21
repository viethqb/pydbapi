"""
Pydantic schemas for DBAPI Phase 2 APIs.

DataSource, ApiAssignment, ApiModule, ApiGroup, AppClient, etc.
"""

import uuid
from datetime import datetime

from pydantic import Field
from sqlmodel import SQLModel

from app.models_dbapi import ProductTypeEnum

# ---------------------------------------------------------------------------
# DataSource (Task 2.1)
# ---------------------------------------------------------------------------


class DataSourceCreate(SQLModel):
    """Body for POST /datasources/create."""

    name: str = Field(..., min_length=1, max_length=255)
    product_type: ProductTypeEnum
    host: str = Field(..., min_length=1, max_length=255)
    port: int = Field(default=5432, ge=1, le=65535)
    database: str = Field(..., min_length=1, max_length=255)
    username: str = Field(..., min_length=1, max_length=255)
    password: str = Field(..., min_length=1, max_length=512)
    driver_version: str | None = Field(default=None, max_length=64)
    description: str | None = Field(default=None, max_length=512)
    is_active: bool = Field(default=True)


class DataSourceUpdate(SQLModel):
    """Body for POST /datasources/update; id required, others optional."""

    id: uuid.UUID
    name: str | None = Field(default=None, min_length=1, max_length=255)
    product_type: ProductTypeEnum | None = None
    host: str | None = Field(default=None, min_length=1, max_length=255)
    port: int | None = Field(default=None, ge=1, le=65535)
    database: str | None = Field(default=None, min_length=1, max_length=255)
    username: str | None = Field(default=None, min_length=1, max_length=255)
    password: str | None = Field(default=None, min_length=1, max_length=512)
    driver_version: str | None = None
    description: str | None = None
    is_active: bool | None = None


class DataSourcePublic(SQLModel):
    """Response schema; password omitted for security."""

    id: uuid.UUID
    name: str
    product_type: ProductTypeEnum
    host: str
    port: int
    database: str
    username: str
    driver_version: str | None
    description: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class DataSourceListIn(SQLModel):
    """Body for POST /datasources/list; pagination and optional filters."""

    page: int = Field(default=1, ge=1, description="1-based page number")
    page_size: int = Field(default=20, ge=1, le=100, description="Items per page")
    product_type: ProductTypeEnum | None = None
    is_active: bool | None = None
    name__ilike: str | None = Field(default=None, max_length=255)


class DataSourceListOut(SQLModel):
    """Paginated list of datasources."""

    data: list[DataSourcePublic]
    total: int


class DataSourcePreTestIn(SQLModel):
    """Body for POST /datasources/preTest; connection params only."""

    product_type: ProductTypeEnum
    host: str = Field(..., min_length=1, max_length=255)
    port: int = Field(default=5432, ge=1, le=65535)
    database: str = Field(..., min_length=1, max_length=255)
    username: str = Field(..., min_length=1, max_length=255)
    password: str = Field(..., min_length=1, max_length=512)


class DataSourceTestResult(SQLModel):
    """Response for /datasources/test/{id} and /datasources/preTest."""

    ok: bool
    message: str


# ---------------------------------------------------------------------------
# ApiModule (Task 2.3)
# ---------------------------------------------------------------------------


class ApiModuleCreate(SQLModel):
    """Body for POST /modules/create."""

    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=512)
    path_prefix: str = Field(default="/", max_length=255)
    sort_order: int = Field(default=0)
    is_active: bool = Field(default=True)


class ApiModuleUpdate(SQLModel):
    """Body for POST /modules/update; id required, others optional."""

    id: uuid.UUID
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    path_prefix: str | None = Field(default=None, max_length=255)
    sort_order: int | None = None
    is_active: bool | None = None


class ApiModulePublic(SQLModel):
    """Response schema for ApiModule."""

    id: uuid.UUID
    name: str
    description: str | None
    path_prefix: str
    sort_order: int
    is_active: bool
    created_at: datetime
    updated_at: datetime


class ApiModuleListIn(SQLModel):
    """Body for POST /modules/list; pagination and optional filters."""

    page: int = Field(default=1, ge=1, description="1-based page number")
    page_size: int = Field(default=20, ge=1, le=100, description="Items per page")
    name__ilike: str | None = Field(default=None, max_length=255)
    is_active: bool | None = None


class ApiModuleListOut(SQLModel):
    """Paginated list of ApiModule."""

    data: list[ApiModulePublic]
    total: int


# ---------------------------------------------------------------------------
# ApiGroup (Task 2.3)
# ---------------------------------------------------------------------------


class ApiGroupCreate(SQLModel):
    """Body for POST /groups/create."""

    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=512)
    is_active: bool = Field(default=True)


class ApiGroupUpdate(SQLModel):
    """Body for POST /groups/update; id required, others optional."""

    id: uuid.UUID
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    is_active: bool | None = None


class ApiGroupPublic(SQLModel):
    """Response schema for ApiGroup."""

    id: uuid.UUID
    name: str
    description: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class ApiGroupDetail(SQLModel):
    """Detail response for GET /groups/{id}; includes api_assignment_ids."""

    id: uuid.UUID
    name: str
    description: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime
    api_assignment_ids: list[uuid.UUID] = Field(default_factory=list)


class ApiGroupListIn(SQLModel):
    """Body for POST /groups/list; pagination and optional filters."""

    page: int = Field(default=1, ge=1, description="1-based page number")
    page_size: int = Field(default=20, ge=1, le=100, description="Items per page")
    name__ilike: str | None = Field(default=None, max_length=255)
    is_active: bool | None = None


class ApiGroupListOut(SQLModel):
    """Paginated list of ApiGroup."""

    data: list[ApiGroupPublic]
    total: int
