"""
DB connection and connection pool for external DataSources (Phase 3, Task 3.1).

No driver layer: psycopg and pymysql are installed via pip; DataSource (product_type, host, ...) is enough.
"""

from .connect import connect, cursor_to_dicts, execute
from .health import health_check
from .manager import PoolManager, get_pool_manager

__all__ = [
    "connect",
    "execute",
    "cursor_to_dicts",
    "health_check",
    "PoolManager",
    "get_pool_manager",
]
