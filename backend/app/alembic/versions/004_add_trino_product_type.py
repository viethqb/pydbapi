"""Add trino to ProductTypeEnum.

Revision ID: 004_add_trino_product_type
Revises: 003_api_assignment_close_connection_after_execute
Create Date: 2026-02-04

"""

from __future__ import annotations

from alembic import op

revision = "004_add_trino_product_type"
down_revision = "003_api_close_conn"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE producttypeenum ADD VALUE IF NOT EXISTS 'trino'")


def downgrade() -> None:
    # PostgreSQL does not support removing enum values; leave 'trino' in place.
    pass
