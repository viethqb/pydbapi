"""Unit tests for engines.sql.template_engine (Phase 3, Task 3.2)."""


from app.engines.sql import SQLTemplateEngine, parse_parameters


class TestSQLTemplateEngineRender:
    def test_simple_int_var(self):
        e = SQLTemplateEngine()
        assert e.render("SELECT {{ x }}", {"x": 1}) == "SELECT 1"

    def test_filter_int(self):
        e = SQLTemplateEngine()
        assert e.render("WHERE id = {{ id | sql_int }}", {"id": 5}) == "WHERE id = 5"

    def test_if(self):
        e = SQLTemplateEngine()
        t = "SELECT 1{% if name %} WHERE name = {{ name }}{% endif %}"
        assert e.render(t, {"name": "a"}) == "SELECT 1 WHERE name = 'a'"
        assert e.render(t, {}) == "SELECT 1"

    def test_in_list(self):
        e = SQLTemplateEngine()
        assert (
            e.render("WHERE id IN {{ ids | in_list }}", {"ids": [1, 2, 3]})
            == "WHERE id IN (1, 2, 3)"
        )

    def test_where_extension(self):
        e = SQLTemplateEngine()
        t = "SELECT * FROM t {% where %}\n  AND a = 1\n{% endwhere %}"
        out = e.render(t, {})
        assert "WHERE" in out and "a = 1" in out
        assert out.strip().startswith("SELECT")


class TestSQLTemplateEngineAutoEscape:
    """Verify the finalize auto-escape prevents SQL injection."""

    def test_string_auto_escaped(self):
        e = SQLTemplateEngine()
        result = e.render("SELECT {{ name }}", {"name": "hello"})
        assert result == "SELECT 'hello'"

    def test_injection_neutralised(self):
        e = SQLTemplateEngine()
        payload = "'; DROP TABLE users; --"
        result = e.render("SELECT {{ name }}", {"name": payload})
        assert "DROP TABLE" in result
        assert result.startswith("SELECT '")
        assert "'';" in result

    def test_int_not_quoted(self):
        e = SQLTemplateEngine()
        assert e.render("WHERE id = {{ id }}", {"id": 42}) == "WHERE id = 42"

    def test_bool_rendered(self):
        e = SQLTemplateEngine()
        assert e.render("WHERE active = {{ flag }}", {"flag": True}) == "WHERE active = TRUE"

    def test_none_renders_null(self):
        e = SQLTemplateEngine()
        assert e.render("WHERE x = {{ val }}", {"val": None}) == "WHERE x = NULL"

    def test_list_auto_in_list(self):
        e = SQLTemplateEngine()
        result = e.render("WHERE id IN {{ ids }}", {"ids": [1, 2, 3]})
        assert result == "WHERE id IN (1, 2, 3)"

    def test_explicit_filter_not_double_escaped(self):
        e = SQLTemplateEngine()
        result = e.render("WHERE name = {{ name | sql_string }}", {"name": "hello"})
        assert result == "WHERE name = 'hello'"

    def test_sql_raw_bypasses_escape(self):
        e = SQLTemplateEngine()
        result = e.render("SELECT * FROM {{ tbl | sql_raw }}", {"tbl": "users"})
        assert result == "SELECT * FROM users"

    def test_safe_alias_bypasses_escape(self):
        e = SQLTemplateEngine()
        result = e.render("SELECT * FROM {{ tbl | safe }}", {"tbl": "users"})
        assert result == "SELECT * FROM users"


class TestSQLTemplateEngineParseParameters:
    def test_vars(self):
        e = SQLTemplateEngine()
        assert e.parse_parameters("{{ a }}") == ["a"]
        assert e.parse_parameters("{{ a }} and {{ b }}") == ["a", "b"]

    def test_with_filter(self):
        e = SQLTemplateEngine()
        assert e.parse_parameters("{{ ids | in_list }}") == ["ids"]

    def test_if_block(self):
        e = SQLTemplateEngine()
        assert "name" in e.parse_parameters("{% if name %}x{{ name }}{% endif %}")

    def test_loop(self):
        e = SQLTemplateEngine()
        names = e.parse_parameters("{% for x in items %}{{ x }}{% endfor %}")
        assert "items" in names


class TestParseParametersStandalone:
    def test_reexport(self):
        assert parse_parameters("{{ a }}") == ["a"]
