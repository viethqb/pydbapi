# Hướng dẫn sử dụng Parameters trong SQL và Script Engine

## Tổng quan

Parameters được định nghĩa trong API với 3 loại location:
- **query**: Tham số từ URL query string (ví dụ: `?id=123&name=test`)
- **header**: Tham số từ HTTP headers (ví dụ: `X-User-Id: 123`)
- **body**: Tham số từ request body (JSON hoặc form data)

## Cách Parameters được truyền vào Engine

### 1. SQL Engine (Jinja2 Template)

Parameters được merge vào một dict duy nhất và truyền vào Jinja2 template. Thứ tự ưu tiên: **path > query > body > header**

**Ví dụ SQL với parameters:**

```sql
-- Sử dụng query parameter
SELECT * FROM users WHERE id = {{ id }}

-- Sử dụng header parameter
SELECT * FROM users WHERE user_id = {{ x_user_id }}

-- Sử dụng body parameter
SELECT * FROM users WHERE name = '{{ name }}' AND email = '{{ email }}'

-- Conditional với parameter
{% if status %}
  AND status = '{{ status }}'
{% endif %}

-- Loop với parameter
SELECT * FROM users WHERE id IN (
  {% for id in user_ids %}
    {{ id }}{% if not loop.last %},{% endif %}
  {% endfor %}
)
```

### 2. Script Engine (Python)

Parameters được truyền vào script qua biến `req` (dictionary). Thứ tự ưu tiên: **path > query > body > header**

**Ví dụ Python Script với parameters:**

```python
# Lấy query parameter
user_id = req.get('id')
if user_id:
    users = db.query("SELECT * FROM users WHERE id = %s", [user_id])
else:
    users = db.query("SELECT * FROM users")

# Lấy header parameter
x_user_id = req.get('x_user_id')
if x_user_id:
    user = db.query_one("SELECT * FROM users WHERE id = %s", [x_user_id])

# Lấy body parameter
name = req.get('name')
email = req.get('email')
if name and email:
    db.execute(
        "INSERT INTO users (name, email) VALUES (%s, %s)",
        [name, email]
    )

# Lấy tất cả parameters
all_params = req  # dict chứa tất cả params

# Kiểm tra parameter có tồn tại
if 'status' in req:
    status = req['status']
    users = db.query("SELECT * FROM users WHERE status = %s", [status])

result = users
```

## Định nghĩa Parameters trong Frontend

Khi tạo/edit API, bạn có thể định nghĩa parameters với các thuộc tính:

- **Name**: Tên parameter (sẽ là key trong dict)
- **Location**: `query`, `header`, hoặc `body`
- **Data Type**: Kiểu dữ liệu (string, number, integer, boolean, array, object)
- **Required**: Parameter có bắt buộc không
- **Validate Type**: Loại validation (regex hoặc python)
- **Validate**: Giá trị validation

## Ví dụ thực tế

### Ví dụ 1: API GET với query và header params

**Parameters định nghĩa:**
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

### Ví dụ 2: API POST với body params

**Parameters định nghĩa:**
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

## Lưu ý quan trọng

1. **Header names**: Header names trong HTTP request thường là case-insensitive, nhưng khi extract vào params, tên sẽ giữ nguyên như định nghĩa trong params definition.

2. **Naming convention**: 
   - Query và body params có thể được convert từ camelCase sang snake_case nếu request có `?naming=snake` (default)
   - Path params không được convert
   - Header params không được convert

3. **Conflict resolution**: Nếu cùng một tên parameter xuất hiện ở nhiều location, thứ tự ưu tiên là: **path > query > body > header**

4. **Type conversion**: 
   - SQL engine: Bạn cần tự convert type trong Jinja2 template
   - Script engine: Python sẽ tự động convert type khi cần

5. **Validation**: Parameters được validate dựa trên definition (required, data_type, validate_type, validate) trước khi truyền vào engine.

## Debug Parameters trong UI

Trong tab **Debug** của API editor, bạn có thể test API với parameters. Field **"Parameters (JSON)"** nhận một JSON object chứa tất cả parameters.

### Format JSON

**Lưu ý quan trọng**: Trong debug mode, **KHÔNG có phân biệt** giữa query, header, hay body params. Tất cả parameters được merge vào một dict duy nhất. Bạn chỉ cần nhập tên parameter và giá trị của nó.

### Ví dụ cơ bản

```json
{
  "id": 123,
  "name": "test",
  "email": "user@example.com"
}
```

### Ví dụ với các kiểu dữ liệu

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

### Ví dụ thực tế

#### Ví dụ 1: SQL với query parameters

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

#### Ví dụ 2: SQL với header parameters

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

#### Ví dụ 3: Python Script với nhiều parameters

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

#### Ví dụ 4: Array parameters

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

#### Ví dụ 5: Nested object parameters

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

### Lưu ý khi debug

1. **Tất cả parameters là flat**: Trong debug mode, không cần quan tâm đến location (query/header/body). Chỉ cần nhập tên và giá trị.

2. **Tên parameter**: Sử dụng đúng tên như đã define trong tab "Basic Info" → "Parameters". Nếu parameter có location="header" với tên "X-User-Id", trong debug bạn vẫn dùng key `"X-User-Id"` hoặc `"x_user_id"` (tùy vào cách bạn define).

3. **Kiểu dữ liệu**: 
   - Số: `123` hoặc `123.45`
   - String: `"text"`
   - Boolean: `true` hoặc `false`
   - Array: `[1, 2, 3]` hoặc `["a", "b", "c"]`
   - Object: `{"key": "value"}`

4. **Null/Empty**: Để bỏ qua parameter, không cần include trong JSON hoặc dùng `null`:
   ```json
   {
     "id": 123,
     "name": null
   }
   ```

5. **Validation**: Debug mode không validate parameters theo definition. Nó chỉ truyền trực tiếp vào engine. Để test validation, bạn cần gọi API qua gateway.

### So sánh Debug vs Gateway

| Aspect | Debug Mode | Gateway (Real Request) |
|--------|-----------|------------------------|
| Params format | Flat JSON object | Separated by location (query/header/body) |
| Validation | Không validate | Validate theo params definition |
| Path params | Không có | Có (từ URL path) |
| Header extraction | Manual trong JSON | Tự động từ HTTP headers |
| Query extraction | Manual trong JSON | Tự động từ query string |
| Body extraction | Manual trong JSON | Tự động từ request body |
