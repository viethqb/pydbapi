"""Unit tests for engines.sql.filters (Phase 3, Task 3.2)."""

from datetime import date, datetime

from app.engines.sql.filters import (
    SqlSafe,
    compare,
    fromjson,
    in_list,
    sql_ident,
    sql_bool,
    sql_date,
    sql_datetime,
    sql_finalize,
    sql_float,
    sql_int,
    sql_like,
    sql_like_end,
    sql_like_start,
    sql_string,
)


class TestSqlSafe:
    """All filters should return SqlSafe instances."""

    def test_sql_string_returns_safe(self):
        assert isinstance(sql_string("hello"), SqlSafe)

    def test_sql_int_returns_safe(self):
        assert isinstance(sql_int(42), SqlSafe)

    def test_sql_int_returns_safe_instance(self):
        assert isinstance(sql_int(1), SqlSafe)


class TestSqlString:
    def test_none(self):
        assert sql_string(None) == "NULL"

    def test_plain(self):
        assert sql_string("hello") == "'hello'"

    def test_quote_escape(self):
        assert sql_string("a'b") == "'a''b'"


class TestSqlInt:
    def test_none(self):
        assert sql_int(None) == "NULL"

    def test_int(self):
        assert sql_int(42) == "42"
        assert sql_int("99") == "99"

    def test_invalid(self):
        assert sql_int("x") == "NULL"


class TestSqlFloat:
    def test_none(self):
        assert sql_float(None) == "NULL"

    def test_float(self):
        assert sql_float(3.14) == "3.14"
        assert sql_float("2.5") == "2.5"


class TestSqlBool:
    def test_none(self):
        assert sql_bool(None) == "NULL"

    def test_true_false(self):
        assert sql_bool(True) == "TRUE"
        assert sql_bool(1) == "TRUE"
        assert sql_bool(False) == "FALSE"
        assert sql_bool(0) == "FALSE"


class TestSqlDate:
    def test_none(self):
        assert sql_date(None) == "NULL"

    def test_date(self):
        assert sql_date(date(2025, 1, 15)) == "'2025-01-15'"

    def test_datetime(self):
        assert sql_date(datetime(2025, 1, 15, 12, 0)) == "'2025-01-15'"

    def test_iso_string(self):
        assert sql_date("2025-01-15") == "'2025-01-15'"
        assert sql_date("2025-01-15T12:00:00") == "'2025-01-15'"


class TestSqlDatetime:
    def test_none(self):
        assert sql_datetime(None) == "NULL"

    def test_datetime(self):
        assert sql_datetime(datetime(2025, 1, 15, 12, 30)) == "'2025-01-15T12:30:00'"

    def test_string(self):
        assert sql_datetime("2025-01-15 12:00:00") == "'2025-01-15 12:00:00'"


class TestInList:
    def test_none(self):
        assert in_list(None) == "(SELECT 1 WHERE 1=0)"

    def test_empty(self):
        assert in_list([]) == "(SELECT 1 WHERE 1=0)"

    def test_ints(self):
        assert in_list([1, 2, 3]) == "(1, 2, 3)"

    def test_mixed(self):
        assert in_list([1, "a", None]) == "(1, 'a', NULL)"

    def test_quote_escape(self):
        assert in_list(["o'brien"]) == "('o''brien')"


class TestSqlLike:
    def test_none(self):
        assert sql_like(None) == "NULL"

    def test_escape_percent_underscore(self):
        assert "\\%" in sql_like("a%b")
        assert "\\_" in sql_like("a_b")

    def test_single_quote_escaped(self):
        assert sql_like("O'Brien") == "'O''Brien'"

    def test_injection_escaped(self):
        result = sql_like("'; DROP TABLE users; --")
        assert result == "'''; DROP TABLE users; --'"


class TestSqlLikeStart:
    def test_suffix_percent(self):
        assert sql_like_start("ab") == "'ab%'"

    def test_escape(self):
        assert "\\%" in sql_like_start("a%") and sql_like_start("a%").endswith("%'")

    def test_single_quote_escaped(self):
        assert sql_like_start("O'Brien") == "'O''Brien%'"

    def test_injection_escaped(self):
        result = sql_like_start("'; DROP TABLE users; --")
        assert result == "'''; DROP TABLE users; --%'"


class TestSqlLikeEnd:
    def test_prefix_percent(self):
        assert sql_like_end("ab") == "'%ab'"

    def test_single_quote_escaped(self):
        assert sql_like_end("O'Brien") == "'%O''Brien'"

    def test_injection_escaped(self):
        result = sql_like_end("'; DROP TABLE users; --")
        assert result == "'%''; DROP TABLE users; --'"


class TestSqlDatetimeEscape:
    """sql_datetime must escape single quotes in string input."""

    def test_injection_escaped(self):
        result = sql_datetime("2024-01-01'; DROP TABLE users; --")
        assert "''" in result
        assert "DROP TABLE" in result


class TestSqlFinalize:
    """Auto-escape finalize callback used by Jinja2 Environment."""

    def test_safe_passthrough(self):
        safe = SqlSafe("'already escaped'")
        assert sql_finalize(safe) == "'already escaped'"

    def test_none(self):
        assert sql_finalize(None) == "NULL"

    def test_bool(self):
        assert sql_finalize(True) == "TRUE"
        assert sql_finalize(False) == "FALSE"

    def test_int(self):
        assert sql_finalize(42) == "42"

    def test_float(self):
        assert sql_finalize(3.14) == "3.14"

    def test_string_auto_escape(self):
        result = sql_finalize("hello")
        assert result == "'hello'"

    def test_string_injection_auto_escape(self):
        result = sql_finalize("'; DROP TABLE users; --")
        assert result == "'''; DROP TABLE users; --'"
        assert "DROP TABLE" in result
        assert result.startswith("'")
        assert result.endswith("'")

    def test_list(self):
        assert sql_finalize([1, 2, 3]) == "(1, 2, 3)"

    def test_dict_json(self):
        result = sql_finalize({"key": "val"})
        assert "'key'" in result or '"key"' in result

    def test_date(self):
        assert sql_finalize(date(2025, 6, 1)) == "'2025-06-01'"

    def test_datetime(self):
        assert sql_finalize(datetime(2025, 6, 1, 12, 0)) == "'2025-06-01T12:00:00'"


class TestFromjson:
    def test_none(self):
        assert fromjson(None) is None

    def test_already_dict(self):
        d = {"a": 1}
        assert fromjson(d) == {"a": 1}

    def test_already_list(self):
        assert fromjson([1, 2]) == [1, 2]

    def test_json_string(self):
        result = fromjson('{"combinator": ">", "values": "100"}')
        assert result == {"combinator": ">", "values": "100"}

    def test_invalid_json(self):
        assert fromjson("not json") is None

    def test_empty_string(self):
        assert fromjson("") is None


class TestCompare:
    """Tests for the compare filter."""

    def test_none(self):
        assert compare(None) == ""

    def test_returns_sqlsafe(self):
        result = compare('{"combinator": ">", "values": "100"}')
        assert isinstance(result, SqlSafe)

    # --- JSON string input ---

    def test_gt_json_string(self):
        assert compare('{"combinator": ">", "values": "100"}') == "> 100.0"

    def test_gte_json_string(self):
        assert compare('{"combinator": ">=", "values": "50.5"}') == ">= 50.5"

    def test_lt_json_string(self):
        assert compare('{"combinator": "<", "values": "1000"}') == "< 1000.0"

    def test_lte_json_string(self):
        assert compare('{"combinator": "<=", "values": "999.99"}') == "<= 999.99"

    def test_eq_json_string(self):
        assert compare('{"combinator": "=", "values": "42"}') == "= 42.0"

    def test_neq_json_string(self):
        assert compare('{"combinator": "!=", "values": "0"}') == "!= 0.0"

    def test_between_json_string(self):
        assert compare('{"combinator": "between", "values": "100,500"}') == "BETWEEN 100.0 AND 500.0"

    def test_between_with_spaces(self):
        assert compare('{"combinator": "between", "values": "100 , 500"}') == "BETWEEN 100.0 AND 500.0"

    # --- Dict input ---

    def test_gt_dict(self):
        assert compare({"combinator": ">", "values": "100"}) == "> 100.0"

    def test_between_dict(self):
        assert compare({"combinator": "between", "values": "10,20"}) == "BETWEEN 10.0 AND 20.0"

    # --- Invalid input ---

    def test_invalid_json(self):
        assert compare("not json") == ""

    def test_missing_combinator(self):
        assert compare('{"values": "100"}') == ""

    def test_missing_values(self):
        assert compare('{"combinator": ">"}') == ""

    def test_invalid_combinator(self):
        assert compare('{"combinator": "DROP TABLE", "values": "1"}') == ""

    def test_invalid_values_non_numeric(self):
        assert compare('{"combinator": ">", "values": "abc"}') == ""

    def test_between_wrong_parts(self):
        assert compare('{"combinator": "between", "values": "100"}') == ""

    def test_between_non_numeric(self):
        assert compare('{"combinator": "between", "values": "abc,def"}') == ""

    def test_sql_injection_combinator(self):
        """Combinator is whitelisted — injection attempt returns empty."""
        assert compare('{"combinator": "; DROP TABLE users --", "values": "1"}') == ""

    def test_sql_injection_values(self):
        """Values are parsed as float — non-numeric returns empty."""
        assert compare('{"combinator": ">", "values": "1; DROP TABLE users"}') == ""

    # --- Supports 'value' key as alias ---

    def test_value_key_alias(self):
        assert compare('{"combinator": "<", "value": "200"}') == "< 200.0"


class TestSqlIdent:
    """Tests for the sql_ident filter."""

    def test_simple_column(self):
        assert sql_ident("duration_ms") == "duration_ms"

    def test_dotted_path(self):
        assert sql_ident("schema.table.col") == "schema.table.col"

    def test_underscore_prefix(self):
        assert sql_ident("_private") == "_private"

    def test_returns_sqlsafe(self):
        assert isinstance(sql_ident("col"), SqlSafe)

    def test_none(self):
        assert sql_ident(None) == ""

    def test_empty(self):
        assert sql_ident("") == ""

    def test_injection_semicolon(self):
        assert sql_ident("col; DROP TABLE") == ""

    def test_injection_comment(self):
        assert sql_ident("col--comment") == ""

    def test_starts_with_number(self):
        assert sql_ident("1col") == ""

    def test_spaces(self):
        assert sql_ident("col name") == ""
