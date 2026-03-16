"""Tests for the Search Contacts script (nested filter / sort / pagination)."""

import uuid
from unittest.mock import MagicMock

from app.engines.script import ScriptContext, ScriptExecutor
from app.models_dbapi import DataSource, ProductTypeEnum


def _make_datasource() -> DataSource:
    return DataSource(
        id=uuid.uuid4(),
        name="test",
        product_type=ProductTypeEnum.POSTGRES,
        host="localhost",
        port=5432,
        database="db",
        username="u",
        password="p",
    )


class MockPool:
    def get_connection(self, ds: DataSource) -> MagicMock:
        raise RuntimeError("no real DB in test")

    def release(self, conn: object, datasource_id: uuid.UUID) -> None:
        pass


# ---------------------------------------------------------------------------
# The script content extracted from seed_examples (kept in sync).
# ---------------------------------------------------------------------------

_SCRIPT_BODY = (
    "ALLOWED_FIELDS = {'name', 'age', 'city', 'email', 'status', 'created_at'}\n"
    "OPERATORS = {\n"
    "    'eq': '=', 'neq': '!=',\n"
    "    'gt': '>', 'gte': '>=',\n"
    "    'lt': '<', 'lte': '<=',\n"
    "    'like': 'LIKE',\n"
    "    'in': 'IN',\n"
    "    'is_null': 'IS NULL', 'is_not_null': 'IS NOT NULL',\n"
    "}\n"
)

# PostgreSQL variant: ILIKE supported natively
_SCRIPT_PG = (
    _SCRIPT_BODY
    + "OPERATORS['ilike'] = 'ILIKE'\n"
    "\n"
    "def execute(params=None):\n"
    "    if not params:\n"
    "        params = {}\n"
    "    values = []\n"
    "\n"
    "    def build_condition(node):\n"
    "        if 'field' in node:\n"
    "            field = node['field']\n"
    "            operator = node.get('operator', 'eq')\n"
    "            value = node.get('value')\n"
    "            if field not in ALLOWED_FIELDS:\n"
    "                return 'TRUE'\n"
    "            op = OPERATORS.get(operator)\n"
    "            if not op:\n"
    "                return 'TRUE'\n"
    "            if operator in ('is_null', 'is_not_null'):\n"
    "                return field + ' ' + op\n"
    "            if operator == 'in':\n"
    "                if not isinstance(value, list) or len(value) == 0:\n"
    "                    return 'FALSE'\n"
    "                placeholders = ', '.join(['%s'] * len(value))\n"
    "                for v in value:\n"
    "                    values.append(v)\n"
    "                return field + ' IN (' + placeholders + ')'\n"
    "            values.append(value)\n"
    "            return field + ' ' + op + ' %s'\n"
    "        logic = node.get('logic', 'and').upper()\n"
    "        if logic not in ('AND', 'OR'):\n"
    "            logic = 'AND'\n"
    "        conditions = node.get('conditions', [])\n"
    "        if not conditions:\n"
    "            return 'TRUE'\n"
    "        parts = []\n"
    "        for cond in conditions:\n"
    "            parts.append(build_condition(cond))\n"
    "        return '(' + (' ' + logic + ' ').join(parts) + ')'\n"
    "\n"
    "    filter_obj = params.get('filter')\n"
    "    where_clause = ''\n"
    "    if filter_obj:\n"
    "        where_clause = 'WHERE ' + build_condition(filter_obj)\n"
    "\n"
    "    sort_obj = params.get('sort')\n"
    "    order_clause = ''\n"
    "    if sort_obj:\n"
    "        sort_field = sort_obj.get('field', 'id')\n"
    "        sort_order = sort_obj.get('order', 'asc').upper()\n"
    "        if sort_field in ALLOWED_FIELDS and sort_order in ('ASC', 'DESC'):\n"
    "            order_clause = 'ORDER BY ' + sort_field + ' ' + sort_order\n"
    "\n"
    "    limit = params.get('limit', 20)\n"
    "    if limit > 100:\n"
    "        limit = 100\n"
    "    offset = params.get('offset', 0)\n"
    "\n"
    "    sql = 'SELECT * FROM contacts ' + where_clause + ' ' + order_clause + ' LIMIT %s OFFSET %s'\n"
    "    values.append(limit)\n"
    "    values.append(offset)\n"
    "\n"
    "    count_sql = 'SELECT COUNT(*) AS total FROM contacts ' + where_clause\n"
    "    count_values = list(values[:-2])\n"
    "\n"
    "    rows = db.query(sql, values)\n"
    "    count_result = db.query(count_sql, count_values)\n"
    "    total = count_result[0]['total'] if count_result else 0\n"
    "\n"
    "    return {\n"
    "        'data': rows,\n"
    "        'total': total,\n"
    "        'limit': limit,\n"
    "        'offset': offset,\n"
    "    }"
)

# StarRocks variant: ilike → LOWER(field) LIKE LOWER(%s)
_SCRIPT_SR = (
    _SCRIPT_BODY
    + "\n"
    "def execute(params=None):\n"
    "    if not params:\n"
    "        params = {}\n"
    "    values = []\n"
    "\n"
    "    def build_condition(node):\n"
    "        if 'field' in node:\n"
    "            field = node['field']\n"
    "            operator = node.get('operator', 'eq')\n"
    "            value = node.get('value')\n"
    "            if field not in ALLOWED_FIELDS:\n"
    "                return 'TRUE'\n"
    "            if operator == 'ilike':\n"
    "                values.append(value)\n"
    "                return 'LOWER(' + field + ') LIKE LOWER(%s)'\n"
    "            op = OPERATORS.get(operator)\n"
    "            if not op:\n"
    "                return 'TRUE'\n"
    "            if operator in ('is_null', 'is_not_null'):\n"
    "                return field + ' ' + op\n"
    "            if operator == 'in':\n"
    "                if not isinstance(value, list) or len(value) == 0:\n"
    "                    return 'FALSE'\n"
    "                placeholders = ', '.join(['%s'] * len(value))\n"
    "                for v in value:\n"
    "                    values.append(v)\n"
    "                return field + ' IN (' + placeholders + ')'\n"
    "            values.append(value)\n"
    "            return field + ' ' + op + ' %s'\n"
    "        logic = node.get('logic', 'and').upper()\n"
    "        if logic not in ('AND', 'OR'):\n"
    "            logic = 'AND'\n"
    "        conditions = node.get('conditions', [])\n"
    "        if not conditions:\n"
    "            return 'TRUE'\n"
    "        parts = []\n"
    "        for cond in conditions:\n"
    "            parts.append(build_condition(cond))\n"
    "        return '(' + (' ' + logic + ' ').join(parts) + ')'\n"
    "\n"
    "    filter_obj = params.get('filter')\n"
    "    where_clause = ''\n"
    "    if filter_obj:\n"
    "        where_clause = 'WHERE ' + build_condition(filter_obj)\n"
    "\n"
    "    sort_obj = params.get('sort')\n"
    "    order_clause = ''\n"
    "    if sort_obj:\n"
    "        sort_field = sort_obj.get('field', 'id')\n"
    "        sort_order = sort_obj.get('order', 'asc').upper()\n"
    "        if sort_field in ALLOWED_FIELDS and sort_order in ('ASC', 'DESC'):\n"
    "            order_clause = 'ORDER BY ' + sort_field + ' ' + sort_order\n"
    "\n"
    "    limit = params.get('limit', 20)\n"
    "    if limit > 100:\n"
    "        limit = 100\n"
    "    offset = params.get('offset', 0)\n"
    "\n"
    "    sql = 'SELECT * FROM contacts ' + where_clause + ' ' + order_clause + ' LIMIT %s OFFSET %s'\n"
    "    values.append(limit)\n"
    "    values.append(offset)\n"
    "\n"
    "    count_sql = 'SELECT COUNT(*) AS total FROM contacts ' + where_clause\n"
    "    count_values = list(values[:-2])\n"
    "\n"
    "    rows = db.query(sql, values)\n"
    "    count_result = db.query(count_sql, count_values)\n"
    "    total = count_result[0]['total'] if count_result else 0\n"
    "\n"
    "    return {\n"
    "        'data': rows,\n"
    "        'total': total,\n"
    "        'limit': limit,\n"
    "        'offset': offset,\n"
    "    }"
)


def _run_script(params: dict, script: str = _SCRIPT_PG) -> dict:
    """Execute the search contacts script with a mocked db.query."""
    ctx = ScriptContext(
        datasource=_make_datasource(),
        req=params,
        pool_manager=MockPool(),
    )

    # Intercept db.query calls to capture generated SQL and values
    calls: list[tuple] = []
    original_to_dict = ctx.to_dict

    def patched_to_dict():
        d = original_to_dict()

        class FakeDb:
            def query(self, sql, values=None):
                calls.append((sql, values))
                # First call = data query, second = count query
                if "COUNT" in sql:
                    return [{"total": 42}]
                return [{"id": 1, "name": "John"}]

        d["db"] = FakeDb()
        return d

    ctx.to_dict = patched_to_dict
    result = ScriptExecutor().execute(script, ctx)
    return {"result": result, "calls": calls}


class TestSearchContactsNoFilter:
    def test_no_params_returns_all(self) -> None:
        out = _run_script({})
        result = out["result"]
        assert result["limit"] == 20
        assert result["offset"] == 0
        assert result["total"] == 42

        data_sql, data_vals = out["calls"][0]
        assert "WHERE" not in data_sql
        assert "LIMIT %s OFFSET %s" in data_sql
        assert data_vals == [20, 0]

    def test_custom_limit_offset(self) -> None:
        out = _run_script({"limit": 5, "offset": 10})
        result = out["result"]
        assert result["limit"] == 5
        assert result["offset"] == 10

        _, data_vals = out["calls"][0]
        assert data_vals == [5, 10]

    def test_limit_capped_at_100(self) -> None:
        out = _run_script({"limit": 500})
        assert out["result"]["limit"] == 100


class TestSearchContactsSimpleFilter:
    def test_eq_condition(self) -> None:
        out = _run_script({
            "filter": {"field": "name", "operator": "eq", "value": "John"},
        })
        data_sql, data_vals = out["calls"][0]
        assert "WHERE name = %s" in data_sql
        assert data_vals == ["John", 20, 0]

    def test_gt_condition(self) -> None:
        out = _run_script({
            "filter": {"field": "age", "operator": "gt", "value": 25},
        })
        data_sql, data_vals = out["calls"][0]
        assert "WHERE age > %s" in data_sql
        assert data_vals == [25, 20, 0]

    def test_disallowed_field_ignored(self) -> None:
        out = _run_script({
            "filter": {"field": "password", "operator": "eq", "value": "secret"},
        })
        data_sql, _ = out["calls"][0]
        assert "WHERE TRUE" in data_sql

    def test_is_null_operator(self) -> None:
        out = _run_script({
            "filter": {"field": "email", "operator": "is_null"},
        })
        data_sql, data_vals = out["calls"][0]
        assert "WHERE email IS NULL" in data_sql
        # No value appended for IS NULL
        assert data_vals == [20, 0]

    def test_in_operator(self) -> None:
        out = _run_script({
            "filter": {"field": "city", "operator": "in", "value": ["New York", "Chicago"]},
        })
        data_sql, data_vals = out["calls"][0]
        assert "WHERE city IN (%s, %s)" in data_sql
        assert data_vals == ["New York", "Chicago", 20, 0]

    def test_in_empty_list_returns_false(self) -> None:
        out = _run_script({
            "filter": {"field": "city", "operator": "in", "value": []},
        })
        data_sql, _ = out["calls"][0]
        assert "WHERE FALSE" in data_sql


class TestSearchContactsNestedFilter:
    def test_and_logic(self) -> None:
        out = _run_script({
            "filter": {
                "logic": "and",
                "conditions": [
                    {"field": "name", "operator": "eq", "value": "John"},
                    {"field": "age", "operator": "gt", "value": 25},
                ],
            },
        })
        data_sql, data_vals = out["calls"][0]
        assert "WHERE (name = %s AND age > %s)" in data_sql
        assert data_vals == ["John", 25, 20, 0]

    def test_or_logic(self) -> None:
        out = _run_script({
            "filter": {
                "logic": "or",
                "conditions": [
                    {"field": "city", "operator": "eq", "value": "New York"},
                    {"field": "city", "operator": "eq", "value": "Chicago"},
                ],
            },
        })
        data_sql, data_vals = out["calls"][0]
        assert "WHERE (city = %s OR city = %s)" in data_sql
        assert data_vals == ["New York", "Chicago", 20, 0]

    def test_deeply_nested_filter(self) -> None:
        """The full example from the user's request."""
        out = _run_script({
            "filter": {
                "logic": "and",
                "conditions": [
                    {"field": "name", "operator": "eq", "value": "John"},
                    {
                        "logic": "or",
                        "conditions": [
                            {"field": "age", "operator": "gt", "value": 25},
                            {"field": "city", "operator": "eq", "value": "New York"},
                        ],
                    },
                ],
            },
            "sort": {"field": "created_at", "order": "desc"},
            "offset": 1,
            "limit": 20,
        })
        data_sql, data_vals = out["calls"][0]
        assert "WHERE (name = %s AND (age > %s OR city = %s))" in data_sql
        assert "ORDER BY created_at DESC" in data_sql
        assert data_vals == ["John", 25, "New York", 20, 1]

        # Count query uses same WHERE but no ORDER/LIMIT
        count_sql, count_vals = out["calls"][1]
        assert "COUNT(*)" in count_sql
        assert "WHERE (name = %s AND (age > %s OR city = %s))" in count_sql
        assert count_vals == ["John", 25, "New York"]


class TestSearchContactsSort:
    def test_sort_asc(self) -> None:
        out = _run_script({"sort": {"field": "name", "order": "asc"}})
        data_sql, _ = out["calls"][0]
        assert "ORDER BY name ASC" in data_sql

    def test_sort_desc(self) -> None:
        out = _run_script({"sort": {"field": "age", "order": "desc"}})
        data_sql, _ = out["calls"][0]
        assert "ORDER BY age DESC" in data_sql

    def test_invalid_sort_field_ignored(self) -> None:
        out = _run_script({"sort": {"field": "DROP TABLE", "order": "desc"}})
        data_sql, _ = out["calls"][0]
        assert "ORDER BY" not in data_sql

    def test_invalid_sort_order_ignored(self) -> None:
        out = _run_script({"sort": {"field": "name", "order": "invalid"}})
        data_sql, _ = out["calls"][0]
        assert "ORDER BY" not in data_sql


class TestSearchContactsCountQuery:
    def test_count_uses_same_where(self) -> None:
        out = _run_script({
            "filter": {"field": "status", "operator": "eq", "value": "active"},
        })
        count_sql, count_vals = out["calls"][1]
        assert "COUNT(*) AS total" in count_sql
        assert "WHERE status = %s" in count_sql
        assert count_vals == ["active"]

    def test_count_no_filter(self) -> None:
        out = _run_script({})
        count_sql, count_vals = out["calls"][1]
        assert "WHERE" not in count_sql
        assert count_vals == []


class TestSearchContactsStarRocks:
    """StarRocks variant: ilike uses LOWER(field) LIKE LOWER(%s)."""

    def test_ilike_uses_lower(self) -> None:
        out = _run_script(
            {"filter": {"field": "name", "operator": "ilike", "value": "john"}},
            script=_SCRIPT_SR,
        )
        data_sql, data_vals = out["calls"][0]
        assert "WHERE LOWER(name) LIKE LOWER(%s)" in data_sql
        assert data_vals == ["john", 20, 0]

    def test_eq_still_works(self) -> None:
        out = _run_script(
            {"filter": {"field": "city", "operator": "eq", "value": "New York"}},
            script=_SCRIPT_SR,
        )
        data_sql, data_vals = out["calls"][0]
        assert "WHERE city = %s" in data_sql
        assert data_vals == ["New York", 20, 0]

    def test_nested_with_ilike(self) -> None:
        out = _run_script(
            {
                "filter": {
                    "logic": "and",
                    "conditions": [
                        {"field": "name", "operator": "ilike", "value": "john"},
                        {"field": "age", "operator": "gt", "value": 25},
                    ],
                },
            },
            script=_SCRIPT_SR,
        )
        data_sql, data_vals = out["calls"][0]
        assert "WHERE (LOWER(name) LIKE LOWER(%s) AND age > %s)" in data_sql
        assert data_vals == ["john", 25, 20, 0]


class TestSearchContactsPostgresIlike:
    """PostgreSQL variant: ilike uses native ILIKE."""

    def test_ilike_native(self) -> None:
        out = _run_script(
            {"filter": {"field": "name", "operator": "ilike", "value": "john"}},
            script=_SCRIPT_PG,
        )
        data_sql, data_vals = out["calls"][0]
        assert "WHERE name ILIKE %s" in data_sql
        assert data_vals == ["john", 20, 0]
