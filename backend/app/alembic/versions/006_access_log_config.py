"""Add access_log_config table (singleton: which datasource stores access logs).

Revision ID: 006_access_log_config
Revises: 005_datasource_use_ssl
Create Date: 2026-02-05

When datasource_id is set, access_record rows are written to that external DB
(e.g. StarRocks/MySQL/Postgres) for better performance. NULL = use main DB.
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "006_access_log_config"
down_revision = "005_datasource_use_ssl"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "access_log_config",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("datasource_id", sa.Uuid(), nullable=True),
        sa.ForeignKeyConstraint(
            ["datasource_id"],
            ["datasource.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_access_log_config_datasource_id"),
        "access_log_config",
        ["datasource_id"],
        unique=False,
    )
    op.execute("INSERT INTO access_log_config (id, datasource_id) VALUES (1, NULL)")


def downgrade() -> None:
    op.drop_index(
        op.f("ix_access_log_config_datasource_id"),
        table_name="access_log_config",
    )
    op.drop_table("access_log_config")
