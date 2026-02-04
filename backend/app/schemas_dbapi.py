"""
Pydantic schemas for DBAPI Phase 2 APIs.

DataSource, ApiAssignment, ApiModule, ApiGroup, AppClient, etc.
"""

import uuid
from datetime import date, datetime

from pydantic import ConfigDict, Field, model_validator
from sqlmodel import SQLModel

from app.models_dbapi import (
    ApiAccessTypeEnum,
    ExecuteEngineEnum,
    HttpMethodEnum,
    MacroTypeEnum,
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
    password: str = Field(
        default="", max_length=512, description="Optional; leave empty for no password."
    )
    driver_version: str | None = Field(default=None, max_length=64)
    description: str | None = Field(default=None, max_length=512)
    is_active: bool = Field(default=True)
    close_connection_after_execute: bool = Field(
        default=False,
        description="If True, close DB connection after each request (e.g. for StarRocks impersonation).",
    )
    use_ssl: bool = Field(
        default=False,
        description="For Trino: use HTTPS. When True, password is required.",
    )

    @model_validator(mode="after")
    def trino_ssl_requires_password(self) -> "DataSourceCreate":
        if (
            self.product_type == ProductTypeEnum.TRINO
            and self.use_ssl
            and not (self.password and self.password.strip())
        ):
            raise ValueError("Password is required for Trino when using SSL/HTTPS.")
        return self


class DataSourceUpdate(SQLModel):
    """Body for POST /datasources/update; id required, others optional."""

    id: uuid.UUID
    name: str | None = Field(default=None, min_length=1, max_length=255)
    product_type: ProductTypeEnum | None = None
    host: str | None = Field(default=None, min_length=1, max_length=255)
    port: int | None = Field(default=None, ge=1, le=65535)
    database: str | None = Field(default=None, min_length=1, max_length=255)
    username: str | None = Field(default=None, min_length=1, max_length=255)
    password: str | None = Field(
        default=None, max_length=512
    )  # None = keep current; "" = set to empty
    driver_version: str | None = None
    description: str | None = None
    is_active: bool | None = None
    close_connection_after_execute: bool | None = None
    use_ssl: bool | None = None

    @model_validator(mode="after")
    def trino_ssl_requires_password(self) -> "DataSourceUpdate":
        if self.product_type != ProductTypeEnum.TRINO or not self.use_ssl:
            return self
        # When setting use_ssl=True, password must be provided (non-empty)
        if self.password is None:
            return self  # None = keep current, validated on server if needed
        if not (self.password.strip() if isinstance(self.password, str) else False):
            raise ValueError("Password is required for Trino when using SSL/HTTPS.")
        return self


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
    close_connection_after_execute: bool
    use_ssl: bool
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
    password: str | None = Field(default=None, max_length=512, description="Optional.")
    use_ssl: bool = Field(
        default=False, description="For Trino: use HTTPS. When True, password required."
    )

    @model_validator(mode="after")
    def trino_ssl_requires_password(self) -> "DataSourcePreTestIn":
        if (
            self.product_type == ProductTypeEnum.TRINO
            and self.use_ssl
            and not (self.password and str(self.password).strip())
        ):
            raise ValueError("Password is required for Trino when using SSL/HTTPS.")
        return self


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
# ApiMacroDef - Jinja macro / Python function definitions for API content
# ---------------------------------------------------------------------------


class ApiMacroDefCreate(SQLModel):
    """Body for POST /macro-defs/create."""

    module_id: uuid.UUID | None = Field(
        default=None, description="Null = global macro_def"
    )
    name: str = Field(..., min_length=1, max_length=128)
    macro_type: MacroTypeEnum
    content: str = Field(..., min_length=1)
    description: str | None = Field(default=None, max_length=512)
    sort_order: int = Field(default=0)


class ApiMacroDefUpdate(SQLModel):
    """Body for POST /macro-defs/update; id required, others optional."""

    id: uuid.UUID
    module_id: uuid.UUID | None = None
    name: str | None = Field(default=None, min_length=1, max_length=128)
    macro_type: MacroTypeEnum | None = None
    content: str | None = Field(default=None, min_length=1)
    description: str | None = None
    sort_order: int | None = None


class ApiMacroDefPublic(SQLModel):
    """Response schema for ApiMacroDef."""

    id: uuid.UUID
    module_id: uuid.UUID | None
    name: str
    macro_type: MacroTypeEnum
    content: str
    description: str | None
    sort_order: int
    is_published: bool = False
    published_version_id: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime


class ApiMacroDefDetail(ApiMacroDefPublic):
    """Detail for GET /macro-defs/{id}; adds used_by_apis_count."""

    used_by_apis_count: int = Field(
        default=0, description="Number of APIs in scope that use this macro_def"
    )


class MacroDefVersionCommitPublic(SQLModel):
    """Minimal schema for MacroDefVersionCommit in list."""

    id: uuid.UUID
    api_macro_def_id: uuid.UUID
    version: int
    commit_message: str | None
    committed_by_id: uuid.UUID | None
    committed_by_email: str | None = None
    committed_at: datetime


class MacroDefVersionCommitDetail(SQLModel):
    """Full schema for MacroDefVersionCommit including content_snapshot."""

    id: uuid.UUID
    api_macro_def_id: uuid.UUID
    version: int
    content_snapshot: str
    commit_message: str | None
    committed_by_id: uuid.UUID | None
    committed_by_email: str | None = None
    committed_at: datetime


class MacroDefVersionCommitCreate(SQLModel):
    """Body for POST /macro-defs/{id}/versions/create."""

    commit_message: str | None = Field(default=None, max_length=512)


class MacroDefVersionCommitListOut(SQLModel):
    """Response for GET /macro-defs/{id}/versions."""

    data: list[MacroDefVersionCommitPublic]


class ApiMacroDefPublishIn(SQLModel):
    """Body for POST /macro-defs/publish."""

    id: uuid.UUID
    version_id: uuid.UUID | None = Field(
        default=None, description="Required for publish."
    )


class ApiMacroDefListIn(SQLModel):
    """Body for POST /macro-defs/list; pagination and optional filters."""

    page: int = Field(default=1, ge=1, description="1-based page number")
    page_size: int = Field(default=20, ge=1, le=100, description="Items per page")
    module_id: uuid.UUID | None = Field(
        default=None, description="Filter by module; null = global only"
    )
    macro_type: MacroTypeEnum | None = None
    name__ilike: str | None = Field(default=None, max_length=128)


class ApiMacroDefListOut(SQLModel):
    """Paginated list of ApiMacroDef."""

    data: list[ApiMacroDefPublic]
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
        description="Data type: string, number, integer, boolean, array, object, etc.",
    )
    is_required: bool = Field(
        default=False,
        description="Whether this parameter is required (cannot be null/empty)",
    )
    validate_type: str | None = Field(
        default=None, max_length=32, description="Validation type: 'regex' or 'python'"
    )
    validate: str | None = Field(
        default=None,
        description="Validation: regex pattern (if validate_type='regex') or Python function code (if validate_type='python')",
    )
    validate_message: str | None = Field(
        default=None,
        max_length=512,
        description="Error message shown when validation fails",
    )
    default_value: str | None = Field(
        default=None,
        description="Default value for this parameter (used in debug UI and as fallback)",
    )
    description: str | None = Field(
        default=None,
        max_length=512,
        description="Human-readable description of the parameter (meaning, usage)",
    )


class ApiParamValidate(SQLModel):
    """Parameter validation script definition."""

    name: str = Field(
        ..., min_length=1, max_length=255, description="Parameter name to validate"
    )
    validation_script: str | None = Field(
        default=None,
        description="Python validation script (e.g., 'def validate(value): return True')",
    )
    message_when_fail: str | None = Field(
        default=None,
        max_length=512,
        description="Error message shown when validation fails",
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
    access_type: ApiAccessTypeEnum = Field(
        default=ApiAccessTypeEnum.PRIVATE,
        description="public: no auth required, private: requires token",
    )
    rate_limit_per_minute: int | None = Field(
        default=None, description="Max requests/min for this API. None = no limit."
    )
    close_connection_after_execute: bool = Field(
        default=False,
        description="Close DB connection after each request (e.g. StarRocks impersonation).",
    )
    sort_order: int = Field(default=0)
    content: str | None = Field(
        default=None, description="SQL/script → ApiContext (1-1)"
    )
    result_transform: str | None = Field(
        default=None,
        description="Optional Python script to transform executor result before returning",
    )
    group_ids: list[uuid.UUID] = Field(
        default_factory=list, description="ApiGroup IDs to link"
    )
    params: list[ApiParameter] = Field(
        default_factory=list, description="Parameter definitions for validation"
    )
    param_validates: list[ApiParamValidate] = Field(
        default_factory=list, description="Parameter validation scripts"
    )


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
    rate_limit_per_minute: int | None = Field(
        default=None, description="Max requests/min for this API. None = no limit."
    )
    close_connection_after_execute: bool | None = None
    sort_order: int | None = None
    content: str | None = None
    result_transform: str | None = None
    group_ids: list[uuid.UUID] | None = Field(
        default=None, description="If set, replace group links"
    )
    params: list[ApiParameter] | None = Field(
        default=None, description="If set, replace parameter definitions"
    )
    param_validates: list[ApiParamValidate] | None = Field(
        default=None, description="If set, replace parameter validation scripts"
    )


class ApiContextPublic(SQLModel):
    """Response schema for ApiContext (included in ApiAssignmentDetail)."""

    id: uuid.UUID
    api_assignment_id: uuid.UUID
    content: str
    params: list[dict] | None = Field(
        default=None,
        description="Parameter definitions: list of {name, location, data_type, is_required, default_value, description}",
    )
    param_validates: list[dict] | None = Field(
        default=None,
        description="Parameter validation scripts: list of {name, validation_script, message_when_fail}",
    )
    result_transform: str | None = Field(
        default=None,
        description="Python script to transform executor result before returning",
    )
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
    published_version_id: uuid.UUID | None
    access_type: ApiAccessTypeEnum
    rate_limit_per_minute: int | None = None
    close_connection_after_execute: bool = False
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
    version_id: uuid.UUID | None = Field(
        default=None,
        description="Version to publish. Required for publish, optional for unpublish.",
    )


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
    client_secret: str = Field(
        ..., min_length=8, max_length=512, description="Plain secret; stored hashed"
    )
    description: str | None = Field(default=None, max_length=512)
    rate_limit_per_minute: int | None = Field(
        default=None, description="Max requests/min for this client. None = no limit."
    )
    max_concurrent: int | None = Field(
        default=None,
        description="Max concurrent requests in flight for this client. None = use global default.",
    )
    is_active: bool = Field(default=True)
    group_ids: list[uuid.UUID] | None = Field(
        default=None,
        description="ApiGroups to allow API access; stored in app_client_group_link",
    )
    api_assignment_ids: list[uuid.UUID] | None = Field(
        default=None,
        description="Direct APIs (outside groups) the client can call; stored in app_client_api_link",
    )


class AppClientUpdate(SQLModel):
    """Body for POST /clients/update; id required. client_id and client_secret not updated here. If group_ids or api_assignment_ids is set, replace links."""

    id: uuid.UUID
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    rate_limit_per_minute: int | None = Field(
        default=None, description="Max requests/min for this client. None = no limit."
    )
    max_concurrent: int | None = Field(
        default=None,
        description="Max concurrent requests in flight for this client. None = use global default.",
    )
    is_active: bool | None = None
    group_ids: list[uuid.UUID] | None = None
    api_assignment_ids: list[uuid.UUID] | None = None


class AppClientPublic(SQLModel):
    """Response schema; excludes client_secret (see regenerate-secret for one-time plain secret)."""

    id: uuid.UUID
    name: str
    client_id: str
    description: str | None
    rate_limit_per_minute: int | None = None
    max_concurrent: int | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class AppClientDetail(SQLModel):
    """Detail response for GET /clients/{id}; includes group_ids and api_assignment_ids for API access control."""

    id: uuid.UUID
    name: str
    client_id: str
    description: str | None
    rate_limit_per_minute: int | None = None
    max_concurrent: int | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime
    group_ids: list[uuid.UUID] = Field(default_factory=list)
    api_assignment_ids: list[uuid.UUID] = Field(default_factory=list)


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
    committed_by_id: uuid.UUID | None
    committed_by_email: str | None = Field(
        default=None, description="Email of user who created this version"
    )
    http_method: str | None = Field(
        default=None, description="HTTP method of the API (GET, POST, etc.)"
    )
    full_path: str | None = Field(
        default=None, description="Full API path pattern: /{module}/{path}"
    )
    committed_at: datetime


class VersionCommitDetail(SQLModel):
    """Full schema for VersionCommit including content_snapshot."""

    id: uuid.UUID
    api_assignment_id: uuid.UUID
    version: int
    content_snapshot: str
    params_snapshot: list[dict] | None = Field(
        default=None,
        description="Snapshot of parameter definitions at commit time",
    )
    param_validates_snapshot: list[dict] | None = Field(
        default=None,
        description="Snapshot of parameter validation scripts at commit time",
    )
    result_transform_snapshot: str | None = Field(
        default=None,
        description="Snapshot of Python result transform script at commit time",
    )
    commit_message: str | None
    committed_by_id: uuid.UUID | None
    committed_by_email: str | None = Field(
        default=None, description="Email of user who created this version"
    )
    committed_at: datetime


class VersionCommitCreate(SQLModel):
    """Body for POST /api-assignments/{id}/versions/create."""

    commit_message: str | None = Field(default=None, max_length=512)


class VersionCommitListOut(SQLModel):
    """Response for GET /api-assignments/{id}/versions."""

    data: list[VersionCommitPublic]


class RecentAccessOut(SQLModel):
    """Response for GET /overview/recent-access."""

    data: list[AccessRecordPublic]


class RecentCommitsOut(SQLModel):
    """Response for GET /overview/recent-commits."""

    data: list[VersionCommitPublic]


class RequestsByDayPoint(SQLModel):
    """Point for GET /overview/requests-by-day."""

    day: date
    count: int


class RequestsByDayOut(SQLModel):
    """Response for GET /overview/requests-by-day."""

    data: list[RequestsByDayPoint]


class TopPathPoint(SQLModel):
    """Point for GET /overview/top-paths."""

    path: str
    count: int


class TopPathsOut(SQLModel):
    """Response for GET /overview/top-paths."""

    data: list[TopPathPoint]


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


class GatewayTokenGenerateGetResponse(SQLModel):
    """Response for GET /token/generate (legacy migration: expireAt unix + token)."""

    model_config = ConfigDict(serialize_by_alias=True)

    expire_at: int = Field(
        ..., alias="expireAt", description="Unix timestamp when token expires"
    )
    token: str
