# Parameters Usage Guide (SQL and Script Engine)

## Overview

Parameters are defined in the API with 3 location types:

- **query**: From URL query string (e.g. `?id=123&name=test`)
- **header**: From HTTP headers (e.g. `X-User-Id: 123`)
- **body**: From request body (JSON or form data)

## How Parameters Are Passed to the Engine

### 1. SQL Engine (Jinja2 Template)

Parameters are merged into a single dict and passed to the Jinja2 template. Priority order: **path > query > body > header**

**SQL example with parameters:**

```sql
-- Using query parameter
SELECT * FROM users WHERE id = {{ id }}

-- Using header parameter
SELECT * FROM users WHERE user_id = {{ x_user_id }}

-- Using body parameter
SELECT * FROM users WHERE name = '{{ name }}' AND email = '{{ email }}'

-- Conditional with parameter
{% if status %}
  AND status = '{{ status }}'
{% endif %}

-- Loop with parameter
SELECT * FROM users WHERE id IN (
  {% for id in user_ids %}
    {{ id }}{% if not loop.last %},{% endif %}
  {% endfor %}
)
```

### 2. Script Engine (Python)

Parameters are passed to the script via the `req` variable (dictionary). Priority order: **path > query > body > header**

**Python script example with parameters:**

```python
# Get query parameter
user_id = req.get('id')
if user_id:
    users = db.query("SELECT * FROM users WHERE id = %s", [user_id])
else:
    users = db.query("SELECT * FROM users")

# Get header parameter
x_user_id = req.get('x_user_id')
if x_user_id:
    user = db.query_one("SELECT * FROM users WHERE id = %s", [x_user_id])

# Get body parameter
name = req.get('name')
email = req.get('email')
if name and email:
    db.execute(
        "INSERT INTO users (name, email) VALUES (%s, %s)",
        [name, email]
    )

# Get all parameters
all_params = req  # dict containing all params

# Check if parameter exists
if 'status' in req:
    status = req['status']
    users = db.query("SELECT * FROM users WHERE status = %s", [status])

result = users
```

## Defining Parameters in the Frontend

When creating/editing an API, you can define parameters with these attributes:

- **Name**: Parameter name (will be the key in the dict)
- **Location**: `query`, `header`, or `body`
- **Data Type**: Data type (string, number, integer, boolean, array, object)
- **Required**: Whether the parameter is required
- **Validate Type**: Validation type (regex or python)
- **Validate**: Validation value

## Practical Examples

These scenarios show how **frontend parameter definitions** (location + type) map to **real gateway requests** and how the values are available inside SQL (Jinja2) or Python scripts.

### Example 1: API GET with query and header params

**Goal:** Simple read-only API that requires an `id` in the query string and optionally receives a `X-User-Id` header for auditing.

**Parameter definitions (Basic Info → Parameters):**

- `id` (query, required, integer)
- `X-User-Id` (header, optional, string)

**SQL:**

```sql
SELECT * FROM users
WHERE id = {{ id }}
{% if x_user_id %}
  AND created_by = '{{ x_user_id }}'
{% endif %}
```

**Python Script:**

```python
user_id = req.get('id')
x_user_id = req.get('x_user_id')

query = "SELECT * FROM users WHERE id = %s"
params = [user_id]

if x_user_id:
    query += " AND created_by = %s"
    params.append(x_user_id)

result = db.query(query, params)
```

### Example 2: API POST with body params

**Goal:** Create a user from JSON body fields and handle optional `age`.

**Parameter definitions (Basic Info → Parameters):**

- `name` (body, required, string)
- `email` (body, required, string)
- `age` (body, optional, integer)

**SQL:**

```sql
INSERT INTO users (name, email, age)
VALUES ('{{ name }}', '{{ email }}', {{ age | default(0) }})
```

**Python Script:**

```python
name = req.get('name')
email = req.get('email')
age = req.get('age', 0)

if not name or not email:
    result = {"error": "name and email are required"}
else:
    db.execute(
        "INSERT INTO users (name, email, age) VALUES (%s, %s, %s)",
        [name, email, age]
    )
    result = {"success": True, "message": "User created"}
```

## Important Notes

1. **Header names**: Header names in HTTP requests are typically case-insensitive, but when extracted into params the names are kept as defined in the params definition.

2. **Naming convention**:
   - Query and body params may be converted from camelCase to snake_case if the request has `?naming=snake` (default)
   - Path params are not converted
   - Header params are not converted

3. **Conflict resolution**: If the same parameter name appears in multiple locations, the priority order is: **path > query > body > header**

4. **Type conversion**:
   - SQL engine: You must convert types yourself in the Jinja2 template
   - Script engine: Python will convert types automatically when needed

5. **Validation**: Parameters are validated against the definition (required, data_type, validate_type, validate) before being passed to the engine.

## Script Engine: Sandbox and Timeout (Backend)

This section describes backend configuration for the Script Engine (Python): module whitelist and execution timeout.

### SCRIPT_EXTRA_MODULES (module whitelist)

- **Purpose**: Allow the Python script to use additional modules (e.g. `pandas`, `numpy`) without allowing arbitrary `import`.
- **Behaviour**:
  - Value is a comma-separated string (e.g. `pandas,numpy`).
  - **Whitelist only**: only module names in the list are injected into script globals. The script **cannot** call `import ...` arbitrarily; only the configured names are available.
  - The backend injects only **top-level module names** (regex: `^[a-zA-Z_][a-zA-Z0-9_]*$`). Submodules (e.g. `pandas.io`) are not added via this env var.
- **Default**: Empty (no extra modules).
- **Example env**: `SCRIPT_EXTRA_MODULES=pandas,numpy`
- **Security note**: Modules like `pandas`, `numpy` can execute complex code. Enable only modules you actually need and have reviewed.

### SCRIPT_EXEC_TIMEOUT (execution timeout)

- **Purpose**: Limit script execution time; avoid scripts running indefinitely.
- **Behaviour**:
  - Value is seconds (integer). When set, the backend will try to abort the script after that many seconds.
  - **On Unix (Linux, macOS)**: Uses `signal.SIGALRM`. When time runs out, the kernel sends SIGALRM, the handler raises `ScriptTimeoutError` (subclass of `TimeoutError`) and the script is stopped.
  - **On Windows**: `signal.SIGALRM` **does not exist**. The backend does not apply a timeout; the script runs until it finishes or errors. For cross-platform timeout, consider an alternative (e.g. thread-based timeout) in the future.
- **Default**: `None` (no time limit).
- **Example env**: `SCRIPT_EXEC_TIMEOUT=30`
- **On error**: When a timeout occurs (only on platforms that support SIGALRM), the API returns an error corresponding to `ScriptTimeoutError`.

Summary:

| Environment variable   | Short description                   | Unix | Windows      |
| ---------------------- | ----------------------------------- | ---- | ------------ |
| `SCRIPT_EXTRA_MODULES` | Whitelist modules (comma-separated) | Yes  | Yes          |
| `SCRIPT_EXEC_TIMEOUT`  | Timeout (seconds), uses SIGALRM     | Yes  | No (ignored) |

## Debug Parameters in the UI

In the **Debug** tab of the API editor you can test the API with parameters. The **"Parameters (JSON)"** field accepts a JSON object containing all parameters.

### JSON format

**Important**: In debug mode there is **no distinction** between query, header, or body params. All parameters are merged into a single dict. You only need to enter the parameter name and its value.

### Basic example

```json
{
  "id": 123,
  "name": "test",
  "email": "user@example.com"
}
```

### Example with data types

```json
{
  "id": 123,
  "name": "John Doe",
  "age": 30,
  "is_active": true,
  "tags": ["admin", "user"],
  "metadata": {
    "department": "IT",
    "role": "developer"
  },
  "x_user_id": "user-123",
  "x_api_key": "secret-key"
}
```

### Practical examples

The following examples show how **Debug JSON**, **SQL templates**, and **Python scripts** work together when you test APIs from the UI.

#### Example 1: SQL with query parameters

**SQL Template:**

```sql
SELECT * FROM users
WHERE id = {{ id }}
{% if name %}
  AND name LIKE '%{{ name }}%'
{% endif %}
```

**Parameters JSON:**

```json
{
  "id": 123,
  "name": "John"
}
```

#### Example 2: SQL with header parameters

**SQL Template:**

```sql
SELECT * FROM users
WHERE user_id = '{{ x_user_id }}'
AND status = '{{ status }}'
```

**Parameters JSON:**

```json
{
  "x_user_id": "user-123",
  "status": "active"
}
```

#### Example 3: Python script with multiple parameters

**Python Script:**

```python
user_id = req.get('id')
name = req.get('name')
x_user_id = req.get('x_user_id')

query = "SELECT * FROM users WHERE 1=1"
params = []

if user_id:
    query += " AND id = %s"
    params.append(user_id)

if name:
    query += " AND name LIKE %s"
    params.append(f"%{name}%")

if x_user_id:
    query += " AND created_by = %s"
    params.append(x_user_id)

result = db.query(query, params)
```

**Parameters JSON:**

```json
{
  "id": 123,
  "name": "John",
  "x_user_id": "user-123"
}
```

#### Example 4: Array parameters

**SQL Template:**

```sql
SELECT * FROM users
WHERE id IN (
  {% for id in user_ids %}
    {{ id }}{% if not loop.last %},{% endif %}
  {% endfor %}
)
```

**Parameters JSON:**

```json
{
  "user_ids": [1, 2, 3, 4, 5]
}
```

#### Example 5: Nested object parameters

**Python Script:**

```python
filter_data = req.get('filter', {})
name = filter_data.get('name')
age_min = filter_data.get('age_min')
age_max = filter_data.get('age_max')

query = "SELECT * FROM users WHERE 1=1"
params = []

if name:
    query += " AND name LIKE %s"
    params.append(f"%{name}%")

if age_min:
    query += " AND age >= %s"
    params.append(age_min)

if age_max:
    query += " AND age <= %s"
    params.append(age_max)

result = db.query(query, params)
```

**Parameters JSON:**

```json
{
  "filter": {
    "name": "John",
    "age_min": 18,
    "age_max": 65
  }
}
```

### Debug notes

1. **All params are flat**: In debug mode you don't need to care about location (query/header/body). Just enter name and value.

2. **Parameter name**: Use the same name as defined in the "Basic Info" → "Parameters" tab. If a parameter has location="header" with name "X-User-Id", in debug you still use key `"X-User-Id"` or `"x_user_id"` (depending on how you defined it).

3. **Data types**:
   - Number: `123` or `123.45`
   - String: `"text"`
   - Boolean: `true` or `false`
   - Array: `[1, 2, 3]` or `["a", "b", "c"]`
   - Object: `{"key": "value"}`

4. **Null/Empty**: To omit a parameter, either omit it from the JSON or use `null`:

   ```json
   {
     "id": 123,
     "name": null
   }
   ```

5. **Validation**: Debug mode does not validate parameters against the definition. It passes them directly to the engine. To test validation, call the API via the gateway.

### Debug vs Gateway comparison

| Aspect            | Debug Mode       | Gateway (Real Request)                    |
| ----------------- | ---------------- | ----------------------------------------- |
| Params format     | Flat JSON object | Separated by location (query/header/body) |
| Validation        | Not validated    | Validated against params definition       |
| Path params       | Not available    | Yes (from URL path)                       |
| Header extraction | Manual in JSON   | Automatic from HTTP headers               |
| Query extraction  | Manual in JSON   | Automatic from query string               |
| Body extraction   | Manual in JSON   | Automatic from request body               |
