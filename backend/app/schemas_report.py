"""Pydantic schemas for Report Engine."""
import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field
from sqlmodel import SQLModel

from app.models_report import ExecutionStatusEnum, SheetWriteModeEnum

# ---------------------------------------------------------------------------
# Excel Format Config
# ---------------------------------------------------------------------------


class FontFormat(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str | None = None
    size: float | None = None
    bold: bool | None = None
    italic: bool | None = None
    color: str | None = None  # ARGB/RGB hex, e.g. "FF0000" or "FFFF0000"


class FillFormat(BaseModel):
    model_config = ConfigDict(extra="forbid")
    bg_color: str | None = None
    pattern: str | None = None  # e.g. "solid"


class BorderFormat(BaseModel):
    model_config = ConfigDict(extra="forbid")
    style: str | None = None  # thin, medium, thick, dashed, dotted
    color: str | None = None


class AlignmentFormat(BaseModel):
    model_config = ConfigDict(extra="forbid")
    horizontal: str | None = None  # left, center, right, justify
    vertical: str | None = None  # top, center, bottom
    wrap_text: bool | None = None


class CellFormat(BaseModel):
    model_config = ConfigDict(extra="forbid")
    font: FontFormat | None = None
    fill: FillFormat | None = None
    border: BorderFormat | None = None
    alignment: AlignmentFormat | None = None
    number_format: str | None = None


class FormatConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    header: CellFormat | None = None
    data: CellFormat | None = None
    column_widths: dict[str, float] | None = None  # {"A": 15, "B": 20}
    auto_fit: bool | None = None
    auto_fit_max_width: float | None = None  # default 50
    wrap_text: bool | None = None

# ---------------------------------------------------------------------------
# ReportModule
# ---------------------------------------------------------------------------

class ReportModuleCreate(SQLModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=512)
    minio_datasource_id: uuid.UUID
    sql_datasource_id: uuid.UUID
    default_template_bucket: str = Field(default="", max_length=255)
    default_output_bucket: str = Field(default="", max_length=255)

class ReportModuleUpdate(SQLModel):
    id: uuid.UUID
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    minio_datasource_id: uuid.UUID | None = None
    sql_datasource_id: uuid.UUID | None = None
    default_template_bucket: str | None = None
    default_output_bucket: str | None = None
    is_active: bool | None = None

class ReportModulePublic(SQLModel):
    id: uuid.UUID
    name: str
    description: str | None
    minio_datasource_id: uuid.UUID
    sql_datasource_id: uuid.UUID
    default_template_bucket: str
    default_output_bucket: str
    is_active: bool
    created_at: datetime
    updated_at: datetime

class ReportModuleDetail(ReportModulePublic):
    templates: list["ReportTemplatePublic"] = Field(default_factory=list)
    client_ids: list[uuid.UUID] = Field(default_factory=list)

class ReportModuleListIn(SQLModel):
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)
    name__ilike: str | None = Field(default=None, max_length=255)
    is_active: bool | None = None

class ReportModuleListOut(SQLModel):
    data: list[ReportModulePublic]
    total: int

# ---------------------------------------------------------------------------
# ReportTemplate
# ---------------------------------------------------------------------------

class SheetMappingCreate(SQLModel):
    sort_order: int = 0
    sheet_name: str = Field(..., min_length=1, max_length=255)
    start_cell: str = Field(..., min_length=1, max_length=20)
    write_mode: SheetWriteModeEnum = SheetWriteModeEnum.ROWS
    write_headers: bool = False
    gap_rows: int = Field(default=0, ge=0)
    format_config: FormatConfig | None = None
    sql_content: str = Field(..., min_length=1)
    description: str | None = Field(default=None, max_length=255)

class ReportTemplateCreate(SQLModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=512)
    template_bucket: str = Field(default="", max_length=255)
    template_path: str = Field(default="", max_length=1024)
    output_bucket: str = Field(..., min_length=1, max_length=255)
    output_prefix: str = Field(default="", max_length=1024)
    recalc_enabled: bool = False
    output_sheet: str | None = Field(default=None, max_length=255)
    format_config: FormatConfig | None = None
    sheet_mappings: list[SheetMappingCreate] | None = Field(default=None)

class ReportTemplateUpdate(SQLModel):
    id: uuid.UUID
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    template_bucket: str | None = None
    template_path: str | None = None
    output_bucket: str | None = None
    output_prefix: str | None = None
    recalc_enabled: bool | None = None
    output_sheet: str | None = None
    format_config: FormatConfig | None = None
    is_active: bool | None = None

class SheetMappingPublic(SQLModel):
    id: uuid.UUID
    report_template_id: uuid.UUID
    sort_order: int
    sheet_name: str
    start_cell: str
    write_mode: SheetWriteModeEnum
    write_headers: bool
    gap_rows: int
    format_config: dict[str, Any] | None
    sql_content: str
    description: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime

class ReportTemplatePublic(SQLModel):
    id: uuid.UUID
    report_module_id: uuid.UUID
    name: str
    description: str | None
    template_bucket: str
    template_path: str
    output_bucket: str
    output_prefix: str
    recalc_enabled: bool
    output_sheet: str | None
    format_config: dict[str, Any] | None
    is_active: bool
    created_at: datetime
    updated_at: datetime

class ReportTemplateDetail(ReportTemplatePublic):
    sheet_mappings: list[SheetMappingPublic] = Field(default_factory=list)
    client_ids: list[uuid.UUID] = Field(default_factory=list)

class ReportTemplateListIn(SQLModel):
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)
    name__ilike: str | None = Field(default=None, max_length=255)
    module_id: uuid.UUID | None = None
    is_active: bool | None = None

class ReportTemplateListOut(SQLModel):
    data: list[ReportTemplatePublic]
    total: int

# ---------------------------------------------------------------------------
# SheetMapping
# ---------------------------------------------------------------------------

class SheetMappingUpdate(SQLModel):
    id: uuid.UUID
    sort_order: int | None = None
    sheet_name: str | None = None
    start_cell: str | None = None
    write_mode: SheetWriteModeEnum | None = None
    write_headers: bool | None = None
    gap_rows: int | None = Field(default=None, ge=0)
    format_config: FormatConfig | None = None
    sql_content: str | None = None
    description: str | None = None
    is_active: bool | None = None

class SheetMappingBatchUpdate(SQLModel):
    mappings: list[SheetMappingUpdate]

class SheetMappingListOut(SQLModel):
    data: list[SheetMappingPublic]
    total: int

# ---------------------------------------------------------------------------
# Client Links
# ---------------------------------------------------------------------------

class ClientIdsUpdate(SQLModel):
    client_ids: list[uuid.UUID]

class ClientIdsOut(SQLModel):
    client_ids: list[uuid.UUID]

# ---------------------------------------------------------------------------
# Execution
# ---------------------------------------------------------------------------

class ReportGenerateIn(SQLModel):
    parameters: dict[str, Any] | None = None
    is_async: bool = Field(default=False, alias="async")
    model_config = {"populate_by_name": True}

class ReportGenerateOut(SQLModel):
    execution_id: uuid.UUID
    status: ExecutionStatusEnum
    output_url: str | None = None
    output_minio_path: str | None = None

class ReportExecutionPublic(SQLModel):
    id: uuid.UUID
    report_template_id: uuid.UUID
    status: ExecutionStatusEnum
    parameters: dict[str, Any] | None
    output_minio_path: str | None
    output_url: str | None
    error_message: str | None
    started_at: datetime | None
    completed_at: datetime | None
    created_at: datetime

class ReportExecutionListOut(SQLModel):
    data: list[ReportExecutionPublic]
    total: int
