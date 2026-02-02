"""Add api_macro table for Jinja macros and Python functions

Revision ID: 003_add_api_macro
Revises: 002_add_rate_limit_per_minute
Create Date: 2026-02-02

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from sqlalchemy.dialects import postgresql

revision = "003_add_api_macro"
down_revision = "002_add_rate_limit_per_minute"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        DO $$ BEGIN
            CREATE TYPE macrotypeenum AS ENUM ('JINJA', 'PYTHON');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
    """
    )
    op.create_table(
        "api_macro",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "module_id",
            sa.Uuid(),
            nullable=True,
        ),
        sa.Column("name", sqlmodel.sql.sqltypes.AutoString(length=128), nullable=False),
        sa.Column(
            "macro_type",
            postgresql.ENUM("JINJA", "PYTHON", name="macrotypeenum", create_type=False),
            nullable=False,
        ),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column(
            "description",
            sqlmodel.sql.sqltypes.AutoString(length=512),
            nullable=True,
        ),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["module_id"],
            ["api_module.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_api_macro_module_id"), "api_macro", ["module_id"], unique=False)
    op.create_index(op.f("ix_api_macro_name"), "api_macro", ["name"], unique=False)
    op.create_index(op.f("ix_api_macro_macro_type"), "api_macro", ["macro_type"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_api_macro_macro_type"), table_name="api_macro")
    op.drop_index(op.f("ix_api_macro_name"), table_name="api_macro")
    op.drop_index(op.f("ix_api_macro_module_id"), table_name="api_macro")
    op.drop_table("api_macro")
    op.execute("DROP TYPE IF EXISTS macrotypeenum")
