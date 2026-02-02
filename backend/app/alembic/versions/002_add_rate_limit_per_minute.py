"""Add rate_limit_per_minute to api_assignment and app_client

Revision ID: 002_add_rate_limit
Revises: 001_schema
Create Date: 2025-02-02

"""
from alembic import op
import sqlalchemy as sa


revision = "002_add_rate_limit_per_minute"
down_revision = "001_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "api_assignment",
        sa.Column("rate_limit_per_minute", sa.Integer(), nullable=True),
    )
    op.add_column(
        "app_client",
        sa.Column("rate_limit_per_minute", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("api_assignment", "rate_limit_per_minute")
    op.drop_column("app_client", "rate_limit_per_minute")
