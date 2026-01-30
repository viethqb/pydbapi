"""Unit tests for engines.script.executor and context (Phase 3, Task 3.3)."""

import signal
import uuid
from unittest.mock import MagicMock, patch

import pytest

from app.engines.script import ScriptContext, ScriptExecutor
from app.engines.script.executor import ScriptTimeoutError
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


class MockPool:
    def get_connection(self, ds: DataSource) -> MagicMock:
        raise RuntimeError("no real DB in test")

    def release(self, conn: object, datasource_id: uuid.UUID) -> None:
        pass


class TestScriptExecutorBasic:
    def test_result_list(self) -> None:
        ctx = ScriptContext(
            datasource=_make_datasource(),
            req={},
            pool_manager=MockPool(),
        )
        out = ScriptExecutor().execute("result = [1, 2, 3]", ctx)
        assert out == [1, 2, 3]

    def test_result_from_comprehension(self) -> None:
        ctx = ScriptContext(
            datasource=_make_datasource(),
            req={"ids": [1, 2, 3]},
            pool_manager=MockPool(),
        )
        out = ScriptExecutor().execute(
            "result = [x * 2 for x in req.get('ids', [])]", ctx
        )
        assert out == [2, 4, 6]

    def test_execute_function_style(self) -> None:
        """When script defines execute(params), it is called with req and return value is used."""
        ctx = ScriptContext(
            datasource=_make_datasource(),
            req={"a": 1, "b": 2},
            pool_manager=MockPool(),
        )
        script = (
            "def execute(params=None):\n"
            "    params = params or {}\n"
            "    return [params.get('a', 0), params.get('b', 0)]\n"
        )
        out = ScriptExecutor().execute(script, ctx)
        assert out == [1, 2]

    def test_no_result_returns_none(self) -> None:
        ctx = ScriptContext(
            datasource=_make_datasource(),
            req={},
            pool_manager=MockPool(),
        )
        out = ScriptExecutor().execute("x = 1", ctx)
        assert out is None

    def test_open_blocked(self) -> None:
        ctx = ScriptContext(
            datasource=_make_datasource(),
            req={},
            pool_manager=MockPool(),
        )
        with pytest.raises(NameError, match="open"):
            ScriptExecutor().execute("result = open('/etc/passwd')", ctx)


@patch("app.engines.script.executor.settings")
@pytest.mark.skipif(not hasattr(signal, "SIGALRM"), reason="SIGALRM not available (e.g. Windows)")
def test_script_executor_timeout_raises(mock_settings: MagicMock) -> None:
    """When SCRIPT_EXEC_TIMEOUT is set, a long-running script raises ScriptTimeoutError."""
    mock_settings.SCRIPT_EXEC_TIMEOUT = 1
    ctx = ScriptContext(
        datasource=_make_datasource(),
        req={},
        pool_manager=MockPool(),
    )
    with pytest.raises(ScriptTimeoutError, match="timed out"):
        ScriptExecutor().execute("while True: pass", ctx)


class TestScriptContextToDict:
    def test_has_db_http_cache_env_log_req_tx_ds(self) -> None:
        ctx = ScriptContext(
            datasource=_make_datasource(),
            req={"k": "v"},
            pool_manager=MockPool(),
        )
        d = ctx.to_dict()
        assert "db" in d
        assert "http" in d
        assert "cache" in d
        assert "env" in d
        assert "log" in d
        assert "req" in d
        assert d["req"] == {"k": "v"}
        assert "tx" in d
        assert "ds" in d
        assert d["ds"]["name"] == "test"
        assert "password" not in str(d["ds"])
