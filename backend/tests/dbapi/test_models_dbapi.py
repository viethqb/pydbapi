"""Smoke tests for DBAPI models (import and table names)."""

import pytest
from sqlalchemy import inspect
from sqlmodel import Session, select

from app.models_dbapi import (
    AccessRecord,
    ApiAssignment,
    ApiAssignmentGroupLink,
    ApiContext,
    ApiGroup,
    ApiModule,
    AppClient,
    DataSource,
    ExecuteEngineEnum,
    FirewallRuleTypeEnum,
    FirewallRules,
    HttpMethodEnum,
    McpClient,
    McpTool,
    ProductTypeEnum,
    UnifyAlarm,
    VersionCommit,
)


def test_models_dbapi_import():
    """All DBAPI models and enums can be imported."""
    assert DataSource.__tablename__ == "datasource"
    assert ApiModule.__tablename__ == "api_module"
    assert ApiGroup.__tablename__ == "api_group"
    assert ApiAssignment.__tablename__ == "api_assignment"
    assert ApiAssignmentGroupLink.__tablename__ == "api_assignment_group_link"
    assert ApiContext.__tablename__ == "api_context"
    assert AppClient.__tablename__ == "app_client"
    assert FirewallRules.__tablename__ == "firewall_rules"
    assert UnifyAlarm.__tablename__ == "unify_alarm"
    assert McpTool.__tablename__ == "mcp_tool"
    assert McpClient.__tablename__ == "mcp_client"
    assert VersionCommit.__tablename__ == "version_commit"
    assert AccessRecord.__tablename__ == "access_record"

    assert ProductTypeEnum.POSTGRES.value == "postgres"
    assert HttpMethodEnum.GET.value == "GET"
    assert ExecuteEngineEnum.SQL.value == "SQL"
    assert FirewallRuleTypeEnum.ALLOW.value == "allow"


def test_datasource_crud(db: Session):
    """Create and read DataSource. Skipped if DBAPI migrations not applied."""
    if "datasource" not in inspect(db.get_bind()).get_table_names():
        pytest.skip("datasource table not found; run: make migrate or make integration-test")
    ds = DataSource(
        name="test-ds-dbapi",
        product_type=ProductTypeEnum.POSTGRES,
        host="localhost",
        port=5432,
        database="app",
        username="postgres",
        password="secret",
    )
    db.add(ds)
    db.commit()
    db.refresh(ds)
    assert ds.id is not None
    got = db.exec(select(DataSource).where(DataSource.name == "test-ds-dbapi")).first()
    assert got is not None
    assert got.product_type == ProductTypeEnum.POSTGRES
    # Cleanup
    db.delete(got)
    db.commit()
