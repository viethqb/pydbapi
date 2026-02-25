"""Unit tests for engines.sql.safety — static analysis for SQL templates."""

from app.engines.sql.safety import check_sql_template_safety


class TestCheckSqlTemplateSafety:
    def test_no_variables(self):
        assert check_sql_template_safety("SELECT 1") == []

    def test_filtered_variable_no_warning(self):
        assert check_sql_template_safety("SELECT {{ name | sql_string }}") == []

    def test_unfiltered_variable_warns(self):
        warnings = check_sql_template_safety("SELECT {{ name }}")
        assert len(warnings) == 1
        assert warnings[0]["variable"] == "name"
        assert warnings[0]["line"] == 1

    def test_multiple_unfiltered(self):
        sql = "SELECT {{ a }}, {{ b | sql_int }}, {{ c }}"
        warnings = check_sql_template_safety(sql)
        names = [w["variable"] for w in warnings]
        assert "a" in names
        assert "c" in names
        assert "b" not in names

    def test_in_list_filter_no_warning(self):
        assert check_sql_template_safety("WHERE id IN {{ ids | in_list }}") == []

    def test_safe_filter_warns_after_removal(self):
        warnings = check_sql_template_safety("FROM {{ tbl | safe }}")
        assert len(warnings) == 1

    def test_multiline_template(self):
        sql = "SELECT *\nFROM t\nWHERE name = {{ name }}"
        warnings = check_sql_template_safety(sql)
        assert len(warnings) == 1
        assert warnings[0]["line"] == 3

    def test_empty_template(self):
        assert check_sql_template_safety("") == []

    def test_jinja_block_not_flagged(self):
        sql = "{% if name %}WHERE name = {{ name | sql_string }}{% endif %}"
        assert check_sql_template_safety(sql) == []

    def test_builtin_int_filter_no_warning(self):
        assert check_sql_template_safety("{{ x | int }}") == []

    def test_unknown_filter_warns(self):
        warnings = check_sql_template_safety("{{ x | totally_unknown }}")
        assert len(warnings) == 1
