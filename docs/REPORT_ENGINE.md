# Report Engine

## Overview

The pyDBAPI Report Engine generates Excel (`.xlsx`) reports by combining SQL query results with Excel template files stored in MinIO. Reports are defined through a three-level hierarchy:

```text
Report Module
  └── Report Template
        └── Sheet Mapping (1..N per template)
```

**Report Module** pairs a MinIO datasource (for template/output storage) with a SQL datasource (for query execution), along with default bucket names.

**Report Template** defines which template file to use (or none for blank workbooks), output location, and optional formula recalculation and sheet extraction settings.

**Sheet Mapping** defines a single data injection point: which sheet, which cell, what SQL to run, and how to write the results (rows or single value).

### Key Features

- Template-based and blank-workbook report generation
- Multiple sheet mappings per template (different sheets or same sheet)
- Two write modes: `rows` (tabular data) and `single` (scalar values)
- Jinja2-powered SQL with parameter injection and custom filters
- Formula recalculation via LibreOffice headless
- Output sheet extraction (values + styles only, no formulas)
- Synchronous and asynchronous generation
- Client JWT authentication for external integration (ToolJet, scripts)
- Presigned MinIO URLs for output download

---

## Quick Start

### Step 1: Get a client token

```bash
curl -s -X POST http://localhost:8000/api/token/generate \
  -H "Content-Type: application/json" \
  -d '{"client_id": "mobile-app", "client_secret": "your-secret"}' \
  | jq .
```

Response:

```json
{
  "access_token": "eyJhbG...",
  "token_type": "bearer"
}
```

### Step 2: Generate a report (synchronous)

```bash
curl -s -X POST http://localhost:8000/api/v1/report-modules/{module_id}/templates/{template_id}/generate \
  -H "Authorization: Bearer eyJhbG..." \
  -H "Content-Type: application/json" \
  -d '{"parameters": {}, "async": false}' \
  | jq .
```

Response:

```json
{
  "execution_id": "...",
  "status": "success",
  "output_url": "https://minio:9000/report-output/...",
  "output_minio_path": "report-output/products/..."
}
```

### Step 3: Download the file

```bash
curl -L -o report.xlsx "https://minio:9000/report-output/..."
```

---

## Concepts

### Report Module

A Report Module is the top-level container that binds together:

| Field | Description |
|---|---|
| `minio_datasource_id` | MinIO datasource for template and output file storage |
| `sql_datasource_id` | SQL datasource (PostgreSQL, StarRocks, etc.) for query execution |
| `default_template_bucket` | Default bucket for template files (e.g., `report-templates`) |
| `default_output_bucket` | Default bucket for generated output (e.g., `report-output`) |

Clients (external applications) are assigned at the module level to control access.

### Report Template

A template defines how a single report type is generated:

| Field | Description |
|---|---|
| `template_bucket` | MinIO bucket containing the template file (empty for blank) |
| `template_path` | Path to the `.xlsx` template file in the bucket (empty for blank) |
| `output_bucket` | Bucket where generated files are saved |
| `output_prefix` | Path prefix for output files (e.g., `products/`) |
| `recalc_enabled` | Whether to recalculate formulas after data injection |
| `output_sheet` | If set, extract only this sheet (values + styles) into the final file |

### Sheet Mapping

Each mapping defines one data injection into the workbook:

| Field | Description |
|---|---|
| `sheet_name` | Target Excel sheet name |
| `start_cell` | Cell where writing begins (e.g., `A5`, `E1`) |
| `write_mode` | `rows` or `single` |
| `write_headers` | Include column headers as the first row (only for `rows` mode) |
| `sort_order` | Execution order when multiple mappings target the same sheet |
| `sql_content` | SQL query, optionally with Jinja2 templating |

### Write Modes

#### `rows` Mode

Writes all query result rows starting at `start_cell`, one row per Excel row. If `write_headers` is `true`, column names are written first.

```text
SQL: SELECT id, name, price FROM products ORDER BY id

Sheet (start_cell=A5, write_headers=true):
  A5: id    B5: name      C5: price
  A6: 1     B6: Widget    C6: 9.99
  A7: 2     B7: Gadget    C7: 19.99
  ...
```

#### `single` Mode

Writes only the first value from the first row of the query result into `start_cell`. Useful for summary statistics, counts, and totals.

```text
SQL: SELECT COUNT(*) FROM products

Sheet (start_cell=E1):
  E1: 42
```

### Blank Template vs Template File

**Template File**: An existing `.xlsx` file in MinIO is downloaded, data is injected into it, and the result is uploaded. The template can contain formatting, headers, formulas, charts, etc.

**Blank Template**: When `template_path` is empty, the engine creates a new blank workbook from scratch. Each mapping's `sheet_name` becomes a new sheet. This is useful for simple data exports.

### Formula Recalculation

When `recalc_enabled=true`, after data injection the engine:

1. Saves the workbook to a temporary file
2. Opens it with LibreOffice in headless mode (`--calc --convert-to xlsx`)
3. LibreOffice recalculates all formulas and saves the result
4. The recalculated file replaces the original

This is required when the template contains formulas that reference the injected data (e.g., `SUM`, `COUNTA`, `AVERAGE` over data ranges).

**Requirements**: LibreOffice must be installed in the container. See the `LIBREOFFICE_PATH` environment variable.

### Output Sheet Extraction

When `output_sheet` is set (e.g., `"Summary"`), after generation (and optional recalc):

1. The specified sheet is extracted from the workbook
2. All formulas are replaced with their calculated values
3. Cell styles and formatting are preserved
4. A new workbook containing only that sheet is saved as the output

This is useful when you have a template with a raw data sheet and a summary sheet: inject data into the raw sheet, recalculate formulas, then deliver only the clean summary.

### SQL with Jinja2 Parameters

SQL queries support Jinja2 templating for dynamic parameter injection. Parameters are passed at generation time via the `parameters` field.

Available filters:

| Filter | Description | Example |
|---|---|---|
| `sql_string` | Wraps value in single quotes with escaping | `{{ name \| sql_string }}` |
| `sql_float` | Casts to float | `{{ min_price \| sql_float }}` |
| `sql_int` | Casts to int | `{{ limit \| sql_int }}` |

The `{% where %}` / `{% endwhere %}` block tag generates a `WHERE` clause only if at least one inner condition is active, converting the first `AND` to `WHERE`:

```sql
SELECT id, name, price, category
FROM products
{% where %}
  {% if category %}AND category = {{ category | sql_string }}{% endif %}
  {% if min_price %}AND price >= {{ min_price | sql_float }}{% endif %}
{% endwhere %}
ORDER BY id
```

With `{"category": "Electronics", "min_price": 10}`:

```sql
SELECT id, name, price, category
FROM products
WHERE category = 'Electronics' AND price >= 10.0
ORDER BY id
```

With `{}` (no parameters):

```sql
SELECT id, name, price, category
FROM products
ORDER BY id
```

---

## API Endpoints

All endpoints are prefixed with `/api/v1`.

### Report Modules

| Method | Path | Description |
|---|---|---|
| POST | `/report-modules/list` | List modules (paginated, filterable) |
| POST | `/report-modules/create` | Create a new module |
| POST | `/report-modules/update` | Update a module |
| POST | `/report-modules/delete?id={id}` | Delete a module and all children |
| GET | `/report-modules/{id}` | Get module detail with templates and client IDs |
| GET | `/report-modules/{id}/clients` | Get assigned client IDs |
| POST | `/report-modules/{id}/clients` | Set assigned client IDs |

### Report Templates

| Method | Path | Description |
|---|---|---|
| POST | `/report-modules/templates/list` | List all templates across modules (global) |
| POST | `/report-modules/{mid}/templates/list` | List templates for a specific module |
| POST | `/report-modules/{mid}/templates/create` | Create template (with optional inline mappings) |
| POST | `/report-modules/{mid}/templates/update` | Update template |
| POST | `/report-modules/{mid}/templates/delete?tid={tid}` | Delete template |
| GET | `/report-modules/{mid}/templates/{tid}` | Get template detail with mappings |
| GET | `/report-modules/{mid}/templates/{tid}/clients` | Get template client IDs |
| POST | `/report-modules/{mid}/templates/{tid}/clients` | Set template client IDs |

### Sheet Mappings

| Method | Path | Description |
|---|---|---|
| POST | `/report-modules/{mid}/templates/{tid}/mappings/create` | Create a mapping |
| POST | `/report-modules/{mid}/templates/{tid}/mappings/update` | Update a mapping |
| POST | `/report-modules/{mid}/templates/{tid}/mappings/delete?mapping_id={id}` | Delete a mapping |

### Report Generation and Executions

| Method | Path | Description |
|---|---|---|
| POST | `/report-modules/{mid}/templates/{tid}/generate` | Generate a report (sync or async) |
| GET | `/report-modules/{mid}/templates/{tid}/executions` | List executions for a template |
| GET | `/report-executions/{exec_id}` | Get a single execution by ID |
| GET | `/report-executions` | List all executions (filterable) |

### MinIO Helpers

| Method | Path | Description |
|---|---|---|
| GET | `/report-modules/buckets/{ds_id}` | List buckets from a MinIO datasource |
| GET | `/report-modules/files/{ds_id}/{bucket}` | List files in a bucket (filterable by prefix/suffix) |
| GET | `/report-modules/sheets/{ds_id}/{bucket}/{path}` | Get sheet names from an xlsx file |

### Authentication Token

| Method | Path | Description |
|---|---|---|
| POST | `/token/generate` | Generate a client JWT token |

---

## Authentication

The Report Engine supports two authentication modes:

### Dashboard JWT

Standard user authentication via the pyDBAPI dashboard. Users log in through the UI and receive a dashboard JWT. This token grants access to all management endpoints (CRUD) and report generation based on the user's role permissions.

### Client JWT (External Integration)

For external systems (ToolJet, scripts, CI/CD pipelines), clients authenticate using `POST /api/token/generate`:

```bash
curl -s -X POST http://localhost:8000/api/token/generate \
  -H "Content-Type: application/json" \
  -d '{"client_id": "mobile-app", "client_secret": "secret123"}'
```

Client tokens can only generate reports for modules the client is assigned to. Assignment is managed via the module clients endpoint.

### Access Control Summary

| Token Type | CRUD Endpoints | Generate Endpoint |
|---|---|---|
| Dashboard JWT | Yes (based on role permissions) | Yes (any module) |
| Client JWT | No | Yes (only assigned modules) |

---

## Examples

### Create a Module with Template and Mappings

```bash
# 1. Create the module
curl -s -X POST http://localhost:8000/api/v1/report-modules/create \
  -H "Authorization: Bearer $DASHBOARD_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Sales Reports",
    "description": "Monthly sales reporting",
    "minio_datasource_id": "'$MINIO_DS_ID'",
    "sql_datasource_id": "'$SQL_DS_ID'",
    "default_template_bucket": "report-templates",
    "default_output_bucket": "report-output"
  }' | jq .

# 2. Create a template with inline mappings
curl -s -X POST http://localhost:8000/api/v1/report-modules/$MODULE_ID/templates/create \
  -H "Authorization: Bearer $DASHBOARD_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "monthly-sales",
    "description": "Monthly sales summary",
    "template_bucket": "report-templates",
    "template_path": "sales/monthly.xlsx",
    "output_bucket": "report-output",
    "output_prefix": "sales/monthly/",
    "sheet_mappings": [
      {
        "sort_order": 1,
        "sheet_name": "Data",
        "start_cell": "A2",
        "write_mode": "rows",
        "write_headers": false,
        "sql_content": "SELECT id, product, quantity, total FROM sales ORDER BY id"
      }
    ]
  }' | jq .
```

### Multiple Mappings on the Same Sheet (single + rows)

```bash
curl -s -X POST http://localhost:8000/api/v1/report-modules/$MODULE_ID/templates/create \
  -H "Authorization: Bearer $DASHBOARD_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "dashboard-report",
    "template_bucket": "report-templates",
    "template_path": "combined/dashboard.xlsx",
    "output_bucket": "report-output",
    "output_prefix": "dashboard/",
    "sheet_mappings": [
      {
        "sort_order": 1,
        "sheet_name": "Report",
        "start_cell": "E1",
        "write_mode": "single",
        "sql_content": "SELECT COUNT(*) FROM products",
        "description": "Total product count"
      },
      {
        "sort_order": 2,
        "sheet_name": "Report",
        "start_cell": "E2",
        "write_mode": "single",
        "sql_content": "SELECT SUM(total) FROM orders",
        "description": "Total revenue"
      },
      {
        "sort_order": 3,
        "sheet_name": "Report",
        "start_cell": "A5",
        "write_mode": "rows",
        "write_headers": true,
        "sql_content": "SELECT id, name, price FROM products ORDER BY id",
        "description": "Product listing"
      }
    ]
  }' | jq .
```

### Blank Template (No File)

```bash
curl -s -X POST http://localhost:8000/api/v1/report-modules/$MODULE_ID/templates/create \
  -H "Authorization: Bearer $DASHBOARD_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "user-export",
    "template_bucket": "",
    "template_path": "",
    "output_bucket": "report-output",
    "output_prefix": "exports/users/",
    "sheet_mappings": [
      {
        "sheet_name": "Users",
        "start_cell": "A1",
        "write_mode": "rows",
        "write_headers": true,
        "sql_content": "SELECT id, username, email, is_active FROM sample_users ORDER BY id"
      }
    ]
  }' | jq .
```

### Template with Formulas + Recalc + Output Sheet

```bash
curl -s -X POST http://localhost:8000/api/v1/report-modules/$MODULE_ID/templates/create \
  -H "Authorization: Bearer $DASHBOARD_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "order-summary",
    "template_bucket": "report-templates",
    "template_path": "orders/order-summary.xlsx",
    "output_bucket": "report-output",
    "output_prefix": "orders/",
    "recalc_enabled": true,
    "output_sheet": "Summary",
    "sheet_mappings": [
      {
        "sheet_name": "RawData",
        "start_cell": "A2",
        "write_mode": "rows",
        "write_headers": false,
        "sql_content": "SELECT id, status, total FROM orders ORDER BY id"
      }
    ]
  }' | jq .
```

The engine will:
1. Download the template from MinIO
2. Inject order data into the `RawData` sheet starting at `A2`
3. Run LibreOffice to recalculate formulas (the `Summary` sheet has `COUNTA`, `SUM`, etc.)
4. Extract only the `Summary` sheet with calculated values
5. Upload the result to MinIO

### Async Generation + Polling

```bash
# Start async generation
RESPONSE=$(curl -s -X POST http://localhost:8000/api/v1/report-modules/$MODULE_ID/templates/$TEMPLATE_ID/generate \
  -H "Authorization: Bearer $CLIENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"parameters": {}, "async": true}')

EXEC_ID=$(echo $RESPONSE | jq -r '.execution_id')
echo "Execution ID: $EXEC_ID"

# Poll for completion
curl -s http://localhost:8000/api/v1/report-executions/$EXEC_ID \
  -H "Authorization: Bearer $DASHBOARD_TOKEN" | jq .
```

Execution status transitions: `pending` -> `running` -> `success` or `failed`.

### SQL with Jinja2 Parameters

```bash
# Generate with filters
curl -s -X POST http://localhost:8000/api/v1/report-modules/$MODULE_ID/templates/$TEMPLATE_ID/generate \
  -H "Authorization: Bearer $CLIENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "parameters": {
      "category": "Electronics",
      "min_price": 10.0
    },
    "async": false
  }' | jq .

# Generate without filters (all rows)
curl -s -X POST http://localhost:8000/api/v1/report-modules/$MODULE_ID/templates/$TEMPLATE_ID/generate \
  -H "Authorization: Bearer $CLIENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "parameters": {},
    "async": false
  }' | jq .
```

---

## ToolJet Integration

### Step 1: Create a Client

In the pyDBAPI dashboard, navigate to **Clients** and create a new client (e.g., `tooljet-reports`). Note the `client_id` and `client_secret`.

### Step 2: Assign Client to Module

In the **Report Management** section, open the report module, go to the **Clients** tab, and assign the `tooljet-reports` client.

### Step 3: Create a REST API Datasource in ToolJet

Create a new REST API datasource in ToolJet:
- **Base URL**: `http://pydbapi-backend:8000/api` (or your network-accessible URL)
- **Authentication**: None (tokens are managed per-request)

### Step 4: Get a Token (ToolJet Query)

Create a REST API query:
- **Method**: POST
- **Endpoint**: `/token/generate`
- **Body**:

```json
{
  "client_id": "tooljet-reports",
  "client_secret": "{{secrets.pydbapi_secret}}"
}
```

Store the token in a ToolJet variable: `{{queries.getToken.data.access_token}}`.

### Step 5: Generate a Report (ToolJet Query)

Create a REST API query:
- **Method**: POST
- **Endpoint**: `/v1/report-modules/{module_id}/templates/{template_id}/generate`
- **Headers**: `Authorization: Bearer {{variables.pydbapi_token}}`
- **Body**:

```json
{
  "parameters": {
    "category": "{{components.categoryDropdown.value}}"
  },
  "async": false
}
```

### Step 6: Download the Report

Use the `output_url` from the response to trigger a file download in ToolJet using a RunJS query:

```javascript
const url = queries.generateReport.data.output_url;
if (url) {
  window.open(url, '_blank');
}
```

---

## Configuration

All settings are configured via environment variables.

| Variable | Default | Description |
|---|---|---|
| `LIBREOFFICE_PATH` | `/usr/bin/libreoffice` | Path to the LibreOffice binary for formula recalculation |
| `REPORT_RECALC_TIMEOUT` | `120` | Maximum seconds to wait for LibreOffice recalculation |
| `REPORT_TEMP_DIR` | `/tmp/reports` | Temporary directory for intermediate files during generation |
| `REPORT_OUTPUT_URL_EXPIRY` | `3600` | Presigned URL expiry time in seconds (default: 1 hour) |
| `REPORT_MAX_ROWS_PER_SHEET` | `1048576` | Maximum rows per sheet (Excel xlsx limit) |
| `REPORT_SQL_CHUNK_SIZE` | `50000` | Number of rows fetched per SQL query chunk for large datasets |

---

## Seed Example Data

When `SEED_EXAMPLE_DATA=true`, the application automatically creates a complete set of report examples on startup.

### What Gets Created

**MinIO Datasource**: `Examples MinIO` pointing to `minio:9000` with `minioadmin/minioadmin` credentials.

**Buckets**: `report-templates` and `report-output`.

**Template Files**:
- `products/product-list.xlsx` - Simple header + data area
- `orders/order-summary.xlsx` - RawData sheet + Summary sheet with formulas
- `combined/multi-query-sheet.xlsx` - Single sheet with multiple data areas

**Report Module**: `Examples (Reports)` with 6 templates:

| Template | Type | Description |
|---|---|---|
| `product-list` | Rows export | Simple product catalog from template |
| `order-summary` | Recalc + extract | Formula recalculation with output sheet |
| `multi-query-sheet` | Multi-mapping | 3 mappings on same sheet (single + rows) |
| `blank-users` | Blank workbook | User export without template file |
| `multi-sheet-blank` | Multi-sheet blank | Users + Metrics on separate sheets |
| `parameterized-report` | Jinja2 SQL | Dynamic filtering with parameters |

**Client Assignment**: The `mobile-app` client is assigned to the module.

**StarRocks Module** (optional): If a StarRocks/MySQL datasource exists, a second module `Examples (Reports - StarRocks)` is created with adapted SQL queries.

### Testing the Seed Data

```bash
# Get a client token
TOKEN=$(curl -s -X POST http://localhost:8000/api/token/generate \
  -H "Content-Type: application/json" \
  -d '{"client_id": "mobile-app", "client_secret": "secret123"}' \
  | jq -r '.access_token')

# List modules
curl -s -X POST http://localhost:8000/api/v1/report-modules/list \
  -H "Authorization: Bearer $DASHBOARD_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"page": 1, "page_size": 10}' | jq .

# Generate the product-list report (sync)
curl -s -X POST http://localhost:8000/api/v1/report-modules/$MODULE_ID/templates/$TPL_ID/generate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"parameters": {}, "async": false}' | jq .

# Generate parameterized report
curl -s -X POST http://localhost:8000/api/v1/report-modules/$MODULE_ID/templates/$TPL_ID/generate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"parameters": {"category": "Electronics", "min_price": 5.0}, "async": false}' | jq .
```

---

## Troubleshooting

### LibreOffice recalculation fails

- Verify LibreOffice is installed: `libreoffice --version`
- Check the path matches `LIBREOFFICE_PATH`
- Ensure the `REPORT_TEMP_DIR` directory exists and is writable
- Increase `REPORT_RECALC_TIMEOUT` if processing large files
- Check for LibreOffice lock files in `/tmp` if a previous process crashed

### MinIO connection errors

- Verify the MinIO datasource credentials are correct
- Check network connectivity between the backend container and MinIO
- Ensure the required buckets exist (`report-templates`, `report-output`)
- Check MinIO logs for access denied or bucket policy issues

### "No active mappings" error

- At least one mapping must have `is_active=true` for the template
- Check that mappings were created successfully via `GET /api/v1/report-modules/{mid}/templates/{tid}`

### Client token rejected with 403

- Verify the client is assigned to the report module via `GET /api/v1/report-modules/{id}/clients`
- Check that the client's `is_active` flag is `true`
- Ensure the token has not expired

### Empty output file

- Verify the SQL query returns data by testing it directly against the database
- Check that `start_cell` references a valid cell (e.g., `A1`, not `0A`)
- For template files, ensure the `sheet_name` matches an existing sheet in the template

### Output sheet extraction produces empty file

- Ensure `recalc_enabled=true` is set if formulas need to be calculated
- Verify the `output_sheet` name exactly matches the sheet name in the workbook (case-sensitive)
- Check that the formula references point to the correct data ranges

### Large reports timing out

- Use `"async": true` for large reports to avoid HTTP timeout
- Increase `REPORT_SQL_CHUNK_SIZE` for faster data loading
- Check `REPORT_MAX_ROWS_PER_SHEET` if data exceeds Excel limits
- Monitor memory usage; very large datasets may require chunked processing
