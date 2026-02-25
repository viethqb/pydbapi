"""Unit tests for engines.sql.filters (Phase 3, Task 3.2)."""

from datetime import date, datetime

from app.engines.sql.filters import (
    SqlSafe,
    in_list,
    sql_bool,
    sql_date,
    sql_datetime,
    sql_finalize,
    sql_float,
    sql_int,
    sql_like,
    sql_like_start,
    sql_raw,
    sql_string,
)


class TestSqlSafe:
    """All filters should return SqlSafe instances."""

    def test_sql_string_returns_safe(self):
        assert isinstance(sql_string("hello"), SqlSafe)

    def test_sql_int_returns_safe(self):
        assert isinstance(sql_int(42), SqlSafe)

    def test_sql_raw_returns_safe(self):
        assert isinstance(sql_raw("my_table"), SqlSafe)


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


class TestSqlLikeStart:
    def test_suffix_percent(self):
        assert sql_like_start("ab") == "'ab%'"

    def test_escape(self):
        assert "\\%" in sql_like_start("a%") and sql_like_start("a%").endswith("%'")


class TestSqlRaw:
    def test_none(self):
        assert sql_raw(None) == "NULL"

    def test_passthrough(self):
        assert sql_raw("my_table") == "my_table"

    def test_returns_safe(self):
        assert isinstance(sql_raw("x"), SqlSafe)


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
