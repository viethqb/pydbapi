"""Add 'execute' to permissionactionenum (test/debug API, datasource test).

Revision ID: 008_execute_action
Revises: 007_permission_tables
Create Date: 2026-02-03

"""

from alembic import op

revision = "008_execute_action"
down_revision = "007_permission_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # PostgreSQL: add new value to existing enum
    op.execute("ALTER TYPE permissionactionenum ADD VALUE IF NOT EXISTS 'execute';")


def downgrade() -> None:
    # PostgreSQL: cannot remove enum value easily; leave enum as-is for safety
    pass
