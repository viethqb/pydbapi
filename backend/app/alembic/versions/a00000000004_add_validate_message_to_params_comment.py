"""Update api_context.params column comment for validate_message

Revision ID: a00000000004
Revises: a00000000003
Create Date: 2025-01-23

Document validate_message in api_context.params JSON structure.
Params JSON: list of {name, location, data_type, is_required, validate_type, validate, validate_message, default_value}.
"""
from alembic import op

revision = "a00000000004"
down_revision = "a00000000003"
branch_labels = None
depends_on = None


def upgrade():
    """Update params column comment to include validate_message."""
    op.execute(
        "COMMENT ON COLUMN api_context.params IS "
        "'Parameter definitions: list of {name, location, data_type, is_required, validate_type, validate, validate_message, default_value}'"
    )


def downgrade():
    """Restore params column comment without validate_message."""
    op.execute(
        "COMMENT ON COLUMN api_context.params IS "
        "'Parameter definitions for validation: list of {name, location, data_type, is_required, validate_type, validate, default_value}'"
    )
