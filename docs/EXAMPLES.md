# Examples

Cookbook-style recipes for building APIs with pyDBAPI. Each example shows the SQL template or Python script content, the parameter definitions, and the expected request/response.

> For filter reference and gateway internals, see [TECHNICAL.md](./TECHNICAL.md).

---

## Table of Contents

1. [Basic CRUD (SQL)](#1-basic-crud-sql)
2. [Search and Filtering (SQL)](#2-search-and-filtering-sql)
3. [Comparison Filters](#3-comparison-filters)
4. [Multi-Statement SQL (Data + Count)](#4-multi-statement-sql-data--count)
5. [Dynamic Sorting (SQL)](#5-dynamic-sorting-sql)
6. [Macros](#6-macros)
7. [Script Engine Examples](#7-script-engine-examples)
8. [Result Transforms](#8-result-transforms)
9. [Private API with Client Auth](#9-private-api-with-client-auth)

---

## 1. Basic CRUD (SQL)

### 1.1 List with Pagination

**Path:** `products` | **Method:** GET

**Parameters:**

| Name   | Location | Type    | Required | Default |
|--------|----------|---------|----------|---------|
| limit  | query    | integer | no       | 20      |
| offset | query    | integer | no       | 0       |

**SQL content:**

```sql
SELECT id, name, price, created_at
FROM products
ORDER BY id DESC
LIMIT {{ limit | sql_int }}
OFFSET {{ offset | sql_int }};
```

**Request:**

```bash
curl "http://localhost/api/products?limit=10&offset=0"
```

**Response:**

```json
{"success": true, "message": null, "data": [{"id": 42, "name": "Widget", "price": 9.99, "created_at": "2025-12-01T10:00:00"}]}
```

### 1.2 Get by ID

**Path:** `products/{id}` | **Method:** GET

**Parameters:**

| Name | Location | Type    | Required |
|------|----------|---------|----------|
| id   | path     | integer | yes      |

**SQL content:**

```sql
SELECT id, name, price, description, created_at
FROM products
WHERE id = {{ id | sql_int }};
```

### 1.3 Create

**Path:** `products` | **Method:** POST

**Parameters:**

| Name        | Location | Type   | Required |
|-------------|----------|--------|----------|
| name        | body     | string | yes      |
| price       | body     | number | yes      |
| description | body     | string | no       |

**SQL content:**

```sql
INSERT INTO products (name, price, description)
VALUES ({{ name | sql_string }}, {{ price | sql_float }}, {{ description | sql_string }})
RETURNING id, name, price;
```

**Request:**

```bash
curl -X POST http://localhost/api/products \
  -H "Content-Type: application/json" \
  -d '{"name": "Gadget", "price": 19.99, "description": "A useful gadget"}'
```

### 1.4 Update with Conditional SET

**Path:** `products/{id}` | **Method:** PUT

**Parameters:**

| Name        | Location | Type    | Required |
|-------------|----------|---------|----------|
| id          | path     | integer | yes      |
| name        | body     | string  | no       |
| price       | body     | number  | no       |
| description | body     | string  | no       |

**SQL content:**

```sql
UPDATE products
SET
  {% if name %}name = {{ name | sql_string }},{% endif %}
  {% if price %}price = {{ price | sql_float }},{% endif %}
  {% if description %}description = {{ description | sql_string }},{% endif %}
  updated_at = NOW()
WHERE id = {{ id | sql_int }}
RETURNING id, name, price;
```

> **Tip:** The trailing comma after each conditional SET field is safe in PostgreSQL when followed by another SET expression (here `updated_at`). For MySQL, you may need to structure the template differently.

### 1.5 Delete

**Path:** `products/{id}` | **Method:** DELETE

**Parameters:**

| Name | Location | Type    | Required |
|------|----------|---------|----------|
| id   | path     | integer | yes      |

**SQL content:**

```sql
DELETE FROM products
WHERE id = {{ id | sql_int }};
```

**Response (DML result):**

```json
{"success": true, "message": null, "data": 1}
```

The `data` field contains the affected row count for INSERT/UPDATE/DELETE.

---

## 2. Search and Filtering (SQL)

### 2.1 Text Search (Prefix Match)

**Path:** `products/search` | **Method:** GET

**Parameters:**

| Name | Location | Type   | Required |
|------|----------|--------|----------|
| q    | query    | string | no       |

**SQL content:**

```sql
SELECT id, name, price
FROM products
{% where %}
  {% if q %}AND name ILIKE {{ q | sql_like_start }}{% endif %}
{% endwhere %}
ORDER BY name
LIMIT 50;
```

`sql_like_start` escapes special LIKE characters and appends `%`, producing `'widget%'`. Use `sql_like_end` for suffix match (`'%widget'`).

**Request:**

```bash
curl "http://localhost/api/products/search?q=wid"
```

### 2.2 IN Clause with Array Parameter

**Path:** `orders/by-status` | **Method:** GET

**Parameters:**

| Name       | Location | Type  | Required |
|------------|----------|-------|----------|
| status_ids | query    | array | yes      |

**SQL content:**

```sql
SELECT id, customer_id, status, total
FROM orders
WHERE status IN {{ status_ids | in_list }}
ORDER BY id DESC;
```

`in_list` converts `[1, 2, 3]` to `(1, 2, 3)`. An empty array produces `(SELECT 1 WHERE 1=0)` (matches nothing).

**Request:**

```bash
curl "http://localhost/api/orders/by-status?status_ids=1,2,3"
```

### 2.3 Date Range

**Path:** `orders` | **Method:** GET

**Parameters:**

| Name       | Location | Type   | Required |
|------------|----------|--------|----------|
| date_from  | query    | string | no       |
| date_to    | query    | string | no       |

**SQL content:**

```sql
SELECT id, customer_id, total, created_at
FROM orders
{% where %}
  {% if date_from %}AND created_at >= {{ date_from | sql_date }}{% endif %}
  {% if date_to %}AND created_at <= {{ date_to | sql_date }}{% endif %}
{% endwhere %}
ORDER BY created_at DESC
LIMIT 100;
```

`sql_date` validates and formats as `'YYYY-MM-DD'`.

**Request:**

```bash
curl "http://localhost/api/orders?date_from=2025-01-01&date_to=2025-12-31"
```

### 2.4 Combined Filters with `{% where %}`

**Path:** `products/filter` | **Method:** GET

**Parameters:**

| Name     | Location | Type    | Required | Default |
|----------|----------|---------|----------|---------|
| q        | query    | string  | no       |         |
| min_price| query    | number  | no       |         |
| category | query    | string  | no       |         |
| active   | query    | boolean | no       |         |
| limit    | query    | integer | no       | 20      |

**SQL content:**

```sql
SELECT id, name, price, category, active
FROM products
{% where %}
  {% if q %}AND name ILIKE {{ q | sql_like_start }}{% endif %}
  {% if min_price %}AND price >= {{ min_price | sql_float }}{% endif %}
  {% if category %}AND category = {{ category | sql_string }}{% endif %}
  {% if active is not none %}AND active = {{ active | sql_bool }}{% endif %}
{% endwhere %}
ORDER BY name
LIMIT {{ limit | sql_int }};
```

The `{% where %}` tag only emits a `WHERE` clause if at least one inner condition is present, and automatically strips the leading `AND`/`OR` from the first active condition.

---

## 3. Comparison Filters

The `compare` filter converts structured JSON comparison objects into safe SQL expressions. Useful for dashboards and data tables where users pick an operator and value.

### 3.1 Single Field

**Path:** `requests/slow` | **Method:** GET

**Parameters:**

| Name        | Location | Type   | Required |
|-------------|----------|--------|----------|
| duration_ms | query    | object | no       |

**SQL content:**

```sql
SELECT id, path, method, duration_ms, created_at
FROM access_log
{% where %}
  {% if duration_ms %}AND duration_ms {{ duration_ms | compare }}{% endif %}
{% endwhere %}
ORDER BY duration_ms DESC
LIMIT 100;
```

**Request examples:**

```bash
# Greater than 500ms
curl 'http://localhost/api/requests/slow?duration_ms={"combinator":">","values":"500"}'

# Between 100ms and 1000ms
curl 'http://localhost/api/requests/slow?duration_ms={"combinator":"between","values":"100,1000"}'
```

**Rendered SQL (for `> 500`):**

```sql
SELECT id, path, method, duration_ms, created_at
FROM access_log
WHERE duration_ms > 500.0
ORDER BY duration_ms DESC
LIMIT 100;
```

### 3.2 Multiple Fields with Loop

When many columns support comparison filters, use `sql_ident` + `compare` in a `{% for %}` loop to avoid repetition.

**Path:** `metrics` | **Method:** GET

**Parameters:**

| Name         | Location | Type   | Required |
|--------------|----------|--------|----------|
| status       | query    | string | no       |
| duration_ms  | query    | object | no       |
| total_amount | query    | object | no       |
| row_count    | query    | object | no       |

**SQL content:**

```sql
{% set compare_fields = [
  ("duration_ms", duration_ms),
  ("total_amount", total_amount),
  ("row_count", row_count)
] %}

SELECT id, path, status, duration_ms, total_amount, row_count
FROM metrics
{% where %}
  {% if status %}AND status = {{ status | sql_string }}{% endif %}
  {% for col, val in compare_fields %}
    {% if val %}AND {{ col | sql_ident }} {{ val | compare }}{% endif %}
  {% endfor %}
{% endwhere %}
ORDER BY created_at DESC
LIMIT 100;
```

**Request:**

```bash
curl 'http://localhost/api/metrics?status=success&duration_ms={"combinator":"<=","values":"200"}&row_count={"combinator":">=","values":"10"}'
```

### 3.3 OR Operation — Match Any Condition

Use `{% where operation="OR" %}` to join conditions with `OR` instead of `AND`. Useful for "match any" filters where a row should appear if it satisfies at least one criterion.

**Path:** `metrics/any` | **Method:** GET

**Parameters:**

| Name         | Location | Type   | Required |
|--------------|----------|--------|----------|
| status       | query    | string | no       |
| duration_ms  | query    | object | no       |
| total_amount | query    | object | no       |
| row_count    | query    | object | no       |
| operation    | query    | string | no       |

**SQL content:**

```sql
{% set compare_fields = [
  ("duration_ms", duration_ms),
  ("total_amount", total_amount),
  ("row_count", row_count)
] %}

SELECT id, path, status, duration_ms, total_amount, row_count
FROM metrics
{% where operation=operation %}
  {% if status %}AND status = {{ status | sql_string }}{% endif %}
  {% for col, val in compare_fields %}
    {% if val %}AND {{ col | sql_ident }} {{ val | compare }}{% endif %}
  {% endfor %}
{% endwhere %}
ORDER BY created_at DESC
LIMIT 100;
```

Write conditions with `AND` prefix as usual — when `operation="OR"`, the tag automatically replaces `AND` connectors with `OR`.

**Request (OR — match any):**

```bash
curl 'http://localhost/api/metrics/any?operation=OR&status=error&duration_ms={"combinator":">","values":"500"}'
```

**Rendered SQL:**

```sql
SELECT id, path, status, duration_ms, total_amount, row_count
FROM metrics
WHERE status = 'error'
  OR duration_ms > 500.0
ORDER BY created_at DESC
LIMIT 100;
```

**Request (AND — match all, default):**

```bash
curl 'http://localhost/api/metrics/any?operation=AND&status=success&duration_ms={"combinator":"<=","values":"200"}'
```

> **Tip:** The `operation` parameter can be hardcoded (`{% where operation="OR" %}`) or dynamic (`{% where operation=operation %}`). When dynamic, pass it as a request parameter; omitting it defaults to `AND`.

### 3.4 Python Script Equivalent

The same comparison logic in a Script engine API using parameterized queries.

**Path:** `metrics/script` | **Method:** GET | **Engine:** Script

**Parameters:**

| Name         | Location | Type   | Required |
|--------------|----------|--------|----------|
| status       | query    | string | no       |
| duration_ms  | query    | object | no       |
| total_amount | query    | object | no       |

**Script content:**

```python
ALLOWED_OPS = {">", ">=", "<", "<=", "=", "!="}

def parse_compare(raw):
    """Parse a comparison object and return (sql_fragment, values) or None."""
    if not raw:
        return None
    obj = raw if isinstance(raw, dict) else json.loads(raw)
    combinator = obj.get("combinator", "").strip()
    raw_val = str(obj.get("values", obj.get("value", ""))).strip()

    if combinator.lower() == "between":
        parts = raw_val.split(",")
        if len(parts) != 2:
            return None
        lo, hi = float(parts[0]), float(parts[1])
        return "BETWEEN %s AND %s", [lo, hi]

    if combinator in ALLOWED_OPS:
        return f"{combinator} %s", [float(raw_val)]

    return None


def execute(params=None):
    conditions = []
    values = []

    if params.get("status"):
        conditions.append("status = %s")
        values.append(params["status"])

    for col in ["duration_ms", "total_amount"]:
        parsed = parse_compare(params.get(col))
        if parsed:
            fragment, vals = parsed
            conditions.append(f"{col} {fragment}")
            values.extend(vals)

    where = ""
    if conditions:
        where = "WHERE " + " AND ".join(conditions)

    sql = f"SELECT id, path, status, duration_ms, total_amount FROM metrics {where} ORDER BY created_at DESC LIMIT 100"
    rows = db.query(sql, values)
    return {"success": True, "data": rows}
```

> **Note:** Column names are hardcoded strings — never interpolate user input into column positions. Use `%s` placeholders for values passed to `db.query`.

---

## 4. Multi-Statement SQL (Data + Count)

Separate SQL statements with `;` to get both paginated rows and total count in one request.

**Path:** `items` | **Method:** GET

**Parameters:**

| Name   | Location | Type    | Required | Default |
|--------|----------|---------|----------|---------|
| q      | query    | string  | no       |         |
| limit  | query    | integer | no       | 20      |
| offset | query    | integer | no       | 0       |

**SQL content:**

```sql
-- Statement 1: paginated data
SELECT id, name, price, category
FROM items
{% where %}
  {% if q %}AND name ILIKE {{ q | sql_like_start }}{% endif %}
{% endwhere %}
ORDER BY id DESC
LIMIT {{ limit | sql_int }}
OFFSET {{ offset | sql_int }};

-- Statement 2: total count
SELECT COUNT(*) AS total
FROM items
{% where %}
  {% if q %}AND name ILIKE {{ q | sql_like_start }}{% endif %}
{% endwhere %};
```

**Raw response (without transform):**

```json
{"success": true, "data": [[{"id": 1, "name": "Widget"}], [{"total": 42}]]}
```

**Result transform** to flatten this into `{data, total, limit, offset}`:

```python
rows = result[0] if len(result) > 0 else []
count_row = result[1][0] if len(result) > 1 and result[1] else {}

result = {
    "data": rows,
    "total": count_row.get("total", 0),
    "limit": params.get("limit", 20),
    "offset": params.get("offset", 0),
}
```

**Final response:**

```json
{"success": true, "data": [{"id": 1, "name": "Widget"}], "total": 42, "limit": 20, "offset": 0}
```

---

## 5. Dynamic Sorting (SQL)

**Path:** `products/sorted` | **Method:** GET

**Parameters:**

| Name      | Location | Type    | Required | Default |
|-----------|----------|---------|----------|---------|
| sort_by   | query    | string  | no       | id      |
| sort_dir  | query    | string  | no       | desc    |
| limit     | query    | integer | no       | 20      |

**SQL content:**

```sql
{% set dir = "ASC" if sort_dir == "asc" else "DESC" %}

SELECT id, name, price, created_at
FROM products
ORDER BY {{ sort_by | sql_ident }} {{ dir }}
LIMIT {{ limit | sql_int }};
```

`sql_ident` only allows safe identifier characters (`[A-Za-z_][A-Za-z0-9_.]*`). Invalid input produces an empty string. The `sort_dir` is guarded by a hardcoded `if/else` — never pass raw user input as ASC/DESC.

**Request:**

```bash
curl "http://localhost/api/products/sorted?sort_by=price&sort_dir=asc&limit=10"
```

---

## 6. Macros

Macros are reusable snippets defined at the module level. SQL macros are prepended to SQL content; Python macros are prepended to script content.

### 6.1 SQL Macro — Reusable Pagination

**Macro name:** `pagination` | **Type:** Jinja2

**Macro content:**

```sql
{% macro paginate(limit_param, offset_param, default_limit=20) %}
LIMIT {{ limit_param | sql_int if limit_param else default_limit }}
OFFSET {{ offset_param | sql_int if offset_param else 0 }}
{% endmacro %}
```

**Using the macro in an API:**

```sql
SELECT id, name, price
FROM products
{% where %}
  {% if q %}AND name ILIKE {{ q | sql_like_start }}{% endif %}
{% endwhere %}
ORDER BY id DESC
{{ paginate(limit, offset) }};
```

### 6.2 Python Macro — Shared Helper

**Macro name:** `response_helpers` | **Type:** Python

**Macro content:**

```python
def success_response(data, total=None, **extra):
    resp = {"success": True, "data": data}
    if total is not None:
        resp["total"] = total
    resp.update(extra)
    return resp

def error_response(message):
    return {"success": False, "message": message, "data": []}
```

**Using the macro in a script API:**

```python
def execute(params=None):
    rows = db.query("SELECT id, name FROM products LIMIT 50")
    return success_response(rows, total=len(rows))
```

---

## 7. Script Engine Examples

All script examples use the **Script** engine type. Available context objects: `db`, `http`, `cache`, `req`, `tx`, `ds`, `env`, `log`.

### 7.1 Basic Database Query

**Path:** `users/active` | **Method:** GET

```python
def execute(params=None):
    rows = db.query(
        "SELECT id, username, email FROM users WHERE is_active = %s ORDER BY username",
        [True]
    )
    return {"success": True, "data": rows}
```

**`db.query`** returns `list[dict]`. **`db.query_one`** returns a single `dict` or `None`:

```python
def execute(params=None):
    user = db.query_one(
        "SELECT id, username, email FROM users WHERE id = %s",
        [params.get("id")]
    )
    if not user:
        return {"success": False, "message": "User not found", "data": []}
    return {"success": True, "data": user}
```

### 7.2 Outbound HTTP Call

**Path:** `weather` | **Method:** GET

**Parameters:**

| Name | Location | Type   | Required |
|------|----------|--------|----------|
| city | query    | string | yes      |

```python
def execute(params=None):
    city = params["city"]
    api_key = env.get("WEATHER_API_KEY")

    data = http.get(
        "https://api.weatherapi.com/v1/current.json",
        params={"key": api_key, "q": city}
    )

    return {"success": True, "data": data}
```

`http.get/post/put/delete` accept `params`, `headers`, `cookies`, `json`, `data`, and `content` kwargs. JSON responses are auto-parsed. Outbound hosts must be listed in `SCRIPT_HTTP_ALLOWED_HOSTS`.

### 7.3 Redis Caching

**Path:** `products/cached` | **Method:** GET

```python
def execute(params=None):
    cache_key = "all_products"
    cached = cache.get(cache_key)

    if cached:
        log.debug("Cache hit for products")
        return {"success": True, "data": json.loads(cached)}

    rows = db.query("SELECT id, name, price FROM products ORDER BY name LIMIT 100")
    cache.set(cache_key, json.dumps(rows), ttl_seconds=300)
    log.info("Cached products list", {"count": len(rows)})

    return {"success": True, "data": rows}
```

**Cache methods:**

| Method                               | Returns      |
|--------------------------------------|--------------|
| `cache.get(key)`                     | `str \| None`|
| `cache.set(key, value, ttl_seconds)` | `None`       |
| `cache.delete(key)`                  | `None`       |
| `cache.exists(key)`                  | `bool`       |
| `cache.incr(key, amount=1)`          | `int`        |
| `cache.decr(key, amount=1)`          | `int`        |

Keys are auto-prefixed with `script:`.

### 7.4 Explicit Transactions

**Path:** `transfer` | **Method:** POST

**Parameters:**

| Name      | Location | Type    | Required |
|-----------|----------|---------|----------|
| from_id   | body     | integer | yes      |
| to_id     | body     | integer | yes      |
| amount    | body     | number  | yes      |

```python
def execute(params=None):
    from_id = params["from_id"]
    to_id = params["to_id"]
    amount = params["amount"]

    tx.begin()

    sender = db.query_one(
        "SELECT id, balance FROM accounts WHERE id = %s FOR UPDATE", [from_id]
    )
    if not sender or sender["balance"] < amount:
        tx.rollback()
        return {"success": False, "message": "Insufficient balance", "data": []}

    db.execute(
        "UPDATE accounts SET balance = balance - %s WHERE id = %s", [amount, from_id]
    )
    db.execute(
        "UPDATE accounts SET balance = balance + %s WHERE id = %s", [amount, to_id]
    )

    tx.commit()

    return {"success": True, "message": "Transfer complete", "data": {"from": from_id, "to": to_id, "amount": amount}}
```

Within `tx.begin()` ... `tx.commit()`, all `db` calls share a single connection. If the script ends without calling `commit()` or `rollback()`, the transaction is automatically rolled back.

---

## 8. Result Transforms

Result transforms are Python scripts (RestrictedPython) that run after the engine returns data. They receive `result` (the raw engine output) and `params` (request parameters), and must assign to `result`.

### 8.1 Reshape Multi-Statement Result

See [Section 4](#4-multi-statement-sql-data--count) for the full example. The transform receives the nested array `[[rows], [{total}]]` and flattens it.

### 8.2 Add Computed Fields

```python
for row in result:
    row["display_name"] = f"{row.get('first_name', '')} {row.get('last_name', '')}".strip()
    row["price_with_tax"] = round(row.get("price", 0) * 1.1, 2)

result = result
```

### 8.3 Strip Sensitive Fields

```python
STRIP_FIELDS = {"password_hash", "secret_key", "internal_notes"}

for row in result:
    for field in STRIP_FIELDS:
        row.pop(field, None)

result = result
```

---

## 9. Private API with Client Auth

End-to-end workflow for creating a private API accessible only to authorized clients.

### Step 1 — Create the API

Create an API assignment with **Access type** set to **Private**. For example, path `orders/private`, method GET.

### Step 2 — Create a Client

In **System > Clients**, create a new client:

- **Client ID:** `mobile-app`
- **Client Secret:** `s3cret!`
- **Rate limit:** 100 req/min
- **Max concurrent:** 5

### Step 3 — Grant Access

Either:
- **Direct link:** Link the client to the API assignment directly, or
- **Group-based:** Add both the client and the API to the same group.

### Step 4 — Generate a Token

```bash
curl -X POST http://localhost/api/token/generate \
  -H "Content-Type: application/json" \
  -d '{"client_id": "mobile-app", "client_secret": "s3cret!"}'
```

**Response:**

```json
{"access_token": "eyJhbGciOiJIUzI1NiIs...", "token_type": "bearer"}
```

### Step 5 — Call the Private API

```bash
curl -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \
  "http://localhost/api/orders/private?limit=10"
```

Without a valid token, the gateway returns `401 Unauthorized`. Without access to the specific API, it returns `403 Forbidden`.

---

## See Also

- [OVERVIEW.md](./OVERVIEW.md) — End-to-end flow, features, and concepts
- [TECHNICAL.md](./TECHNICAL.md) — Gateway internals, filters, engines, parameters
- [ENV_REFERENCE.md](./ENV_REFERENCE.md) — Environment variable reference
