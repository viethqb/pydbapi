"""
DBAPI migration models (Phase 1).

Entities: DataSource, ApiAssignment, ApiModule, ApiGroup, AppClient,
FirewallRules, UnifyAlarm, ApiContext, VersionCommit, AccessRecord.

Note: SystemUser removed; web login uses app.models.User. VersionCommit
no longer stores committed_by; can add committed_by_id -> user.id later if needed.
McpTool and McpClient excluded from product scope.
"""

import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any

from sqlalchemy import Column, Enum as SQLEnum, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, Relationship, SQLModel


def _utc_now() -> datetime:
    """Timezone-aware UTC now (replaces deprecated datetime.utcnow())."""
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Enums (Task 1.2)
# ---------------------------------------------------------------------------


class ProductTypeEnum(str, Enum):
    """Supported database product types (initial: postgres, mysql)."""

    POSTGRES = "postgres"
    MYSQL = "mysql"


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


class FirewallRuleTypeEnum(str, Enum):
    """Firewall rule: allow or deny."""

    ALLOW = "allow"
    DENY = "deny"


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
    password: str = Field(max_length=512)  # Consider encryption in Phase 4+
    driver_version: str | None = Field(default=None, max_length=64)
    description: str | None = Field(default=None, max_length=512)
    is_active: bool = Field(default=True)
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
    path: str = Field(max_length=255)  # Path within module, e.g. "users" or "users/{id}"
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
    version_commits: list["VersionCommit"] = Relationship(back_populates="api_assignment")
    access_records: list["AccessRecord"] = Relationship(back_populates="api_assignment")


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
    created_at: datetime = Field(default_factory=_utc_now)
    updated_at: datetime = Field(default_factory=_utc_now)

    api_assignment: "ApiAssignment" = Relationship(back_populates="api_context")


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
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=_utc_now)
    updated_at: datetime = Field(default_factory=_utc_now)

    access_records: list["AccessRecord"] = Relationship(back_populates="app_client")


# ---------------------------------------------------------------------------
# FirewallRules - Firewall rules (IP allow/deny)
# ---------------------------------------------------------------------------


class FirewallRules(SQLModel, table=True):
    __tablename__ = "firewall_rules"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    rule_type: FirewallRuleTypeEnum = Field(
        sa_column=Column(
            SQLEnum(
                FirewallRuleTypeEnum,
                name="firewallruletypeenum",
                create_type=False,
                values_callable=lambda x: [e.value for e in x],
            ),
            nullable=False,
            index=True,
        )
    )
    ip_range: str = Field(max_length=128)  # CIDR or single IP
    description: str | None = Field(default=None, max_length=512)
    is_active: bool = Field(default=True)
    sort_order: int = Field(default=0)
    created_at: datetime = Field(default_factory=_utc_now)
    updated_at: datetime = Field(default_factory=_utc_now)


# ---------------------------------------------------------------------------
# UnifyAlarm - Alarm configuration
# ---------------------------------------------------------------------------


class UnifyAlarm(SQLModel, table=True):
    __tablename__ = "unify_alarm"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(max_length=255, index=True)
    alarm_type: str = Field(max_length=64, index=True)
    config: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSONB))
    is_enabled: bool = Field(default=True)
    created_at: datetime = Field(default_factory=_utc_now)
    updated_at: datetime = Field(default_factory=_utc_now)


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
    commit_message: str | None = Field(default=None, max_length=512)
    committed_at: datetime = Field(default_factory=_utc_now)

    api_assignment: "ApiAssignment" = Relationship(back_populates="version_commits")


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
    created_at: datetime = Field(default_factory=_utc_now)

    api_assignment: "ApiAssignment" = Relationship(back_populates="access_records")
    app_client: "AppClient" = Relationship(back_populates="access_records")
