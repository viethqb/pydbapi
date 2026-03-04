# Seed Example Data

pyDBAPI can automatically seed sample tables, demo data, and ~19 ready-to-use API endpoints on startup. This is useful for evaluating the platform, onboarding new developers, or running demos without manual setup.

---

## Quick Start

1. Set `SEED_EXAMPLE_DATA=true` in your `.env` file (project root).

2. Start the stack:

```bash
docker compose up -d
```

3. Open `http://localhost` and log in. You will see two new modules in **API Dev**:

   - **Examples (PostgreSQL)** — 19 APIs backed by the app's own PostgreSQL
   - **Examples (StarRocks)** — 18 APIs (auto-created only if StarRocks is running)

4. Try an API immediately:

```bash
curl "http://localhost/api/examples/pg/products?limit=5"
```

> **Idempotent:** The seed runs once. On subsequent restarts it detects the existing module and skips. To re-seed, delete the "Examples (PostgreSQL)" module from the UI (or drop the database volume).

---

## What Gets Created

### Sample Tables

Seven tables are created in the app's PostgreSQL database (and optionally mirrored in StarRocks):

| Table | Description | Sample Rows |
|-------|-------------|-------------|
| `products` | Product catalog with name, price, category, active flag | 8 |
| `orders` | Customer orders with status and total | 5 |
| `items` | Small parts inventory | 6 |
| `access_log` | Simulated request log with path and duration | 5 |
| `metrics` | Aggregated metrics with duration, amount, row count | 5 |
| `accounts` | Bank accounts for the transfer demo (Alice, Bob) | 2 |
| `sample_users` | Users for the script engine demo | 4 |

### API Endpoints

All endpoints are published and immediately live on the gateway.

| # | Name | Path | Method | Engine | Description |
|---|------|------|--------|--------|-------------|
| 1.1 | List Products | `examples/pg/products` | GET | SQL | Paginated product list |
| 1.2 | Get Product | `examples/pg/products/{id}` | GET | SQL | Single product by ID |
| 1.3 | Create Product | `examples/pg/products` | POST | SQL | Insert a product |
| 1.4 | Update Product | `examples/pg/products/{id}` | PUT | SQL | Partial update with conditional SET |
| 1.5 | Delete Product | `examples/pg/products/{id}` | DELETE | SQL | Delete by ID |
| 2.1 | Search Products | `examples/pg/products/search` | GET | SQL | Prefix search with ILIKE |
| 2.2 | Orders by Status | `examples/pg/orders/by-status` | GET | SQL | IN clause with array parameter |
| 2.3 | Orders Date Range | `examples/pg/orders` | GET | SQL | Date range filter |
| 2.4 | Filter Products | `examples/pg/products/filter` | GET | SQL | Combined filters with `{% where %}` |
| 3.1 | Slow Requests | `examples/pg/requests/slow` | GET | SQL | Compare filter on duration |
| 3.2 | Metrics Multi-Compare | `examples/pg/metrics` | GET | SQL | Loop-based compare on multiple columns |
| 3.3 | Metrics Script | `examples/pg/metrics/script` | GET | Script | Same compare logic in Python |
| 4 | Items with Count | `examples/pg/items` | GET | SQL | Multi-statement (data + count) with result transform |
| 5 | Sorted Products | `examples/pg/products/sorted` | GET | SQL | Dynamic ORDER BY with `sql_ident` |
| 7.1 | Active Users | `examples/pg/users/active` | GET | Script | Basic `db.query` usage |
| 7.2 | Weather API | `examples/pg/weather` | GET | Script | Mock outbound HTTP (demonstrates `http` context) |
| 7.3 | Cached Products | `examples/pg/products/cached` | GET | Script | Redis caching with `cache.get/set` |
| 7.4 | Transfer | `examples/pg/transfer` | POST | Script | Explicit transaction with `tx.begin/commit` |
| 9 | Private Orders | `examples/pg/orders/private` | GET | SQL | Private API requiring client auth |

StarRocks APIs use the same definitions under `examples/sr/` (18 endpoints — Transfer is skipped because StarRocks does not support multi-statement transactions).

### Macros

Two macros are created in each module:

| Name | Type | Description |
|------|------|-------------|
| `pagination` | Jinja2 | Reusable `LIMIT/OFFSET` macro |
| `response_helpers` | Python | `success_response()` and `error_response()` helpers |

### Client and Group

A sample client and group are created for the private API example:

- **Client:** `mobile-app` (secret: `s3cret!`)
- **Group:** `Example Group` (linked to the `orders/private` API)

---

## Testing Every API

All parameters have default values pre-filled, so you can test from the UI debug panel with a single click. Below are curl commands for quick verification.

### CRUD (Section 1)

```bash
# 1.1 List Products
curl "http://localhost/api/examples/pg/products?limit=5"

# 1.2 Get Product by ID
curl "http://localhost/api/examples/pg/products/1"

# 1.3 Create Product
curl -X POST http://localhost/api/examples/pg/products \
  -H "Content-Type: application/json" \
  -d '{"name": "New Gadget", "price": 19.99, "description": "A shiny gadget"}'

# 1.4 Update Product (partial — only price)
curl -X PUT http://localhost/api/examples/pg/products/1 \
  -H "Content-Type: application/json" \
  -d '{"price": 29.99}'

# 1.5 Delete Product
curl -X DELETE "http://localhost/api/examples/pg/products/999"
```

### Search and Filtering (Section 2)

```bash
# 2.1 Search by name prefix
curl "http://localhost/api/examples/pg/products/search?q=widget"

# 2.2 Orders by status (IN clause)
curl "http://localhost/api/examples/pg/orders/by-status?status_ids=1,2"

# 2.3 Orders in date range
curl "http://localhost/api/examples/pg/orders?start_date=2025-01-01&end_date=2025-12-31"

# 2.4 Combined filters
curl "http://localhost/api/examples/pg/products/filter?min_price=10&category=Tools"
```

### Comparison Filters (Section 3)

```bash
# 3.1 Slow requests (duration > 100ms)
curl 'http://localhost/api/examples/pg/requests/slow?duration_ms={"combinator":">","value":"100"}'

# 3.2 Metrics with status filter
curl "http://localhost/api/examples/pg/metrics?status=success"

# 3.3 Same logic via Script engine
curl "http://localhost/api/examples/pg/metrics/script?status=success"
```

### Multi-Statement + Transform (Section 4)

```bash
# Returns {data: [...], total: N, limit: 20, offset: 0}
curl "http://localhost/api/examples/pg/items?limit=5"
```

### Dynamic Sorting (Section 5)

```bash
curl "http://localhost/api/examples/pg/products/sorted?sort_by=price&sort_dir=desc&limit=5"
```

### Script Engine (Section 7)

```bash
# 7.1 Active users from database
curl "http://localhost/api/examples/pg/users/active"

# 7.2 Weather mock
curl "http://localhost/api/examples/pg/weather?city=London"

# 7.3 Cached products (uses Redis)
curl "http://localhost/api/examples/pg/products/cached"

# 7.4 Transfer between accounts
curl -X POST http://localhost/api/examples/pg/transfer \
  -H "Content-Type: application/json" \
  -d '{"from_id": 1, "to_id": 2, "amount": 10.00}'
```

### Private API (Section 9)

```bash
# Without token — returns 401
curl "http://localhost/api/examples/pg/orders/private?limit=5"

# Generate a token
TOKEN=$(curl -s -X POST http://localhost/api/token/generate \
  -H "Content-Type: application/json" \
  -d '{"client_id": "mobile-app", "client_secret": "s3cret!"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# Call with token
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost/api/examples/pg/orders/private?limit=5"
```

---

## StarRocks Support

If StarRocks is running (via the `starrocks` Docker Compose profile), the seed automatically:

1. Connects to StarRocks at `STARROCKS_HOST:STARROCKS_PORT` (default: `starrocks:9030`)
2. Creates an `example_db` database with the same table schemas
3. Seeds the same demo data
4. Creates a second module **"Examples (StarRocks)"** with 18 APIs under `examples/sr/`

### Starting with StarRocks

```bash
docker compose --profile starrocks up -d
# or for all optional services:
docker compose --profile full up -d
```

### StarRocks SQL Differences

The seed automatically adapts SQL for StarRocks compatibility:

| Feature | PostgreSQL | StarRocks |
|---------|-----------|-----------|
| Text search | `ILIKE` | `LOWER(col) LIKE CONCAT(LOWER(...), '%')` |
| Insert return | `RETURNING id, ...` | Plain `INSERT` (returns row count) |
| Create product | Auto-increment `id` | Requires explicit `id` parameter |
| Table engine | Standard | `PRIMARY KEY` for products/accounts (supports UPDATE/DELETE), `DUPLICATE KEY` for others |
| Transactions | Full support (Transfer API) | Skipped (not well-supported in OLAP) |

### Testing StarRocks APIs

```bash
curl "http://localhost/api/examples/sr/products?limit=5"
curl "http://localhost/api/examples/sr/products/search?q=widget"
curl "http://localhost/api/examples/sr/orders/by-status?status_ids=1,2"
```

---

## Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `SEED_EXAMPLE_DATA` | bool | `false` | Enable seed on startup |
| `STARROCKS_HOST` | string | `starrocks` | StarRocks hostname for auto-detection |
| `STARROCKS_PORT` | int | `9030` | StarRocks MySQL-protocol port |

See [ENV_REFERENCE.md](./ENV_REFERENCE.md) for the full variable list.

---

## Creating Your Own APIs (Step-by-Step)

This section walks through creating a sample API from scratch using the UI, following the same patterns as the seeded examples.

### Step 1: Create a Data Source

1. Go to **Connection** (Data Sources) in the sidebar.
2. Click **Add Data Source**.
3. Fill in the connection details:
   - **Name:** `My PostgreSQL`
   - **Type:** PostgreSQL
   - **Host:** `db` (inside Docker) or `localhost` (local dev)
   - **Port:** `5432`
   - **Database:** `app`
   - **Username:** `postgres`
   - **Password:** your `POSTGRES_PASSWORD`
4. Click **Test Connection** to verify, then **Save**.

### Step 2: Create a Module

1. Go to **API Dev** in the sidebar.
2. Click **Add Module**.
3. Name it `My First Module` and save.

### Step 3: Create a SQL API

1. Inside the module, click **Add API**.
2. Configure the basics:
   - **Name:** `List Users`
   - **Path:** `my/users`
   - **Method:** GET
   - **Engine:** SQL
   - **Data Source:** select `My PostgreSQL`
   - **Access Type:** Public
3. Add parameters:

   | Name | Location | Type | Default | Description |
   |------|----------|------|---------|-------------|
   | `limit` | query | integer | `20` | Max rows |
   | `offset` | query | integer | `0` | Skip rows |
   | `q` | query | string | | Search by username |

4. Write the SQL content:

```sql
SELECT id, username, email, is_active
FROM sample_users
{% where %}
  {% if q %}AND username ILIKE {{ q | sql_like_start }}{% endif %}
{% endwhere %}
ORDER BY id
LIMIT {{ (limit | default(20)) | sql_int }}
OFFSET {{ (offset | default(0)) | sql_int }};
```

5. Click **Debug** to test — parameters are pre-filled from defaults.
6. Click **Commit** to save a version, then **Publish** to go live.
7. Call it:

```bash
curl "http://localhost/api/my/users?q=alice&limit=10"
```

### Step 4: Create a Script API

1. Add another API in the same module:
   - **Name:** `User Stats`
   - **Path:** `my/users/stats`
   - **Method:** GET
   - **Engine:** Script
   - **Data Source:** select `My PostgreSQL`

2. Write the script content:

```python
def execute(params=None):
    total = db.query_one("SELECT COUNT(*) AS count FROM sample_users")
    active = db.query_one(
        "SELECT COUNT(*) AS count FROM sample_users WHERE is_active = %s",
        [True]
    )
    return {
        "success": True,
        "data": {
            "total_users": total["count"],
            "active_users": active["count"],
        }
    }
```

3. Debug, commit, publish. Call it:

```bash
curl "http://localhost/api/my/users/stats"
```

**Response:**

```json
{
  "success": true,
  "message": null,
  "data": [{"success": true, "data": {"total_users": 4, "active_users": 3}}]
}
```

### Step 5: Add a Result Transform

Result transforms reshape the engine output before it reaches the client.

1. Edit the `User Stats` API.
2. In the **Result Transform** section, add:

```python
def transform(result, params=None):
    data = result["data"] if isinstance(result, dict) else result
    inner = data[0] if isinstance(data, list) and data else data
    return inner.get("data", inner) if isinstance(inner, dict) else inner
```

Now the response is cleaner:

```json
{
  "success": true,
  "message": null,
  "data": {"total_users": 4, "active_users": 3}
}
```

### Step 6: Make It Private

1. Create a **Client** in **System > Clients**:
   - **Client ID:** `my-app`
   - **Client Secret:** `my-secret`
2. Create a **Group** in **Security > Groups**:
   - **Name:** `My Group`
3. Add the client and the API to the group.
4. Change the API's **Access Type** to **Private**.
5. Generate a token and call:

```bash
# Get token
curl -X POST http://localhost/api/token/generate \
  -H "Content-Type: application/json" \
  -d '{"client_id": "my-app", "client_secret": "my-secret"}'

# Call private API
curl -H "Authorization: Bearer <token>" \
  "http://localhost/api/my/users/stats"
```

---

## Troubleshooting

### Seed didn't run

- Check that `SEED_EXAMPLE_DATA=true` is set in `.env`.
- The `prestart` container must have the variable. Check with:

```bash
docker logs prestart 2>&1 | grep -i seed
```

Expected: `Seeding example data...` followed by `Example data seeded successfully`.

### StarRocks seed failed

StarRocks needs time to initialize cluster capacity after container start. The seed retries up to 3 times (15 seconds apart). Check logs:

```bash
docker logs prestart 2>&1 | grep -i starrocks
```

If it says `Cluster has no available capacity` on all 3 attempts, restart prestart after StarRocks is healthy:

```bash
# Wait for StarRocks health check to pass
docker compose --profile starrocks restart prestart
```

### Want to re-seed from scratch

Delete the database volume and restart:

```bash
docker compose --profile full down
docker volume rm pydbapi_app-db-data
docker compose --profile full up -d
```

### APIs return empty results

- Verify sample data exists: open the data source in the UI and run `SELECT * FROM products LIMIT 5` in the debug panel.
- For StarRocks, check that `example_db` has tables: `SHOW TABLES FROM example_db`.

---

## See Also

- [EXAMPLES.md](./EXAMPLES.md) — Detailed cookbook for each API pattern (filters, macros, scripts, transforms)
- [OVERVIEW.md](./OVERVIEW.md) — End-to-end flow and feature overview
- [TECHNICAL.md](./TECHNICAL.md) — Gateway internals, SQL filters, script engine context
- [ENV_REFERENCE.md](./ENV_REFERENCE.md) — All environment variables
