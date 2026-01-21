"""
Connection health check for external DBs (Phase 3, Task 3.1).
"""

from typing import Any

from app.models_dbapi import ProductTypeEnum

from .connect import execute


def health_check(conn: Any, product_type: ProductTypeEnum) -> bool:
    """
    Run SELECT 1 and return True if no exception. Postgres and MySQL both support SELECT 1.
    """
    cur = None
    try:
        cur = execute(conn, "SELECT 1", product_type=product_type)
        cur.fetchone()
        return True
    except Exception:
        return False
    finally:
        if cur is not None:
            cur.close()
