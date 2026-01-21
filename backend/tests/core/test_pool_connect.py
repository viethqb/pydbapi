"""
Integration tests for core.pool: connect, health_check, execute, cursor_to_dicts, PoolManager.

Requires Postgres and MySQL from docker-compose.test.yml (e.g. make integration-test or make docker-up).
Uses POSTGRES_* and MYSQL_* from env (integration-test.sh exports them).
"""

import os
import uuid
from unittest.mock import MagicMock, patch

import pytest

from app.core.pool import (
    connect,
    cursor_to_dicts,
    execute,
    get_pool_manager,
    health_check,
)
from app.models_dbapi import DataSource, ProductTypeEnum


def _pg_params() -> dict:
    return {
        "product_type": ProductTypeEnum.POSTGRES,
        "host": os.environ.get("POSTGRES_SERVER", "localhost"),
        "port": int(os.environ.get("POSTGRES_PORT", "5432")),
        "database": os.environ.get("POSTGRES_DB", "app"),
        "username": os.environ.get("POSTGRES_USER", "postgres"),
        "password": os.environ.get("POSTGRES_PASSWORD", "postgres"),
    }


def _mysql_params() -> dict:
    return {
        "product_type": ProductTypeEnum.MYSQL,
        "host": os.environ.get("MYSQL_HOST", "localhost"),
        "port": int(os.environ.get("MYSQL_PORT", "3306")),
        "database": os.environ.get("MYSQL_DATABASE", "app"),
        "username": os.environ.get("MYSQL_USER", "app"),
        "password": os.environ.get("MYSQL_PASSWORD", "app"),
    }


def _pg_datasource() -> DataSource:
    p = _pg_params()
    return DataSource(
        id=uuid.uuid4(),
        name="itest-pg",
        product_type=p["product_type"],
        host=p["host"],
        port=p["port"],
        database=p["database"],
        username=p["username"],
        password=p["password"],
    )


def _mysql_datasource() -> DataSource:
    p = _mysql_params()
    return DataSource(
        id=uuid.uuid4(),
        name="itest-mysql",
        product_type=p["product_type"],
        host=p["host"],
        port=p["port"],
        database=p["database"],
        username=p["username"],
        password=p["password"],
    )


# --- connect + health_check + execute + cursor_to_dicts ---


def test_connect_postgres() -> None:
    """Connect to Postgres, health_check, execute SELECT 1, cursor_to_dicts, close."""
    params = _pg_params()
    conn = connect(params)
    try:
        assert health_check(conn, ProductTypeEnum.POSTGRES) is True
        cur = execute(conn, "SELECT 1 AS n")
        rows = cursor_to_dicts(cur)
        cur.close()
        assert len(rows) == 1
        assert rows[0]["n"] == 1
    finally:
        conn.close()


def test_connect_mysql() -> None:
    """Connect to MySQL, health_check, execute SELECT 1, cursor_to_dicts, close."""
    params = _mysql_params()
    conn = connect(params)
    try:
        assert health_check(conn, ProductTypeEnum.MYSQL) is True
        cur = execute(conn, "SELECT 1 AS n")
        rows = cursor_to_dicts(cur)
        cur.close()
        assert len(rows) == 1
        assert rows[0]["n"] == 1
    finally:
        conn.close()


def test_connect_postgres_with_datasource_model() -> None:
    """connect() accepts a DataSource model (not only dict)."""
    ds = _pg_datasource()
    conn = connect(ds)
    try:
        assert health_check(conn, ds.product_type) is True
    finally:
        conn.close()


def test_connect_mysql_with_datasource_model() -> None:
    """connect() accepts a DataSource model for MySQL."""
    ds = _mysql_datasource()
    conn = connect(ds)
    try:
        assert health_check(conn, ds.product_type) is True
    finally:
        conn.close()


def test_connect_invalid_product_type() -> None:
    """connect() raises ValueError for unsupported product_type."""
    params = _pg_params()
    params["product_type"] = "oracle"  # type: ignore[typeddict-unknown-key]
    with pytest.raises(ValueError, match="oracle|ProductTypeEnum|Unsupported"):
        connect(params)


def test_health_check_fails_on_closed_connection() -> None:
    """health_check returns False when connection is closed (execute raises, we catch and return False)."""
    params = _pg_params()
    conn = connect(params)
    conn.close()
    ok = health_check(conn, ProductTypeEnum.POSTGRES)
    assert ok is False


@patch("app.core.pool.connect.settings")
def test_execute_applies_statement_timeout_when_configured(mock_settings: MagicMock) -> None:
    """When EXTERNAL_DB_STATEMENT_TIMEOUT is set, execute() runs SET statement_timeout (Postgres) before query and resets after."""
    mock_settings.EXTERNAL_DB_STATEMENT_TIMEOUT = 5
    calls: list[tuple[str, tuple]] = []
    mock_cur = MagicMock()
    mock_cur.execute = lambda s, p=None: calls.append((s, p if p is not None else ()))
    mock_cur.description = [("n",)]
    mock_cur.fetchall = lambda: [(1,)]
    mock_cur.close = lambda: None
    mock_conn = MagicMock()
    mock_conn.cursor.return_value = mock_cur

    cur = execute(
        mock_conn,
        "SELECT 1 AS n",
        product_type=ProductTypeEnum.POSTGRES,
    )

    assert len(calls) >= 2
    assert "statement_timeout" in calls[0][0]
    assert "5000" in str(calls[0][1])
    assert calls[1][0] == "SELECT 1 AS n"
    assert "statement_timeout" in calls[2][0] and "0" in calls[2][0]
    assert cur is mock_cur


# --- PoolManager ---


def test_pool_manager_postgres_get_release() -> None:
    """PoolManager: get_connection(DataSource), release, get again reuses or creates."""
    pm = get_pool_manager()
    ds = _pg_datasource()
    conn1 = pm.get_connection(ds)
    try:
        assert health_check(conn1, ProductTypeEnum.POSTGRES) is True
        cur = execute(conn1, "SELECT 1 AS x")
        assert cursor_to_dicts(cur)[0]["x"] == 1
        cur.close()
    finally:
        pm.release(conn1, ds.id)
    conn2 = pm.get_connection(ds)
    try:
        assert health_check(conn2, ProductTypeEnum.POSTGRES) is True
    finally:
        pm.release(conn2, ds.id)
    pm.dispose(ds.id)


def test_pool_manager_mysql_get_release() -> None:
    """PoolManager: get_connection(DataSource) and release for MySQL."""
    pm = get_pool_manager()
    ds = _mysql_datasource()
    conn = pm.get_connection(ds)
    try:
        assert health_check(conn, ProductTypeEnum.MYSQL) is True
        cur = execute(conn, "SELECT 1 AS y")
        assert cursor_to_dicts(cur)[0]["y"] == 1
        cur.close()
    finally:
        pm.release(conn, ds.id)
    pm.dispose(ds.id)
