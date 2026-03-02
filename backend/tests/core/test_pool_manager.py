"""Tests for pool manager max-age fix (#38).

Runs without database:
    uv run pytest tests/core/test_pool_manager.py -v --noconftest
"""

import time
import uuid
from unittest.mock import MagicMock, patch

from app.core.pool.manager import PoolManager, _PoolEntry


def _make_mock_conn(pool_created_at: float | None = None):
    """Create a mock connection with rollback/close/cursor methods."""
    conn = MagicMock()
    conn.rollback.return_value = None
    conn.close.return_value = None
    if pool_created_at is not None:
        conn._pool_created_at = pool_created_at
    return conn


class TestPoolManagerCreatedAtPreserved:
    """#38: Pool manager must preserve created_at across borrow/release cycles."""

    def test_release_preserves_pool_created_at(self):
        pm = PoolManager()
        ds_id = uuid.uuid4()
        original_time = time.monotonic() - 100  # 100 seconds ago

        conn = _make_mock_conn(pool_created_at=original_time)
        pm.release(conn, ds_id)

        # Check the pool entry preserved the original created_at
        assert len(pm._pools[ds_id]) == 1
        entry = pm._pools[ds_id][0]
        assert entry.created_at == original_time

    def test_release_without_pool_created_at_uses_now(self):
        pm = PoolManager()
        ds_id = uuid.uuid4()

        # Use a real object without _pool_created_at to ensure getattr fallback
        conn = MagicMock(spec=["rollback", "close"])
        conn.rollback.return_value = None
        before = time.monotonic()
        pm.release(conn, ds_id)
        after = time.monotonic()

        entry = pm._pools[ds_id][0]
        assert before <= entry.created_at <= after

    def test_get_connection_stamps_created_at_from_pool(self):
        """When getting a pooled connection, _pool_created_at matches the original."""
        pm = PoolManager()
        ds_id = uuid.uuid4()
        original_time = time.monotonic() - 50

        # Pre-populate pool with an entry
        mock_conn = _make_mock_conn()
        cursor_mock = MagicMock()
        cursor_mock.execute.return_value = None
        mock_conn.cursor.return_value = cursor_mock
        entry = _PoolEntry(conn=mock_conn, created_at=original_time, last_used=time.monotonic())
        pm._pools[ds_id] = [entry]

        mock_ds = MagicMock()
        mock_ds.id = ds_id
        conn = pm.get_connection(mock_ds)
        assert conn._pool_created_at == original_time

    def test_get_connection_stamps_created_at_for_fresh(self):
        """Fresh connections get current monotonic time as _pool_created_at."""
        pm = PoolManager()
        mock_ds = MagicMock()
        mock_ds.id = uuid.uuid4()

        mock_conn = MagicMock()
        before = time.monotonic()
        with patch("app.core.pool.manager.connect", return_value=mock_conn):
            conn = pm.get_connection(mock_ds)
        after = time.monotonic()

        assert before <= conn._pool_created_at <= after


class TestPoolManagerExpiry:
    def test_expired_connections_are_closed(self):
        """Connections older than max_age are closed on checkout."""
        pm = PoolManager()
        pm._max_age = 10.0  # 10 seconds

        ds_id = uuid.uuid4()
        old_conn = _make_mock_conn()
        # Created 20 seconds ago (expired)
        entry = _PoolEntry(
            conn=old_conn,
            created_at=time.monotonic() - 20,
            last_used=time.monotonic(),
        )
        pm._pools[ds_id] = [entry]

        mock_ds = MagicMock()
        mock_ds.id = ds_id
        new_conn = MagicMock()
        with patch("app.core.pool.manager.connect", return_value=new_conn):
            conn = pm.get_connection(mock_ds)

        # Old connection should have been closed
        old_conn.close.assert_called_once()
        # Returned connection is the fresh one
        assert conn is new_conn


class TestPoolManagerDispose:
    def test_dispose_specific(self):
        pm = PoolManager()
        ds_id = uuid.uuid4()
        conn = _make_mock_conn()
        entry = _PoolEntry(conn=conn, created_at=time.monotonic(), last_used=time.monotonic())
        pm._pools[ds_id] = [entry]

        pm.dispose(ds_id)
        assert ds_id not in pm._pools
        conn.close.assert_called_once()

    def test_dispose_all(self):
        pm = PoolManager()
        for _ in range(3):
            ds_id = uuid.uuid4()
            conn = _make_mock_conn()
            entry = _PoolEntry(conn=conn, created_at=time.monotonic(), last_used=time.monotonic())
            pm._pools[ds_id] = [entry]

        pm.dispose()
        assert len(pm._pools) == 0

    def test_stats(self):
        pm = PoolManager()
        ds1, ds2 = uuid.uuid4(), uuid.uuid4()
        for ds_id, count in [(ds1, 2), (ds2, 3)]:
            pm._pools[ds_id] = [
                _PoolEntry(conn=_make_mock_conn(), created_at=time.monotonic(), last_used=time.monotonic())
                for _ in range(count)
            ]
        stats = pm.stats()
        assert stats["datasources"] == 2
        assert stats["idle_connections"] == 5
