"""Unit tests for engines.sql.executor (Phase 3, Task 3.2)."""

import uuid
from unittest.mock import MagicMock, patch

from app.engines.sql import execute_sql
from app.engines.sql.executor import _split_statements
from app.models_dbapi import DataSource, ProductTypeEnum


def _make_datasource() -> DataSource:
    return DataSource(
        id=uuid.uuid4(),
        name="test",
        product_type=ProductTypeEnum.POSTGRES,
        host="localhost",
        port=5432,
        database="db",
        username="u",
        password="p",
    )


@patch("app.engines.sql.executor.cursor_to_dicts")
@patch("app.engines.sql.executor.execute")
@patch("app.engines.sql.executor.get_pool_manager")
def test_execute_sql_select_uses_pool(
    mock_pm: MagicMock,
    mock_execute: MagicMock,
    mock_ctd: MagicMock,
) -> None:
    ds = _make_datasource()
    mock_conn = MagicMock()
    mock_cur = MagicMock()
    mock_pm.return_value.get_connection.return_value = mock_conn
    mock_execute.return_value = mock_cur
    mock_ctd.return_value = [{"n": 1}]

    out = execute_sql(ds, "SELECT 1 AS n", use_pool=True)

    # Single statement -> list of one result
    assert out == [[{"n": 1}]]
    mock_pm.return_value.get_connection.assert_called_once_with(ds)
    mock_execute.assert_called_once_with(mock_conn, "SELECT 1 AS n", product_type=ds.product_type)
    mock_ctd.assert_called_once_with(mock_cur)
    mock_pm.return_value.release.assert_called_once_with(mock_conn, ds.id)


@patch("app.engines.sql.executor.execute")
@patch("app.engines.sql.executor.connect")
def test_execute_sql_select_no_pool(
    mock_connect: MagicMock,
    mock_execute: MagicMock,
) -> None:
    ds = _make_datasource()
    mock_conn = MagicMock()
    mock_cur = MagicMock()
    mock_cur.description = [("n",)]
    mock_cur.fetchall.return_value = [(1,)]
    mock_connect.return_value = mock_conn
    mock_execute.return_value = mock_cur

    # Must patch cursor_to_dicts to avoid real impl (which uses cursor.description/fetchall)
    with patch("app.engines.sql.executor.cursor_to_dicts", return_value=[{"n": 1}]):
        out = execute_sql(ds, "SELECT 1 AS n", use_pool=False)

    assert out == [[{"n": 1}]]
    mock_connect.assert_called_once_with(ds)
    mock_conn.close.assert_called_once()


@patch("app.engines.sql.executor.execute")
@patch("app.engines.sql.executor.get_pool_manager")
def test_execute_sql_insert_returns_rowcount(
    mock_pm: MagicMock,
    mock_execute: MagicMock,
) -> None:
    ds = _make_datasource()
    mock_conn = MagicMock()
    mock_cur = MagicMock()
    mock_cur.rowcount = 3
    mock_pm.return_value.get_connection.return_value = mock_conn
    mock_execute.return_value = mock_cur

    out = execute_sql(ds, "INSERT INTO t (a) VALUES (1)", use_pool=True)

    assert out == [3]
    mock_pm.return_value.release.assert_called_once()


@patch("app.engines.sql.executor.execute")
@patch("app.engines.sql.executor.get_pool_manager")
def test_execute_sql_with_cte_treated_as_select(
    mock_pm: MagicMock,
    mock_execute: MagicMock,
) -> None:
    ds = _make_datasource()
    mock_conn = MagicMock()
    mock_cur = MagicMock()
    mock_pm.return_value.get_connection.return_value = mock_conn
    mock_execute.return_value = mock_cur

    with patch("app.engines.sql.executor.cursor_to_dicts", return_value=[]):
        out = execute_sql(ds, "WITH c AS (SELECT 1) SELECT * FROM c", use_pool=True)

    assert out == [[]]
    mock_execute.assert_called_once()


class TestSplitStatements:
    """Tests for the quote-aware SQL statement splitter."""

    def test_single(self):
        assert _split_statements("SELECT 1") == ["SELECT 1"]

    def test_two_statements(self):
        assert _split_statements("SELECT 1; SELECT 2") == ["SELECT 1", "SELECT 2"]

    def test_trailing_semicolon(self):
        assert _split_statements("SELECT 1;") == ["SELECT 1"]

    def test_empty(self):
        assert _split_statements("") == []
        assert _split_statements("  ;  ;  ") == []

    def test_semicolon_in_single_quotes(self):
        sql = "SELECT * FROM t WHERE name = 'foo;bar'"
        assert _split_statements(sql) == [sql]

    def test_semicolon_in_double_quotes(self):
        sql = 'SELECT * FROM t WHERE "col;name" = 1'
        assert _split_statements(sql) == [sql]

    def test_escaped_quote(self):
        sql = "SELECT 'it''s;here'"
        assert _split_statements(sql) == [sql]

    def test_dollar_quoting(self):
        sql = "SELECT $$semi;colon$$"
        assert _split_statements(sql) == [sql]

    def test_line_comment(self):
        sql = "SELECT 1 -- comment; not a split\n; SELECT 2"
        result = _split_statements(sql)
        assert len(result) == 2
        assert "SELECT 2" in result[1]

    def test_block_comment(self):
        sql = "SELECT /* ; */ 1; SELECT 2"
        result = _split_statements(sql)
        assert len(result) == 2

    def test_mixed_real_world(self):
        sql = "INSERT INTO t(name) VALUES ('a;b'); SELECT * FROM t WHERE id = 1"
        result = _split_statements(sql)
        assert len(result) == 2
        assert "'a;b'" in result[0]
