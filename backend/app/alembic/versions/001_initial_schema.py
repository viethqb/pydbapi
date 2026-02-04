"""Full schema (single migration): user, dbapi, macro_def, permission.

Revision ID: 001_initial_schema
Revises:
Create Date: 2026-02-04

Replaces all previous migrations. Matches app.models, app.models_dbapi, app.models_permission.
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from sqlalchemy.dialects import postgresql

revision = "001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ----- Enums -----
    op.execute(
        """
        DO $$ BEGIN
            CREATE TYPE producttypeenum AS ENUM ('postgres', 'mysql');
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
        """
    )
    op.execute(
        """
        DO $$ BEGIN
            CREATE TYPE httpmethodenum AS ENUM ('GET', 'POST', 'PUT', 'DELETE', 'PATCH');
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
        """
    )
    op.execute(
        """
        DO $$ BEGIN
            CREATE TYPE executeengineenum AS ENUM ('SQL', 'SCRIPT');
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
        """
    )
    op.execute(
        """
        DO $$ BEGIN
            CREATE TYPE apiaccesstypeenum AS ENUM ('public', 'private');
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
        """
    )
    op.execute(
        """
        DO $$ BEGIN
            CREATE TYPE macrotypeenum AS ENUM ('JINJA', 'PYTHON');
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
        """
    )
    op.execute(
        """
        DO $$ BEGIN
            CREATE TYPE resourcetypeenum AS ENUM (
                'datasource', 'module', 'group', 'api_assignment',
                'macro_def', 'client', 'user', 'overview'
            );
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
        """
    )
    op.execute(
        """
        DO $$ BEGIN
            CREATE TYPE permissionactionenum AS ENUM ('read', 'create', 'update', 'delete', 'execute');
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
        """
    )

    # ----- Tables (dependency order) -----
    op.create_table(
        "api_group",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column(
            "description", sqlmodel.sql.sqltypes.AutoString(length=512), nullable=True
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_api_group_name"), "api_group", ["name"], unique=False)

    op.create_table(
        "api_module",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column(
            "description", sqlmodel.sql.sqltypes.AutoString(length=512), nullable=True
        ),
        sa.Column(
            "path_prefix", sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False
        ),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_api_module_name"), "api_module", ["name"], unique=False)

    op.create_table(
        "datasource",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column(
            "product_type",
            postgresql.ENUM(
                "postgres", "mysql", name="producttypeenum", create_type=False
            ),
            nullable=False,
        ),
        sa.Column("host", sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column("port", sa.Integer(), nullable=False),
        sa.Column(
            "database", sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False
        ),
        sa.Column(
            "username", sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False
        ),
        sa.Column(
            "password", sqlmodel.sql.sqltypes.AutoString(length=512), nullable=False
        ),
        sa.Column(
            "driver_version", sqlmodel.sql.sqltypes.AutoString(length=64), nullable=True
        ),
        sa.Column(
            "description", sqlmodel.sql.sqltypes.AutoString(length=512), nullable=True
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_datasource_name"), "datasource", ["name"], unique=False)
    op.create_index(
        op.f("ix_datasource_product_type"), "datasource", ["product_type"], unique=False
    )

    op.create_table(
        "user",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "email", sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False
        ),
        sa.Column(
            "hashed_password", sqlmodel.sql.sqltypes.AutoString(), nullable=False
        ),
        sa.Column(
            "full_name", sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("is_superuser", sa.Boolean(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_user_email"), "user", ["email"], unique=True)

    op.create_table(
        "app_client",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column(
            "client_id", sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False
        ),
        sa.Column(
            "client_secret",
            sqlmodel.sql.sqltypes.AutoString(length=512),
            nullable=False,
        ),
        sa.Column(
            "description", sqlmodel.sql.sqltypes.AutoString(length=512), nullable=True
        ),
        sa.Column("rate_limit_per_minute", sa.Integer(), nullable=True),
        sa.Column("max_concurrent", sa.Integer(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("client_id"),
    )
    op.create_index(op.f("ix_app_client_name"), "app_client", ["name"], unique=False)
    op.create_index(
        op.f("ix_app_client_client_id"), "app_client", ["client_id"], unique=True
    )

    op.create_table(
        "api_assignment",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("module_id", sa.Uuid(), nullable=False),
        sa.Column("name", sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column("path", sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column(
            "http_method",
            postgresql.ENUM(
                "GET",
                "POST",
                "PUT",
                "DELETE",
                "PATCH",
                name="httpmethodenum",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column(
            "execute_engine",
            postgresql.ENUM(
                "SQL", "SCRIPT", name="executeengineenum", create_type=False
            ),
            nullable=False,
        ),
        sa.Column("datasource_id", sa.Uuid(), nullable=True),
        sa.Column(
            "description", sqlmodel.sql.sqltypes.AutoString(length=512), nullable=True
        ),
        sa.Column("is_published", sa.Boolean(), nullable=False),
        sa.Column(
            "access_type",
            postgresql.ENUM(
                "public", "private", name="apiaccesstypeenum", create_type=False
            ),
            nullable=False,
        ),
        sa.Column("rate_limit_per_minute", sa.Integer(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["datasource_id"], ["datasource.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(["module_id"], ["api_module.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_api_assignment_module_id"),
        "api_assignment",
        ["module_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_api_assignment_name"), "api_assignment", ["name"], unique=False
    )
    op.create_index(
        op.f("ix_api_assignment_http_method"),
        "api_assignment",
        ["http_method"],
        unique=False,
    )
    op.create_index(
        op.f("ix_api_assignment_execute_engine"),
        "api_assignment",
        ["execute_engine"],
        unique=False,
    )
    op.create_index(
        op.f("ix_api_assignment_datasource_id"),
        "api_assignment",
        ["datasource_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_api_assignment_access_type"),
        "api_assignment",
        ["access_type"],
        unique=False,
    )

    op.create_table(
        "api_assignment_group_link",
        sa.Column("api_assignment_id", sa.Uuid(), nullable=False),
        sa.Column("api_group_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["api_assignment_id"], ["api_assignment.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["api_group_id"], ["api_group.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("api_assignment_id", "api_group_id"),
    )

    op.create_table(
        "api_context",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("api_assignment_id", sa.Uuid(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("params", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "param_validates", postgresql.JSONB(astext_type=sa.Text()), nullable=True
        ),
        sa.Column("result_transform", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["api_assignment_id"], ["api_assignment.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("api_assignment_id"),
    )
    op.create_index(
        op.f("ix_api_context_api_assignment_id"),
        "api_context",
        ["api_assignment_id"],
        unique=True,
    )

    op.create_table(
        "version_commit",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("api_assignment_id", sa.Uuid(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("content_snapshot", sa.Text(), nullable=False),
        sa.Column(
            "commit_message",
            sqlmodel.sql.sqltypes.AutoString(length=512),
            nullable=True,
        ),
        sa.Column("committed_by_id", sa.Uuid(), nullable=True),
        sa.Column("committed_at", sa.DateTime(), nullable=False),
        sa.Column(
            "params_snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=True
        ),
        sa.Column(
            "param_validates_snapshot",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.Column("result_transform_snapshot", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(
            ["api_assignment_id"], ["api_assignment.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["committed_by_id"], ["user.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_version_commit_api_assignment_id"),
        "version_commit",
        ["api_assignment_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_version_commit_committed_by_id"),
        "version_commit",
        ["committed_by_id"],
        unique=False,
    )

    op.add_column(
        "api_assignment", sa.Column("published_version_id", sa.Uuid(), nullable=True)
    )
    op.create_index(
        op.f("ix_api_assignment_published_version_id"),
        "api_assignment",
        ["published_version_id"],
        unique=False,
    )
    op.create_foreign_key(
        "fk_api_assignment_published_version_id_version_commit",
        "api_assignment",
        "version_commit",
        ["published_version_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.create_table(
        "app_client_group_link",
        sa.Column("app_client_id", sa.Uuid(), nullable=False),
        sa.Column("api_group_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["app_client_id"], ["app_client.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["api_group_id"], ["api_group.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("app_client_id", "api_group_id"),
    )

    op.create_table(
        "app_client_api_link",
        sa.Column("app_client_id", sa.Uuid(), nullable=False),
        sa.Column("api_assignment_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["app_client_id"], ["app_client.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["api_assignment_id"], ["api_assignment.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("app_client_id", "api_assignment_id"),
    )

    op.create_table(
        "access_record",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("api_assignment_id", sa.Uuid(), nullable=True),
        sa.Column("app_client_id", sa.Uuid(), nullable=True),
        sa.Column(
            "ip_address", sqlmodel.sql.sqltypes.AutoString(length=64), nullable=False
        ),
        sa.Column(
            "http_method", sqlmodel.sql.sqltypes.AutoString(length=16), nullable=False
        ),
        sa.Column("path", sqlmodel.sql.sqltypes.AutoString(length=512), nullable=False),
        sa.Column("status_code", sa.Integer(), nullable=False),
        sa.Column("request_body", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["api_assignment_id"], ["api_assignment.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["app_client_id"], ["app_client.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_access_record_api_assignment_id"),
        "access_record",
        ["api_assignment_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_access_record_app_client_id"),
        "access_record",
        ["app_client_id"],
        unique=False,
    )

    # ----- Macro def: api_macro_def first, then macro_def_version_commit (circular FK) -----
    op.create_table(
        "api_macro_def",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("module_id", sa.Uuid(), nullable=True),
        sa.Column("name", sqlmodel.sql.sqltypes.AutoString(length=128), nullable=False),
        sa.Column(
            "macro_type",
            postgresql.ENUM("JINJA", "PYTHON", name="macrotypeenum", create_type=False),
            nullable=False,
        ),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column(
            "description", sqlmodel.sql.sqltypes.AutoString(length=512), nullable=True
        ),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("is_published", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["module_id"], ["api_module.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_api_macro_def_module_id"), "api_macro_def", ["module_id"], unique=False
    )
    op.create_index(
        op.f("ix_api_macro_def_name"), "api_macro_def", ["name"], unique=False
    )
    op.create_index(
        op.f("ix_api_macro_def_macro_type"),
        "api_macro_def",
        ["macro_type"],
        unique=False,
    )

    op.create_table(
        "macro_def_version_commit",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("api_macro_def_id", sa.Uuid(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("content_snapshot", sa.Text(), nullable=False),
        sa.Column(
            "commit_message",
            sqlmodel.sql.sqltypes.AutoString(length=512),
            nullable=True,
        ),
        sa.Column("committed_by_id", sa.Uuid(), nullable=True),
        sa.Column("committed_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["api_macro_def_id"], ["api_macro_def.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["committed_by_id"], ["user.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_macro_def_version_commit_api_macro_def_id"),
        "macro_def_version_commit",
        ["api_macro_def_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_macro_def_version_commit_committed_by_id"),
        "macro_def_version_commit",
        ["committed_by_id"],
        unique=False,
    )

    op.add_column(
        "api_macro_def", sa.Column("published_version_id", sa.Uuid(), nullable=True)
    )
    op.create_index(
        op.f("ix_api_macro_def_published_version_id"),
        "api_macro_def",
        ["published_version_id"],
        unique=False,
    )
    op.create_foreign_key(
        "fk_api_macro_def_published_version_id",
        "api_macro_def",
        "macro_def_version_commit",
        ["published_version_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # ----- Permission (role, permission, user_role_link, role_permission_link) -----
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
                "execute",
                name="permissionactionenum",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column("resource_id", sa.Uuid(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "resource_type",
            "action",
            "resource_id",
            name="uq_permission_resource_action_scope",
        ),
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

    op.drop_constraint(
        "fk_api_macro_def_published_version_id",
        "api_macro_def",
        type_="foreignkey",
    )
    op.drop_index(
        op.f("ix_api_macro_def_published_version_id"), table_name="api_macro_def"
    )
    op.drop_column("api_macro_def", "published_version_id")
    op.drop_index(op.f("ix_api_macro_def_macro_type"), table_name="api_macro_def")
    op.drop_index(op.f("ix_api_macro_def_name"), table_name="api_macro_def")
    op.drop_index(op.f("ix_api_macro_def_module_id"), table_name="api_macro_def")
    op.drop_table("api_macro_def")
    op.drop_index(
        op.f("ix_macro_def_version_commit_committed_by_id"),
        table_name="macro_def_version_commit",
    )
    op.drop_index(
        op.f("ix_macro_def_version_commit_api_macro_def_id"),
        table_name="macro_def_version_commit",
    )
    op.drop_table("macro_def_version_commit")

    op.drop_index(op.f("ix_access_record_app_client_id"), table_name="access_record")
    op.drop_index(
        op.f("ix_access_record_api_assignment_id"), table_name="access_record"
    )
    op.drop_table("access_record")
    op.drop_table("app_client_api_link")
    op.drop_table("app_client_group_link")
    op.drop_constraint(
        "fk_api_assignment_published_version_id_version_commit",
        "api_assignment",
        type_="foreignkey",
    )
    op.drop_index(
        op.f("ix_api_assignment_published_version_id"), table_name="api_assignment"
    )
    op.drop_column("api_assignment", "published_version_id")
    op.drop_index(
        op.f("ix_version_commit_committed_by_id"), table_name="version_commit"
    )
    op.drop_index(
        op.f("ix_version_commit_api_assignment_id"), table_name="version_commit"
    )
    op.drop_table("version_commit")
    op.drop_index(op.f("ix_api_context_api_assignment_id"), table_name="api_context")
    op.drop_table("api_context")
    op.drop_table("api_assignment_group_link")
    op.drop_index(op.f("ix_api_assignment_access_type"), table_name="api_assignment")
    op.drop_index(op.f("ix_api_assignment_datasource_id"), table_name="api_assignment")
    op.drop_index(op.f("ix_api_assignment_execute_engine"), table_name="api_assignment")
    op.drop_index(op.f("ix_api_assignment_http_method"), table_name="api_assignment")
    op.drop_index(op.f("ix_api_assignment_name"), table_name="api_assignment")
    op.drop_index(op.f("ix_api_assignment_module_id"), table_name="api_assignment")
    op.drop_table("api_assignment")
    op.drop_index(op.f("ix_app_client_client_id"), table_name="app_client")
    op.drop_index(op.f("ix_app_client_name"), table_name="app_client")
    op.drop_table("app_client")
    op.drop_index(op.f("ix_user_email"), table_name="user")
    op.drop_table("user")
    op.drop_index(op.f("ix_datasource_product_type"), table_name="datasource")
    op.drop_index(op.f("ix_datasource_name"), table_name="datasource")
    op.drop_table("datasource")
    op.drop_index(op.f("ix_api_module_name"), table_name="api_module")
    op.drop_table("api_module")
    op.drop_index(op.f("ix_api_group_name"), table_name="api_group")
    op.drop_table("api_group")

    op.execute("DROP TYPE IF EXISTS permissionactionenum")
    op.execute("DROP TYPE IF EXISTS resourcetypeenum")
    op.execute("DROP TYPE IF EXISTS macrotypeenum")
    op.execute("DROP TYPE IF EXISTS apiaccesstypeenum")
    op.execute("DROP TYPE IF EXISTS executeengineenum")
    op.execute("DROP TYPE IF EXISTS httpmethodenum")
    op.execute("DROP TYPE IF EXISTS producttypeenum")
