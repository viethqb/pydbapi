"""excel engine: recalc timeout override on template, progress tracking on execution

Revision ID: 004_excel_progress_and_retry
Revises: 003_excel_format_gap
Create Date: 2026-04-23 00:00:00.000000
"""
import sqlalchemy as sa
from alembic import op

revision = "004_excel_progress_and_retry"
down_revision = "003_excel_format_gap"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "report_template",
        sa.Column("recalc_timeout_override", sa.Integer(), nullable=True),
    )
    op.add_column(
        "report_execution",
        sa.Column("processed_rows", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "report_execution",
        sa.Column("progress_pct", sa.Integer(), nullable=True),
    )


def downgrade():
    op.drop_column("report_execution", "progress_pct")
    op.drop_column("report_execution", "processed_rows")
    op.drop_column("report_template", "recalc_timeout_override")
