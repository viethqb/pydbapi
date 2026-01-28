"""Add param_validates to api_context

Revision ID: add_param_validates
Revises: add_version_management
Create Date: 2026-01-28 13:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'add_param_validates'
down_revision = 'add_version_management'
branch_labels = None
depends_on = None


def upgrade():
    # Add param_validates column to api_context table
    op.add_column('api_context', sa.Column('param_validates', postgresql.JSONB(astext_type=sa.Text()), nullable=True))


def downgrade():
    # Remove param_validates column from api_context
    op.drop_column('api_context', 'param_validates')
