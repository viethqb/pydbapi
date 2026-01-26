"""
Pydantic schemas for DBAPI Phase 2 APIs.

DataSource, ApiAssignment, ApiModule, ApiGroup, AppClient, etc.
"""

import uuid
from datetime import datetime

from pydantic import Field
from sqlmodel import SQLModel

from app.models_dbapi import (
    ApiAccessTypeEnum,
    ExecuteEngineEnum,
    FirewallRuleTypeEnum,
    HttpMethodEnum,
    ProductTypeEnum,
)

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


class ApiParameter(SQLModel):
    """Parameter definition for API validation."""

    name: str = Field(..., min_length=1, max_length=255, description="Parameter name")
    location: str = Field(..., description="Parameter location: query, header, or body")
    data_type: str | None = Field(
        default=None,
        max_length=64,
        description="Data type: string, number, integer, boolean, array, object, etc."
    )
    is_required: bool = Field(
        default=False,
        description="Whether this parameter is required (cannot be null/empty)"
    )
    validate_type: str | None = Field(
        default=None,
        max_length=32,
        description="Validation type: 'regex' or 'python'"
    )
    validate: str | None = Field(
        default=None,
        description="Validation: regex pattern (if validate_type='regex') or Python function code (if validate_type='python')"
    )
    validate_message: str | None = Field(
        default=None,
        max_length=512,
        description="Error message shown when validation fails"
    )
    default_value: str | None = Field(
        default=None,
        description="Default value for this parameter (used in debug UI and as fallback)"
    )


class ApiAssignmentCreate(SQLModel):
    """Body for POST /api-assignments/create."""

    module_id: uuid.UUID
    name: str = Field(..., min_length=1, max_length=255)
    path: str = Field(..., min_length=1, max_length=255)
    http_method: HttpMethodEnum
    execute_engine: ExecuteEngineEnum
    datasource_id: uuid.UUID | None = None
    description: str | None = Field(default=None, max_length=512)
    access_type: ApiAccessTypeEnum = Field(default=ApiAccessTypeEnum.PRIVATE, description="public: no auth required, private: requires token")
    sort_order: int = Field(default=0)
    content: str | None = Field(default=None, description="SQL/script → ApiContext (1-1)")
    group_ids: list[uuid.UUID] = Field(default_factory=list, description="ApiGroup IDs to link")
    params: list[ApiParameter] = Field(default_factory=list, description="Parameter definitions for validation")


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
    access_type: ApiAccessTypeEnum | None = None
    sort_order: int | None = None
    content: str | None = None
    group_ids: list[uuid.UUID] | None = Field(default=None, description="If set, replace group links")
    params: list[ApiParameter] | None = Field(default=None, description="If set, replace parameter definitions")


class ApiContextPublic(SQLModel):
    """Response schema for ApiContext (included in ApiAssignmentDetail)."""

    id: uuid.UUID
    api_assignment_id: uuid.UUID
    content: str
    params: list[dict] | None = Field(default=None, description="Parameter definitions: list of {name, location, data_type, is_required, validate_type, validate, default_value}")
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
    access_type: ApiAccessTypeEnum
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


# ---------------------------------------------------------------------------
# AppClient (Task 2.4)
# ---------------------------------------------------------------------------


class AppClientCreate(SQLModel):
    """Body for POST /clients/create; backend generates client_id, hashes client_secret."""

    name: str = Field(..., min_length=1, max_length=255)
    client_secret: str = Field(..., min_length=8, max_length=512, description="Plain secret; stored hashed")
    description: str | None = Field(default=None, max_length=512)
    is_active: bool = Field(default=True)


class AppClientUpdate(SQLModel):
    """Body for POST /clients/update; id required. client_id and client_secret not updated here."""

    id: uuid.UUID
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    is_active: bool | None = None


class AppClientPublic(SQLModel):
    """Response schema; excludes client_secret (see regenerate-secret for one-time plain secret)."""

    id: uuid.UUID
    name: str
    client_id: str
    description: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class AppClientListIn(SQLModel):
    """Body for POST /clients/list; pagination and optional filters."""

    page: int = Field(default=1, ge=1, description="1-based page number")
    page_size: int = Field(default=20, ge=1, le=100, description="Items per page")
    name__ilike: str | None = Field(default=None, max_length=255)
    is_active: bool | None = None


class AppClientListOut(SQLModel):
    """Paginated list of AppClient."""

    data: list[AppClientPublic]
    total: int


class AppClientRegenerateSecretOut(SQLModel):
    """Response for POST /clients/{id}/regenerate-secret; plain secret shown once."""

    message: str = "Client secret regenerated. Save it now; it will not be shown again."
    client_secret: str


# ---------------------------------------------------------------------------
# FirewallRules (Task 2.5)
# ---------------------------------------------------------------------------


class FirewallRuleCreate(SQLModel):
    """Body for POST /firewall/create."""

    rule_type: FirewallRuleTypeEnum
    ip_range: str = Field(..., min_length=1, max_length=128)
    description: str | None = Field(default=None, max_length=512)
    is_active: bool = Field(default=True)
    sort_order: int = Field(default=0)


class FirewallRuleUpdate(SQLModel):
    """Body for POST /firewall/update; id required, others optional."""

    id: uuid.UUID
    rule_type: FirewallRuleTypeEnum | None = None
    ip_range: str | None = Field(default=None, min_length=1, max_length=128)
    description: str | None = None
    is_active: bool | None = None
    sort_order: int | None = None


class FirewallRulePublic(SQLModel):
    """Response schema for FirewallRules."""

    id: uuid.UUID
    rule_type: FirewallRuleTypeEnum
    ip_range: str
    description: str | None
    is_active: bool
    sort_order: int
    created_at: datetime
    updated_at: datetime


class FirewallRuleListIn(SQLModel):
    """Body for POST /firewall/list; pagination and optional filters."""

    page: int = Field(default=1, ge=1, description="1-based page number")
    page_size: int = Field(default=20, ge=1, le=100, description="Items per page")
    rule_type: FirewallRuleTypeEnum | None = None
    is_active: bool | None = None


class FirewallRuleListOut(SQLModel):
    """Paginated list of FirewallRules."""

    data: list[FirewallRulePublic]
    total: int


# ---------------------------------------------------------------------------
# UnifyAlarm (Task 2.5)
# ---------------------------------------------------------------------------


class UnifyAlarmCreate(SQLModel):
    """Body for POST /alarm/create."""

    name: str = Field(..., min_length=1, max_length=255)
    alarm_type: str = Field(..., min_length=1, max_length=64)
    config: dict = Field(default_factory=dict, description="JSON config")
    is_enabled: bool = Field(default=True)


class UnifyAlarmUpdate(SQLModel):
    """Body for POST /alarm/update; id required, others optional."""

    id: uuid.UUID
    name: str | None = Field(default=None, min_length=1, max_length=255)
    alarm_type: str | None = Field(default=None, min_length=1, max_length=64)
    config: dict | None = None
    is_enabled: bool | None = None


class UnifyAlarmPublic(SQLModel):
    """Response schema for UnifyAlarm."""

    id: uuid.UUID
    name: str
    alarm_type: str
    config: dict
    is_enabled: bool
    created_at: datetime
    updated_at: datetime


class UnifyAlarmListIn(SQLModel):
    """Body for POST /alarm/list; pagination and optional filters."""

    page: int = Field(default=1, ge=1, description="1-based page number")
    page_size: int = Field(default=20, ge=1, le=100, description="Items per page")
    alarm_type: str | None = Field(default=None, max_length=64)
    is_enabled: bool | None = None


class UnifyAlarmListOut(SQLModel):
    """Paginated list of UnifyAlarm."""

    data: list[UnifyAlarmPublic]
    total: int


# ---------------------------------------------------------------------------
# Overview / Dashboard (Task 2.7)
# ---------------------------------------------------------------------------


class OverviewStats(SQLModel):
    """Response for GET /overview/stats; counts of main entities."""

    datasources: int = 0
    modules: int = 0
    groups: int = 0
    apis_total: int = 0
    apis_published: int = 0
    clients: int = 0
    firewall_rules: int = 0
    alarms: int = 0


class AccessRecordPublic(SQLModel):
    """Minimal schema for AccessRecord in recent-access; request_body excluded."""

    id: uuid.UUID
    api_assignment_id: uuid.UUID | None
    app_client_id: uuid.UUID | None
    ip_address: str
    http_method: str
    path: str
    status_code: int
    created_at: datetime


class VersionCommitPublic(SQLModel):
    """Minimal schema for VersionCommit in recent-commits; content_snapshot excluded."""

    id: uuid.UUID
    api_assignment_id: uuid.UUID
    version: int
    commit_message: str | None
    committed_at: datetime


class RecentAccessOut(SQLModel):
    """Response for GET /overview/recent-access."""

    data: list[AccessRecordPublic]


class RecentCommitsOut(SQLModel):
    """Response for GET /overview/recent-commits."""

    data: list[VersionCommitPublic]


# ---------------------------------------------------------------------------
# Gateway (Phase 4 – token auth)
# ---------------------------------------------------------------------------


class GatewayTokenIn(SQLModel):
    """Body for POST /token/generate (JSON or form)."""

    client_id: str = Field(..., min_length=1, max_length=255)
    client_secret: str = Field(..., min_length=1, max_length=512)
    grant_type: str = Field(default="client_credentials", max_length=64)


class GatewayTokenResponse(SQLModel):
    """Response for POST /token/generate."""

    access_token: str
    token_type: str = "bearer"
    expires_in: int
