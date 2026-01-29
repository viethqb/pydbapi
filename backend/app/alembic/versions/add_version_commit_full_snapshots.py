"""Add full snapshots to version_commit

Revision ID: add_vc_full_snapshots
Revises: add_result_transform
Create Date: 2026-01-29 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "add_vc_full_snapshots"
down_revision = "add_result_transform"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "version_commit",
        sa.Column(
            "params_snapshot",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
    )
    op.add_column(
        "version_commit",
        sa.Column(
            "param_validates_snapshot",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
    )
    op.add_column(
        "version_commit",
        sa.Column("result_transform_snapshot", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("version_commit", "result_transform_snapshot")
    op.drop_column("version_commit", "param_validates_snapshot")
    op.drop_column("version_commit", "params_snapshot")

