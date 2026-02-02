"""Rename macro to macro_def: api_macro->api_macro_def, macro_version_commit->macro_def_version_commit

Revision ID: 005_rename_macro_to_macro_def
Revises: 004_add_macro_version
Create Date: 2026-02-02

"""
from alembic import op

revision = "005_rename_macro_to_macro_def"
down_revision = "004_add_macro_version"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.rename_table("api_macro", "api_macro_def")
    op.rename_table("macro_version_commit", "macro_def_version_commit")
    op.alter_column(
        "macro_def_version_commit",
        "api_macro_id",
        new_column_name="api_macro_def_id",
    )
    # Update FK from api_macro_def.published_version_id (references macro_def_version_commit)
    op.drop_constraint(
        "fk_api_macro_published_version_id",
        "api_macro_def",
        type_="foreignkey",
    )
    op.create_foreign_key(
        "fk_api_macro_def_published_version_id",
        "api_macro_def",
        "macro_def_version_commit",
        ["published_version_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_api_macro_def_published_version_id",
        "api_macro_def",
        type_="foreignkey",
    )
    op.create_foreign_key(
        "fk_api_macro_published_version_id",
        "api_macro_def",
        "macro_def_version_commit",
        ["published_version_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.alter_column(
        "macro_def_version_commit",
        "api_macro_def_id",
        new_column_name="api_macro_id",
    )
    op.rename_table("macro_def_version_commit", "macro_version_commit")
    op.rename_table("api_macro_def", "api_macro")
