"""Unit tests for engines.sql.template_engine (Phase 3, Task 3.2)."""


from app.engines.sql import SQLTemplateEngine, parse_parameters


class TestSQLTemplateEngineRender:
    def test_simple_var(self):
        e = SQLTemplateEngine()
        assert e.render("SELECT {{ x }}", {"x": 1}) == "SELECT 1"

    def test_filter_int(self):
        e = SQLTemplateEngine()
        assert e.render("WHERE id = {{ id | int }}", {"id": 5}) == "WHERE id = 5"

    def test_if(self):
        e = SQLTemplateEngine()
        t = "SELECT 1{% if name %} WHERE name = '{{ name }}'{% endif %}"
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
        # name is used in {% if name %} and {{ name }}
        assert "name" in e.parse_parameters("{% if name %}x{{ name }}{% endif %}")

    def test_loop(self):
        e = SQLTemplateEngine()
        names = e.parse_parameters("{% for x in items %}{{ x }}{% endfor %}")
        assert "items" in names


class TestParseParametersStandalone:
    def test_reexport(self):
        # parse_parameters is in parser and re-exported from sql __init__
        assert parse_parameters("{{ a }}") == ["a"]
