"""
StarRocks audit: write/read pydbapi access logs to starrocks_audit_db__.pydbapi_access_log_tbl__.

Table schema matches AccessRecord (id, api_assignment_id, app_client_id, ip_address,
http_method, path, status_code, request_body, created_at) with StarRocks-compatible types.
"""

from datetime import date, datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.engine import Engine

# Database and table: keep starrocks_audit_db__; table name matches pydbapi domain
STARROCKS_AUDIT_DATABASE = "starrocks_audit_db__"
STARROCKS_AUDIT_TABLE = "pydbapi_access_log_tbl__"

# Column names and types aligned with pydbapi AccessRecord (snake_case, StarRocks types)
DDL_STARROCKS_AUDIT = f"""
CREATE DATABASE IF NOT EXISTS {STARROCKS_AUDIT_DATABASE};

CREATE TABLE IF NOT EXISTS {STARROCKS_AUDIT_DATABASE}.{STARROCKS_AUDIT_TABLE} (
  `id` VARCHAR(36) NOT NULL COMMENT "UUID of the access record",
  `api_assignment_id` VARCHAR(36) NULL COMMENT "API assignment UUID",
  `app_client_id` VARCHAR(36) NULL COMMENT "App client UUID",
  `ip_address` VARCHAR(64) NOT NULL COMMENT "Client IP",
  `http_method` VARCHAR(16) NOT NULL COMMENT "GET, POST, PUT, PATCH, DELETE",
  `path` VARCHAR(512) NOT NULL COMMENT "Request path",
  `status_code` INT NOT NULL COMMENT "HTTP status code",
  `request_body` VARCHAR(65533) NULL COMMENT "Request body (optional, may be truncated)",
  `request_headers` VARCHAR(65533) NULL COMMENT "Request headers JSON",
  `request_params` VARCHAR(65533) NULL COMMENT "Request params JSON",
  `created_at` DATETIME NOT NULL COMMENT "Record time",
  `duration_ms` INT NULL COMMENT "Request duration in milliseconds"
) ENGINE = OLAP
DUPLICATE KEY (`id`)
COMMENT "pydbapi gateway access log"
PARTITION BY date_trunc('day', `created_at`)
PROPERTIES (
  "replication_num" = "1",
  "partition_live_number" = "30"
);
"""


def write_starrocks_audit_row(
    engine: Engine,
    *,
    id: UUID,
    api_assignment_id: UUID | None,
    app_client_id: UUID | None,
    ip_address: str,
    http_method: str,
    path: str,
    status_code: int,
    request_body: str | None = None,
    request_headers: str | None = None,
    request_params: str | None = None,
    created_at: datetime | None = None,
    duration_ms: int | None = None,
) -> None:
    """Insert one gateway access record into starrocks_audit_db__.pydbapi_access_log_tbl__."""
    ts = created_at or datetime.now(timezone.utc)
    body_val = None
    if request_body is not None:
        body_val = request_body[:2000] + "..." if len(request_body) > 2000 else request_body
    headers_val = (request_headers[:65533] + "...") if request_headers and len(request_headers) > 65533 else request_headers
    params_val = (request_params[:65533] + "...") if request_params and len(request_params) > 65533 else request_params
    sql = text(f"""
    INSERT INTO {STARROCKS_AUDIT_DATABASE}.{STARROCKS_AUDIT_TABLE}
    (`id`, `api_assignment_id`, `app_client_id`, `ip_address`, `http_method`, `path`, `status_code`, `request_body`, `request_headers`, `request_params`, `created_at`, `duration_ms`)
    VALUES (:id, :api_assignment_id, :app_client_id, :ip_address, :http_method, :path, :status_code, :request_body, :request_headers, :request_params, :created_at, :duration_ms)
    """)
    with engine.connect() as conn:
        conn.execute(
            sql,
            {
                "id": str(id),
                "api_assignment_id": str(api_assignment_id) if api_assignment_id else None,
                "app_client_id": str(app_client_id) if app_client_id else None,
                "ip_address": (ip_address or "")[:64],
                "http_method": (http_method or "GET")[:16],
                "path": (path or "")[:512],
                "status_code": status_code,
                "request_body": body_val,
                "request_headers": headers_val,
                "request_params": params_val,
                "created_at": ts,
                "duration_ms": duration_ms,
            },
        )
        conn.commit()


def _row_to_dict(row: dict) -> dict:
    """Map StarRocks row (pydbapi columns) to AccessRecord-like dict."""
    return {
        "id": row.get("id"),
        "api_assignment_id": row.get("api_assignment_id"),
        "app_client_id": row.get("app_client_id"),
        "ip_address": row.get("ip_address") or "",
        "http_method": row.get("http_method") or "GET",
        "path": row.get("path") or "",
        "status_code": int(row["status_code"]) if row.get("status_code") is not None else 0,
        "request_body": row.get("request_body"),
        "request_headers": row.get("request_headers"),
        "request_params": row.get("request_params"),
        "created_at": row.get("created_at"),
        "duration_ms": row.get("duration_ms"),
    }


def read_starrocks_audit_list(
    engine: Engine,
    *,
    api_assignment_id: str | None = None,
    api_assignment_ids: list[str] | None = None,
    app_client_id: str | None = None,
    path__ilike: str | None = None,
    http_method: str | None = None,
    ip_address: str | None = None,
    time_from: datetime | None = None,
    time_to: datetime | None = None,
    status: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[dict], int]:
    """Query starrocks_audit_db__.pydbapi_access_log_tbl__; return (list of row dicts, total count)."""
    conditions = ["1 = 1"]
    params: dict[str, Any] = {}
    if api_assignment_id is not None:
        conditions.append("`api_assignment_id` = :api_assignment_id")
        params["api_assignment_id"] = api_assignment_id
    if api_assignment_ids:
        # Build `IN` clause with named params to avoid SQL injection
        placeholders: list[str] = []
        for i, v in enumerate(api_assignment_ids):
            key = f"api_assignment_id_{i}"
            placeholders.append(f":{key}")
            params[key] = v
        conditions.append(f"`api_assignment_id` IN ({', '.join(placeholders)})")
    if app_client_id is not None:
        conditions.append("`app_client_id` = :app_client_id")
        params["app_client_id"] = app_client_id
    if path__ilike is not None and path__ilike.strip():
        conditions.append("`path` LIKE :path_like")
        params["path_like"] = f"%{path__ilike.strip()}%"
    if http_method is not None and http_method.strip():
        conditions.append("`http_method` = :http_method")
        params["http_method"] = http_method.strip().upper()
    if ip_address is not None and ip_address.strip():
        conditions.append("`ip_address` = :ip_address")
        params["ip_address"] = ip_address.strip()
    if time_from is not None:
        conditions.append("`created_at` >= :time_from")
        params["time_from"] = time_from
    if time_to is not None:
        conditions.append("`created_at` <= :time_to")
        params["time_to"] = time_to
    if status == "success":
        conditions.append("`status_code` < 400")
    elif status == "fail":
        conditions.append("`status_code` >= 400")

    where_sql = " AND ".join(conditions)
    count_sql = text(
        f"SELECT COUNT(*) AS c FROM {STARROCKS_AUDIT_DATABASE}.{STARROCKS_AUDIT_TABLE} WHERE {where_sql}"
    )
    list_sql = text(f"""
    SELECT `id`, `api_assignment_id`, `app_client_id`, `ip_address`, `http_method`, `path`, `status_code`, `request_body`, `request_headers`, `request_params`, `created_at`, `duration_ms`
    FROM {STARROCKS_AUDIT_DATABASE}.{STARROCKS_AUDIT_TABLE}
    WHERE {where_sql}
    ORDER BY `created_at` DESC
    LIMIT :page_size OFFSET :offset
    """)
    params["page_size"] = page_size
    params["offset"] = (page - 1) * page_size

    count_params = {
        k: v for k, v in params.items()
        if k in ("api_assignment_id", "app_client_id", "path_like", "http_method", "ip_address", "time_from", "time_to")
        or k.startswith("api_assignment_id_")
    }
    with engine.connect() as conn:
        count_result = conn.execute(count_sql, count_params)
        total = 0
        for row in count_result:
            total = row[0] if row else 0
            break
        result = conn.execute(list_sql, params)
        rows = [dict(zip(result.keys(), row, strict=True)) for row in result.fetchall()]

    return [_row_to_dict(r) for r in rows], total


def read_starrocks_audit_detail(engine: Engine, log_id: str) -> dict | None:
    """Get one row by id."""
    sql = text(f"""
    SELECT `id`, `api_assignment_id`, `app_client_id`, `ip_address`, `http_method`, `path`, `status_code`, `request_body`, `request_headers`, `request_params`, `created_at`, `duration_ms`
    FROM {STARROCKS_AUDIT_DATABASE}.{STARROCKS_AUDIT_TABLE}
    WHERE `id` = :id
    LIMIT 1
    """)
    with engine.connect() as conn:
        result = conn.execute(sql, {"id": log_id})
        row = result.fetchone()
    if not row:
        return None
    keys = list(result.keys())
    row_dict = dict(zip(keys, row, strict=True))
    return _row_to_dict(row_dict)


def read_starrocks_audit_requests_by_day(
    engine: Engine,
    *,
    days: int,
) -> list[tuple[date, int]]:
    """Query requests grouped by day from StarRocks audit table. Returns list of (date, count)."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    sql = text(f"""
    SELECT DATE(`created_at`) AS day, COUNT(*) AS count
    FROM {STARROCKS_AUDIT_DATABASE}.{STARROCKS_AUDIT_TABLE}
    WHERE `created_at` >= :cutoff
    GROUP BY DATE(`created_at`)
    ORDER BY day ASC
    """)
    with engine.connect() as conn:
        result = conn.execute(sql, {"cutoff": cutoff})
        rows = result.fetchall()
    points: list[tuple[date, int]] = []
    for row in rows:
        day_val, count_val = row
        if isinstance(day_val, datetime):
            day_val = day_val.date()
        elif isinstance(day_val, str):
            day_val = date.fromisoformat(day_val.split("T")[0])
        points.append((day_val, int(count_val or 0)))
    return points


def read_starrocks_audit_top_paths(
    engine: Engine,
    *,
    days: int,
    limit: int,
) -> list[tuple[str, int]]:
    """Query top paths by count from StarRocks audit table. Returns list of (path, count)."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    sql = text(f"""
    SELECT `path`, COUNT(*) AS count
    FROM {STARROCKS_AUDIT_DATABASE}.{STARROCKS_AUDIT_TABLE}
    WHERE `created_at` >= :cutoff
    GROUP BY `path`
    ORDER BY count DESC
    LIMIT :limit
    """)
    with engine.connect() as conn:
        result = conn.execute(sql, {"cutoff": cutoff, "limit": limit})
        rows = result.fetchall()
    return [(str(path), int(count or 0)) for path, count in rows]


def read_starrocks_audit_recent(
    engine: Engine,
    *,
    limit: int,
) -> list[dict]:
    """Query recent access records from StarRocks audit table. Returns list of row dicts."""
    sql = text(f"""
    SELECT `id`, `api_assignment_id`, `app_client_id`, `ip_address`, `http_method`, `path`, `status_code`, `request_body`, `request_headers`, `request_params`, `created_at`, `duration_ms`
    FROM {STARROCKS_AUDIT_DATABASE}.{STARROCKS_AUDIT_TABLE}
    ORDER BY `created_at` DESC
    LIMIT :limit
    """)
    with engine.connect() as conn:
        result = conn.execute(sql, {"limit": limit})
        rows = [dict(zip(result.keys(), row, strict=True)) for row in result.fetchall()]
    return [_row_to_dict(r) for r in rows]
