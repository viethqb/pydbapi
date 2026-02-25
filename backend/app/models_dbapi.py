"""
DBAPI migration models (Phase 1).

Entities: DataSource, ApiAssignment, ApiModule, ApiGroup, AppClient,
ApiContext, VersionCommit, AccessRecord.

Note: SystemUser removed; web login uses app.models.User. VersionCommit
no longer stores committed_by; can add committed_by_id -> user.id later if needed.
McpTool and McpClient excluded from product scope.
"""

import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional

from sqlalchemy import Column, Enum as SQLEnum, ForeignKey, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, Relationship, SQLModel


def _utc_now() -> datetime:
    """Timezone-aware UTC now (replaces deprecated datetime.utcnow())."""
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Enums (Task 1.2)
# ---------------------------------------------------------------------------


class ProductTypeEnum(str, Enum):
    """Supported database product types (postgres, mysql, trino)."""

    POSTGRES = "postgres"
    MYSQL = "mysql"
    TRINO = "trino"


class HttpMethodEnum(str, Enum):
    """HTTP methods for API assignments."""

    GET = "GET"
    POST = "POST"
    PUT = "PUT"
    DELETE = "DELETE"
    PATCH = "PATCH"


class ExecuteEngineEnum(str, Enum):
    """Execution engine: SQL (Jinja2) or SCRIPT (Python)."""

    SQL = "SQL"
    SCRIPT = "SCRIPT"


class ApiAccessTypeEnum(str, Enum):
    """API access type: public (no auth) or private (requires token)."""

    PUBLIC = "public"
    PRIVATE = "private"


class MacroTypeEnum(str, Enum):
    """Macro type: Jinja2 for SQL templates, Python for script engine."""

    JINJA = "JINJA"
    PYTHON = "PYTHON"


# ---------------------------------------------------------------------------
# DataSource - Connection management
# ---------------------------------------------------------------------------


class DataSource(SQLModel, table=True):
    __tablename__ = "datasource"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(max_length=255, index=True)
    product_type: ProductTypeEnum = Field(
        sa_column=Column(
            SQLEnum(
                ProductTypeEnum,
                name="producttypeenum",
                create_type=False,
                values_callable=lambda x: [e.value for e in x],
            ),
            nullable=False,
            index=True,
        )
    )
    host: str = Field(max_length=255)
    port: int = Field(default=5432)
    database: str = Field(max_length=255)
    username: str = Field(max_length=255)
    password: str = Field(max_length=512)  # Encrypted via Fernet (core.security)
    driver_version: str | None = Field(default=None, max_length=64)
    description: str | None = Field(default=None, max_length=512)
    is_active: bool = Field(default=True)
    close_connection_after_execute: bool = Field(
        default=False,
        description="If True, close the DB connection after each request instead of returning to pool. "
        "Required for DBs like StarRocks when using EXECUTE AS user WITH NO REVERT (impersonation).",
    )
    use_ssl: bool = Field(
        default=False,
        description="For Trino: use HTTPS (http_scheme='https'). When True, password is required.",
    )
    created_at: datetime = Field(default_factory=_utc_now)
    updated_at: datetime = Field(default_factory=_utc_now)

    api_assignments: list["ApiAssignment"] = Relationship(back_populates="datasource")


# ---------------------------------------------------------------------------
# ApiModule - Module grouping APIs
# ---------------------------------------------------------------------------


class ApiModule(SQLModel, table=True):
    __tablename__ = "api_module"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(max_length=255, index=True)
    description: str | None = Field(default=None, max_length=512)
    path_prefix: str = Field(max_length=255, default="/")
    sort_order: int = Field(default=0)
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=_utc_now)
    updated_at: datetime = Field(default_factory=_utc_now)

    api_assignments: list["ApiAssignment"] = Relationship(
        back_populates="module", cascade_delete=True
    )
    macro_defs: list["ApiMacroDef"] = Relationship(
        back_populates="module", cascade_delete=True
    )


# ---------------------------------------------------------------------------
# ApiMacroDef - Jinja macro / Python function definitions for API content
# ---------------------------------------------------------------------------


class MacroDefVersionCommit(SQLModel, table=True):
    """Version snapshot for macro_def content."""

    __tablename__ = "macro_def_version_commit"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    api_macro_def_id: uuid.UUID = Field(
        foreign_key="api_macro_def.id",
        nullable=False,
        index=True,
        ondelete="CASCADE",
    )
    version: int = Field(default=1)
    content_snapshot: str = Field(sa_column=Column(Text, nullable=False))
    commit_message: str | None = Field(default=None, max_length=512)
    committed_by_id: uuid.UUID | None = Field(
        default=None,
        foreign_key="user.id",
        index=True,
        ondelete="SET NULL",
    )
    committed_at: datetime = Field(default_factory=_utc_now)

    api_macro_def: "ApiMacroDef" = Relationship(
        back_populates="version_commits",
        sa_relationship_kwargs={
            "foreign_keys": "MacroDefVersionCommit.api_macro_def_id"
        },
    )


class ApiMacroDef(SQLModel, table=True):
    """Jinja macro or Python function definition. module_id null = global."""

    __tablename__ = "api_macro_def"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    module_id: uuid.UUID | None = Field(
        default=None,
        foreign_key="api_module.id",
        index=True,
        ondelete="CASCADE",
        description="Null = global macro; non-null = module-specific",
    )
    name: str = Field(
        max_length=128, index=True, description="Identifier for reference"
    )
    macro_type: MacroTypeEnum = Field(
        sa_column=Column(
            SQLEnum(
                MacroTypeEnum,
                name="macrotypeenum",
                create_type=True,
                values_callable=lambda x: [e.value for e in x],
            ),
            nullable=False,
            index=True,
        )
    )
    content: str = Field(sa_column=Column(Text, nullable=False))
    description: str | None = Field(default=None, max_length=512)
    sort_order: int = Field(default=0)
    is_published: bool = Field(default=False)
    published_version_id: uuid.UUID | None = Field(
        default=None,
        foreign_key="macro_def_version_commit.id",
        index=True,
        ondelete="SET NULL",
        description="Version that is currently published",
    )
    created_at: datetime = Field(default_factory=_utc_now)
    updated_at: datetime = Field(default_factory=_utc_now)

    module: Optional["ApiModule"] = Relationship(back_populates="macro_defs")
    version_commits: list["MacroDefVersionCommit"] = Relationship(
        back_populates="api_macro_def",
        sa_relationship_kwargs={
            "foreign_keys": "MacroDefVersionCommit.api_macro_def_id"
        },
    )
    published_version: Optional["MacroDefVersionCommit"] = Relationship(
        sa_relationship_kwargs={
            "foreign_keys": "ApiMacroDef.published_version_id",
            "uselist": False,
        },
    )


# ---------------------------------------------------------------------------
# ApiGroup - Authorization group
# ---------------------------------------------------------------------------


class ApiGroup(SQLModel, table=True):
    __tablename__ = "api_group"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(max_length=255, index=True)
    description: str | None = Field(default=None, max_length=512)
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=_utc_now)
    updated_at: datetime = Field(default_factory=_utc_now)

    api_assignments: list["ApiAssignmentGroupLink"] = Relationship(
        back_populates="api_group"
    )
    client_links: list["AppClientGroupLink"] = Relationship(back_populates="api_group")


# ---------------------------------------------------------------------------
# ApiAssignmentGroupLink - M2M between ApiAssignment and ApiGroup
# ---------------------------------------------------------------------------


class ApiAssignmentGroupLink(SQLModel, table=True):
    __tablename__ = "api_assignment_group_link"

    api_assignment_id: uuid.UUID = Field(
        foreign_key="api_assignment.id", primary_key=True, ondelete="CASCADE"
    )
    api_group_id: uuid.UUID = Field(
        foreign_key="api_group.id", primary_key=True, ondelete="CASCADE"
    )

    api_assignment: "ApiAssignment" = Relationship(back_populates="group_links")
    api_group: "ApiGroup" = Relationship(back_populates="api_assignments")


# ---------------------------------------------------------------------------
# ApiAssignment - API endpoint definition
# ---------------------------------------------------------------------------


class ApiAssignment(SQLModel, table=True):
    __tablename__ = "api_assignment"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    module_id: uuid.UUID = Field(
        foreign_key="api_module.id", nullable=False, index=True, ondelete="CASCADE"
    )
    name: str = Field(max_length=255, index=True)
    path: str = Field(
        max_length=255
    )  # Path within module, e.g. "users" or "users/{id}"
    http_method: HttpMethodEnum = Field(
        sa_column=Column(
            SQLEnum(
                HttpMethodEnum,
                name="httpmethodenum",
                create_type=False,
                values_callable=lambda x: [e.value for e in x],
            ),
            nullable=False,
            index=True,
        )
    )
    execute_engine: ExecuteEngineEnum = Field(
        sa_column=Column(
            SQLEnum(
                ExecuteEngineEnum,
                name="executeengineenum",
                create_type=False,
                values_callable=lambda x: [e.value for e in x],
            ),
            nullable=False,
            index=True,
        )
    )
    datasource_id: uuid.UUID | None = Field(
        default=None,
        foreign_key="datasource.id",
        index=True,
        ondelete="SET NULL",
    )
    description: str | None = Field(default=None, max_length=512)
    is_published: bool = Field(default=False)
    published_version_id: uuid.UUID | None = Field(
        default=None,
        foreign_key="version_commit.id",
        index=True,
        ondelete="SET NULL",
        description="Version that is currently published",
    )
    access_type: ApiAccessTypeEnum = Field(
        sa_column=Column(
            SQLEnum(
                ApiAccessTypeEnum,
                name="apiaccesstypeenum",
                create_type=False,
                values_callable=lambda x: [e.value for e in x],
            ),
            nullable=False,
            index=True,
        ),
        default=ApiAccessTypeEnum.PRIVATE,
    )
    rate_limit_per_minute: int | None = Field(
        default=None,
        description="Max requests per minute for this API. None = no limit (call freely).",
    )
    close_connection_after_execute: bool = Field(
        default=False,
        description="If True, close DB connection after each request (e.g. StarRocks EXECUTE AS WITH NO REVERT).",
    )
    sort_order: int = Field(default=0)
    created_at: datetime = Field(default_factory=_utc_now)
    updated_at: datetime = Field(default_factory=_utc_now)

    module: "ApiModule" = Relationship(back_populates="api_assignments")
    datasource: "DataSource" = Relationship(back_populates="api_assignments")
    group_links: list[ApiAssignmentGroupLink] = Relationship(
        back_populates="api_assignment", cascade_delete=True
    )
    api_context: "ApiContext" = Relationship(
        back_populates="api_assignment",
        sa_relationship_kwargs={"uselist": False},
        cascade_delete=True,
    )
    version_commits: list["VersionCommit"] = Relationship(
        back_populates="api_assignment",
        sa_relationship_kwargs={"foreign_keys": "VersionCommit.api_assignment_id"},
    )
    published_version: Optional["VersionCommit"] = Relationship(
        sa_relationship_kwargs={
            "foreign_keys": "ApiAssignment.published_version_id",
            "uselist": False,
        },
    )
    access_records: list["AccessRecord"] = Relationship(back_populates="api_assignment")
    client_direct_links: list["AppClientApiLink"] = Relationship(
        back_populates="api_assignment"
    )


# ---------------------------------------------------------------------------
# ApiContext - SQL/script content for API (1-1 with ApiAssignment)
# ---------------------------------------------------------------------------


class ApiContext(SQLModel, table=True):
    __tablename__ = "api_context"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    api_assignment_id: uuid.UUID = Field(
        foreign_key="api_assignment.id",
        unique=True,
        index=True,
        nullable=False,
        ondelete="CASCADE",
    )
    content: str = Field(sa_column=Column(Text, nullable=False))
    params: dict[str, Any] | None = Field(
        default=None,
        sa_column=Column(JSONB, nullable=True),
        description="Parameter definitions for validation: list of {name, location}",
    )
    param_validates: dict[str, Any] | None = Field(
        default=None,
        sa_column=Column(JSONB, nullable=True),
        description="Parameter validation scripts: list of {name, validation_script, message_when_fail}",
    )
    result_transform: str | None = Field(
        default=None,
        sa_column=Column(Text, nullable=True),
        description="Python script to transform the raw executor result before returning it",
    )
    created_at: datetime = Field(default_factory=_utc_now)
    updated_at: datetime = Field(default_factory=_utc_now)

    api_assignment: "ApiAssignment" = Relationship(back_populates="api_context")


# ---------------------------------------------------------------------------
# AppClientGroupLink - M2M between AppClient and ApiGroup (for API access control)
# ---------------------------------------------------------------------------


class AppClientGroupLink(SQLModel, table=True):
    __tablename__ = "app_client_group_link"

    app_client_id: uuid.UUID = Field(
        foreign_key="app_client.id", primary_key=True, ondelete="CASCADE"
    )
    api_group_id: uuid.UUID = Field(
        foreign_key="api_group.id", primary_key=True, ondelete="CASCADE"
    )

    app_client: "AppClient" = Relationship(back_populates="group_links")
    api_group: "ApiGroup" = Relationship(back_populates="client_links")


# ---------------------------------------------------------------------------
# AppClientApiLink - M2M AppClient <-> ApiAssignment (direct API permission, outside groups)
# ---------------------------------------------------------------------------


class AppClientApiLink(SQLModel, table=True):
    __tablename__ = "app_client_api_link"

    app_client_id: uuid.UUID = Field(
        foreign_key="app_client.id", primary_key=True, ondelete="CASCADE"
    )
    api_assignment_id: uuid.UUID = Field(
        foreign_key="api_assignment.id", primary_key=True, ondelete="CASCADE"
    )

    app_client: "AppClient" = Relationship(back_populates="api_links")
    api_assignment: "ApiAssignment" = Relationship(back_populates="client_direct_links")


# ---------------------------------------------------------------------------
# AppClient - Client application (OAuth / API key)
# ---------------------------------------------------------------------------


class AppClient(SQLModel, table=True):
    __tablename__ = "app_client"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(max_length=255, index=True)
    client_id: str = Field(max_length=255, unique=True, index=True)
    client_secret: str = Field(max_length=512)  # Hashed
    description: str | None = Field(default=None, max_length=512)
    rate_limit_per_minute: int | None = Field(
        default=None,
        description="Max requests per minute for this client. None = no limit (call freely).",
    )
    max_concurrent: int | None = Field(
        default=None,
        description="Max concurrent requests in flight for this client. None = use global FLOW_CONTROL_MAX_CONCURRENT_PER_CLIENT.",
    )
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=_utc_now)
    updated_at: datetime = Field(default_factory=_utc_now)

    group_links: list["AppClientGroupLink"] = Relationship(
        back_populates="app_client", cascade_delete=True
    )
    api_links: list["AppClientApiLink"] = Relationship(
        back_populates="app_client", cascade_delete=True
    )
    access_records: list["AccessRecord"] = Relationship(back_populates="app_client")


# ---------------------------------------------------------------------------
# VersionCommit - Version management for API content
# ---------------------------------------------------------------------------


class VersionCommit(SQLModel, table=True):
    __tablename__ = "version_commit"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    api_assignment_id: uuid.UUID = Field(
        foreign_key="api_assignment.id", nullable=False, index=True, ondelete="CASCADE"
    )
    version: int = Field(default=1)
    content_snapshot: str = Field(sa_column=Column(Text, nullable=False))
    params_snapshot: dict[str, Any] | None = Field(
        default=None,
        sa_column=Column(JSONB, nullable=True),
        description="Snapshot of ApiContext.params at commit time",
    )
    param_validates_snapshot: dict[str, Any] | None = Field(
        default=None,
        sa_column=Column(JSONB, nullable=True),
        description="Snapshot of ApiContext.param_validates at commit time",
    )
    result_transform_snapshot: str | None = Field(
        default=None,
        sa_column=Column(Text, nullable=True),
        description="Snapshot of ApiContext.result_transform at commit time",
    )
    commit_message: str | None = Field(default=None, max_length=512)
    committed_by_id: uuid.UUID | None = Field(
        default=None,
        foreign_key="user.id",
        index=True,
        ondelete="SET NULL",
        description="User who created this version",
    )
    committed_at: datetime = Field(default_factory=_utc_now)

    api_assignment: "ApiAssignment" = Relationship(
        back_populates="version_commits",
        sa_relationship_kwargs={"foreign_keys": "VersionCommit.api_assignment_id"},
    )


# ---------------------------------------------------------------------------
# AccessRecord - Access log
# ---------------------------------------------------------------------------


class AccessRecord(SQLModel, table=True):
    __tablename__ = "access_record"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    api_assignment_id: uuid.UUID | None = Field(
        default=None,
        foreign_key="api_assignment.id",
        index=True,
        ondelete="SET NULL",
    )
    app_client_id: uuid.UUID | None = Field(
        default=None,
        foreign_key="app_client.id",
        index=True,
        ondelete="SET NULL",
    )
    ip_address: str = Field(max_length=64)
    http_method: str = Field(max_length=16)
    path: str = Field(max_length=512)
    status_code: int = Field(default=0)
    request_body: str | None = Field(default=None, sa_column=Column(Text))
    request_headers: str | None = Field(default=None, sa_column=Column(Text))
    request_params: str | None = Field(default=None, sa_column=Column(Text))
    created_at: datetime = Field(default_factory=_utc_now)
    duration_ms: int | None = Field(default=None, description="Request duration in milliseconds")

    api_assignment: "ApiAssignment" = Relationship(back_populates="access_records")
    app_client: "AppClient" = Relationship(back_populates="access_records")


# ---------------------------------------------------------------------------
# AccessLogConfig - Which DataSource to use for access logs (singleton)
# ---------------------------------------------------------------------------

# Singleton row id used in application
ACCESS_LOG_CONFIG_ROW_ID = 1


class AccessLogConfig(SQLModel, table=True):
    """Single row: datasource_id = which DataSource stores access_record. NULL = main DB.
    use_starrocks_audit: when True and datasource is MySQL, use StarRocks audit schema
    (starrocks_audit_db__.pydbapi_access_log_tbl__) instead of access_record table."""

    __tablename__ = "access_log_config"

    id: int = Field(primary_key=True, default=ACCESS_LOG_CONFIG_ROW_ID)
    datasource_id: uuid.UUID | None = Field(
        default=None,
        foreign_key="datasource.id",
        index=True,
        ondelete="SET NULL",
    )
    use_starrocks_audit: bool = Field(default=False)
