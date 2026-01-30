"""Unit tests for ApiExecutor (Phase 3, Task 3.4)."""

import uuid
from unittest.mock import MagicMock, patch

import pytest

from app.engines.executor import ApiExecutor
from app.models_dbapi import DataSource, ExecuteEngineEnum, ProductTypeEnum


def _make_datasource() -> DataSource:
    return DataSource(
        id=uuid.uuid4(),
        name="test-ds",
        product_type=ProductTypeEnum.POSTGRES,
        host="localhost",
        port=5432,
        database="db",
        username="u",
        password="p",
    )


# --- SQL engine ---


@patch("app.engines.executor.execute_sql")
@patch("app.engines.executor.SQLTemplateEngine")
def test_api_executor_sql_returns_data(
    mock_engine_cls: MagicMock,
    mock_execute_sql: MagicMock,
) -> None:
    ds = _make_datasource()
    mock_engine_cls.return_value.render.return_value = "SELECT 1 AS n"
    # execute_sql returns list of statement results (one stmt -> one element)
    mock_execute_sql.return_value = [[{"n": 1}, {"n": 2}]]

    out = ApiExecutor().execute(
        engine=ExecuteEngineEnum.SQL,
        content="SELECT 1 AS n",
        params={"x": 1},
        datasource=ds,
    )

    assert out == {"data": [[{"n": 1}, {"n": 2}]]}
    mock_engine_cls.return_value.render.assert_called_once_with("SELECT 1 AS n", {"x": 1})
    mock_execute_sql.assert_called_once_with(ds, "SELECT 1 AS n")


@patch("app.engines.executor.execute_sql")
@patch("app.engines.executor.SQLTemplateEngine")
def test_api_executor_sql_returns_rowcount(
    mock_engine_cls: MagicMock,
    mock_execute_sql: MagicMock,
) -> None:
    ds = _make_datasource()
    mock_engine_cls.return_value.render.return_value = "INSERT INTO t (a) VALUES (1)"
    # execute_sql returns list of statement results (one stmt -> one element = rowcount)
    mock_execute_sql.return_value = [3]

    out = ApiExecutor().execute(
        engine=ExecuteEngineEnum.SQL,
        content="INSERT INTO t (a) VALUES (1)",
        params={},
        datasource=ds,
    )

    assert out == {"data": [3]}
    mock_execute_sql.assert_called_once()


@patch("app.engines.executor.execute_sql")
@patch("app.engines.executor.SQLTemplateEngine")
def test_api_executor_sql_loads_datasource_from_session(
    mock_engine_cls: MagicMock,
    mock_execute_sql: MagicMock,
) -> None:
    ds = _make_datasource()
    mock_session = MagicMock()
    mock_session.get.return_value = ds
    mock_engine_cls.return_value.render.return_value = "SELECT 1"
    # execute_sql returns list of statement results
    mock_execute_sql.return_value = [[]]

    out = ApiExecutor().execute(
        engine=ExecuteEngineEnum.SQL,
        content="SELECT 1",
        datasource_id=ds.id,
        session=mock_session,
    )

    assert out == {"data": [[]]}
    mock_session.get.assert_called_once()
    assert mock_session.get.call_args[0][1] == ds.id
    mock_execute_sql.assert_called_once_with(ds, "SELECT 1")


# --- SCRIPT engine ---


@patch("app.engines.executor.ScriptExecutor")
@patch("app.engines.executor.ScriptContext")
@patch("app.engines.executor.get_pool_manager")
def test_api_executor_script_returns_data(
    mock_get_pm: MagicMock,
    mock_ctx_cls: MagicMock,
    mock_se_cls: MagicMock,
) -> None:
    ds = _make_datasource()
    mock_ctx = MagicMock()
    mock_ctx.to_dict.return_value = {}
    mock_ctx_cls.return_value = mock_ctx
    mock_se_cls.return_value.execute.return_value = [1, 2, 3]

    out = ApiExecutor().execute(
        engine=ExecuteEngineEnum.SCRIPT,
        content="result = [1,2,3]",
        params={"key": "v"},
        datasource=ds,
    )

    assert out == {"data": [1, 2, 3]}
    mock_ctx_cls.assert_called_once()
    mock_se_cls.return_value.execute.assert_called_once_with("result = [1,2,3]", mock_ctx)


@patch("app.engines.executor.ScriptExecutor")
@patch("app.engines.executor.ScriptContext")
@patch("app.engines.executor.get_pool_manager")
def test_api_executor_script_loads_datasource_from_session(
    mock_get_pm: MagicMock,
    mock_ctx_cls: MagicMock,
    mock_se_cls: MagicMock,
) -> None:
    ds = _make_datasource()
    mock_session = MagicMock()
    mock_session.get.return_value = ds
    mock_ctx = MagicMock()
    mock_ctx_cls.return_value = mock_ctx
    mock_se_cls.return_value.execute.return_value = {"ok": True}

    out = ApiExecutor().execute(
        engine=ExecuteEngineEnum.SCRIPT,
        content="result = {'ok': True}",
        datasource_id=ds.id,
        session=mock_session,
    )

    assert out == {"data": {"ok": True}}
    mock_session.get.assert_called_once()
    assert mock_session.get.call_args[0][1] == ds.id


# --- Validation ---


def test_api_executor_sql_no_datasource_raises() -> None:
    ex = ApiExecutor()
    with pytest.raises(ValueError, match="datasource or datasource_id is required"):
        ex.execute(
            engine=ExecuteEngineEnum.SQL,
            content="SELECT 1",
            datasource=None,
            datasource_id=None,
        )


def test_api_executor_script_no_datasource_raises() -> None:
    ex = ApiExecutor()
    with pytest.raises(ValueError, match="datasource or datasource_id is required"):
        ex.execute(
            engine=ExecuteEngineEnum.SCRIPT,
            content="result=1",
            datasource=None,
            datasource_id=None,
        )


def test_api_executor_datasource_id_without_session_raises() -> None:
    ex = ApiExecutor()
    with pytest.raises(ValueError, match="session is required"):
        ex.execute(
            engine=ExecuteEngineEnum.SQL,
            content="SELECT 1",
            datasource_id=uuid.uuid4(),
            session=None,
        )


@patch("app.engines.executor.execute_sql")
@patch("app.engines.executor.SQLTemplateEngine")
def test_api_executor_datasource_not_found_raises(
    mock_engine: MagicMock,
    mock_execute_sql: MagicMock,
) -> None:
    mock_session = MagicMock()
    mock_session.get.return_value = None
    ex = ApiExecutor()
    with pytest.raises(ValueError, match="DataSource not found"):
        ex.execute(
            engine=ExecuteEngineEnum.SQL,
            content="SELECT 1",
            datasource_id=uuid.uuid4(),
            session=mock_session,
        )


def test_api_executor_unsupported_engine_raises() -> None:
    ds = _make_datasource()
    ex = ApiExecutor()
    with pytest.raises(ValueError, match="Unsupported engine"):
        ex.execute(
            engine=MagicMock(value="RUST"),  # type: ignore[arg-type]
            content="x",
            datasource=ds,
        )
