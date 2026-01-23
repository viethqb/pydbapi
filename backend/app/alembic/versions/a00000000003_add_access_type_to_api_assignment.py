"""Add access_type column to api_assignment

Revision ID: a00000000003
Revises: a00000000002
Create Date: 2025-01-23 XX:XX:XX.XXXXXX

Add access_type enum column to api_assignment table for public/private API access control.
"""
from alembic import op
import sqlalchemy as sa

revision = "a00000000003"
down_revision = "a00000000002"
branch_labels = None
depends_on = None


def upgrade():
    """Add access_type enum and column to api_assignment table."""
    # Create enum type directly with string values (same pattern as initial migration)
    op.execute("CREATE TYPE apiaccesstypeenum AS ENUM ('public', 'private')")
    
    # Add column with default value 'private'
    op.add_column(
        "api_assignment",
        sa.Column(
            "access_type",
            sa.Enum("public", "private", name="apiaccesstypeenum", create_type=False),
            nullable=False,
            server_default=sa.text("'private'"),
        ),
    )
    op.create_index(op.f("ix_api_assignment_access_type"), "api_assignment", ["access_type"])


def downgrade():
    """Remove access_type column and enum type from api_assignment table."""
    op.drop_index(op.f("ix_api_assignment_access_type"), table_name="api_assignment")
    op.drop_column("api_assignment", "access_type")
    sa.Enum(name="apiaccesstypeenum").drop(op.get_bind(), checkfirst=True)
