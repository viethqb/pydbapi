"""
Pydantic schemas for DBAPI Phase 2 APIs.

DataSource, ApiAssignment, ApiModule, ApiGroup, AppClient, etc.
"""

import uuid
from datetime import datetime

from pydantic import Field
from sqlmodel import SQLModel

from app.models_dbapi import ExecuteEngineEnum, HttpMethodEnum, ProductTypeEnum

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


# ---------------------------------------------------------------------------
# ApiAssignment + ApiContext (Task 2.2)
# ---------------------------------------------------------------------------


class ApiAssignmentCreate(SQLModel):
    """Body for POST /api-assignments/create."""

    module_id: uuid.UUID
    name: str = Field(..., min_length=1, max_length=255)
    path: str = Field(..., min_length=1, max_length=255)
    http_method: HttpMethodEnum
    execute_engine: ExecuteEngineEnum
    datasource_id: uuid.UUID | None = None
    description: str | None = Field(default=None, max_length=512)
    sort_order: int = Field(default=0)
    content: str | None = Field(default=None, description="SQL/script → ApiContext (1-1)")
    group_ids: list[uuid.UUID] = Field(default_factory=list, description="ApiGroup IDs to link")


class ApiAssignmentUpdate(SQLModel):
    """Body for POST /api-assignments/update; id required, others optional."""

    id: uuid.UUID
    module_id: uuid.UUID | None = None
    name: str | None = Field(default=None, min_length=1, max_length=255)
    path: str | None = Field(default=None, min_length=1, max_length=255)
    http_method: HttpMethodEnum | None = None
    execute_engine: ExecuteEngineEnum | None = None
    datasource_id: uuid.UUID | None = None
    description: str | None = None
    sort_order: int | None = None
    content: str | None = None
    group_ids: list[uuid.UUID] | None = Field(default=None, description="If set, replace group links")


class ApiContextPublic(SQLModel):
    """Response schema for ApiContext (included in ApiAssignmentDetail)."""

    id: uuid.UUID
    api_assignment_id: uuid.UUID
    content: str
    created_at: datetime
    updated_at: datetime


class ApiAssignmentPublic(SQLModel):
    """Response schema for ApiAssignment (core fields; omit api_context in list)."""

    id: uuid.UUID
    module_id: uuid.UUID
    name: str
    path: str
    http_method: HttpMethodEnum
    execute_engine: ExecuteEngineEnum
    datasource_id: uuid.UUID | None
    description: str | None
    is_published: bool
    sort_order: int
    created_at: datetime
    updated_at: datetime


class ApiAssignmentDetail(ApiAssignmentPublic):
    """Detail for GET /api-assignments/{id}; adds api_context and group_ids."""

    api_context: ApiContextPublic | None = None
    group_ids: list[uuid.UUID] = Field(default_factory=list)


class ApiAssignmentListIn(SQLModel):
    """Body for POST /api-assignments/list; pagination and optional filters."""

    page: int = Field(default=1, ge=1, description="1-based page number")
    page_size: int = Field(default=20, ge=1, le=100, description="Items per page")
    module_id: uuid.UUID | None = None
    is_published: bool | None = None
    name__ilike: str | None = Field(default=None, max_length=255)
    http_method: HttpMethodEnum | None = None
    execute_engine: ExecuteEngineEnum | None = None


class ApiAssignmentListOut(SQLModel):
    """Paginated list of ApiAssignment."""

    data: list[ApiAssignmentPublic]
    total: int


class ApiAssignmentPublishIn(SQLModel):
    """Body for POST /api-assignments/publish."""

    id: uuid.UUID


class ApiAssignmentDebugIn(SQLModel):
    """Body for POST /api-assignments/debug; Phase 2 returns 501."""

    id: uuid.UUID | None = None
    content: str | None = None
    execute_engine: ExecuteEngineEnum | None = None
    datasource_id: uuid.UUID | None = None
    params: dict | None = Field(default=None, description="Optional params dict")
