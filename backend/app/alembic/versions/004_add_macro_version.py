"""Add macro version and publish (macro_version_commit, is_published, published_version_id)

Revision ID: 004_add_macro_version
Revises: 003_add_api_macro
Create Date: 2026-02-02

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "004_add_macro_version"
down_revision = "003_add_api_macro"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "macro_version_commit",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("api_macro_id", sa.Uuid(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("content_snapshot", sa.Text(), nullable=False),
        sa.Column("commit_message", sa.String(512), nullable=True),
        sa.Column("committed_by_id", sa.Uuid(), nullable=True),
        sa.Column("committed_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["api_macro_id"],
            ["api_macro.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["committed_by_id"],
            ["user.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_macro_version_commit_api_macro_id"),
        "macro_version_commit",
        ["api_macro_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_macro_version_commit_committed_by_id"),
        "macro_version_commit",
        ["committed_by_id"],
        unique=False,
    )

    op.add_column(
        "api_macro",
        sa.Column("is_published", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column(
        "api_macro",
        sa.Column("published_version_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        "fk_api_macro_published_version_id",
        "api_macro",
        "macro_version_commit",
        ["published_version_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_api_macro_published_version_id",
        "api_macro",
        type_="foreignkey",
    )
    op.drop_column("api_macro", "published_version_id")
    op.drop_column("api_macro", "is_published")
    op.drop_index(
        op.f("ix_macro_version_commit_committed_by_id"),
        table_name="macro_version_commit",
    )
    op.drop_index(
        op.f("ix_macro_version_commit_api_macro_id"),
        table_name="macro_version_commit",
    )
    op.drop_table("macro_version_commit")
    op.drop_column("api_macro", "published_version_id")
    op.drop_column("api_macro", "is_published")
