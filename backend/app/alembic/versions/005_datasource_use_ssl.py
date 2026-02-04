"""Add use_ssl to datasource (Trino HTTPS).

Revision ID: 005_datasource_use_ssl
Revises: 004_add_trino_product_type
Create Date: 2026-02-04

For Trino: when True, use http_scheme='https' and password is required.
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "005_datasource_use_ssl"
down_revision = "004_add_trino_product_type"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "datasource",
        sa.Column(
            "use_ssl",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    op.drop_column("datasource", "use_ssl")
