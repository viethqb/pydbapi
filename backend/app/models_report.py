"""
Report engine models.

Hierarchy: ReportModule → ReportTemplate → ReportSheetMapping / ReportExecution
Client access: module-level and template-level via link tables.
"""

import uuid
from datetime import UTC, datetime
from enum import Enum
from typing import Any, Optional

from sqlalchemy import Column, Text, UniqueConstraint
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, Relationship, SQLModel


def _utc_now() -> datetime:
    return datetime.now(UTC)


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class SheetWriteModeEnum(str, Enum):
    ROWS = "rows"
    SINGLE = "single"


class ExecutionStatusEnum(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"


# ---------------------------------------------------------------------------
# ReportModule - groups templates with shared MinIO + SQL datasources
# ---------------------------------------------------------------------------


class ReportModule(SQLModel, table=True):
    __tablename__ = "report_module"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(max_length=255, unique=True, index=True)
    description: str | None = Field(default=None, max_length=512)
    minio_datasource_id: uuid.UUID = Field(
        foreign_key="datasource.id",
        nullable=False,
        index=True,
        ondelete="RESTRICT",
    )
    sql_datasource_id: uuid.UUID = Field(
        foreign_key="datasource.id",
        nullable=False,
        index=True,
        ondelete="RESTRICT",
    )
    default_template_bucket: str = Field(default="", max_length=255)
    default_output_bucket: str = Field(default="", max_length=255)
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=_utc_now)
    updated_at: datetime = Field(default_factory=_utc_now)

    templates: list["ReportTemplate"] = Relationship(
        back_populates="report_module", cascade_delete=True
    )
    client_links: list["ReportModuleClientLink"] = Relationship(
        back_populates="report_module", cascade_delete=True
    )


# ---------------------------------------------------------------------------
# ReportTemplate - belongs to module
# ---------------------------------------------------------------------------


class ReportTemplate(SQLModel, table=True):
    __tablename__ = "report_template"
    __table_args__ = (
        UniqueConstraint("report_module_id", "name", name="uq_report_template_module_name"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    report_module_id: uuid.UUID = Field(
        foreign_key="report_module.id",
        nullable=False,
        index=True,
        ondelete="CASCADE",
    )
    name: str = Field(max_length=255, index=True)
    description: str | None = Field(default=None, max_length=512)
    template_bucket: str = Field(default="", max_length=255)
    template_path: str = Field(default="", max_length=1024)
    output_bucket: str = Field(max_length=255)
    output_prefix: str = Field(default="", max_length=1024)
    recalc_enabled: bool = Field(default=False)
    # Per-template override of REPORT_RECALC_TIMEOUT (seconds). None = use global.
    recalc_timeout_override: int | None = Field(default=None)
    output_sheet: str | None = Field(default=None, max_length=255)
    format_config: dict[str, Any] | None = Field(
        default=None, sa_column=Column(JSONB, nullable=True)
    )
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=_utc_now)
    updated_at: datetime = Field(default_factory=_utc_now)

    report_module: Optional["ReportModule"] = Relationship(back_populates="templates")
    sheet_mappings: list["ReportSheetMapping"] = Relationship(
        back_populates="report_template", cascade_delete=True
    )
    executions: list["ReportExecution"] = Relationship(back_populates="report_template")
    client_links: list["ReportTemplateClientLink"] = Relationship(
        back_populates="report_template", cascade_delete=True
    )


# ---------------------------------------------------------------------------
# ReportSheetMapping
# ---------------------------------------------------------------------------


class ReportSheetMapping(SQLModel, table=True):
    __tablename__ = "report_sheet_mapping"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    report_template_id: uuid.UUID = Field(
        foreign_key="report_template.id",
        nullable=False,
        index=True,
        ondelete="CASCADE",
    )
    sort_order: int = Field(default=0)
    sheet_name: str = Field(max_length=255)
    start_cell: str = Field(max_length=20)
    write_mode: SheetWriteModeEnum = Field(
        sa_column=Column(
            SQLEnum(SheetWriteModeEnum, name="sheetwritemodeenum",
                    create_type=True, values_callable=lambda x: [e.value for e in x]),
            nullable=False,
        ),
        default=SheetWriteModeEnum.ROWS,
    )
    write_headers: bool = Field(default=False)
    gap_rows: int = Field(default=0)
    format_config: dict[str, Any] | None = Field(
        default=None, sa_column=Column(JSONB, nullable=True)
    )
    sql_content: str = Field(sa_column=Column(Text, nullable=False))
    description: str | None = Field(default=None, max_length=255)
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=_utc_now)
    updated_at: datetime = Field(default_factory=_utc_now)

    report_template: Optional["ReportTemplate"] = Relationship(back_populates="sheet_mappings")


# ---------------------------------------------------------------------------
# ReportExecution
# ---------------------------------------------------------------------------


class ReportExecution(SQLModel, table=True):
    __tablename__ = "report_execution"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    report_template_id: uuid.UUID = Field(
        foreign_key="report_template.id",
        nullable=False,
        index=True,
        ondelete="CASCADE",
    )
    status: ExecutionStatusEnum = Field(
        sa_column=Column(
            SQLEnum(ExecutionStatusEnum, name="executionstatusenum",
                    create_type=True, values_callable=lambda x: [e.value for e in x]),
            nullable=False, index=True,
        ),
        default=ExecutionStatusEnum.PENDING,
    )
    parameters: dict[str, Any] | None = Field(
        default=None, sa_column=Column(JSONB, nullable=True)
    )
    output_minio_path: str | None = Field(default=None, max_length=1024)
    output_url: str | None = Field(default=None, sa_column=Column(Text, nullable=True))
    error_message: str | None = Field(default=None, sa_column=Column(Text, nullable=True))
    # Progress tracking for async reports. processed_rows is the cumulative
    # number of data rows written across all mappings so far; progress_pct is
    # a best-effort percent estimate (0-100, None when unknown).
    processed_rows: int = Field(default=0)
    progress_pct: int | None = Field(default=None)
    started_at: datetime | None = Field(default=None)
    completed_at: datetime | None = Field(default=None)
    created_at: datetime = Field(default_factory=_utc_now)

    report_template: Optional["ReportTemplate"] = Relationship(back_populates="executions")


# ---------------------------------------------------------------------------
# Client Link Tables (M2M)
# ---------------------------------------------------------------------------


class ReportModuleClientLink(SQLModel, table=True):
    __tablename__ = "report_module_client_link"

    report_module_id: uuid.UUID = Field(
        foreign_key="report_module.id", primary_key=True, ondelete="CASCADE"
    )
    app_client_id: uuid.UUID = Field(
        foreign_key="app_client.id", primary_key=True, ondelete="CASCADE"
    )
    created_at: datetime = Field(default_factory=_utc_now)

    report_module: Optional["ReportModule"] = Relationship(back_populates="client_links")


class ReportTemplateClientLink(SQLModel, table=True):
    __tablename__ = "report_template_client_link"

    report_template_id: uuid.UUID = Field(
        foreign_key="report_template.id", primary_key=True, ondelete="CASCADE"
    )
    app_client_id: uuid.UUID = Field(
        foreign_key="app_client.id", primary_key=True, ondelete="CASCADE"
    )
    created_at: datetime = Field(default_factory=_utc_now)

    report_template: Optional["ReportTemplate"] = Relationship(back_populates="client_links")
