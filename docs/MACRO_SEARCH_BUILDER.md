# Macro: `search_builder`

Reusable Python macro for building filter / sort / pagination search APIs on top of the pyDBAPI Script engine. Extracts all the boilerplate (whitelist, nested filter tree, cross-DB `ilike`, CTE wrapping, parameterized SQL) so each API is ~15 lines of config.

Portable across **PostgreSQL, MySQL, Trino, StarRocks** — `ilike` renders as `LOWER(col) LIKE LOWER(%s)` instead of Postgres-specific `ILIKE`.

---

## Contents

1. [Setup](#setup)
2. [Macro source](#macro-source)
3. [Minimal API (plain table)](#minimal-api-plain-table)
4. [Filter syntax — AND / OR examples](#filter-syntax--and--or-examples)
5. [Daily-partition API (`cte_from` + required `w_partition_date`)](#daily-partition-api-cte_from--required-w_partition_date)
6. [Complex source (`base_cte` — JOIN / aggregate)](#complex-source-base_cte--join--aggregate)
7. [Configuration reference](#configuration-reference)
8. [Behavior notes](#behavior-notes)
9. [Security model](#security-model)
10. [Test coverage](#test-coverage)
11. [Indexing tips](#indexing-tips)

---

## Setup

1. **API Dev → Macros → Create** → Type: **PYTHON** → Name: `search_builder`.
2. Paste the [macro source](#macro-source) below and **Publish**.
3. On each Script API that needs search, link the `search_builder` macro. The gateway prepends the macro to the API script so `search()` is in scope.

---

## Macro source

```python
# =============================================================================
# search_builder — reusable filter / sort / pagination helper
#
# Operators: eq, neq, gt, gte, lt, lte, like, ilike, in, is_null, is_not_null.
# `ilike` renders as LOWER(col) LIKE LOWER(%s) for cross-DB portability.
# =============================================================================

SB_OPERATORS = {
    'eq': '=', 'neq': '!=',
    'gt': '>', 'gte': '>=', 'lt': '<', 'lte': '<=',
    'like': 'LIKE', 'in': 'IN',
    'is_null': 'IS NULL', 'is_not_null': 'IS NOT NULL',
}
MAX_FILTER_DEPTH = 10
MAX_IN_VALUES = 1000


def sb_collect_filter_fields(node, out):
    if not isinstance(node, dict):
        return
    if 'field' in node:
        out.add(node['field'])
        return
    for c in node.get('conditions') or []:
        sb_collect_filter_fields(c, out)


def sb_build_condition(node, allowed, values, depth=1):
    if depth > MAX_FILTER_DEPTH:
        raise ValueError('filter depth > ' + str(MAX_FILTER_DEPTH))
    if not isinstance(node, dict):
        raise ValueError('filter node must be object')
    if 'field' in node:
        field = node['field']
        if field not in allowed:
            raise ValueError('field ' + repr(field) + ' not in allowed_fields')
        operator = node.get('operator', 'eq')
        if operator == 'ilike':
            values.append(node.get('value'))
            return 'LOWER(' + field + ') LIKE LOWER(%s)'
        op = SB_OPERATORS.get(operator)
        if not op:
            raise ValueError('unknown operator: ' + repr(operator))
        if operator in ('is_null', 'is_not_null'):
            return field + ' ' + op
        if operator == 'in':
            v = node.get('value')
            if not isinstance(v, list) or not v:
                raise ValueError("'in' on " + repr(field) + ' needs non-empty array')
            if len(v) > MAX_IN_VALUES:
                raise ValueError("'in' on " + repr(field) + ' exceeds ' + str(MAX_IN_VALUES))
            ph = ', '.join(['%s'] * len(v))
            values.extend(v)
            return field + ' IN (' + ph + ')'
        values.append(node.get('value'))
        return field + ' ' + op + ' %s'
    logic = str(node.get('logic', 'and')).upper()
    if logic not in ('AND', 'OR'):
        raise ValueError('unknown logic: ' + logic)
    conds = node.get('conditions') or []
    if not conds:
        raise ValueError('empty conditions')
    parts = [sb_build_condition(c, allowed, values, depth + 1) for c in conds]
    return '(' + (' ' + logic + ' ').join(parts) + ')'


def sb_resolve_select_columns(params, allowed_fields, allowed_set, default_columns):
    """Outer SELECT = default_columns (always) ∪ client.columns (if sent).

    When neither default_columns nor client.columns is provided, return the
    full allowed_fields list (never `SELECT *`).
    """
    out = []
    for c in (default_columns or []):
        if c in allowed_set and c not in out:
            out.append(c)
    cols_req = params.get('columns')
    if cols_req:
        for c in cols_req:
            if c in allowed_set and c not in out:
                out.append(c)
    elif not default_columns:
        for c in allowed_fields:
            if c not in out:
                out.append(c)
    return out


def sb_resolve_limit_offset(params, default_limit, max_limit):
    """Return {'limit': int, 'offset': int}. Dict avoids tuple unpacking at
    the call site — the pyDBAPI sandbox doesn't expose `_unpack_sequence_`.
    """
    if default_limit > max_limit:
        default_limit = max_limit
    if default_limit < 1:
        default_limit = 1
    raw_limit = params.get('limit')
    limit = int(raw_limit) if raw_limit is not None else default_limit
    if limit > max_limit:
        limit = max_limit
    if limit < 1:
        limit = 1
    raw_offset = params.get('offset')
    offset = int(raw_offset) if raw_offset is not None else 0
    if offset < 0:
        offset = 0
    return {'limit': limit, 'offset': offset}


def search(table, allowed_fields, params,
           default_sort=None, default_columns=None,
           default_limit=20, max_limit=100,
           required_filter_fields=None,
           base_cte=None, base_cte_values=None,
           cte_from=None, cte_where=None, cte_where_values=None):
    """Run nested filter + sort + pagination against `table`.

    Returns: {'data': [...], 'total': n, 'limit': l, 'offset': o}.

    Column resolution: `default_columns` are ALWAYS returned (if in allowed);
    the client's `columns` are appended (deduplicated). When neither is
    provided the macro falls back to every `allowed_fields` entry — no
    `SELECT *`, no columns outside the whitelist.

    CTE modes (mutually exclusive):
      * cte_from + cte_where : macro builds CTE with the minimal column list
                               (select ∪ filter fields ∪ sort field).
                               Use for single-table partition / pre-filter.
      * base_cte             : you provide the full source SELECT (JOIN,
                               aggregate, window, UNION, etc.). macro wraps
                               it as `WITH <table> AS (<base_cte>)`.
    """
    if required_filter_fields:
        bad = [c for c in required_filter_fields if c not in allowed_fields]
        if bad:
            raise ValueError(
                'required_filter_fields contain fields not in allowed_fields: '
                + repr(bad))
    if base_cte and cte_from:
        raise ValueError('cannot set both base_cte and cte_from')
    if cte_from and not cte_where:
        raise ValueError('cte_from requires cte_where')
    if cte_where and not cte_from:
        raise ValueError('cte_where requires cte_from')

    allowed_set = set(allowed_fields)
    params = params or {}
    values = []

    # --- WHERE ---
    f = params.get('filter')
    if required_filter_fields:
        present = set()
        if f:
            sb_collect_filter_fields(f, present)
        missing = [c for c in required_filter_fields if c not in present]
        if missing:
            raise ValueError(
                'filter must include these fields: ' + ', '.join(missing))
    where = ''
    if f:
        where = 'WHERE ' + sb_build_condition(f, allowed_set, values)

    # --- ORDER BY ---
    order = ''
    sort_field_used = None
    s = params.get('sort') or default_sort
    if s:
        sf = s.get('field')
        so = str(s.get('order', 'asc')).upper()
        if sf in allowed_set and so in ('ASC', 'DESC'):
            order = 'ORDER BY ' + sf + ' ' + so
            sort_field_used = sf

    # --- SELECT (outer) ---
    select_cols = sb_resolve_select_columns(
        params, allowed_fields, allowed_set, default_columns)
    select = ', '.join(select_cols) if select_cols else '*'

    # --- LIMIT / OFFSET ---
    lo = sb_resolve_limit_offset(params, default_limit, max_limit)
    limit = lo['limit']
    offset = lo['offset']

    # --- Auto-build CTE with minimal column list ---
    if cte_from:
        needed = set(select_cols)
        if f:
            ff = set()
            sb_collect_filter_fields(f, ff)
            needed.update(c for c in ff if c in allowed_set)
        if sort_field_used:
            needed.add(sort_field_used)
        cte_cols = [c for c in allowed_fields if c in needed]
        base_cte = (
            'SELECT ' + ', '.join(cte_cols) + ' '
            'FROM ' + cte_from + ' '
            'WHERE ' + cte_where)
        base_cte_values = cte_where_values

    if base_cte:
        prefix = 'WITH ' + table + ' AS (' + base_cte + ') '
        base_values = list(base_cte_values or [])
    else:
        prefix = ''
        base_values = []

    sql = (prefix +
           'SELECT ' + select + ' FROM ' + table + ' ' +
           where + ' ' + order + ' LIMIT %s OFFSET %s')
    count_sql = (prefix +
                 'SELECT COUNT(*) AS total FROM ' + table + ' ' + where)

    rows = db.query(sql, base_values + values + [limit, offset])
    count = db.query(count_sql, base_values + list(values))
    total = count[0]['total'] if count else 0

    return {'data': rows, 'total': total, 'limit': limit, 'offset': offset}
```

---

## Minimal API (plain table)

**Path:** `contacts/search` | **Method:** POST | **Engine:** SCRIPT

```python
def execute(params=None):
    return search(
        table='contacts',
        allowed_fields=['id', 'name', 'age', 'city', 'email', 'created_at'],
        default_sort={'field': 'created_at', 'order': 'desc'},
        default_columns=['id', 'name', 'email'],
        max_limit=200,
        params=params,
    )
```

**Request:**

```bash
curl -X POST http://localhost/api/contacts/search \
  -H "Content-Type: application/json" \
  -d '{
    "filter": {"field": "name", "operator": "ilike", "value": "john%"},
    "limit": 10
  }'
```

**Rendered SQL:**

```sql
SELECT id, name, email FROM contacts
WHERE LOWER(name) LIKE LOWER(%s)
ORDER BY created_at DESC
LIMIT %s OFFSET %s
-- values: ['john%', 10, 0]
```

---

## Filter syntax — AND / OR examples

The `filter` body is a **tree** made of two node types:

- **Leaf** — a single comparison: `{"field": "...", "operator": "...", "value": ...}`
- **Group** — combines children: `{"logic": "and" | "or", "conditions": [<node>, <node>, ...]}`

Groups can be nested to any depth ≤ 10. All examples below assume:

```python
allowed_fields = ['id', 'name', 'age', 'city', 'email', 'status', 'created_at']
```

### 1. Single condition (no group needed)

```json
{
  "filter": { "field": "status", "operator": "eq", "value": "active" }
}
```

```sql
WHERE status = %s
-- values: ['active']
```

### 2. Flat AND — all conditions must match

```json
{
  "filter": {
    "logic": "and",
    "conditions": [
      { "field": "status", "operator": "eq",  "value": "active" },
      { "field": "age",    "operator": "gte", "value": 18 },
      { "field": "city",   "operator": "eq",  "value": "Hanoi" }
    ]
  }
}
```

```sql
WHERE (status = %s AND age >= %s AND city = %s)
-- values: ['active', 18, 'Hanoi']
```

### 3. Flat OR — any condition matches

```json
{
  "filter": {
    "logic": "or",
    "conditions": [
      { "field": "city", "operator": "eq", "value": "Hanoi" },
      { "field": "city", "operator": "eq", "value": "Ho Chi Minh" },
      { "field": "city", "operator": "eq", "value": "Da Nang" }
    ]
  }
}
```

```sql
WHERE (city = %s OR city = %s OR city = %s)
-- values: ['Hanoi', 'Ho Chi Minh', 'Da Nang']
```

Same result with the `in` operator (more compact):

```json
{
  "filter": {
    "field": "city",
    "operator": "in",
    "value": ["Hanoi", "Ho Chi Minh", "Da Nang"]
  }
}
```

```sql
WHERE city IN (%s, %s, %s)
```

### 4. Mixed — AND of (something) AND (OR group)

"Active users in one of 3 cities, age ≥ 18":

```json
{
  "filter": {
    "logic": "and",
    "conditions": [
      { "field": "status", "operator": "eq",  "value": "active" },
      { "field": "age",    "operator": "gte", "value": 18 },
      {
        "logic": "or",
        "conditions": [
          { "field": "city", "operator": "eq", "value": "Hanoi" },
          { "field": "city", "operator": "eq", "value": "Ho Chi Minh" },
          { "field": "city", "operator": "eq", "value": "Da Nang" }
        ]
      }
    ]
  }
}
```

```sql
WHERE (
  status = %s
  AND age >= %s
  AND (city = %s OR city = %s OR city = %s)
)
-- values: ['active', 18, 'Hanoi', 'Ho Chi Minh', 'Da Nang']
```

### 5. OR of two AND groups — "either ... or ..."

"VIP Hanoi users, or anyone older than 60":

```json
{
  "filter": {
    "logic": "or",
    "conditions": [
      {
        "logic": "and",
        "conditions": [
          { "field": "city",   "operator": "eq", "value": "Hanoi" },
          { "field": "status", "operator": "eq", "value": "vip" }
        ]
      },
      { "field": "age", "operator": "gt", "value": 60 }
    ]
  }
}
```

```sql
WHERE ((city = %s AND status = %s) OR age > %s)
-- values: ['Hanoi', 'vip', 60]
```

### 6. Search + range + null check — combined

"Active users whose name starts with J, created in 2026, with an email":

```json
{
  "filter": {
    "logic": "and",
    "conditions": [
      { "field": "status",     "operator": "eq",     "value": "active" },
      { "field": "name",       "operator": "ilike",  "value": "J%" },
      { "field": "created_at", "operator": "gte",    "value": "2026-01-01" },
      { "field": "created_at", "operator": "lt",     "value": "2027-01-01" },
      { "field": "email",      "operator": "is_not_null" }
    ]
  }
}
```

```sql
WHERE (
  status = %s
  AND LOWER(name) LIKE LOWER(%s)
  AND created_at >= %s
  AND created_at < %s
  AND email IS NOT NULL
)
-- values: ['active', 'J%', '2026-01-01', '2027-01-01']
```

### 7. De Morgan — expressing NOT via OR

The macro has no `not` group node. To express negation, rewrite with de Morgan's laws or use `neq`:

```text
NOT (status = 'banned' AND city = 'Hanoi')
  ≡ status != 'banned' OR city != 'Hanoi'
```

```json
{
  "filter": {
    "logic": "or",
    "conditions": [
      { "field": "status", "operator": "neq", "value": "banned" },
      { "field": "city",   "operator": "neq", "value": "Hanoi" }
    ]
  }
}
```

### Node reference

| Field | Type | Required? | Notes |
|---|---|---|---|
| **Leaf** | | | |
| `field` | string | ✅ | Must be in `allowed_fields` |
| `operator` | string | default `eq` | See operator table |
| `value` | any | depends on operator | Scalar for `eq/neq/gt/.../like/ilike`; array for `in`; omitted for `is_null` / `is_not_null` |
| **Group** | | | |
| `logic` | `"and"` \| `"or"` | default `and` | Case-insensitive |
| `conditions` | array | ✅ | Non-empty; each element is a leaf or group |

Unknown fields, unsupported operators, empty conditions, or recursion deeper than 10 all raise `ValueError` → gateway returns 400.

---

## Daily-partition API (`cte_from` + required `w_partition_date`)

Pattern: table has one partition per day. Client **must** send `w_partition_date`. Macro wraps the source in a CTE that only scans the requested partition — and only the columns the outer query actually uses.

### 1. Parameters

| Name | Location | Type | Required | Default |
|------|----------|------|----------|---------|
| `w_partition_date` | body | string | ✅ | — |
| `filter` | body | object | no | — |
| `sort` | body | object | no | — |
| `columns` | body | array | no | — |
| `offset` | body | integer | no | 0 |
| `limit` | body | integer | no | 50 |

### 2. Param validate — `w_partition_date`

```python
# No imports — RestrictedPython sandbox doesn't allow `import`.
# No tuple unpacking either — the sandbox doesn't expose `_unpack_sequence_`.
def validate(value, params=None):
    if not isinstance(value, str):
        return False
    # Length and separator positions
    if len(value) != 10 or value[4] != '-' or value[7] != '-':
        return False
    y = value[:4]
    m = value[5:7]
    d = value[8:10]
    if not (y.isdigit() and m.isdigit() and d.isdigit()):
        return False
    yi = int(y)
    mi = int(m)
    di = int(d)
    return 1900 <= yi <= 2100 and 1 <= mi <= 12 and 1 <= di <= 31
```

Message when fail: `w_partition_date phải có định dạng YYYY-MM-DD (vd: 2026-04-15)`.

### 3. API content

```python
METRICS_TABLE = 'daily_metrics'
ALLOWED_FIELDS = [
    'id', 'customer_id', 'channel', 'region',
    'revenue', 'orders', 'created_at',
]


def execute(params=None):
    pd_value = (params or {}).get('w_partition_date')

    result = search(
        table='tmp',
        allowed_fields=ALLOWED_FIELDS,
        params=params,
        cte_from=METRICS_TABLE,
        cte_where='w_partition_date = %s',
        cte_where_values=[pd_value],
        # default_columns are always returned + merged with client's `columns`
        default_columns=['id', 'customer_id', 'channel', 'revenue', 'orders'],
        default_sort={'field': 'revenue', 'order': 'desc'},
        default_limit=50,
        max_limit=500,
    )
    result['w_partition_date'] = pd_value
    return result
```

### 4. Request → SQL

```bash
curl -X POST http://localhost/api/daily_metrics/search \
  -H "Content-Type: application/json" \
  -d '{
    "w_partition_date": "2026-04-14",
    "columns": ["region"],
    "filter": {"field": "revenue", "operator": "gt", "value": 1000}
  }'
```

Macro picks the minimal CTE column list = `select ∪ filter fields ∪ sort field`:

```sql
-- data query
WITH tmp AS (
  SELECT id, customer_id, channel, region, revenue, orders    -- default + client + filter + sort
  FROM daily_metrics
  WHERE w_partition_date = %s                                  -- '2026-04-14'
)
SELECT id, customer_id, channel, revenue, orders, region FROM tmp   -- default + client.columns
WHERE revenue > %s                                             -- 1000
ORDER BY revenue DESC                                          -- from default_sort
LIMIT %s OFFSET %s                                             -- 50, 0

-- count query (shares CTE, no LIMIT/OFFSET)
WITH tmp AS (
  SELECT id, customer_id, channel, region, revenue, orders
  FROM daily_metrics
  WHERE w_partition_date = %s
)
SELECT COUNT(*) AS total FROM tmp WHERE revenue > %s
```

Note `created_at` is not in the CTE — it isn't in `default_columns`, client didn't request it, and no filter/sort references it.

### 5. Response

```json
{
  "success": true,
  "message": null,
  "data": [
    {
      "id": 1,
      "customer_id": 42,
      "channel": "web",
      "revenue": 12500,
      "orders": 8,
      "region": "VN"
    }
  ],
  "total": 87,
  "limit": 50,
  "offset": 0,
  "w_partition_date": "2026-04-14"
}
```

---

## Complex source (`base_cte` — JOIN / aggregate)

When the source needs JOIN, aggregate, window functions, or UNION — write the source SELECT yourself and pass it as `base_cte`. Macro wraps it in `WITH <table> AS (...)` and applies the user filter on top.

```python
def execute(params=None):
    base = (
        'SELECT o.id, o.total, c.name AS customer_name, c.tier '
        'FROM orders o '
        'JOIN customers c ON c.id = o.customer_id '
        'WHERE o.status IN (%s, %s)'
    )
    return search(
        table='tmp',
        allowed_fields=['id', 'total', 'customer_name', 'tier'],
        params=params,
        base_cte=base,
        base_cte_values=['paid', 'shipped'],
        default_sort={'field': 'total', 'order': 'desc'},
        max_limit=200,
    )
```

Rendered SQL wraps your source and applies the user's filter on `tmp`:

```sql
WITH tmp AS (SELECT o.id, o.total, c.name AS customer_name, c.tier
             FROM orders o JOIN customers c ON c.id = o.customer_id
             WHERE o.status IN (%s, %s))
SELECT * FROM tmp WHERE tier = %s ORDER BY total DESC LIMIT %s OFFSET %s
-- values: ['paid', 'shipped', 'gold', 20, 0]
```

Note that with `base_cte` macro does **not** narrow the CTE column list — you control the source SELECT fully.

---

## Configuration reference

```python
search(
    table,                          # CTE alias (when cte_from / base_cte set) or physical table
    allowed_fields,                 # list[str] — whitelist for filter / sort / columns
    params,                         # request dict
    # Output shaping
    default_sort=None,              # {field, order} applied when `sort` omitted
    default_columns=None,           # ALWAYS returned; merged with client's `columns` (deduped)
    # Pagination
    default_limit=20,               # applied when `limit` missing/None
    max_limit=100,                  # hard cap on limit (also clamps default_limit)
    # Filter enforcement
    required_filter_fields=None,    # list of fields that MUST appear in the filter
    # Source — pick ONE of these two modes
    base_cte=None,                  # full source SELECT (JOIN / aggregate / etc.)
    base_cte_values=None,           # values bound to %s placeholders in base_cte
    cte_from=None,                  # source table for auto-built CTE
    cte_where=None,                 # WHERE predicate body (can have %s)
    cte_where_values=None,          # values for cte_where placeholders
)
```

### CTE mode decision matrix

| Need | Mode |
|---|---|
| Plain table, no wrapper | Neither — just set `table` |
| Partition / pre-filter on one source table with minimal column scan | `cte_from` + `cte_where` |
| JOIN, GROUP BY, window function, UNION | `base_cte` |

### Column resolution (outer SELECT)

```
default_columns                         ← always returned
  ∪
request.columns                         ← merged when client sends them
```

If **neither** `default_columns` **nor** `request.columns` is provided, the macro uses the full `allowed_fields` list — no `SELECT *`, no columns outside the whitelist.

Order: `default_columns` first (in given order), then the client's extra columns (in their given order), deduplicated. Any entry not in `allowed_fields` is silently dropped.

**Examples** with `allowed_fields=[id, name, email, phone]` and `default_columns=[id, name]`:

| Client `columns` | Outer SELECT |
|---|---|
| omitted | `id, name` |
| `[]` | `id, name` |
| `[phone]` | `id, name, phone` |
| `[id, phone]` | `id, name, phone` (no duplicate `id`) |
| `[phone, evil]` | `id, name, phone` (evil dropped) |

### CTE column resolution (`cte_from` mode)

```
SELECT columns of outer query           ← pinned + user cols
  ∪
filter fields (any leaf in filter tree) ← so WHERE can reference them
  ∪
sort field                              ← so ORDER BY can reference it
```

Result is ordered per `allowed_fields` for stable SQL. Columns not needed by the outer query aren't scanned — material for columnar stores (StarRocks, Trino on Parquet).

---

## Behavior notes

### Precedence of `limit`

| Request sends | Effective limit |
|---|---|
| `limit: 10` | `min(10, max_limit)` |
| `limit: 99999` | `max_limit` |
| `limit: 0` | `1` (clamped — zero is meaningless) |
| `limit: null` / omitted | `min(default_limit, max_limit)` |

### `required_filter_fields`

Ensures every listed field appears as a leaf somewhere in the filter tree. Presence-only — if the required field sits under `OR` it may not logically scope the query. For strict tenant isolation inject the scope server-side via `cte_from`/`cte_where` (partition-style) rather than relying on client cooperation.

### Operators

| Operator | SQL | Value |
|---|---|---|
| `eq` | `=` | yes |
| `neq` | `!=` | yes |
| `gt` | `>` | yes |
| `gte` | `>=` | yes |
| `lt` | `<` | yes |
| `lte` | `<=` | yes |
| `like` | `LIKE` | yes |
| `ilike` | `LOWER(col) LIKE LOWER(%s)` | yes |
| `in` | `IN (...)` | array |
| `is_null` | `IS NULL` | — |
| `is_not_null` | `IS NOT NULL` | — |

---

## Security model

- **Field whitelist**: `filter.field`, `sort.field`, `columns[]` entries not in `allowed_fields` are rejected (raise → 400) or silently dropped (`columns`, `sort`). Identifiers never reach the SQL string without passing this check.
- **No `SELECT *`**: when client omits both `columns` and `default_columns`, macro uses the full `allowed_fields` list — sensitive columns not in the whitelist are never exposed.
- **Values always parameterized** via driver `%s` placeholders. No string interpolation of user values anywhere.
- **Filter recursion capped** at `MAX_FILTER_DEPTH = 10`.
- **`IN` list capped** at `MAX_IN_VALUES = 1000`.
- **`limit` clamped** to `max_limit`; `limit < 1 → 1`; `offset < 0 → 0`.
- `cte_where` is **identifier-level trusted** (author writes the WHERE template); values go through `cte_where_values`. Never interpolate user input into `cte_where` itself.

---

## Test coverage

Validated with a standalone harness (`exec()` of the macro source with a mocked `db.query`). **23 / 23 checks pass.**

```text
[PASS] D1  default + client columns (union)
[PASS] D2  dedup when client overlaps default
[PASS] D3  no client columns → default only
[PASS] D4  no default, client filtered
[PASS] D5  no default, no client → all allowed
[PASS] D6  non-allowed default silently dropped
[PASS] D7  explicit ordering preserved
[PASS] T1  CTE narrow: default + client + filter + sort
[PASS] T1  outer SELECT: default + client
[PASS] T1  params ok
[PASS] S1  whitelist reject
[PASS] O1  ilike portable
[PASS] O2  nested AND
[PASS] O3  IN expansion
[PASS] L1  limit clamped
[PASS] L2  limit 0 → 1
[PASS] R1  required missing
[PASS] B1  static base_cte
[PASS] X1  mutually exclusive base_cte / cte_from
[PASS] K1  count uses narrow CTE
[PASS] K1  count no LIMIT/OFFSET
[PASS] K1  count params: cte + filter only
[PASS] P0  pinned_columns kwarg removed
```

### Coverage matrix

| Area | Tests |
|---|---|
| `default_columns` always returned; union with client; dedup; whitelist-drop; ordering | D1–D7 |
| `cte_from` auto-build: CTE narrow to `select ∪ filter fields ∪ sort`; outer SELECT independent | T1 |
| Whitelist field rejection (identifier safety) | S1 |
| `required_filter_fields` presence check | R1 |
| Operators: `ilike` cross-DB, nested AND/OR, `IN` expansion | O1–O3 |
| Limit clamp (upper cap, zero → 1) | L1, L2 |
| `base_cte` manual wrapping + value ordering | B1 |
| Mutual exclusion of CTE modes | X1 |
| Count query: narrowed CTE, no LIMIT/OFFSET | K1 |
| Obsolete `pinned_columns` kwarg rejected | P0 |

---

## Indexing tips

Because `ilike` uses `LOWER(col)`, a plain B-tree index on `col` is unused.

### PostgreSQL
```sql
-- Prefix / equality
CREATE INDEX idx_users_name_lower ON users (LOWER(name));

-- Substring via trigram
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_users_name_trgm ON users USING gin (LOWER(name) gin_trgm_ops);
```

### MySQL ≥ 8.0.13
```sql
ALTER TABLE users ADD INDEX idx_name_lower ((LOWER(name)));
```

### Trino / StarRocks
Functional / expression indexes on `LOWER(col)` aren't widely supported. For large tables:
- Store a denormalized `name_lower` column, filter on that.
- Or partition by a narrowing column first and let the engine skip non-matching partitions.

For tables under ~100k rows (OLTP) or ~10M rows (OLAP), the full scan under `LOWER(col) LIKE LOWER(?)` is usually fine. Measure before optimizing.
