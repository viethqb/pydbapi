"""Add DBAPI models (Phase 1)

Revision ID: f0a1b2c3d4e5
Revises: 1a31ce608336
Create Date: 2025-01-01 00:00:00.000000

- DataSource, ApiModule, ApiGroup, ApiAssignment, ApiAssignmentGroupLink,
  ApiContext, AppClient, SystemUser, FirewallRules, UnifyAlarm,
  McpTool, McpClient, VersionCommit, AccessRecord
- Enums: ProductTypeEnum, HttpMethodEnum, ExecuteEngineEnum, FirewallRuleTypeEnum
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from app.models_dbapi import (
    ExecuteEngineEnum,
    FirewallRuleTypeEnum,
    HttpMethodEnum,
    ProductTypeEnum,
)

# revision identifiers, used by Alembic.
revision = "f0a1b2c3d4e5"
down_revision = "1a31ce608336"
branch_labels = None
depends_on = None


def _drop_enums(conn):
    sa.Enum(FirewallRuleTypeEnum, name="firewallruletypeenum").drop(
        conn, checkfirst=True
    )
    sa.Enum(ExecuteEngineEnum, name="executeengineenum").drop(conn, checkfirst=True)
    sa.Enum(HttpMethodEnum, name="httpmethodenum").drop(conn, checkfirst=True)
    sa.Enum(ProductTypeEnum, name="producttypeenum").drop(conn, checkfirst=True)


def upgrade():
    op.create_table(
        "datasource",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column(
            "product_type",
            sa.Enum("postgres", "mysql", name="producttypeenum"),
            nullable=False,
        ),
        sa.Column("host", sa.String(255), nullable=False),
        sa.Column("port", sa.Integer(), nullable=False, server_default="5432"),
        sa.Column("database", sa.String(255), nullable=False),
        sa.Column("username", sa.String(255), nullable=False),
        sa.Column("password", sa.String(512), nullable=False),
        sa.Column("driver_version", sa.String(64), nullable=True),
        sa.Column("description", sa.String(512), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index(op.f("ix_datasource_name"), "datasource", ["name"])
    op.create_index(op.f("ix_datasource_product_type"), "datasource", ["product_type"])

    op.create_table(
        "api_module",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.String(512), nullable=True),
        sa.Column("path_prefix", sa.String(255), nullable=False, server_default="/"),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index(op.f("ix_api_module_name"), "api_module", ["name"])

    op.create_table(
        "api_group",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.String(512), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index(op.f("ix_api_group_name"), "api_group", ["name"])

    op.create_table(
        "api_assignment",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("module_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("path", sa.String(255), nullable=False),
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
        sa.Column("datasource_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("description", sa.String(512), nullable=True),
        sa.Column("is_published", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["module_id"], ["api_module.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["datasource_id"], ["datasource.id"], ondelete="SET NULL"),
    )
    op.create_index(op.f("ix_api_assignment_module_id"), "api_assignment", ["module_id"])
    op.create_index(op.f("ix_api_assignment_name"), "api_assignment", ["name"])
    op.create_index(op.f("ix_api_assignment_http_method"), "api_assignment", ["http_method"])
    op.create_index(op.f("ix_api_assignment_execute_engine"), "api_assignment", ["execute_engine"])
    op.create_index(op.f("ix_api_assignment_datasource_id"), "api_assignment", ["datasource_id"])

    op.create_table(
        "api_assignment_group_link",
        sa.Column("api_assignment_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("api_group_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.ForeignKeyConstraint(["api_assignment_id"], ["api_assignment.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["api_group_id"], ["api_group.id"], ondelete="CASCADE"),
    )

    op.create_table(
        "api_context",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("api_assignment_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["api_assignment_id"], ["api_assignment.id"], ondelete="CASCADE"),
    )
    op.create_index(op.f("ix_api_context_api_assignment_id"), "api_context", ["api_assignment_id"], unique=True)

    op.create_table(
        "app_client",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("client_id", sa.String(255), nullable=False),
        sa.Column("client_secret", sa.String(512), nullable=False),
        sa.Column("description", sa.String(512), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index(op.f("ix_app_client_name"), "app_client", ["name"])
    op.create_index(op.f("ix_app_client_client_id"), "app_client", ["client_id"], unique=True)

    op.create_table(
        "app_system_user",  # "system_user" is reserved in PostgreSQL
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("username", sa.String(255), nullable=False),
        sa.Column("hashed_password", sa.String(512), nullable=False),
        sa.Column("full_name", sa.String(255), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index(op.f("ix_app_system_user_username"), "app_system_user", ["username"], unique=True)

    op.create_table(
        "firewall_rules",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "rule_type",
            sa.Enum("allow", "deny", name="firewallruletypeenum"),
            nullable=False,
        ),
        sa.Column("ip_range", sa.String(128), nullable=False),
        sa.Column("description", sa.String(512), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index(op.f("ix_firewall_rules_rule_type"), "firewall_rules", ["rule_type"])

    op.create_table(
        "unify_alarm",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("alarm_type", sa.String(64), nullable=False),
        sa.Column(
            "config",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index(op.f("ix_unify_alarm_name"), "unify_alarm", ["name"])
    op.create_index(op.f("ix_unify_alarm_alarm_type"), "unify_alarm", ["alarm_type"])

    op.create_table(
        "mcp_tool",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column(
            "config",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index(op.f("ix_mcp_tool_name"), "mcp_tool", ["name"])

    op.create_table(
        "mcp_client",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column(
            "config",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index(op.f("ix_mcp_client_name"), "mcp_client", ["name"])

    op.create_table(
        "version_commit",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("api_assignment_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("content_snapshot", sa.Text(), nullable=False),
        sa.Column("commit_message", sa.String(512), nullable=True),
        sa.Column("committed_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("committed_by_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.ForeignKeyConstraint(["api_assignment_id"], ["api_assignment.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["committed_by_id"], ["app_system_user.id"], ondelete="SET NULL"),
    )
    op.create_index(op.f("ix_version_commit_api_assignment_id"), "version_commit", ["api_assignment_id"])
    op.create_index(op.f("ix_version_commit_committed_by_id"), "version_commit", ["committed_by_id"])

    op.create_table(
        "access_record",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("api_assignment_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("app_client_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("ip_address", sa.String(64), nullable=False),
        sa.Column("http_method", sa.String(16), nullable=False),
        sa.Column("path", sa.String(512), nullable=False),
        sa.Column("status_code", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("request_body", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["api_assignment_id"], ["api_assignment.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["app_client_id"], ["app_client.id"], ondelete="SET NULL"),
    )
    op.create_index(op.f("ix_access_record_api_assignment_id"), "access_record", ["api_assignment_id"])
    op.create_index(op.f("ix_access_record_app_client_id"), "access_record", ["app_client_id"])


def downgrade():
    op.drop_table("access_record")
    op.drop_table("version_commit")
    op.drop_table("mcp_client")
    op.drop_table("mcp_tool")
    op.drop_table("unify_alarm")
    op.drop_table("firewall_rules")
    op.drop_table("app_system_user")
    op.drop_table("app_client")
    op.drop_table("api_context")
    op.drop_table("api_assignment_group_link")
    op.drop_table("api_assignment")
    op.drop_table("api_group")
    op.drop_table("api_module")
    op.drop_table("datasource")

    conn = op.get_bind()
    _drop_enums(conn)
