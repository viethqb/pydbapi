"""Add request_headers and request_params to access_record.

Revision ID: 008_access_record_headers_params
Revises: 007_use_starrocks_audit
Create Date: 2026-02-05

"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "008_access_record_headers_params"
down_revision = "007_use_starrocks_audit"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "access_record",
        sa.Column("request_headers", sa.Text(), nullable=True),
    )
    op.add_column(
        "access_record",
        sa.Column("request_params", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("access_record", "request_params")
    op.drop_column("access_record", "request_headers")
