"""Add access_log to ResourceTypeEnum.

Revision ID: 009_access_log_resource
Revises: 008_access_record_headers_params
Create Date: For permission scope: access_log read/update for Access logs page.

"""
from alembic import op

revision = "009_access_log_resource"
down_revision = "008_access_record_headers_params"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE resourcetypeenum ADD VALUE IF NOT EXISTS 'access_log'")


def downgrade() -> None:
    # PostgreSQL does not support removing enum values easily; leave value in place
    pass
