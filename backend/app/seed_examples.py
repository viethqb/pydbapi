"""Seed example APIs, sample tables, and demo data.

Controlled by the SEED_EXAMPLE_DATA setting. Idempotent: skips if the
"Examples (PostgreSQL)" module already exists.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any

from sqlalchemy import text
from sqlmodel import Session, select

from app.core.config import settings
from app.core.gateway.resolver import invalidate_route_cache
from app.core.permission_resources import ensure_resource_permissions
from app.core.security import encrypt_value, get_password_hash
from app.models import User
from app.models_dbapi import (
    ApiAccessTypeEnum,
    ApiAssignment,
    ApiAssignmentGroupLink,
    ApiContext,
    ApiGroup,
    ApiMacroDef,
    ApiModule,
    AppClient,
    AppClientGroupLink,
    DataSource,
    ExecuteEngineEnum,
    HttpMethodEnum,
    MacroDefVersionCommit,
    MacroTypeEnum,
    ProductTypeEnum,
    VersionCommit,
)
from app.models_permission import PermissionActionEnum, ResourceTypeEnum

logger = logging.getLogger(__name__)

PG_MODULE_NAME = "Examples (PostgreSQL)"
SR_MODULE_NAME = "Examples (StarRocks)"

# ---------------------------------------------------------------------------
# Permission action sets per resource type
# ---------------------------------------------------------------------------
_DS_ACTIONS = (
    PermissionActionEnum.READ,
    PermissionActionEnum.CREATE,
    PermissionActionEnum.UPDATE,
    PermissionActionEnum.DELETE,
    PermissionActionEnum.EXECUTE,
)
_MOD_ACTIONS = (
    PermissionActionEnum.READ,
    PermissionActionEnum.CREATE,
    PermissionActionEnum.UPDATE,
    PermissionActionEnum.DELETE,
)
_API_ACTIONS = (
    PermissionActionEnum.READ,
    PermissionActionEnum.CREATE,
    PermissionActionEnum.UPDATE,
    PermissionActionEnum.DELETE,
    PermissionActionEnum.EXECUTE,
)
_MACRO_ACTIONS = (
    PermissionActionEnum.READ,
    PermissionActionEnum.CREATE,
    PermissionActionEnum.UPDATE,
    PermissionActionEnum.DELETE,
)
_CLIENT_ACTIONS = (
    PermissionActionEnum.READ,
    PermissionActionEnum.CREATE,
    PermissionActionEnum.UPDATE,
    PermissionActionEnum.DELETE,
)
_GROUP_ACTIONS = (
    PermissionActionEnum.READ,
    PermissionActionEnum.CREATE,
    PermissionActionEnum.UPDATE,
    PermissionActionEnum.DELETE,
)


# ---------------------------------------------------------------------------
# DDL + sample data
# ---------------------------------------------------------------------------

_PG_DDL = """\
CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    price NUMERIC(10,2) NOT NULL DEFAULT 0,
    description TEXT,
    category VARCHAR(100),
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL,
    status INTEGER NOT NULL DEFAULT 1,
    total NUMERIC(10,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS items (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    price NUMERIC(10,2) NOT NULL DEFAULT 0,
    category VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS access_log (
    id SERIAL PRIMARY KEY,
    path VARCHAR(512),
    method VARCHAR(16),
    duration_ms INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS metrics (
    id SERIAL PRIMARY KEY,
    path VARCHAR(512),
    status VARCHAR(64),
    duration_ms INTEGER,
    total_amount NUMERIC(10,2),
    row_count INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS accounts (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    balance NUMERIC(12,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sample_users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE
);
"""

_PG_SEED = """\
INSERT INTO products (name, price, description, category, active) VALUES
  ('Widget',   9.99,  'A basic widget',       'Gadgets',     TRUE),
  ('Gizmo',   24.50,  'A fancy gizmo',        'Gadgets',     TRUE),
  ('Doohickey', 4.99, 'A simple doohickey',   'Accessories', TRUE),
  ('Thingamajig', 14.99, 'A useful thingamajig', 'Tools',    TRUE),
  ('Whatchamacallit', 39.99, 'Premium quality', 'Tools',     TRUE),
  ('Sprocket', 7.49, 'Industrial sprocket',   'Parts',       TRUE),
  ('Cog',      3.99, 'Small brass cog',       'Parts',       FALSE),
  ('Lever',   12.00, 'Adjustable lever',      'Tools',       TRUE)
ON CONFLICT DO NOTHING;

INSERT INTO orders (customer_id, status, total, created_at) VALUES
  (1, 1, 49.99,  '2025-06-01'),
  (2, 2, 124.50, '2025-07-15'),
  (1, 1, 9.99,   '2025-08-20'),
  (3, 3, 74.97,  '2025-09-10'),
  (2, 1, 39.99,  '2025-10-05')
ON CONFLICT DO NOTHING;

INSERT INTO items (name, price, category) VALUES
  ('Bolt M6',  0.15, 'Fasteners'),
  ('Nut M6',   0.10, 'Fasteners'),
  ('Washer',   0.05, 'Fasteners'),
  ('Spring',   1.20, 'Hardware'),
  ('Hinge',    3.50, 'Hardware'),
  ('Bracket',  2.80, 'Hardware')
ON CONFLICT DO NOTHING;

INSERT INTO access_log (path, method, duration_ms, created_at) VALUES
  ('/api/products',       'GET',  45,   '2025-06-01 10:00:00'),
  ('/api/orders',         'GET',  120,  '2025-06-01 10:01:00'),
  ('/api/products/1',     'GET',  600,  '2025-06-01 10:02:00'),
  ('/api/products',       'POST', 1500, '2025-06-01 10:03:00'),
  ('/api/orders/by-status','GET', 250,  '2025-06-01 10:04:00')
ON CONFLICT DO NOTHING;

INSERT INTO metrics (path, status, duration_ms, total_amount, row_count, created_at) VALUES
  ('/api/products',   'success', 45,   99.99,  10, '2025-06-01 10:00:00'),
  ('/api/orders',     'success', 120,  249.50, 5,  '2025-06-01 10:01:00'),
  ('/api/products/1', 'error',   600,  0,      0,  '2025-06-01 10:02:00'),
  ('/api/products',   'success', 200,  149.97, 8,  '2025-06-01 10:03:00'),
  ('/api/metrics',    'success', 80,   0,      3,  '2025-06-01 10:04:00')
ON CONFLICT DO NOTHING;

INSERT INTO accounts (name, balance) VALUES
  ('Alice', 1000.00),
  ('Bob',   500.00)
ON CONFLICT DO NOTHING;

INSERT INTO sample_users (username, email, is_active) VALUES
  ('alice',   'alice@example.com',   TRUE),
  ('bob',     'bob@example.com',     TRUE),
  ('charlie', 'charlie@example.com', FALSE),
  ('diana',   'diana@example.com',   TRUE)
ON CONFLICT DO NOTHING;
"""

# ---------------------------------------------------------------------------
# API definitions
# ---------------------------------------------------------------------------

# Each tuple: (name, path_suffix, method, engine, content, params, access_type,
#               param_validates, result_transform)
# params is a list of dicts with: name, location, type, required (optional), default (optional)

_SQL = ExecuteEngineEnum.SQL
_SCRIPT = ExecuteEngineEnum.SCRIPT
_GET = HttpMethodEnum.GET
_POST = HttpMethodEnum.POST
_PUT = HttpMethodEnum.PUT
_DELETE = HttpMethodEnum.DELETE
_PUBLIC = ApiAccessTypeEnum.PUBLIC
_PRIVATE = ApiAccessTypeEnum.PRIVATE


def _p(
    name: str,
    location: str,
    type_: str = "string",
    required: bool = False,
    default: Any = None,
    description: str | None = None,
) -> dict:
    d: dict[str, Any] = {"name": name, "location": location, "data_type": type_}
    if required:
        d["is_required"] = True
    if default is not None:
        d["default_value"] = str(default)
    if description:
        d["description"] = description
    return d


def _api_defs(
    prefix: str, *, skip_transfer: bool = False, dialect: str = "pg"
) -> list[tuple]:
    """Return API definitions with paths prefixed by *prefix*.

    *dialect* controls SQL syntax: ``"pg"`` for PostgreSQL, ``"sr"`` for
    StarRocks (no ILIKE, no RETURNING, etc.).
    """
    is_sr = dialect == "sr"

    # ILIKE replacement for StarRocks: LOWER(col) LIKE LOWER(...)
    _like_name = (
        "AND LOWER(name) LIKE CONCAT(LOWER({{ q | sql_string }}), '%%')"
        if is_sr
        else "AND name ILIKE {{ q | sql_like_start }}"
    )

    defs: list[tuple] = [
        # 1.1 List Products
        (
            "List Products",
            f"{prefix}/products",
            _GET,
            _SQL,
            (
                "SELECT id, name, price, created_at\n"
                "FROM products\n"
                "ORDER BY id DESC\n"
                "LIMIT {{ (limit | default(20)) | sql_int }}\n"
                "OFFSET {{ (offset | default(0)) | sql_int }};"
            ),
            [
                _p("limit", "query", "integer", default=20, description="Max rows to return"),
                _p("offset", "query", "integer", default=0, description="Number of rows to skip"),
            ],
            _PUBLIC,
            None,
            None,
        ),
        # 1.2 Get Product
        (
            "Get Product",
            f"{prefix}/products/{{id}}",
            _GET,
            _SQL,
            (
                "SELECT id, name, price, description, created_at\n"
                "FROM products\n"
                "WHERE id = {{ id | sql_int }};"
            ),
            [_p("id", "path", "integer", required=True, default=1, description="Product ID")],
            _PUBLIC,
            None,
            None,
        ),
        # 1.3 Create Product
        (
            "Create Product",
            f"{prefix}/products",
            _POST,
            _SQL,
            (
                "INSERT INTO products (id, name, price, description)\n"
                "VALUES ({{ id | sql_int }}, {{ name | sql_string }}, {{ price | sql_float }}, {{ description | sql_string }});"
            )
            if is_sr
            else (
                "INSERT INTO products (name, price, description)\n"
                "VALUES ({{ name | sql_string }}, {{ price | sql_float }}, {{ description | sql_string }})\n"
                "RETURNING id, name, price;"
            ),
            [
                _p("id", "body", "integer", required=True, default=100, description="Product ID (StarRocks requires explicit ID)"),
                _p("name", "body", "string", required=True, default="New Product", description="Product name"),
                _p("price", "body", "number", required=True, default=19.99, description="Product price"),
                _p("description", "body", "string", default="A sample product", description="Product description"),
            ]
            if is_sr
            else [
                _p("name", "body", "string", required=True, default="New Product", description="Product name"),
                _p("price", "body", "number", required=True, default=19.99, description="Product price"),
                _p("description", "body", "string", default="A sample product", description="Product description"),
            ],
            _PUBLIC,
            None,
            None,
        ),
        # 1.4 Update Product
        (
            "Update Product",
            f"{prefix}/products/{{id}}",
            _PUT,
            _SQL,
            (
                "UPDATE products\n"
                "SET\n"
                "  {% if name %}name = {{ name | sql_string }},{% endif %}\n"
                "  {% if price %}price = {{ price | sql_float }},{% endif %}\n"
                "  {% if description %}description = {{ description | sql_string }},{% endif %}\n"
                "  updated_at = NOW()\n"
                "WHERE id = {{ id | sql_int }};"
            )
            if is_sr
            else (
                "UPDATE products\n"
                "SET\n"
                "  {% if name %}name = {{ name | sql_string }},{% endif %}\n"
                "  {% if price %}price = {{ price | sql_float }},{% endif %}\n"
                "  {% if description %}description = {{ description | sql_string }},{% endif %}\n"
                "  updated_at = NOW()\n"
                "WHERE id = {{ id | sql_int }}\n"
                "RETURNING id, name, price;"
            ),
            [
                _p("id", "path", "integer", required=True, default=1, description="Product ID to update"),
                _p("name", "body", "string", default="Updated Widget", description="New product name"),
                _p("price", "body", "number", default=29.99, description="New price"),
                _p("description", "body", "string", description="New description"),
            ],
            _PUBLIC,
            None,
            None,
        ),
        # 1.5 Delete Product
        (
            "Delete Product",
            f"{prefix}/products/{{id}}",
            _DELETE,
            _SQL,
            "DELETE FROM products\nWHERE id = {{ id | sql_int }};",
            [_p("id", "path", "integer", required=True, default=999, description="Product ID to delete")],
            _PUBLIC,
            None,
            None,
        ),
        # 2.1 Search Products
        (
            "Search Products",
            f"{prefix}/products/search",
            _GET,
            _SQL,
            (
                "SELECT id, name, price\n"
                "FROM products\n"
                "{% where %}\n"
                f"  {{% if q %}}{_like_name}{{% endif %}}\n"
                "{% endwhere %}\n"
                "ORDER BY name\n"
                "LIMIT 50;"
            ),
            [_p("q", "query", "string", default="widget", description="Search term (prefix match on name)")],
            _PUBLIC,
            None,
            None,
        ),
        # 2.2 Orders by Status
        (
            "Orders by Status",
            f"{prefix}/orders/by-status",
            _GET,
            _SQL,
            (
                "SELECT id, customer_id, status, total\n"
                "FROM orders\n"
                'WHERE status IN {{ status_ids.split(",") | in_list }}\n'
                "ORDER BY id DESC;"
            ),
            [_p("status_ids", "query", "array", required=True, default="1,2", description="Comma-separated status IDs")],
            _PUBLIC,
            None,
            None,
        ),
        # 2.3 Orders Date Range
        (
            "Orders Date Range",
            f"{prefix}/orders",
            _GET,
            _SQL,
            (
                "SELECT id, customer_id, total, created_at\n"
                "FROM orders\n"
                "{% where %}\n"
                "  {% if date_from %}AND created_at >= {{ date_from | sql_date }}{% endif %}\n"
                "  {% if date_to %}AND created_at <= {{ date_to | sql_date }}{% endif %}\n"
                "{% endwhere %}\n"
                "ORDER BY created_at DESC\n"
                "LIMIT 100;"
            ),
            [
                _p("date_from", "query", "string", default="2025-01-01", description="Start date (YYYY-MM-DD)"),
                _p("date_to", "query", "string", default="2026-12-31", description="End date (YYYY-MM-DD)"),
            ],
            _PUBLIC,
            None,
            None,
        ),
        # 2.4 Filter Products
        (
            "Filter Products",
            f"{prefix}/products/filter",
            _GET,
            _SQL,
            (
                "SELECT id, name, price, category, active\n"
                "FROM products\n"
                "{% where %}\n"
                f"  {{% if q %}}{_like_name}{{% endif %}}\n"
                "  {% if min_price %}AND price >= {{ min_price | sql_float }}{% endif %}\n"
                "  {% if category %}AND category = {{ category | sql_string }}{% endif %}\n"
                "  {% if active is defined and active is not none %}AND active = {{ active | sql_bool }}{% endif %}\n"
                "{% endwhere %}\n"
                "ORDER BY name\n"
                "LIMIT {{ (limit | default(20)) | sql_int }};"
            ),
            [
                _p("q", "query", "string", description="Search term (prefix match on name)"),
                _p("min_price", "query", "number", default=5, description="Minimum price filter"),
                _p("category", "query", "string", description="Filter by category (e.g. Gadgets, Tools)"),
                _p("active", "query", "boolean", description="Filter by active status"),
                _p("limit", "query", "integer", default=20, description="Max rows to return"),
            ],
            _PUBLIC,
            None,
            None,
        ),
        # 3.1 Slow Requests
        (
            "Slow Requests",
            f"{prefix}/requests/slow",
            _GET,
            _SQL,
            (
                "SELECT id, path, method, duration_ms, created_at\n"
                "FROM access_log\n"
                "{% where %}\n"
                "  {% if duration_ms %}AND duration_ms {{ duration_ms | compare }}{% endif %}\n"
                "{% endwhere %}\n"
                "ORDER BY duration_ms DESC\n"
                "LIMIT 100;"
            ),
            [_p("duration_ms", "query", "object", default='{"combinator":">","value":"100"}', description="Duration filter (compare object)")],
            _PUBLIC,
            None,
            None,
        ),
        # 3.2 Metrics Multi-Compare
        (
            "Metrics Multi-Compare",
            f"{prefix}/metrics",
            _GET,
            _SQL,
            (
                "{% set compare_fields = [\n"
                '  ("duration_ms", duration_ms),\n'
                '  ("total_amount", total_amount),\n'
                '  ("row_count", row_count)\n'
                "] %}\n"
                "\n"
                "SELECT id, path, status, duration_ms, total_amount, row_count\n"
                "FROM metrics\n"
                "{% where %}\n"
                "  {% if status %}AND status = {{ status | sql_string }}{% endif %}\n"
                "  {% for col, val in compare_fields %}\n"
                "    {% if val %}AND {{ col | sql_ident }} {{ val | compare }}{% endif %}\n"
                "  {% endfor %}\n"
                "{% endwhere %}\n"
                "ORDER BY created_at DESC\n"
                "LIMIT 100;"
            ),
            [
                _p("status", "query", "string", default="success", description="Filter by status"),
                _p("duration_ms", "query", "object", description="Duration filter (compare object)"),
                _p("total_amount", "query", "object", description="Total amount filter (compare object)"),
                _p("row_count", "query", "object", description="Row count filter (compare object)"),
            ],
            _PUBLIC,
            None,
            None,
        ),
        # 3.3 Metrics OR Operation
        (
            "Metrics OR Operation",
            f"{prefix}/metrics/any",
            _GET,
            _SQL,
            (
                "{% set compare_fields = [\n"
                '  ("duration_ms", duration_ms),\n'
                '  ("total_amount", total_amount),\n'
                '  ("row_count", row_count)\n'
                "] %}\n"
                "\n"
                "SELECT id, path, status, duration_ms, total_amount, row_count\n"
                "FROM metrics\n"
                '{% where operation=operation %}\n'
                "  {% if status %}AND status = {{ status | sql_string }}{% endif %}\n"
                "  {% for col, val in compare_fields %}\n"
                "    {% if val %}AND {{ col | sql_ident }} {{ val | compare }}{% endif %}\n"
                "  {% endfor %}\n"
                "{% endwhere %}\n"
                "ORDER BY created_at DESC\n"
                "LIMIT 100;"
            ),
            [
                _p("status", "query", "string", default="success", description="Filter by status"),
                _p("duration_ms", "query", "object", description="Duration filter (compare object)"),
                _p("total_amount", "query", "object", description="Total amount filter (compare object)"),
                _p("row_count", "query", "object", description="Row count filter (compare object)"),
                _p("operation", "query", "string", default="OR", description="Condition join: AND (match all) or OR (match any)"),
            ],
            _PUBLIC,
            None,
            None,
        ),
        # 3.4 Metrics Script
        (
            "Metrics Script",
            f"{prefix}/metrics/script",
            _GET,
            _SCRIPT,
            (
                'ALLOWED_OPS = {">", ">=", "<", "<=", "=", "!="}\n'
                "\n"
                "def parse_compare(raw):\n"
                '    """Parse a comparison object and return (sql_fragment, values) or None."""\n'
                "    if not raw:\n"
                "        return None\n"
                "    obj = raw if isinstance(raw, dict) else json.loads(raw)\n"
                '    combinator = obj.get("combinator", "").strip()\n'
                '    raw_val = str(obj.get("values", obj.get("value", ""))).strip()\n'
                "\n"
                '    if combinator.lower() == "between":\n'
                '        parts = raw_val.split(",")\n'
                "        if len(parts) != 2:\n"
                "            return None\n"
                "        lo, hi = float(parts[0]), float(parts[1])\n"
                '        return "BETWEEN %s AND %s", [lo, hi]\n'
                "\n"
                "    if combinator in ALLOWED_OPS:\n"
                '        return f"{combinator} %s", [float(raw_val)]\n'
                "\n"
                "    return None\n"
                "\n"
                "\n"
                "def execute(params=None):\n"
                "    conditions = []\n"
                "    values = []\n"
                "\n"
                '    if params.get("status"):\n'
                '        conditions.append("status = %s")\n'
                '        values.append(params["status"])\n'
                "\n"
                '    for col in ["duration_ms", "total_amount"]:\n'
                "        parsed = parse_compare(params.get(col))\n"
                "        if parsed:\n"
                "            fragment, vals = parsed\n"
                '            conditions.append(f"{col} {fragment}")\n'
                "            values.extend(vals)\n"
                "\n"
                '    where = ""\n'
                "    if conditions:\n"
                '        where = "WHERE " + " AND ".join(conditions)\n'
                "\n"
                '    sql = f"SELECT id, path, status, duration_ms, total_amount FROM metrics {where} ORDER BY created_at DESC LIMIT 100"\n'
                "    rows = db.query(sql, values)\n"
                '    return {"success": True, "data": rows}'
            ),
            [
                _p("status", "query", "string", default="success", description="Filter by status"),
                _p("duration_ms", "query", "object", description="Duration filter (compare object)"),
                _p("total_amount", "query", "object", description="Total amount filter (compare object)"),
            ],
            _PUBLIC,
            None,
            None,
        ),
        # 4. Items with Count
        (
            "Items with Count",
            f"{prefix}/items",
            _GET,
            _SQL,
            (
                "SELECT id, name, price, category\n"
                "FROM items\n"
                "{% where %}\n"
                f"  {{% if q %}}{_like_name}{{% endif %}}\n"
                "{% endwhere %}\n"
                "ORDER BY id DESC\n"
                "LIMIT {{ (limit | default(20)) | sql_int }}\n"
                "OFFSET {{ (offset | default(0)) | sql_int }};\n"
                "\n"
                "SELECT COUNT(*) AS total\n"
                "FROM items\n"
                "{% where %}\n"
                f"  {{% if q %}}{_like_name}{{% endif %}}\n"
                "{% endwhere %};"
            ),
            [
                _p("q", "query", "string", description="Search term (prefix match on name)"),
                _p("limit", "query", "integer", default=20, description="Max rows to return"),
                _p("offset", "query", "integer", default=0, description="Number of rows to skip"),
            ],
            _PUBLIC,
            None,
            # result transform — result is {"data": [[rows], [count_rows]]}
            (
                "def transform(result, params=None):\n"
                "    if not params:\n"
                "        params = {}\n"
                '    data = result["data"] if isinstance(result, dict) else result\n'
                "    rows = data[0] if len(data) > 0 else []\n"
                "    count_row = data[1][0] if len(data) > 1 and data[1] else {}\n"
                "    return {\n"
                '        "data": rows,\n'
                '        "total": count_row.get("total", 0),\n'
                '        "limit": params.get("limit", 20),\n'
                '        "offset": params.get("offset", 0),\n'
                "    }"
            ),
        ),
        # 5. Sorted Products
        (
            "Sorted Products",
            f"{prefix}/products/sorted",
            _GET,
            _SQL,
            (
                '{% set dir = "ASC" if sort_dir == "asc" else "DESC" %}\n'
                "\n"
                "SELECT id, name, price, created_at\n"
                "FROM products\n"
                "ORDER BY {{ (sort_by | default('id')) | sql_ident }} {{ dir | sql_ident }}\n"
                "LIMIT {{ (limit | default(20)) | sql_int }};"
            ),
            [
                _p("sort_by", "query", "string", default="price", description="Column to sort by (id, name, price)"),
                _p("sort_dir", "query", "string", default="desc", description="Sort direction (asc or desc)"),
                _p("limit", "query", "integer", default=20, description="Max rows to return"),
            ],
            _PUBLIC,
            None,
            None,
        ),
        # 7.1 Active Users (script)
        (
            "Active Users",
            f"{prefix}/users/active",
            _GET,
            _SCRIPT,
            (
                "def execute(params=None):\n"
                "    rows = db.query(\n"
                '        "SELECT id, username, email FROM sample_users WHERE is_active = %s ORDER BY username",\n'
                "        [True]\n"
                "    )\n"
                '    return {"success": True, "data": rows}'
            ),
            [],
            _PUBLIC,
            None,
            None,
        ),
        # 7.2 Weather API (script)
        (
            "Weather API",
            f"{prefix}/weather",
            _GET,
            _SCRIPT,
            (
                "def execute(params=None):\n"
                '    city = params.get("city", "London")\n'
                "    # Demo: return mock data since WEATHER_API_KEY may not be set\n"
                "    return {\n"
                '        "success": True,\n'
                '        "data": {\n'
                '            "city": city,\n'
                '            "temperature": 22,\n'
                '            "condition": "Sunny",\n'
                '            "note": "This is mock data. Set WEATHER_API_KEY and update the script to call a real API."\n'
                "        }\n"
                "    }"
            ),
            [_p("city", "query", "string", default="London", description="City name for weather lookup")],
            _PUBLIC,
            None,
            None,
        ),
        # 7.3 Cached Products (script)
        (
            "Cached Products",
            f"{prefix}/products/cached",
            _GET,
            _SCRIPT,
            (
                "def execute(params=None):\n"
                '    cache_key = "all_products"\n'
                "    cached = cache.get(cache_key)\n"
                "\n"
                "    if cached:\n"
                '        log.debug("Cache hit for products")\n'
                '        return {"success": True, "data": json.loads(cached)}\n'
                "\n"
                '    rows = db.query("SELECT id, name, price FROM products ORDER BY name LIMIT 100")\n'
                "    # Use default=str to handle Decimal serialization\n"
                "    cache.set(cache_key, json.dumps(rows, default=str), ttl_seconds=300)\n"
                '    log.info("Cached products list", {"count": len(rows)})\n'
                "\n"
                '    return {"success": True, "data": rows}'
            ),
            [],
            _PUBLIC,
            None,
            None,
        ),
        # 9. Private Orders
        (
            "Private Orders",
            f"{prefix}/orders/private",
            _GET,
            _SQL,
            (
                "SELECT id, customer_id, status, total, created_at\n"
                "FROM orders\n"
                "ORDER BY created_at DESC\n"
                "LIMIT {{ (limit | default(20)) | sql_int }};"
            ),
            [_p("limit", "query", "integer", default=20, description="Max rows to return")],
            _PRIVATE,
            None,
            None,
        ),
    ]

    # 7.4 Transfer (transactions) — only for PostgreSQL (not StarRocks)
    if not skip_transfer:
        defs.append(
            (
                "Transfer",
                f"{prefix}/transfer",
                _POST,
                _SCRIPT,
                (
                    "def execute(params=None):\n"
                    '    from_id = int(params["from_id"])\n'
                    '    to_id = int(params["to_id"])\n'
                    '    amount = float(params["amount"])\n'
                    "\n"
                    "    tx.begin()\n"
                    "\n"
                    "    sender = db.query_one(\n"
                    '        "SELECT id, balance FROM accounts WHERE id = %s FOR UPDATE", [from_id]\n'
                    "    )\n"
                    '    if not sender or float(sender["balance"]) < amount:\n'
                    "        tx.rollback()\n"
                    '        return {"success": False, "message": "Insufficient balance", "data": []}\n'
                    "\n"
                    "    db.execute(\n"
                    '        "UPDATE accounts SET balance = balance - %s WHERE id = %s", [amount, from_id]\n'
                    "    )\n"
                    "    db.execute(\n"
                    '        "UPDATE accounts SET balance = balance + %s WHERE id = %s", [amount, to_id]\n'
                    "    )\n"
                    "\n"
                    "    tx.commit()\n"
                    "\n"
                    '    return {"success": True, "message": "Transfer complete", "data": {"from": from_id, "to": to_id, "amount": amount}}'
                ),
                [
                    _p("from_id", "body", "integer", required=True, default=1, description="Source account ID"),
                    _p("to_id", "body", "integer", required=True, default=2, description="Destination account ID"),
                    _p("amount", "body", "number", required=True, default=10.00, description="Amount to transfer"),
                ],
                _PUBLIC,
                None,
                None,
            )
        )

    return defs


# ---------------------------------------------------------------------------
# Macro definitions
# ---------------------------------------------------------------------------

_MACROS = [
    (
        "pagination",
        MacroTypeEnum.JINJA,
        (
            "{% macro paginate(limit_param, offset_param, default_limit=20) %}\n"
            "LIMIT {{ limit_param | sql_int if limit_param else default_limit }}\n"
            "OFFSET {{ offset_param | sql_int if offset_param else 0 }}\n"
            "{% endmacro %}"
        ),
        "Reusable pagination macro for SQL templates",
    ),
    (
        "response_helpers",
        MacroTypeEnum.PYTHON,
        (
            "def success_response(data, total=None, **extra):\n"
            '    resp = {"success": True, "data": data}\n'
            "    if total is not None:\n"
            '        resp["total"] = total\n'
            "    resp.update(extra)\n"
            "    return resp\n"
            "\n"
            "def error_response(message):\n"
            '    return {"success": False, "message": message, "data": []}'
        ),
        "Shared response helper functions for Python scripts",
    ),
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _already_seeded(session: Session) -> bool:
    """Return True if the PostgreSQL examples module already exists."""
    stmt = select(ApiModule).where(ApiModule.name == PG_MODULE_NAME)
    return session.exec(stmt).first() is not None


def _get_superuser(session: Session) -> User:
    """Return the first superuser (for committed_by_id)."""
    stmt = select(User).where(User.is_superuser == True)  # noqa: E712
    user = session.exec(stmt).first()
    if not user:
        raise RuntimeError("No superuser found — run init_db first")
    return user


def _create_pg_tables(session: Session) -> None:
    """Create sample tables and seed data using the app's own PostgreSQL."""
    for stmt in _PG_DDL.strip().split(";"):
        stmt = stmt.strip()
        if stmt:
            session.execute(text(stmt))
    for stmt in _PG_SEED.strip().split(";"):
        stmt = stmt.strip()
        if stmt:
            session.execute(text(stmt))
    session.flush()
    logger.info("Created sample tables and data in PostgreSQL")


def _create_datasource(
    session: Session,
    name: str,
    product_type: ProductTypeEnum,
    host: str,
    port: int,
    database: str,
    username: str,
    password: str,
    description: str | None = None,
    close_connection_after_execute: bool = False,
) -> DataSource:
    """Create a DataSource record with encrypted password."""
    ds = DataSource(
        name=name,
        product_type=product_type,
        host=host,
        port=port,
        database=database,
        username=username,
        password=encrypt_value(password),
        description=description,
        close_connection_after_execute=close_connection_after_execute,
        is_active=True,
    )
    session.add(ds)
    session.flush()
    ensure_resource_permissions(
        session, ResourceTypeEnum.DATASOURCE, ds.id, _DS_ACTIONS
    )
    logger.info("Created datasource: %s", name)
    return ds


def _create_module(session: Session, name: str, description: str) -> ApiModule:
    """Create an ApiModule record."""
    mod = ApiModule(name=name, description=description, is_active=True)
    session.add(mod)
    session.flush()
    ensure_resource_permissions(session, ResourceTypeEnum.MODULE, mod.id, _MOD_ACTIONS)
    logger.info("Created module: %s", name)
    return mod


def _create_apis(
    session: Session,
    module: ApiModule,
    datasource: DataSource,
    api_defs: list[tuple],
    user_id: uuid.UUID,
) -> dict[str, ApiAssignment]:
    """Create ApiAssignment + ApiContext + VersionCommit for each API definition."""
    created: dict[str, ApiAssignment] = {}
    for idx, api_def in enumerate(api_defs):
        (
            name,
            path,
            method,
            engine,
            content,
            params,
            access_type,
            param_validates,
            result_transform,
        ) = api_def

        assignment = ApiAssignment(
            module_id=module.id,
            name=name,
            path=path,
            http_method=method,
            execute_engine=engine,
            datasource_id=datasource.id,
            access_type=access_type,
            is_published=False,
            sort_order=idx,
        )
        session.add(assignment)
        session.flush()

        ensure_resource_permissions(
            session, ResourceTypeEnum.API_ASSIGNMENT, assignment.id, _API_ACTIONS
        )

        # ApiContext
        ctx = ApiContext(
            api_assignment_id=assignment.id,
            content=content,
            params=params if params else None,
            param_validates=param_validates,
            result_transform=result_transform,
        )
        session.add(ctx)
        session.flush()

        # VersionCommit
        vc = VersionCommit(
            api_assignment_id=assignment.id,
            version=1,
            content_snapshot=content,
            params_snapshot=params if params else None,
            param_validates_snapshot=param_validates,
            result_transform_snapshot=result_transform,
            commit_message="Initial seed",
            committed_by_id=user_id,
        )
        session.add(vc)
        session.flush()

        # Publish
        assignment.is_published = True
        assignment.published_version_id = vc.id
        session.add(assignment)
        session.flush()

        created[name] = assignment

    logger.info("Created %d APIs in module '%s'", len(created), module.name)
    return created


def _create_macros(
    session: Session,
    module: ApiModule,
    user_id: uuid.UUID,
) -> list[ApiMacroDef]:
    """Create macro definitions with version commits."""
    created: list[ApiMacroDef] = []
    for name, macro_type, content, description in _MACROS:
        macro = ApiMacroDef(
            module_id=module.id,
            name=name,
            macro_type=macro_type,
            content=content,
            description=description,
            is_published=False,
        )
        session.add(macro)
        session.flush()

        ensure_resource_permissions(
            session, ResourceTypeEnum.MACRO_DEF, macro.id, _MACRO_ACTIONS
        )

        vc = MacroDefVersionCommit(
            api_macro_def_id=macro.id,
            version=1,
            content_snapshot=content,
            commit_message="Initial seed",
            committed_by_id=user_id,
        )
        session.add(vc)
        session.flush()

        macro.is_published = True
        macro.published_version_id = vc.id
        session.add(macro)
        session.flush()

        created.append(macro)

    logger.info("Created %d macros in module '%s'", len(created), module.name)
    return created


def _create_client_and_group(
    session: Session,
    private_api: ApiAssignment,
) -> None:
    """Create a sample AppClient, ApiGroup, and link them to the private API."""
    # Client
    client = AppClient(
        name="Example Mobile App",
        client_id="mobile-app",
        client_secret=get_password_hash("s3cret!"),
        description="Sample client for the private API example",
        rate_limit_per_minute=100,
        max_concurrent=5,
        is_active=True,
    )
    session.add(client)
    session.flush()
    ensure_resource_permissions(
        session, ResourceTypeEnum.CLIENT, client.id, _CLIENT_ACTIONS
    )

    # Group
    group = ApiGroup(
        name="Example Group",
        description="Group for example private APIs",
        is_active=True,
    )
    session.add(group)
    session.flush()
    ensure_resource_permissions(
        session, ResourceTypeEnum.GROUP, group.id, _GROUP_ACTIONS
    )

    # Link client to group
    client_group_link = AppClientGroupLink(
        app_client_id=client.id,
        api_group_id=group.id,
    )
    session.add(client_group_link)

    # Link API to group
    api_group_link = ApiAssignmentGroupLink(
        api_assignment_id=private_api.id,
        api_group_id=group.id,
    )
    session.add(api_group_link)
    session.flush()

    logger.info(
        "Created client '%s', group '%s', and linked to private API",
        client.client_id,
        group.name,
    )


# ---------------------------------------------------------------------------
# StarRocks support
# ---------------------------------------------------------------------------

_SR_DDL_TEMPLATE = """\
CREATE DATABASE IF NOT EXISTS example_db;
USE example_db;

CREATE TABLE IF NOT EXISTS products (
    id INT,
    name VARCHAR(255),
    price DECIMAL(10,2),
    description VARCHAR(1024),
    category VARCHAR(100),
    active BOOLEAN,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=OLAP
PRIMARY KEY(id)
DISTRIBUTED BY HASH(id) BUCKETS 1
PROPERTIES("replication_num"="1");

CREATE TABLE IF NOT EXISTS orders (
    id INT,
    customer_id INT,
    status INT,
    total DECIMAL(10,2),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=OLAP
DUPLICATE KEY(id)
DISTRIBUTED BY HASH(id) BUCKETS 1
PROPERTIES("replication_num"="1");

CREATE TABLE IF NOT EXISTS items (
    id INT,
    name VARCHAR(255),
    price DECIMAL(10,2),
    category VARCHAR(100),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=OLAP
DUPLICATE KEY(id)
DISTRIBUTED BY HASH(id) BUCKETS 1
PROPERTIES("replication_num"="1");

CREATE TABLE IF NOT EXISTS access_log (
    id INT,
    path VARCHAR(512),
    method VARCHAR(16),
    duration_ms INT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=OLAP
DUPLICATE KEY(id)
DISTRIBUTED BY HASH(id) BUCKETS 1
PROPERTIES("replication_num"="1");

CREATE TABLE IF NOT EXISTS metrics (
    id INT,
    path VARCHAR(512),
    status VARCHAR(64),
    duration_ms INT,
    total_amount DECIMAL(10,2),
    row_count INT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=OLAP
DUPLICATE KEY(id)
DISTRIBUTED BY HASH(id) BUCKETS 1
PROPERTIES("replication_num"="1");

CREATE TABLE IF NOT EXISTS accounts (
    id INT,
    name VARCHAR(255),
    balance DECIMAL(12,2)
) ENGINE=OLAP
PRIMARY KEY(id)
DISTRIBUTED BY HASH(id) BUCKETS 1
PROPERTIES("replication_num"="1");

CREATE TABLE IF NOT EXISTS sample_users (
    id INT,
    username VARCHAR(255),
    email VARCHAR(255),
    is_active BOOLEAN
) ENGINE=OLAP
DUPLICATE KEY(id)
DISTRIBUTED BY HASH(id) BUCKETS 1
PROPERTIES("replication_num"="1");
"""

_SR_SEED_STATEMENTS = [
    "INSERT INTO example_db.products (id, name, price, description, category, active) SELECT 1,'Widget',9.99,'A basic widget','Gadgets',TRUE WHERE NOT EXISTS (SELECT 1 FROM example_db.products WHERE id=1)",
    "INSERT INTO example_db.products (id, name, price, description, category, active) SELECT 2,'Gizmo',24.50,'A fancy gizmo','Gadgets',TRUE WHERE NOT EXISTS (SELECT 1 FROM example_db.products WHERE id=2)",
    "INSERT INTO example_db.products (id, name, price, description, category, active) SELECT 3,'Doohickey',4.99,'A simple doohickey','Accessories',TRUE WHERE NOT EXISTS (SELECT 1 FROM example_db.products WHERE id=3)",
    "INSERT INTO example_db.products (id, name, price, description, category, active) SELECT 4,'Thingamajig',14.99,'A useful thingamajig','Tools',TRUE WHERE NOT EXISTS (SELECT 1 FROM example_db.products WHERE id=4)",
    "INSERT INTO example_db.products (id, name, price, description, category, active) SELECT 5,'Whatchamacallit',39.99,'Premium quality','Tools',TRUE WHERE NOT EXISTS (SELECT 1 FROM example_db.products WHERE id=5)",
    "INSERT INTO example_db.orders (id, customer_id, status, total) SELECT 1,1,1,49.99 WHERE NOT EXISTS (SELECT 1 FROM example_db.orders WHERE id=1)",
    "INSERT INTO example_db.orders (id, customer_id, status, total) SELECT 2,2,2,124.50 WHERE NOT EXISTS (SELECT 1 FROM example_db.orders WHERE id=2)",
    "INSERT INTO example_db.orders (id, customer_id, status, total) SELECT 3,1,1,9.99 WHERE NOT EXISTS (SELECT 1 FROM example_db.orders WHERE id=3)",
    "INSERT INTO example_db.items (id, name, price, category) SELECT 1,'Bolt M6',0.15,'Fasteners' WHERE NOT EXISTS (SELECT 1 FROM example_db.items WHERE id=1)",
    "INSERT INTO example_db.items (id, name, price, category) SELECT 2,'Nut M6',0.10,'Fasteners' WHERE NOT EXISTS (SELECT 1 FROM example_db.items WHERE id=2)",
    "INSERT INTO example_db.items (id, name, price, category) SELECT 3,'Washer',0.05,'Fasteners' WHERE NOT EXISTS (SELECT 1 FROM example_db.items WHERE id=3)",
    "INSERT INTO example_db.access_log (id, path, method, duration_ms) SELECT 1,'/api/products','GET',45 WHERE NOT EXISTS (SELECT 1 FROM example_db.access_log WHERE id=1)",
    "INSERT INTO example_db.access_log (id, path, method, duration_ms) SELECT 2,'/api/orders','GET',120 WHERE NOT EXISTS (SELECT 1 FROM example_db.access_log WHERE id=2)",
    "INSERT INTO example_db.access_log (id, path, method, duration_ms) SELECT 3,'/api/products/1','GET',600 WHERE NOT EXISTS (SELECT 1 FROM example_db.access_log WHERE id=3)",
    "INSERT INTO example_db.metrics (id, path, status, duration_ms, total_amount, row_count) SELECT 1,'/api/products','success',45,99.99,10 WHERE NOT EXISTS (SELECT 1 FROM example_db.metrics WHERE id=1)",
    "INSERT INTO example_db.metrics (id, path, status, duration_ms, total_amount, row_count) SELECT 2,'/api/orders','success',120,249.50,5 WHERE NOT EXISTS (SELECT 1 FROM example_db.metrics WHERE id=2)",
    "INSERT INTO example_db.accounts (id, name, balance) SELECT 1,'Alice',1000.00 WHERE NOT EXISTS (SELECT 1 FROM example_db.accounts WHERE id=1)",
    "INSERT INTO example_db.accounts (id, name, balance) SELECT 2,'Bob',500.00 WHERE NOT EXISTS (SELECT 1 FROM example_db.accounts WHERE id=2)",
    "INSERT INTO example_db.sample_users (id, username, email, is_active) SELECT 1,'alice','alice@example.com',TRUE WHERE NOT EXISTS (SELECT 1 FROM example_db.sample_users WHERE id=1)",
    "INSERT INTO example_db.sample_users (id, username, email, is_active) SELECT 2,'bob','bob@example.com',TRUE WHERE NOT EXISTS (SELECT 1 FROM example_db.sample_users WHERE id=2)",
    "INSERT INTO example_db.sample_users (id, username, email, is_active) SELECT 3,'charlie','charlie@example.com',FALSE WHERE NOT EXISTS (SELECT 1 FROM example_db.sample_users WHERE id=3)",
]


def _try_seed_starrocks(session: Session, user_id: uuid.UUID) -> None:
    """Try to connect to StarRocks and seed example data there too."""
    import time

    try:
        import pymysql
    except ImportError:
        logger.info("pymysql not installed — skipping StarRocks examples")
        return

    host = settings.STARROCKS_HOST
    port = settings.STARROCKS_PORT

    # Connect via the catalog information_schema (always exists)
    try:
        conn = pymysql.connect(
            host=host,
            port=port,
            user="root",
            database="default_catalog.information_schema",
            connect_timeout=5,
        )
    except Exception:
        logger.info("StarRocks not reachable at %s:%d — skipping", host, port)
        return

    # StarRocks may need time after container start to gain cluster capacity.
    # Retry DDL up to 3 times with a 15-second wait between attempts.
    max_attempts = 3
    for attempt in range(1, max_attempts + 1):
        try:
            with conn.cursor() as cur:
                # Create database first, then switch to it
                cur.execute("CREATE DATABASE IF NOT EXISTS example_db")
                cur.execute("USE example_db")
                # DDL — execute each statement separately (skip CREATE DATABASE / USE)
                for stmt in _SR_DDL_TEMPLATE.strip().split(";"):
                    stmt = stmt.strip()
                    if not stmt:
                        continue
                    upper = stmt.upper().lstrip()
                    if upper.startswith("CREATE DATABASE") or upper.startswith("USE "):
                        continue
                    cur.execute(stmt)
                # Seed data
                for stmt in _SR_SEED_STATEMENTS:
                    try:
                        cur.execute(stmt)
                    except Exception:
                        pass  # Ignore duplicate/conflict errors
            conn.commit()
            break  # Success
        except Exception as e:
            if attempt < max_attempts and "no available capacity" in str(e).lower():
                logger.info(
                    "StarRocks not ready (attempt %d/%d), waiting 15s...",
                    attempt,
                    max_attempts,
                )
                time.sleep(15)
            else:
                logger.warning("StarRocks DDL/seed failed: %s", e)
                conn.close()
                return
    conn.close()

    logger.info("Created StarRocks sample tables and data in example_db")

    # Create StarRocks datasource
    ds = _create_datasource(
        session,
        name="Examples StarRocks",
        product_type=ProductTypeEnum.MYSQL,
        host=host,
        port=port,
        database="example_db",
        username="root",
        password="",
        description="StarRocks example datasource (auto-seeded)",
        close_connection_after_execute=True,
    )

    # Create module
    mod = _create_module(session, SR_MODULE_NAME, "Auto-seeded StarRocks example APIs")

    # Create APIs (skip transfer — transactions not well-supported in StarRocks)
    api_defs = _api_defs("examples/sr", skip_transfer=True, dialect="sr")
    _create_apis(session, mod, ds, api_defs, user_id)
    _create_macros(session, mod, user_id)


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------


def seed_example_data(session: Session) -> None:
    """Seed example APIs, sample tables, and demo data.

    Idempotent: skips if the PostgreSQL examples module already exists.
    """
    if _already_seeded(session):
        logger.info("Example data already seeded — skipping")
        return

    logger.info("Seeding example data...")

    user = _get_superuser(session)

    # 1. Create sample tables and data in the app's own PostgreSQL
    _create_pg_tables(session)

    # 2. Create PostgreSQL datasource (points to the app's own DB)
    pg_ds = _create_datasource(
        session,
        name="Examples PostgreSQL",
        product_type=ProductTypeEnum.POSTGRES,
        host=settings.POSTGRES_SERVER,
        port=settings.POSTGRES_PORT,
        database=settings.POSTGRES_DB,
        username=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        description="App database used for example APIs (auto-seeded)",
    )

    # 3. Create PostgreSQL module
    pg_mod = _create_module(
        session, PG_MODULE_NAME, "Auto-seeded PostgreSQL example APIs"
    )

    # 4. Create all APIs
    pg_api_defs = _api_defs("examples/pg")
    created_apis = _create_apis(session, pg_mod, pg_ds, pg_api_defs, user.id)

    # 5. Create macros
    _create_macros(session, pg_mod, user.id)

    # 6. Create client + group for the private API
    private_api = created_apis.get("Private Orders")
    if private_api:
        _create_client_and_group(session, private_api)

    # 7. Try StarRocks (optional, auto-detected)
    # Use a savepoint so StarRocks failure doesn't roll back PG seed
    session.flush()
    nested = session.begin_nested()
    try:
        _try_seed_starrocks(session, user.id)
        nested.commit()
    except Exception as e:
        nested.rollback()
        logger.warning("StarRocks example seed failed (PG seed preserved): %s", e)

    # 8. Invalidate route cache so new APIs are immediately available
    invalidate_route_cache()

    logger.info("Example data seeded successfully")
