"""
Unit tests for TINYINT(1) → bool coercion in cursor_to_dicts.

No real DB needed — we construct fake cursors whose ``description`` mimics
what pymysql and psycopg produce, and verify the coercion behavior.
"""

from types import SimpleNamespace
from unittest.mock import patch

import pytest

from app.core.pool.connect import _bool_coerce_indexes, cursor_to_dicts


class _FakeCursor:
    """Minimal cursor stub. ``module`` controls the detected driver family."""

    def __init__(self, description, rows, module: str = "pymysql.cursors"):
        self.description = description
        self._rows = rows
        # cursor_to_dicts inspects ``type(cursor).__module__`` — we can't
        # set ``__module__`` per-instance in a stable way, so subclass per test.
        self.__class__ = type(
            "_FakeCursor",
            (_FakeCursor,),
            {"__module__": module},
        )

    def fetchall(self):
        return list(self._rows)


# pymysql FIELD_TYPE codes
FT_TINY = 1      # TINYINT (and TINYINT(1) == BOOLEAN)
FT_LONG = 3      # INT
FT_VAR_STRING = 253


def _pymysql_desc(*cols):
    """Build a pymysql-style description tuple list.

    Each col is (name, type_code, display_size) — internal_size defaults to
    display_size (MySQL convention). Use ``_starrocks_desc`` for the StarRocks
    quirk where display_size is None but internal_size is populated.
    """
    return [(n, t, ds, ds, None, None, True) for (n, t, ds) in cols]


def _starrocks_desc(*cols):
    """StarRocks-style description: display_size=None, internal_size populated.

    Each col is (name, type_code, internal_size).
    """
    return [(n, t, None, isz, None, None, True) for (n, t, isz) in cols]


# ---------------------------------------------------------------------------
# _bool_coerce_indexes — detection logic
# ---------------------------------------------------------------------------


def test_detects_tinyint1_pymysql():
    cur = _FakeCursor(
        _pymysql_desc(
            ("id", FT_LONG, 11),
            ("is_active", FT_TINY, 1),    # TINYINT(1) → bool
            ("small_int", FT_TINY, 4),    # TINYINT(4) → keep int
            ("name", FT_VAR_STRING, 255),
        ),
        rows=[],
    )
    assert _bool_coerce_indexes(cur) == {1}


def test_skips_non_pymysql_driver():
    """psycopg / trino cursors shouldn't trigger coercion."""
    cur = _FakeCursor(
        _pymysql_desc(("is_active", FT_TINY, 1)),
        rows=[],
        module="psycopg.cursors",
    )
    assert _bool_coerce_indexes(cur) == set()


def test_empty_description_returns_empty():
    cur = _FakeCursor(description=None, rows=[])
    assert _bool_coerce_indexes(cur) == set()


def test_coerce_disabled_by_setting():
    cur = _FakeCursor(
        _pymysql_desc(("is_active", FT_TINY, 1)),
        rows=[],
    )
    with patch("app.core.pool.connect.settings") as mock_settings:
        mock_settings.EXTERNAL_DB_COERCE_TINYINT_BOOL = False
        assert _bool_coerce_indexes(cur) == set()


# ---------------------------------------------------------------------------
# cursor_to_dicts — end-to-end behavior
# ---------------------------------------------------------------------------


def test_pymysql_tinyint1_coerced_to_bool():
    cur = _FakeCursor(
        _pymysql_desc(
            ("id", FT_LONG, 11),
            ("is_active", FT_TINY, 1),
            ("name", FT_VAR_STRING, 255),
        ),
        rows=[
            (1, 1, "alice"),
            (2, 0, "bob"),
            (3, None, "carol"),
        ],
    )
    result = cursor_to_dicts(cur)
    assert result == [
        {"id": 1, "is_active": True, "name": "alice"},
        {"id": 2, "is_active": False, "name": "bob"},
        {"id": 3, "is_active": None, "name": "carol"},  # NULL stays None
    ]
    # Ensure the types are real booleans, not ints
    assert result[0]["is_active"] is True
    assert result[1]["is_active"] is False


def test_pymysql_regular_tinyint_stays_int():
    """TINYINT(4) / TINYINT without size=1 is not a bool — keep as int."""
    cur = _FakeCursor(
        _pymysql_desc(
            ("count", FT_TINY, 4),
            ("flag", FT_TINY, 1),
        ),
        rows=[(5, 1), (127, 0)],
    )
    result = cursor_to_dicts(cur)
    assert result == [
        {"count": 5, "flag": True},
        {"count": 127, "flag": False},
    ]
    assert isinstance(result[0]["count"], int) and not isinstance(
        result[0]["count"], bool
    )


def test_psycopg_cursor_passthrough():
    """psycopg already returns native bool — we should not double-process."""
    cur = _FakeCursor(
        _pymysql_desc(
            ("id", FT_LONG, 11),
            ("flag", FT_TINY, 1),
        ),
        rows=[(1, True), (2, False)],
        module="psycopg.cursor",
    )
    result = cursor_to_dicts(cur)
    # psycopg path skips coercion entirely — values pass through untouched
    assert result == [{"id": 1, "flag": True}, {"id": 2, "flag": False}]


def test_multiple_bool_columns_in_same_row():
    cur = _FakeCursor(
        _pymysql_desc(
            ("id", FT_LONG, 11),
            ("had_margin", FT_TINY, 1),
            ("is_vip", FT_TINY, 1),
            ("score", FT_LONG, 11),
            ("is_active", FT_TINY, 1),
        ),
        rows=[(42, 1, 0, 100, 1)],
    )
    result = cursor_to_dicts(cur)
    assert result == [{
        "id": 42,
        "had_margin": True,
        "is_vip": False,
        "score": 100,
        "is_active": True,
    }]


def test_setting_disabled_no_coercion():
    cur = _FakeCursor(
        _pymysql_desc(("is_active", FT_TINY, 1)),
        rows=[(1,), (0,)],
    )
    with patch("app.core.pool.connect.settings") as mock_settings:
        mock_settings.EXTERNAL_DB_COERCE_TINYINT_BOOL = False
        result = cursor_to_dicts(cur)
    assert result == [{"is_active": 1}, {"is_active": 0}]


def test_empty_result_set():
    cur = _FakeCursor(
        _pymysql_desc(("is_active", FT_TINY, 1)),
        rows=[],
    )
    assert cursor_to_dicts(cur) == []


def test_description_none_returns_empty():
    cur = _FakeCursor(description=None, rows=[])
    assert cursor_to_dicts(cur) == []


# ---------------------------------------------------------------------------
# StarRocks — display_size is None; detection must use internal_size
# ---------------------------------------------------------------------------


def test_starrocks_boolean_detected_via_internal_size():
    """StarRocks leaves display_size=None but populates internal_size=1
    for BOOLEAN columns (and =4 for TINYINT). Detection should use that."""
    cur = _FakeCursor(
        _starrocks_desc(
            ("id", FT_LONG, 11),
            ("is_vip", FT_TINY, 1),        # BOOLEAN
            ("count_int", FT_TINY, 4),     # TINYINT
        ),
        rows=[(1, 1, 5), (2, 0, 127)],
    )
    assert _bool_coerce_indexes(cur) == {1}
    result = cursor_to_dicts(cur)
    assert result == [
        {"id": 1, "is_vip": True, "count_int": 5},
        {"id": 2, "is_vip": False, "count_int": 127},
    ]
    # count_int must stay int, not become bool
    assert isinstance(result[0]["count_int"], int)
    assert not isinstance(result[0]["count_int"], bool)


def test_starrocks_multiple_booleans():
    cur = _FakeCursor(
        _starrocks_desc(
            ("had_margin", FT_TINY, 1),
            ("is_active", FT_TINY, 1),
            ("is_vip", FT_TINY, 1),
        ),
        rows=[(1, 0, 1), (0, 1, None)],
    )
    result = cursor_to_dicts(cur)
    assert result == [
        {"had_margin": True, "is_active": False, "is_vip": True},
        {"had_margin": False, "is_active": True, "is_vip": None},
    ]
