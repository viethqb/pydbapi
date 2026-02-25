"""initial schema

Revision ID: 001_initial_schema
Revises: 
Create Date: 2026-02-05 13:54:40.130863

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '001_initial_schema'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    # NOTE: This revision is generated as a *single squashed migration*.
    # Alembic autogenerate may output tables in an order that doesn't satisfy
    # Postgres FK dependencies (and can include cycles). We manually order the
    # table creation and add the cyclic FKs afterwards.

    # --- Base tables (no incoming FKs) ---
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
            sa.Enum("postgres", "mysql", "trino", name="producttypeenum"),
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
        sa.Column("close_connection_after_execute", sa.Boolean(), nullable=False),
        sa.Column("use_ssl", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_datasource_name"), "datasource", ["name"], unique=False)
    op.create_index(
        op.f("ix_datasource_product_type"),
        "datasource",
        ["product_type"],
        unique=False,
    )

    op.create_table(
        "user",
        sa.Column("email", sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("is_superuser", sa.Boolean(), nullable=False),
        sa.Column(
            "full_name", sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True
        ),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("hashed_password", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
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
            "client_secret", sqlmodel.sql.sqltypes.AutoString(length=512), nullable=False
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
    )
    op.create_index(
        op.f("ix_app_client_client_id"), "app_client", ["client_id"], unique=True
    )
    op.create_index(op.f("ix_app_client_name"), "app_client", ["name"], unique=False)

    op.create_table(
        "role",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sqlmodel.sql.sqltypes.AutoString(length=64), nullable=False),
        sa.Column(
            "description", sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_role_name"), "role", ["name"], unique=True)

    op.create_table(
        "permission",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "resource_type",
            sa.Enum(
                "datasource",
                "module",
                "group",
                "api_assignment",
                "macro_def",
                "client",
                "user",
                "overview",
                "access_log",
                name="resourcetypeenum",
            ),
            nullable=False,
        ),
        sa.Column(
            "action",
            sa.Enum("read", "create", "update", "delete", "execute", name="permissionactionenum"),
            nullable=False,
        ),
        sa.Column("resource_id", sa.Uuid(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_permission_action"), "permission", ["action"], unique=False)
    op.create_index(
        op.f("ix_permission_resource_type"),
        "permission",
        ["resource_type"],
        unique=False,
    )

    # --- DBAPI core (FKs to base tables) ---
    op.create_table(
        "api_assignment",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("module_id", sa.Uuid(), nullable=False),
        sa.Column("name", sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column("path", sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column(
            "http_method",
            sa.Enum("GET", "POST", "PUT", "DELETE", "PATCH", name="httpmethodenum"),
            nullable=False,
        ),
        sa.Column(
            "execute_engine",
            sa.Enum("SQL", "SCRIPT", name="executeengineenum"),
            nullable=False,
        ),
        sa.Column("datasource_id", sa.Uuid(), nullable=True),
        sa.Column(
            "description", sqlmodel.sql.sqltypes.AutoString(length=512), nullable=True
        ),
        sa.Column("is_published", sa.Boolean(), nullable=False),
        sa.Column("published_version_id", sa.Uuid(), nullable=True),
        sa.Column(
            "access_type",
            sa.Enum("public", "private", name="apiaccesstypeenum"),
            nullable=False,
        ),
        sa.Column("rate_limit_per_minute", sa.Integer(), nullable=True),
        sa.Column("close_connection_after_execute", sa.Boolean(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["datasource_id"], ["datasource.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["module_id"], ["api_module.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_api_assignment_access_type"),
        "api_assignment",
        ["access_type"],
        unique=False,
    )
    op.create_index(
        op.f("ix_api_assignment_datasource_id"),
        "api_assignment",
        ["datasource_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_api_assignment_execute_engine"),
        "api_assignment",
        ["execute_engine"],
        unique=False,
    )
    op.create_index(
        op.f("ix_api_assignment_http_method"),
        "api_assignment",
        ["http_method"],
        unique=False,
    )
    op.create_index(
        op.f("ix_api_assignment_module_id"),
        "api_assignment",
        ["module_id"],
        unique=False,
    )
    op.create_index(op.f("ix_api_assignment_name"), "api_assignment", ["name"], unique=False)
    op.create_index(
        op.f("ix_api_assignment_published_version_id"),
        "api_assignment",
        ["published_version_id"],
        unique=False,
    )

    op.create_table(
        "api_macro_def",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("module_id", sa.Uuid(), nullable=True),
        sa.Column("name", sqlmodel.sql.sqltypes.AutoString(length=128), nullable=False),
        sa.Column(
            "macro_type",
            sa.Enum("JINJA", "PYTHON", name="macrotypeenum"),
            nullable=False,
        ),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column(
            "description", sqlmodel.sql.sqltypes.AutoString(length=512), nullable=True
        ),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("is_published", sa.Boolean(), nullable=False),
        sa.Column("published_version_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["module_id"], ["api_module.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_api_macro_def_macro_type"),
        "api_macro_def",
        ["macro_type"],
        unique=False,
    )
    op.create_index(
        op.f("ix_api_macro_def_module_id"),
        "api_macro_def",
        ["module_id"],
        unique=False,
    )
    op.create_index(op.f("ix_api_macro_def_name"), "api_macro_def", ["name"], unique=False)
    op.create_index(
        op.f("ix_api_macro_def_published_version_id"),
        "api_macro_def",
        ["published_version_id"],
        unique=False,
    )

    op.create_table(
        "version_commit",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("api_assignment_id", sa.Uuid(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("content_snapshot", sa.Text(), nullable=False),
        sa.Column(
            "params_snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=True
        ),
        sa.Column(
            "param_validates_snapshot",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.Column("result_transform_snapshot", sa.Text(), nullable=True),
        sa.Column(
            "commit_message", sqlmodel.sql.sqltypes.AutoString(length=512), nullable=True
        ),
        sa.Column("committed_by_id", sa.Uuid(), nullable=True),
        sa.Column("committed_at", sa.DateTime(), nullable=False),
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

    op.create_table(
        "macro_def_version_commit",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("api_macro_def_id", sa.Uuid(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("content_snapshot", sa.Text(), nullable=False),
        sa.Column(
            "commit_message", sqlmodel.sql.sqltypes.AutoString(length=512), nullable=True
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

    # Break cyclic dependencies (published version pointers)
    op.create_foreign_key(
        "fk_api_assignment_published_version_id_version_commit",
        "api_assignment",
        "version_commit",
        ["published_version_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_api_macro_def_published_version_id",
        "api_macro_def",
        "macro_def_version_commit",
        ["published_version_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # --- Other tables ---
    op.create_table(
        "access_log_config",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("datasource_id", sa.Uuid(), nullable=True),
        sa.Column("use_starrocks_audit", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["datasource_id"], ["datasource.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_access_log_config_datasource_id"),
        "access_log_config",
        ["datasource_id"],
        unique=False,
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
        sa.Column("request_headers", sa.Text(), nullable=True),
        sa.Column("request_params", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(
            ["api_assignment_id"], ["api_assignment.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(["app_client_id"], ["app_client.id"], ondelete="SET NULL"),
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
    )
    op.create_index(
        op.f("ix_api_context_api_assignment_id"),
        "api_context",
        ["api_assignment_id"],
        unique=True,
    )

    op.create_table(
        "app_client_api_link",
        sa.Column("app_client_id", sa.Uuid(), nullable=False),
        sa.Column("api_assignment_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["api_assignment_id"], ["api_assignment.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["app_client_id"], ["app_client.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("app_client_id", "api_assignment_id"),
    )

    op.create_table(
        "app_client_group_link",
        sa.Column("app_client_id", sa.Uuid(), nullable=False),
        sa.Column("api_group_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["api_group_id"], ["api_group.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["app_client_id"], ["app_client.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("app_client_id", "api_group_id"),
    )

    op.create_table(
        "role_permission_link",
        sa.Column("role_id", sa.Uuid(), nullable=False),
        sa.Column("permission_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["permission_id"], ["permission.id"]),
        sa.ForeignKeyConstraint(["role_id"], ["role.id"]),
        sa.PrimaryKeyConstraint("role_id", "permission_id"),
        sa.UniqueConstraint("role_id", "permission_id", name="uq_role_permission"),
    )

    op.create_table(
        "user_role_link",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("role_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["role_id"], ["role.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("user_id", "role_id"),
        sa.UniqueConstraint("user_id", "role_id", name="uq_user_role"),
    )


def downgrade():
    op.drop_table("user_role_link")
    op.drop_table("role_permission_link")
    op.drop_table("app_client_group_link")
    op.drop_table("app_client_api_link")
    op.drop_index(op.f("ix_api_context_api_assignment_id"), table_name="api_context")
    op.drop_table("api_context")
    op.drop_table("api_assignment_group_link")
    op.drop_index(op.f("ix_access_record_app_client_id"), table_name="access_record")
    op.drop_index(op.f("ix_access_record_api_assignment_id"), table_name="access_record")
    op.drop_table("access_record")
    op.drop_index(op.f("ix_access_log_config_datasource_id"), table_name="access_log_config")
    op.drop_table("access_log_config")

    # Drop cyclic FKs (tables will be dropped next, but keep order explicit)
    op.drop_constraint(
        "fk_api_macro_def_published_version_id", "api_macro_def", type_="foreignkey"
    )
    op.drop_constraint(
        "fk_api_assignment_published_version_id_version_commit",
        "api_assignment",
        type_="foreignkey",
    )

    op.drop_index(op.f("ix_macro_def_version_commit_committed_by_id"), table_name="macro_def_version_commit")
    op.drop_index(op.f("ix_macro_def_version_commit_api_macro_def_id"), table_name="macro_def_version_commit")
    op.drop_table("macro_def_version_commit")

    op.drop_index(op.f("ix_version_commit_committed_by_id"), table_name="version_commit")
    op.drop_index(op.f("ix_version_commit_api_assignment_id"), table_name="version_commit")
    op.drop_table("version_commit")

    op.drop_index(op.f("ix_api_macro_def_published_version_id"), table_name="api_macro_def")
    op.drop_index(op.f("ix_api_macro_def_name"), table_name="api_macro_def")
    op.drop_index(op.f("ix_api_macro_def_module_id"), table_name="api_macro_def")
    op.drop_index(op.f("ix_api_macro_def_macro_type"), table_name="api_macro_def")
    op.drop_table("api_macro_def")

    op.drop_index(op.f("ix_api_assignment_published_version_id"), table_name="api_assignment")
    op.drop_index(op.f("ix_api_assignment_name"), table_name="api_assignment")
    op.drop_index(op.f("ix_api_assignment_module_id"), table_name="api_assignment")
    op.drop_index(op.f("ix_api_assignment_http_method"), table_name="api_assignment")
    op.drop_index(op.f("ix_api_assignment_execute_engine"), table_name="api_assignment")
    op.drop_index(op.f("ix_api_assignment_datasource_id"), table_name="api_assignment")
    op.drop_index(op.f("ix_api_assignment_access_type"), table_name="api_assignment")
    op.drop_table("api_assignment")

    op.drop_index(op.f("ix_permission_resource_type"), table_name="permission")
    op.drop_index(op.f("ix_permission_action"), table_name="permission")
    op.drop_table("permission")

    op.drop_index(op.f("ix_role_name"), table_name="role")
    op.drop_table("role")

    op.drop_index(op.f("ix_app_client_name"), table_name="app_client")
    op.drop_index(op.f("ix_app_client_client_id"), table_name="app_client")
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

    # Optional: clean up enums (Postgres doesn't drop them automatically)
    op.execute("DROP TYPE IF EXISTS permissionactionenum")
    op.execute("DROP TYPE IF EXISTS resourcetypeenum")
    op.execute("DROP TYPE IF EXISTS macrotypeenum")
    op.execute("DROP TYPE IF EXISTS apiaccesstypeenum")
    op.execute("DROP TYPE IF EXISTS executeengineenum")
    op.execute("DROP TYPE IF EXISTS httpmethodenum")
    op.execute("DROP TYPE IF EXISTS producttypeenum")
