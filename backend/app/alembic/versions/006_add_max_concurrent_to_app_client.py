"""Add max_concurrent to app_client (per-client limit for concurrent requests)

Revision ID: 006_max_concurrent
Revises: 005_rename_macro_to_macro_def
Create Date: 2026-02-02

"""

from alembic import op
import sqlalchemy as sa


revision = "006_max_concurrent_client"
down_revision = "005_rename_macro_to_macro_def"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "app_client",
        sa.Column("max_concurrent", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("app_client", "max_concurrent")
