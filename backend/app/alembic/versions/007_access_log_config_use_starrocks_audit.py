"""Add use_starrocks_audit to access_log_config.

Revision ID: 007_use_starrocks_audit
Revises: 006_access_log_config
Create Date: 2026-02-05

When True and datasource is MySQL, access logs are written to
starrocks_audit_db__.pydbapi_access_log_tbl__ (StarRocks audit schema).
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "007_use_starrocks_audit"
down_revision = "006_access_log_config"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "access_log_config",
        sa.Column("use_starrocks_audit", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("access_log_config", "use_starrocks_audit")
