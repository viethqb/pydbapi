"""excel engine: gap_rows and format_config for template & mapping

Revision ID: 003_excel_format_gap
Revises: 002_report_engine
Create Date: 2026-04-16 00:00:00.000000
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "003_excel_format_gap"
down_revision = "002_report_engine"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "report_template",
        sa.Column("format_config", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.add_column(
        "report_sheet_mapping",
        sa.Column("gap_rows", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "report_sheet_mapping",
        sa.Column("format_config", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade():
    op.drop_column("report_sheet_mapping", "format_config")
    op.drop_column("report_sheet_mapping", "gap_rows")
    op.drop_column("report_template", "format_config")
