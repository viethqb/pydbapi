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
| `gap_rows` | Number of empty rows to insert when auto-shifting (default `0`) |
| `format_config` | Per-mapping formatting (overrides template-level format). See [Format Config](#format-config) |
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

### Collision Detection & Auto-Shift

When multiple mappings write to the **same sheet**, the engine tracks the last row written per sheet. If a mapping's `start_cell` falls within an already-written region, the engine **automatically shifts** it down to avoid overwriting.

**How it works:**

1. Mappings execute in `sort_order` sequence
2. After each mapping, the engine records the last written row for that sheet
3. Before writing the next mapping, if `start_cell` row ≤ `last_written_row`, the engine shifts to `last_written_row + gap_rows + 1` (keeping the same column)
4. A log message records every shift: `Mapping {id}: start_cell A1 collided with prior writes on sheet 'Sheet1', shifted to A5 (gap_rows=2)`

**gap_rows** controls the spacing between auto-shifted blocks. It only takes effect when a collision is detected — if mappings don't overlap, `gap_rows` is ignored.

```text
Template with 2 mappings on the same sheet, gap_rows=2 on mapping 2:

Mapping 1 (sort_order=0, start_cell=A1, write_headers=true):
  SQL: SELECT 1 AS v UNION ALL SELECT 2

  A1: v       ← header
  A2: 1       ← data
  A3: 2       ← last_written_row = 3

Mapping 2 (sort_order=1, start_cell=A1, gap_rows=2, write_headers=true):
  SQL: SELECT 10 AS v

  A1 would collide → shifted to A3 + 2 + 1 = A6
  A4: (empty)  ← gap row 1
  A5: (empty)  ← gap row 2
  A6: v        ← header
  A7: 10       ← data
```

**Rules:**
- Auto-shift is per-sheet: mappings on different sheets never affect each other
- `single` mode updates the sheet's last-row tracker too (at the cell's row)
- When `start_cell` row is already below the last written row, no shift occurs

### Format Config

Format configuration controls the appearance of written cells. It can be set at two levels:

- **Template-level** (`ReportTemplate.format_config`): Default format for all mappings
- **Mapping-level** (`ReportSheetMapping.format_config`): Override per mapping

When both are set, they are **deep-merged**: mapping values override template values per-key, while unset keys inherit from the template.

#### Format Config Structure

```json
{
  "header": { ... },           // CellFormat — applied to header row
  "data": { ... },             // CellFormat — applied to data rows
  "column_widths": {           // Manual column widths
    "A": 15, "B": 25, "C": 10
  },
  "auto_fit": true,            // Auto-calculate column widths from content
  "auto_fit_max_width": 50,    // Max width when auto-fitting (default 50)
  "wrap_text": true            // Apply wrap text to all cells (header + data)
}
```

#### CellFormat Object

Each of `header` and `data` accepts a `CellFormat` with these sub-objects:

```json
{
  "font": {
    "name": "Calibri",         // Font family
    "size": 11,                // Font size in points
    "bold": true,              // Bold text
    "italic": false,           // Italic text
    "color": "FF0000"          // Font color (RGB hex, e.g. "FF0000" = red)
  },
  "fill": {
    "bg_color": "FFFF00",     // Background color (RGB hex)
    "pattern": "solid"         // Fill pattern (default "solid" when bg_color set)
  },
  "border": {
    "style": "thin",           // Border style: thin, medium, thick, dashed, dotted, double
    "color": "000000"          // Border color (RGB hex, default black)
  },
  "alignment": {
    "horizontal": "center",    // left, center, right, justify
    "vertical": "center",      // top, center, bottom
    "wrap_text": true          // Wrap text within cell
  },
  "number_format": "#,##0.00"  // Excel number format string
}
```

All fields are optional. Only set what you need — unset fields keep the cell's default or template-inherited style.

#### Common Number Formats

| Format | Example Output | Use Case |
|---|---|---|
| `General` | 1234.5 | Default |
| `#,##0` | 1,235 | Integer with thousands separator |
| `#,##0.00` | 1,234.50 | Currency/decimal |
| `0%` | 75% | Percentage (integer) |
| `0.00%` | 75.50% | Percentage (decimal) |
| `yyyy-mm-dd` | 2026-04-16 | ISO date |
| `dd/mm/yyyy` | 16/04/2026 | EU date |
| `yyyy-mm-dd hh:mm:ss` | 2026-04-16 14:30:00 | Datetime |
| `@` | (text as-is) | Force text format |

#### Common Font Colors

| Color | Hex Code |
|---|---|
| Black | `000000` |
| White | `FFFFFF` |
| Red | `FF0000` |
| Dark Red | `C00000` |
| Green | `00B050` |
| Blue | `0070C0` |
| Dark Blue | `002060` |
| Orange | `FF6600` |
| Yellow | `FFFF00` |
| Purple | `7030A0` |
| Gray 25% | `D9D9D9` |
| Gray 50% | `808080` |

#### Auto-fit Columns

When `auto_fit: true`, the engine calculates column widths based on the content (header + data values). The width is clamped between `8` (minimum) and `auto_fit_max_width` (default `50`).

**Rules:**
- Auto-fit is **skipped** when `column_widths` is also set (manual widths take priority)
- Auto-fit calculates width from the longest value across all data rows per column
- Multi-line values (containing `\n`) use the longest line for width calculation
- Width = `max_content_length + 2` (padding), capped at `auto_fit_max_width`

#### Wrap Text

When `wrap_text: true`, all cells (both header and data rows) get `wrap_text=true` in their alignment. This is a convenience shortcut — you can also set `alignment.wrap_text` per-section in `header` or `data` CellFormat for more granular control.

#### Format Merge Examples

**Template-level format + no mapping override:**

```json
// Template format_config
{
  "header": { "font": { "bold": true, "size": 12 } },
  "data": { "number_format": "#,##0" }
}
// Mapping format_config: null

// Result: all mappings use template format
// → Header: bold 12pt
// → Data: #,##0
```

**Mapping overrides specific keys:**

```json
// Template format_config
{
  "header": { "font": { "bold": true, "size": 12 } },
  "data": { "number_format": "#,##0" }
}
// Mapping format_config
{
  "header": { "font": { "size": 16 }, "fill": { "bg_color": "FFFF00" } }
}

// Result (deep-merged):
// → Header: bold (inherited) + 16pt (overridden) + yellow background (added)
// → Data: #,##0 (inherited from template)
```

#### Complete Format Config Examples

**Simple styled export:**

```json
{
  "header": {
    "font": { "bold": true, "color": "FFFFFF" },
    "fill": { "bg_color": "002060" },
    "border": { "style": "thin" },
    "alignment": { "horizontal": "center" }
  },
  "data": {
    "border": { "style": "thin", "color": "D9D9D9" },
    "number_format": "#,##0.00"
  },
  "auto_fit": true,
  "auto_fit_max_width": 40
}
```

**Wrap text with fixed column widths:**

```json
{
  "column_widths": { "A": 10, "B": 30, "C": 15 },
  "wrap_text": true,
  "header": { "font": { "bold": true } }
}
```

**Data-only formatting (no header style):**

```json
{
  "data": {
    "font": { "name": "Consolas", "size": 10 },
    "alignment": { "vertical": "top" }
  },
  "auto_fit": true
}
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

#### Available Filters

**Type-safe escaping filters** (all return SQL-safe values, `None` → `NULL`):

| Filter | Output Example | Description |
|---|---|---|
| `sql_string` | `'O''Brien'` | Single-quote wrapped, escapes `'` |
| `sql_int` | `42` | Validates integer |
| `sql_float` | `3.14` | Validates float |
| `sql_bool` | `TRUE` / `FALSE` | Boolean literal |
| `sql_date` | `'2026-04-16'` | YYYY-MM-DD format |
| `sql_datetime` | `'2026-04-16T14:30:00'` | ISO datetime format |
| `sql_ident` | `column_name` | Identifier (alphanumeric + `_` + `.` only, no quoting) |

**List & pattern filters**:

| Filter | Output Example | Description |
|---|---|---|
| `in_list` | `(1, 2, 3)` | Comma-separated parenthesized list. Empty list → `(SELECT 1 WHERE 1=0)` |
| `sql_like` | `'pattern'` | Escapes `%` and `_` for safe LIKE |
| `sql_like_start` | `'pattern%'` | Prefix match |
| `sql_like_end` | `'%pattern'` | Suffix match |
| `compare` | `> 100.0` or `BETWEEN 10 AND 50` | From JSON: `{"combinator": ">", "values": "100"}` |

**Utility filters**:

| Filter | Output Example | Description |
|---|---|---|
| `fromjson` | (parsed dict/list) | Parse JSON string to object |
| `json` | `'{"key":"val"}'` | Serialize to quoted JSON string |

#### Auto-escape Behavior

When a variable is used **without an explicit filter** (e.g., `{{ name }}`), the engine auto-escapes based on type:

| Python Type | Auto-escape Result |
|---|---|
| `None` | `NULL` |
| `bool` | `TRUE` / `FALSE` |
| `int`, `float` | String representation (no quoting) |
| `str` | `sql_string()` (quoted + escaped) |
| `list`, `tuple` | `in_list()` |
| `dict` | `json()` |
| `datetime` | `sql_datetime()` |
| `date` | `sql_date()` |

This means `{{ name }}` is safe by default — you only need explicit filters when you want a specific behavior different from auto-escape (e.g., `{{ ids | in_list }}` for a list in an `IN` clause).

#### Tags

**`{% where %}` / `{% endwhere %}`** — Conditional WHERE clause builder:

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

**OR mode** — use `operation="OR"` to join conditions with OR instead of AND:

```sql
SELECT * FROM users
{% where operation="OR" %}
  {% if email %}AND email = {{ email | sql_string }}{% endif %}
  {% if phone %}AND phone = {{ phone | sql_string }}{% endif %}
{% endwhere %}
```

#### Advanced SQL Template Patterns

**Dynamic IN list from parameter array:**

```sql
SELECT * FROM orders
WHERE status IN {{ statuses | in_list }}
ORDER BY created_at DESC
```

```json
{ "statuses": ["pending", "processing"] }
```

→ `WHERE status IN ('pending', 'processing')`

**Conditional columns and JOINs:**

```sql
SELECT o.id, o.total
  {% if include_customer %}, c.name AS customer_name{% endif %}
FROM orders o
{% if include_customer %}
  LEFT JOIN customers c ON c.id = o.customer_id
{% endif %}
{% where %}
  {% if status %}AND o.status = {{ status | sql_string }}{% endif %}
  {% if min_total %}AND o.total >= {{ min_total | sql_float }}{% endif %}
  {% if date_from %}AND o.created_at >= {{ date_from | sql_date }}{% endif %}
  {% if date_to %}AND o.created_at <= {{ date_to | sql_date }}{% endif %}
{% endwhere %}
ORDER BY o.created_at DESC
{% if limit %}LIMIT {{ limit | sql_int }}{% endif %}
```

**LIKE search:**

```sql
SELECT * FROM products
{% where %}
  {% if search %}AND name LIKE {{ search | sql_like_start }}{% endif %}
  {% if category %}AND category = {{ category | sql_string }}{% endif %}
{% endwhere %}
```

With `{"search": "Wi"}` → `WHERE name LIKE 'Wi%'`

**Default values with Jinja2:**

```sql
SELECT * FROM logs
WHERE created_at >= {{ date_from | default("2026-01-01") | sql_date }}
ORDER BY created_at
LIMIT {{ limit | default(1000) | sql_int }}
```

**Multiple statements (write multiple result sets):**

```sql
SELECT 'Report Title' AS title;
SELECT id, name, amount FROM transactions ORDER BY id
```

The first statement's result goes to a `single` mapping, the second to a `rows` mapping.

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

### Formatted Report with Auto-Shift

Create a template with default formatting and two mappings that auto-shift on the same sheet:

```bash
# Create template with default format (applied to all mappings)
curl -s -X POST http://localhost:8000/api/v1/report-modules/$MODULE_ID/templates/create \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "styled-sales-report",
    "output_bucket": "report-output",
    "format_config": {
      "header": {
        "font": { "bold": true, "color": "FFFFFF", "size": 11 },
        "fill": { "bg_color": "002060" },
        "border": { "style": "thin" },
        "alignment": { "horizontal": "center" }
      },
      "data": {
        "border": { "style": "thin", "color": "D9D9D9" }
      },
      "auto_fit": true,
      "auto_fit_max_width": 40,
      "wrap_text": true
    },
    "sheet_mappings": [
      {
        "sort_order": 0,
        "sheet_name": "Report",
        "start_cell": "A1",
        "write_mode": "rows",
        "write_headers": true,
        "sql_content": "SELECT id, product, amount, status FROM sales ORDER BY id",
        "description": "Sales data"
      },
      {
        "sort_order": 1,
        "sheet_name": "Report",
        "start_cell": "A1",
        "write_mode": "rows",
        "write_headers": true,
        "gap_rows": 2,
        "sql_content": "SELECT status, COUNT(*) as count, SUM(amount) as total FROM sales GROUP BY status",
        "description": "Summary by status",
        "format_config": {
          "header": { "fill": { "bg_color": "00B050" } },
          "data": { "number_format": "#,##0.00" }
        }
      }
    ]
  }' | jq .
```

**Output:**

```text
Sheet "Report":

  A1: id    B1: product   C1: amount    D1: status     ← dark blue header (template)
  A2: 1     B2: Widget    C2: 9.99      D2: completed
  A3: 2     B3: Gadget    C3: 19.99     D3: pending
  ...
  A50: 49   B50: Item49   C50: 5.00     D50: completed ← last row = 50

  A51: (empty) ← gap row 1
  A52: (empty) ← gap row 2

  A53: status    B53: count   C53: total    ← green header (mapping override)
  A54: completed B54: 30      C54: 15,000.00 ← number format #,##0.00
  A55: pending   B55: 19      C55: 8,500.00

All cells have thin borders, auto-fit column widths, and wrap text.
```

### Multi-Sheet Report with Mixed Modes

```bash
curl -s -X POST http://localhost:8000/api/v1/report-modules/$MODULE_ID/templates/create \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "dashboard-export",
    "output_bucket": "report-output",
    "format_config": { "auto_fit": true },
    "sheet_mappings": [
      {
        "sort_order": 0,
        "sheet_name": "Dashboard",
        "start_cell": "B2",
        "write_mode": "single",
        "sql_content": "SELECT COUNT(*) FROM orders",
        "format_config": { "data": { "font": { "size": 24, "bold": true } } },
        "description": "Total orders count"
      },
      {
        "sort_order": 1,
        "sheet_name": "Dashboard",
        "start_cell": "D2",
        "write_mode": "single",
        "sql_content": "SELECT SUM(amount) FROM orders",
        "format_config": { "data": { "number_format": "#,##0.00", "font": { "size": 24, "bold": true } } },
        "description": "Total revenue"
      },
      {
        "sort_order": 2,
        "sheet_name": "Data",
        "start_cell": "A1",
        "write_mode": "rows",
        "write_headers": true,
        "sql_content": "SELECT id, customer, amount, created_at FROM orders ORDER BY created_at DESC",
        "format_config": {
          "header": { "font": { "bold": true }, "fill": { "bg_color": "DDEBF7" } },
          "data": { "number_format": "#,##0.00" }
        }
      }
    ]
  }' | jq .
```

---

## Frontend Configuration Guide

This section walks through configuring the Report Engine entirely from the pyDBAPI Dashboard UI (`/report-management`).

### Creating a Report Module

1. Navigate to **Report Management → Modules** and click **Create Module**
2. Fill in the required fields:
   - **Name**: Unique module name
   - **MinIO Datasource**: Select a MinIO-type datasource (stores templates and output files)
   - **SQL Datasource**: Select a PostgreSQL/MySQL datasource (executes SQL queries)
   - **Default Template Bucket**: Bucket containing `.xlsx` template files
   - **Default Output Bucket**: Bucket where generated reports are saved
3. Click **Create**

### Creating a Report Template

1. Open the module, go to the **Templates** tab, and click **Create Template**
2. Fill in:
   - **Name**: Template name (unique within the module)
   - **Template File**: Select an `.xlsx` file from MinIO, or leave empty to create a blank workbook
   - **Output Prefix**: Output folder path (e.g., `reports/monthly/`)
   - **Output Sheet**: Extract a specific sheet after generation (leave empty to keep the full workbook)
   - **Recalc**: Enable if the template contains formulas that reference injected data
3. Click **Create**

### Configuring Default Format (Template-level)

On the template detail page, go to the **Overview** tab and click **Edit**:

1. Scroll down to the **Default Format** row and click **Format Config** to expand the panel
2. Configure the options:

   **Quick Options** (applied to all cells in every mapping):

   | Option | Description |
   |---|---|
   | **Auto-fit column widths** | Automatically calculate column widths based on content. Set **Max width** to cap the maximum (default 50) |
   | **Wrap text** | Enable text wrapping in all cells (header and data rows) |

   **Header Format** (applied to header rows only):

   Click **Header Format** to expand. Available settings:

   | Setting | How to configure |
   |---|---|
   | **Font** | Select font family from the dropdown (Arial, Calibri, Segoe UI, etc.), choose size (8–36), toggle **B** for bold or **I** for italic |
   | **Font Color** | Pick a preset color from the dropdown (Red, Blue, White, etc.) or type a hex code (e.g., `FF0000`) in the text field. A color swatch previews the selected color |
   | **Background** | Pick a fill color. Pattern defaults to `solid` when a color is selected |
   | **Border** | Choose a style (thin, medium, thick, dashed, dotted, double) from the dropdown. A color picker appears when a style is selected |
   | **Alignment** | Click alignment icons for horizontal (left / center / right / justify), select vertical (Top / Middle / Bottom), toggle the wrap text icon |
   | **Number Format** | Select a preset from the dropdown (`#,##0`, `0%`, `yyyy-mm-dd`, etc.) or type a custom Excel format string in the text field |

   **Data Format** (applied to data rows only):

   Same settings as Header Format, configured independently.

   **Column Widths** (manual override):

   Click **Column Widths** to expand:
   - Enter a column letter (A, B, C…) and width value, then click **Add** or press Enter
   - Each width appears as a removable pill tag (e.g., `A=15 ×`)
   - When set, manual widths take priority over auto-fit

3. Click **Save**

> **Note**: Template-level format is the **default** for all mappings. Each mapping can override specific properties without affecting others (deep merge).

### Creating and Configuring Sheet Mappings

On the template detail page, go to the **Mappings** tab and click **Add Mapping**. The dialog opens as a table-based form:

#### Basic Fields

| Field | Description | Example |
|---|---|---|
| **Sheet Name** | Target Excel sheet name. For blank templates, sheets are auto-created | `Sheet1`, `Data`, `Summary` |
| **Start Cell** | Cell where writing begins | `A1`, `B5`, `E10` |
| **Write Mode** | `Rows` = write all query rows. `Single Value` = write first value of first row | `Rows` |
| **Sort Order** | Execution order (lower runs first). Critical when multiple mappings target the same sheet | `0`, `1`, `2` |
| **Gap Rows** | Empty rows to insert when auto-shift triggers (only applies during collision, ignored otherwise) | `0`, `2`, `5` |
| **Options** | **Headers** = write column names as the first row. **Active** = enable/disable the mapping (edit dialog only) | ✓ Headers |

#### SQL Content

Write a SQL query with optional Jinja2 templating for dynamic parameters:

```sql
SELECT id, name, amount, status
FROM orders
{% where %}
  {% if status %}AND status = {{ status | sql_string }}{% endif %}
  {% if min_amount %}AND amount >= {{ min_amount | sql_float }}{% endif %}
  {% if date_from %}AND created_at >= {{ date_from | sql_date }}{% endif %}
{% endwhere %}
ORDER BY id
```

Parameters are passed as JSON when generating the report (see [Generating a Report](#generating-a-report)).

#### Per-Mapping Format Override

Below the SQL Content field, click **Format Config** to expand the format panel. The interface is identical to the template-level format editor but applies only to this mapping.

**Merge rules**:
- The mapping **inherits** all format settings from the template
- Only set what you want to **override** — unset fields keep the template value
- Merge is **per-key** (deep merge), not a full replacement of the block

**Example**: Template sets header = bold + 11pt. Mapping only sets header fill = yellow. Result: header = bold + 11pt + yellow background.

### Reading the Mapping Summary

After creation, each mapping displays as a table with full details:

| Row | Content |
|---|---|
| **Sheet / Start Cell / Mode** | Position info + write mode badge + edit/delete buttons |
| **Order / Headers / Gap Rows** | Execution order, header toggle, gap spacing |
| **SQL** | Query content in a scrollable code block |
| **Format** | Visual summary using pill tags: `auto-fit ≤50` `wrap-text` `Header: Bold · Calibri · 12pt · ●#FFFFFF · ●fill` `Data: #,##0.00 · thin` `widths: A=15 B=25` |
| **Status** | Shows `Inactive` badge if disabled, plus description text if set |

### Multiple Mappings on the Same Sheet

When two or more mappings share the same `Sheet Name`:

1. Set **Sort Order** to control execution sequence (mapping with order 0 runs first)
2. Set **Gap Rows** on the second mapping onward to add spacing between data blocks
3. The engine automatically **auto-shifts** later mappings below earlier ones — no data is overwritten

**Example setup**:

| Mapping | Sort Order | Start Cell | Gap Rows | Write Headers | SQL |
|---|---|---|---|---|---|
| Order details | 0 | A1 | 0 | ✓ | `SELECT id, product, amount FROM orders` |
| Summary by status | 1 | A1 | 2 | ✓ | `SELECT status, COUNT(*), SUM(amount) FROM orders GROUP BY status` |

**Result**: Mapping 1 writes from A1 downward. Mapping 2 auto-shifts below mapping 1's data, with 2 empty gap rows in between.

### Combining SINGLE + ROWS on the Same Sheet

Use `Single Value` mode for totals/labels and `Rows` mode for data tables:

| Mapping | Mode | Sort Order | Start Cell | SQL |
|---|---|---|---|---|
| Report title | Single Value | 0 | A1 | `SELECT 'Monthly Report - April 2026'` |
| Total orders | Single Value | 1 | D1 | `SELECT COUNT(*) FROM orders` |
| Order data | Rows | 2 | A3 | `SELECT * FROM orders ORDER BY id` |

> **Important**: `Single Value` mappings also affect auto-shift tracking. If a SINGLE mapping writes to row 1, a subsequent ROWS mapping at A1 will shift to A2. To avoid unexpected shifts, place ROWS mappings at a `Start Cell` below the SINGLE values (e.g., `A3`), or rely on Sort Order + Gap Rows.

### Generating a Report

1. Open the template detail page and go to the **Generate** tab
2. Enter **Parameters** as a JSON object:

```json
{
  "status": "completed",
  "min_amount": 100,
  "date_from": "2026-01-01",
  "date_to": "2026-04-30"
}
```

Pass `{}` to generate without filters (all SQL conditions using `{% if param %}` are skipped).

3. Click **Generate**
4. When complete, click **Download Report** or copy the download URL

### Viewing Execution History

The **History** tab shows all past generations:

| Column | Description |
|---|---|
| **Status** | `pending` → `running` → `success` or `failed` |
| **Started / Completed** | Timestamps for execution start and finish |
| **Download** | Download button (only shown for `success` status) |
| **Error** | Error message if failed (hover to see full text) |

The page auto-refreshes every 3 seconds while any execution is `pending` or `running`.

### Managing Client Access

The **Clients** tab (available at both module and template level):

1. Check the clients allowed to generate reports via external API (ToolJet, scripts, etc.)
2. Clients must be assigned at the **module level** for access
3. Click **Save** to apply changes

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
