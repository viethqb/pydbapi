"""Add params column to api_context

Revision ID: a00000000002
Revises: a00000000001
Create Date: 2025-01-XX XX:XX:XX.XXXXXX

Add params JSONB column to api_context table for storing parameter definitions.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "a00000000002"
down_revision = "a00000000001"
branch_labels = None
depends_on = None


def upgrade():
    """Add params JSONB column to api_context table."""
    op.add_column(
        "api_context",
        sa.Column(
            "params",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
            comment="Parameter definitions for validation: list of {name, location, data_type, is_required, validate_type, validate}",
        ),
    )


def downgrade():
    """Remove params column from api_context table."""
    op.drop_column("api_context", "params")
