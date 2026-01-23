"""
Connection pool for external DataSources (Phase 3, Task 3.1).

Reuses connections per datasource_id to avoid open/close on every request.
"""

import threading
import uuid
from typing import Any

from app.core.config import settings
from app.models_dbapi import DataSource

from .connect import connect


class PoolManager:
    """
    Per-datasource_id connection pool. get_connection / release / dispose.
    """

    def __init__(self) -> None:
        self._pools: dict[uuid.UUID, list[Any]] = {}
        self._lock = threading.Lock()
        self._pool_size = settings.EXTERNAL_DB_POOL_SIZE

    def get_connection(self, datasource: DataSource) -> Any:
        """
        Get a connection for the datasource. Reuses from pool or creates via connect().
        If reusing from pool, rollback any pending transaction to ensure clean state.
        """
        ds_id = datasource.id
        with self._lock:
            pool = self._pools.setdefault(ds_id, [])
            if pool:
                conn = pool.pop()
                # Rollback any pending transaction to ensure clean state
                # This prevents "current transaction is aborted" errors
                try:
                    conn.rollback()
                except Exception:
                    # If rollback fails, connection might be broken, create new one
                    try:
                        conn.close()
                    except Exception:
                        pass
                    return connect(datasource)
                return conn
        return connect(datasource)

    def release(self, conn: Any, datasource_id: uuid.UUID) -> None:
        """
        Return a connection to the pool. If pool is full, close the connection.
        Rollback any pending transaction before returning to pool to ensure clean state.
        """
        # Rollback any pending transaction before returning to pool
        # This prevents "current transaction is aborted" errors on next use
        try:
            conn.rollback()
        except Exception:
            # If rollback fails, connection might be broken, close it instead of pooling
            try:
                conn.close()
            except Exception:
                pass
            return
        
        with self._lock:
            pool = self._pools.get(datasource_id, [])
            if len(pool) < self._pool_size:
                pool.append(conn)
                return
        try:
            conn.close()
        except Exception:
            pass

    def dispose(self, datasource_id: uuid.UUID | None = None) -> None:
        """
        Close pooled connections. If datasource_id is None, dispose all pools.
        """
        with self._lock:
            if datasource_id is not None:
                conns = self._pools.pop(datasource_id, [])
            else:
                conns = [c for pool in self._pools.values() for c in pool]
                self._pools.clear()
        for c in conns:
            try:
                c.close()
            except Exception:
                pass


_pool_manager: PoolManager | None = None


def get_pool_manager() -> PoolManager:
    """Return the singleton PoolManager."""
    global _pool_manager
    if _pool_manager is None:
        _pool_manager = PoolManager()
    return _pool_manager
