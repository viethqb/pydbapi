"""Unit tests for engines.sql.filters (Phase 3, Task 3.2)."""

from datetime import date, datetime

from app.engines.sql.filters import (
    in_list,
    sql_bool,
    sql_date,
    sql_datetime,
    sql_float,
    sql_int,
    sql_like,
    sql_like_start,
    sql_string,
)


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
