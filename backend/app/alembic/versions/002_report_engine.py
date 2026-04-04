"""report engine v2: module hierarchy, templates, mappings, executions, client links

Revision ID: 002_report_engine
Revises: 001_initial_schema
Create Date: 2026-04-04 10:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from sqlalchemy.dialects import postgresql

revision = "002_report_engine"
down_revision = "001_initial_schema"
branch_labels = None
depends_on = None


def upgrade():
    # --- Enum values ---
    op.execute("ALTER TYPE producttypeenum ADD VALUE IF NOT EXISTS 'minio'")
    op.execute("ALTER TYPE resourcetypeenum ADD VALUE IF NOT EXISTS 'report_module'")

    # --- report_module ---
    op.create_table(
        "report_module",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column("description", sqlmodel.sql.sqltypes.AutoString(length=512), nullable=True),
        sa.Column("minio_datasource_id", sa.Uuid(), nullable=False),
        sa.Column("sql_datasource_id", sa.Uuid(), nullable=False),
        sa.Column("default_template_bucket", sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False, server_default=""),
        sa.Column("default_output_bucket", sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False, server_default=""),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name", name="uq_report_module_name"),
        sa.ForeignKeyConstraint(["minio_datasource_id"], ["datasource.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["sql_datasource_id"], ["datasource.id"], ondelete="RESTRICT"),
    )
    op.create_index("ix_report_module_name", "report_module", ["name"], unique=True)

    # --- report_template ---
    op.create_table(
        "report_template",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("report_module_id", sa.Uuid(), nullable=False),
        sa.Column("name", sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column("description", sqlmodel.sql.sqltypes.AutoString(length=512), nullable=True),
        sa.Column("template_bucket", sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column("template_path", sqlmodel.sql.sqltypes.AutoString(length=1024), nullable=False),
        sa.Column("output_bucket", sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column("output_prefix", sqlmodel.sql.sqltypes.AutoString(length=1024), nullable=False, server_default=""),
        sa.Column("recalc_enabled", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("output_sheet", sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("report_module_id", "name", name="uq_report_template_module_name"),
        sa.ForeignKeyConstraint(["report_module_id"], ["report_module.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_report_template_report_module_id", "report_template", ["report_module_id"])
    op.create_index("ix_report_template_name", "report_template", ["name"])

    # --- report_sheet_mapping ---
    op.create_table(
        "report_sheet_mapping",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("report_template_id", sa.Uuid(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("sheet_name", sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column("start_cell", sqlmodel.sql.sqltypes.AutoString(length=20), nullable=False),
        sa.Column("write_mode", sa.Enum("rows", "single", name="sheetwritemodeenum", create_type=True), nullable=False, server_default="rows"),
        sa.Column("write_headers", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("sql_content", sa.Text(), nullable=False),
        sa.Column("description", sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["report_template_id"], ["report_template.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_report_sheet_mapping_report_template_id", "report_sheet_mapping", ["report_template_id"])

    # --- report_execution ---
    op.create_table(
        "report_execution",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("report_template_id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.Enum("pending", "running", "success", "failed", name="executionstatusenum", create_type=True), nullable=False, server_default="pending"),
        sa.Column("parameters", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("output_minio_path", sqlmodel.sql.sqltypes.AutoString(length=1024), nullable=True),
        sa.Column("output_url", sa.Text(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["report_template_id"], ["report_template.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_report_execution_report_template_id", "report_execution", ["report_template_id"])
    op.create_index("ix_report_execution_status", "report_execution", ["status"])

    # --- report_module_client_link ---
    op.create_table(
        "report_module_client_link",
        sa.Column("report_module_id", sa.Uuid(), nullable=False),
        sa.Column("app_client_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("report_module_id", "app_client_id"),
        sa.ForeignKeyConstraint(["report_module_id"], ["report_module.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["app_client_id"], ["app_client.id"], ondelete="CASCADE"),
    )

    # --- report_template_client_link ---
    op.create_table(
        "report_template_client_link",
        sa.Column("report_template_id", sa.Uuid(), nullable=False),
        sa.Column("app_client_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("report_template_id", "app_client_id"),
        sa.ForeignKeyConstraint(["report_template_id"], ["report_template.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["app_client_id"], ["app_client.id"], ondelete="CASCADE"),
    )


def downgrade():
    op.drop_table("report_template_client_link")
    op.drop_table("report_module_client_link")
    op.drop_table("report_execution")
    op.drop_table("report_sheet_mapping")
    op.drop_table("report_template")
    op.drop_table("report_module")
    op.execute("DROP TYPE IF EXISTS executionstatusenum")
    op.execute("DROP TYPE IF EXISTS sheetwritemodeenum")
