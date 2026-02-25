"""
Unified API Executor (Phase 3, Task 3.4).

Dispatches to SQL (Jinja2 + execute_sql) or SCRIPT (RestrictedPython) by engine.
"""

import logging
from typing import Any
from uuid import UUID

import psycopg
import pymysql
from sqlmodel import Session
from trino.exceptions import TrinoExternalError, TrinoUserError

from app.core.config import settings
from app.core.pool import get_pool_manager
from app.core.redis_client import get_redis
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
        close_connection_after_execute: bool = False,
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
                raise ValueError(
                    "session is required to load DataSource by datasource_id"
                )
            ds = session.get(DataSource, datasource_id)
            if ds is None:
                raise ValueError("DataSource not found")

        # Check if datasource is active (if datasource is required)
        if ds is not None and not ds.is_active:
            raise ValueError("DataSource is inactive and cannot be used")

        if engine == ExecuteEngineEnum.SQL:
            if ds is None:
                raise ValueError(
                    "datasource or datasource_id is required for SQL engine"
                )
            try:
                sql = SQLTemplateEngine().render(content, _params)
                _log.debug("Rendered SQL: %s", sql)
            except ValueError:
                raise  # already wrapped by SQLTemplateEngine
            except Exception as e:
                _log.error("SQL template render failed: %s", e, exc_info=True)
                raise ValueError(f"SQL template render failed: {e}") from e
            try:
                # use_pool=False when close_connection_after_execute (e.g. StarRocks impersonation)
                use_pool = not close_connection_after_execute
                out = execute_sql(ds, sql, use_pool=use_pool)
                return {"data": out}
            except psycopg.errors.QueryCanceled as e:
                _log.warning("SQL query timed out: %s", e)
                raise ValueError("SQL query timed out (statement_timeout)") from e
            except psycopg.Error as e:
                _log.error("PostgreSQL error: %s. SQL: %s", e, sql, exc_info=True)
                raise ValueError(f"SQL execution failed: {e}") from e
            except pymysql.err.OperationalError as e:
                _log.error("MySQL operational error: %s. SQL: %s", e, sql, exc_info=True)
                raise ValueError(f"SQL execution failed: {e}") from e
            except pymysql.err.ProgrammingError as e:
                _log.warning("MySQL programming error: %s", e)
                raise ValueError(f"SQL error: {e}") from e
            except pymysql.Error as e:
                _log.error("MySQL error: %s. SQL: %s", e, sql, exc_info=True)
                raise ValueError(f"SQL execution failed: {e}") from e
            except (TrinoUserError, TrinoExternalError) as e:
                _log.error("Trino error: %s. SQL: %s", e, sql, exc_info=True)
                raise ValueError(f"SQL execution failed: {e}") from e
            except ConnectionError as e:
                _log.error("Connection error: %s", e, exc_info=True)
                raise ValueError(f"Database connection failed: {e}") from e
            except Exception as e:
                _log.error("SQL execution failed: %s. SQL: %s", e, sql, exc_info=True)
                raise ValueError(f"SQL execution failed: {e}") from e

        if engine == ExecuteEngineEnum.SCRIPT:
            if ds is None:
                raise ValueError(
                    "datasource or datasource_id is required for SCRIPT engine"
                )
            pm = get_pool_manager()
            raw_hosts = (settings.SCRIPT_HTTP_ALLOWED_HOSTS or "").strip()
            http_allowed = frozenset(
                h.strip().lower() for h in raw_hosts.split(",") if h.strip()
            )
            ctx = ScriptContext(
                datasource=ds,
                req=_params,
                pool_manager=pm,
                cache_client=get_redis(),
                settings=settings,
                logger=_log,
                http_allowed_hosts=http_allowed,
                close_connection_after_execute=close_connection_after_execute,
            )
            result = ScriptExecutor().execute(content, ctx)
            return {"data": result}

        raise ValueError(f"Unsupported engine: {engine}")
