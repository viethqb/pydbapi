"""Add close_connection_after_execute to datasource (StarRocks impersonation).

Revision ID: 002_close_conn
Revises: 001_initial_schema
Create Date: 2026-02-04

When True, connection is closed after each request instead of being returned
to the pool. Required for StarRocks EXECUTE AS user WITH NO REVERT (impersonation).
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "002_close_conn"
down_revision = "001_initial_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "datasource",
        sa.Column(
            "close_connection_after_execute",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    op.drop_column("datasource", "close_connection_after_execute")
