"""
Connection pool for external DataSources (Phase 3, Task 3.1).

Reuses connections per datasource_id to avoid open/close on every request.
Includes health-check on checkout, max-age eviction, and thread-safe
singleton initialisation.
"""

import logging
import threading
import time
import uuid
from typing import Any, NamedTuple

from app.core.config import settings
from app.models_dbapi import DataSource

from .connect import connect

_log = logging.getLogger(__name__)

_DEFAULT_MAX_AGE_SEC = 600  # 10 minutes


_PING_IDLE_THRESHOLD = 30.0  # only ping connections idle longer than this (seconds)


class _PoolEntry(NamedTuple):
    conn: Any
    created_at: float  # time.monotonic() when the connection was opened
    last_used: float   # time.monotonic() when last returned to pool


class PoolManager:
    """Per-datasource_id connection pool with health-check and max-age."""

    def __init__(self) -> None:
        self._pools: dict[uuid.UUID, list[_PoolEntry]] = {}
        self._lock = threading.Lock()
        self._pool_size: int = settings.EXTERNAL_DB_POOL_SIZE
        self._max_age: float = float(
            getattr(settings, "EXTERNAL_DB_POOL_MAX_AGE_SEC", _DEFAULT_MAX_AGE_SEC)
        )

    def get_connection(self, datasource: DataSource) -> Any:
        """Get a healthy connection for *datasource* (from pool or freshly opened)."""
        ds_id = datasource.id
        now = time.monotonic()
        while True:
            entry = self._pop(ds_id)
            if entry is None:
                break
            if self._is_expired(entry):
                self._close_quiet(entry.conn)
                continue
            idle_sec = now - entry.last_used
            if idle_sec > _PING_IDLE_THRESHOLD and not self._is_alive(entry.conn):
                self._close_quiet(entry.conn)
                continue
            try:
                entry.conn.rollback()
            except Exception:
                self._close_quiet(entry.conn)
                continue
            return entry.conn

        return connect(datasource)

    def release(self, conn: Any, datasource_id: uuid.UUID) -> None:
        """Return a connection to the pool (or close it if pool is full)."""
        try:
            conn.rollback()
        except Exception:
            self._close_quiet(conn)
            return

        with self._lock:
            pool = self._pools.setdefault(datasource_id, [])
            if len(pool) < self._pool_size:
                now = time.monotonic()
                pool.append(_PoolEntry(conn=conn, created_at=now, last_used=now))
                return

        self._close_quiet(conn)

    def dispose(self, datasource_id: uuid.UUID | None = None) -> None:
        """Close pooled connections. ``None`` = dispose all pools."""
        with self._lock:
            if datasource_id is not None:
                entries = self._pools.pop(datasource_id, [])
            else:
                entries = [e for pool in self._pools.values() for e in pool]
                self._pools.clear()
        for e in entries:
            self._close_quiet(e.conn)

    def stats(self) -> dict[str, int]:
        """Return pool statistics for monitoring."""
        with self._lock:
            total = sum(len(p) for p in self._pools.values())
            return {
                "datasources": len(self._pools),
                "idle_connections": total,
            }

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    def _pop(self, ds_id: uuid.UUID) -> _PoolEntry | None:
        with self._lock:
            pool = self._pools.get(ds_id)
            if pool:
                return pool.pop()
        return None

    def _is_expired(self, entry: _PoolEntry) -> bool:
        return (time.monotonic() - entry.created_at) > self._max_age

    @staticmethod
    def _is_alive(conn: Any) -> bool:
        """Lightweight ping: attempt a no-op query to detect broken connections."""
        try:
            cur = conn.cursor()
            cur.execute("SELECT 1")
            cur.close()
            return True
        except Exception:
            return False

    @staticmethod
    def _close_quiet(conn: Any) -> None:
        try:
            conn.close()
        except Exception:
            pass


_pool_manager: PoolManager | None = None
_pool_lock = threading.Lock()


def get_pool_manager() -> PoolManager:
    """Return the singleton PoolManager (thread-safe double-checked locking)."""
    global _pool_manager
    if _pool_manager is None:
        with _pool_lock:
            if _pool_manager is None:
                _pool_manager = PoolManager()
    return _pool_manager
