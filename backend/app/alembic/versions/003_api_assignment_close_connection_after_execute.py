"""Add close_connection_after_execute to api_assignment (StarRocks impersonation).

Revision ID: 003_api_close_conn
Revises: 002_close_conn
Create Date: 2026-02-04

Config at API level: close DB connection after each request for this API only.
Required for StarRocks EXECUTE AS user WITH NO REVERT (impersonation).
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "003_api_close_conn"
down_revision = "002_close_conn"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "api_assignment",
        sa.Column(
            "close_connection_after_execute",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    op.drop_column("api_assignment", "close_connection_after_execute")
