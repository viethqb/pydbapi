"""Add permission tables (Role, Permission, user_role_link, role_permission_link)

Phase 1 – PERMISSION_PLAN_SUPERSET_STYLE.

Revision ID: 007_permission_tables
Revises: 006_max_concurrent_client
Create Date: 2026-02-03

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "007_permission_tables"
down_revision = "006_max_concurrent_client"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create enums for permission
    op.execute(
        """
        DO $$ BEGIN
            CREATE TYPE resourcetypeenum AS ENUM (
                'datasource', 'module', 'group', 'api_assignment',
                'macro_def', 'client', 'user', 'overview'
            );
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
    """
    )
    op.execute(
        """
        DO $$ BEGIN
            CREATE TYPE permissionactionenum AS ENUM ('read', 'create', 'update', 'delete');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
    """
    )

    op.create_table(
        "role",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=64), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_role_name"), "role", ["name"], unique=True)

    op.create_table(
        "permission",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "resource_type",
            postgresql.ENUM(
                "datasource",
                "module",
                "group",
                "api_assignment",
                "macro_def",
                "client",
                "user",
                "overview",
                name="resourcetypeenum",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column(
            "action",
            postgresql.ENUM(
                "read",
                "create",
                "update",
                "delete",
                name="permissionactionenum",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column("resource_id", sa.Uuid(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_permission_resource_type"),
        "permission",
        ["resource_type"],
        unique=False,
    )
    op.create_index(
        op.f("ix_permission_action"), "permission", ["action"], unique=False
    )

    op.create_table(
        "user_role_link",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("role_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["role_id"], ["role.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "role_id"),
        sa.UniqueConstraint("user_id", "role_id", name="uq_user_role"),
    )

    op.create_table(
        "role_permission_link",
        sa.Column("role_id", sa.Uuid(), nullable=False),
        sa.Column("permission_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["permission_id"], ["permission.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["role_id"], ["role.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("role_id", "permission_id"),
        sa.UniqueConstraint("role_id", "permission_id", name="uq_role_permission"),
    )


def downgrade() -> None:
    op.drop_table("role_permission_link")
    op.drop_table("user_role_link")
    op.drop_index(op.f("ix_permission_action"), table_name="permission")
    op.drop_index(op.f("ix_permission_resource_type"), table_name="permission")
    op.drop_table("permission")
    op.drop_index(op.f("ix_role_name"), table_name="role")
    op.drop_table("role")
    op.execute("DROP TYPE IF EXISTS permissionactionenum")
    op.execute("DROP TYPE IF EXISTS resourcetypeenum")
