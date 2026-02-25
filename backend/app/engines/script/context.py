"""
ScriptContext: db, http, cache, env, log, req, tx, ds for script execution (Phase 3, Task 3.3).
"""

import logging
from typing import Any
from uuid import UUID

from app.models_dbapi import DataSource

from .modules import (
    make_cache_module,
    make_db_module,
    make_env_module,
    make_http_module,
    make_log_module,
)

_log = logging.getLogger(__name__)


class ScriptContext:
    """
    Injects db, ds, http, cache, env, log, req, tx into the script namespace.
    Manages one connection per script; tx controls begin/commit/rollback.
    """

    def __init__(
        self,
        *,
        datasource: DataSource,
        req: dict[str, Any],
        pool_manager: Any,
        cache_client: Any = None,
        settings: Any = None,
        logger: logging.Logger | None = None,
        env_whitelist: set[str] | frozenset[str] | None = None,
        http_timeout: float = 30.0,
        http_allowed_hosts: frozenset[str] | None = None,
        log_extra: dict[str, Any] | None = None,
        close_connection_after_execute: bool = False,
    ) -> None:
        self._datasource = datasource
        self._req = req
        self._pool = pool_manager
        self._tx_conn: Any = None
        self._in_tx = False
        self._close_connection_after_execute = close_connection_after_execute

        # ds: read-only metadata (no password)
        self.ds = {
            "id": str(datasource.id),
            "name": datasource.name,
            "product_type": datasource.product_type.value,
            "host": datasource.host,
            "port": datasource.port,
            "database": datasource.database,
        }

        self.req = req

        self.db = make_db_module(
            datasource=datasource,
            get_connection=self._get_connection,
            release_connection=self._release_connection,
            commit_after_dml=self._commit_after_dml,
        )

        self.http = make_http_module(timeout=http_timeout, allowed_hosts=http_allowed_hosts)
        self.cache = make_cache_module(cache_client=cache_client)
        self.env = make_env_module(settings=settings, env_whitelist=env_whitelist)
        self.log = make_log_module(logger_instance=logger, extra=log_extra)

        self.tx = _TxFacade(self)

    def _get_connection(self) -> Any:
        if self._tx_conn is not None:
            return self._tx_conn
        return self._pool.get_connection(self._datasource)

    def _release_connection(self, conn: Any) -> None:
        if conn is self._tx_conn:
            return
        if self._close_connection_after_execute:
            try:
                conn.close()
            except Exception:
                pass
        else:
            self._pool.release(conn, self._datasource.id)

    def _commit_after_dml(self, conn: Any, *, is_dml: bool) -> None:
        if not is_dml or self._in_tx:
            return
        try:
            conn.commit()
        except Exception as e:
            _log.warning("commit_after_dml commit failed: %s", e)

    def _begin_tx(self) -> None:
        if self._in_tx:
            return
        if self._tx_conn is None:
            self._tx_conn = self._pool.get_connection(self._datasource)
        self._in_tx = True

    def _commit_tx(self) -> None:
        if self._tx_conn is None:
            return
        try:
            self._tx_conn.commit()
        finally:
            self._in_tx = False

    def _rollback_tx(self) -> None:
        if self._tx_conn is None:
            return
        try:
            self._tx_conn.rollback()
        finally:
            self._in_tx = False

    def release_script_connection(self) -> None:
        """Call at script end: rollback if still in tx, then release or close the connection."""
        if self._tx_conn is None:
            return
        try:
            if self._in_tx:
                try:
                    self._tx_conn.rollback()
                except Exception as e:
                    _log.warning("release_script_connection rollback: %s", e)
        finally:
            if self._close_connection_after_execute:
                try:
                    self._tx_conn.close()
                except Exception as e:
                    _log.warning("release_script_connection close: %s", e)
            else:
                try:
                    self._pool.release(self._tx_conn, self._datasource.id)
                except Exception as e:
                    _log.warning("release_script_connection release: %s", e)
            self._tx_conn = None
            self._in_tx = False

    def to_dict(self) -> dict[str, Any]:
        """Namespace for exec(compiled, globals): db, http, cache, env, log, req, tx, ds, result."""
        # Default result envelope: script can mutate result["data"], result["total"], etc., then return result
        result: dict[str, Any] = {
            "success": True,
            "message": None,
            "data": [],
        }
        return {
            "db": self.db,
            "ds": self.ds,
            "http": self.http,
            "cache": self.cache,
            "env": self.env,
            "log": self.log,
            "req": self.req,
            "tx": self.tx,
            "result": result,
        }


class _TxFacade:
    """Transaction control: begin, commit, rollback."""

    def __init__(self, ctx: ScriptContext) -> None:
        self._ctx = ctx

    def begin(self) -> None:
        self._ctx._begin_tx()

    def commit(self) -> None:
        self._ctx._commit_tx()

    def rollback(self) -> None:
        self._ctx._rollback_tx()
