"""
Unified API Executor (Phase 3, Task 3.4).

Dispatches to SQL (Jinja2 + execute_sql) or SCRIPT (RestrictedPython) by engine.
"""

import logging
from typing import Any
from uuid import UUID

from sqlmodel import Session

from app.core.config import settings
from app.core.pool import get_pool_manager
from app.engines.script import ScriptContext, ScriptExecutor
from app.engines.sql import SQLTemplateEngine, execute_sql
from app.models_dbapi import DataSource, ExecuteEngineEnum

_log = logging.getLogger(__name__)


class ApiExecutor:
    """
    execute(engine, datasource_id, content, params, *, datasource=None, session=None)
    -> {"data": ...} | {"rowcount": int} | for SCRIPT also raw result
    """

    def execute(
        self,
        engine: ExecuteEngineEnum,
        content: str,
        params: dict[str, Any] | None = None,
        *,
        datasource_id: UUID | None = None,
        datasource: DataSource | None = None,
        session: Session | None = None,
    ) -> dict[str, Any] | Any:
        """
        Run SQL or Script. For SQL/SCRIPT, datasource (or load from datasource_id) is required.

        - SQL: render(content, params) -> execute_sql -> {"data": rows} or {"rowcount": n}
        - SCRIPT: ScriptContext + ScriptExecutor.execute -> {"data": result}
        """
        _params = params or {}
        ds = datasource
        if ds is None and datasource_id is not None:
            if session is None:
                raise ValueError("session is required to load DataSource by datasource_id")
            ds = session.get(DataSource, datasource_id)
            if ds is None:
                raise ValueError("DataSource not found")

        if engine == ExecuteEngineEnum.SQL:
            if ds is None:
                raise ValueError("datasource or datasource_id is required for SQL engine")
            try:
                sql = SQLTemplateEngine().render(content, _params)
                _log.debug("Rendered SQL: %s", sql)
            except Exception as e:
                _log.error("SQL template render failed: %s", e, exc_info=True)
                raise
            try:
                out = execute_sql(ds, sql)
                if isinstance(out, list):
                    return {"data": out}
                return {"rowcount": out}
            except Exception as e:
                _log.error("SQL execution failed: %s. SQL: %s", e, sql, exc_info=True)
                raise ValueError(f"SQL execution failed: {str(e)}") from e

        if engine == ExecuteEngineEnum.SCRIPT:
            if ds is None:
                raise ValueError("datasource or datasource_id is required for SCRIPT engine")
            pm = get_pool_manager()
            ctx = ScriptContext(
                datasource=ds,
                req=_params,
                pool_manager=pm,
                cache_client=None,
                settings=settings,
                logger=_log,
            )
            result = ScriptExecutor().execute(content, ctx)
            return {"data": result}

        raise ValueError(f"Unsupported engine: {engine}")
