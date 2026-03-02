"""Tests for response size limiting (#41) and normalize_api_result fixes.

Runs without database:
    uv run pytest tests/core/gateway/test_response_limits.py -v --noconftest
"""

from unittest.mock import patch

from app.core.config import settings
from app.core.gateway.request_response import (
    _cap_rows,
    format_response,
    normalize_api_result,
)


# ---------------------------------------------------------------------------
# #41: _cap_rows truncates data and sets truncated flag
# ---------------------------------------------------------------------------


class TestCapRows:
    def test_under_limit_unchanged(self):
        out = {"success": True, "message": None, "data": [1, 2, 3]}
        with patch.object(settings, "GATEWAY_MAX_RESPONSE_ROWS", 10):
            result = _cap_rows(out)
        assert result["data"] == [1, 2, 3]
        assert "truncated" not in result

    def test_over_limit_truncated(self):
        data = list(range(100))
        out = {"success": True, "message": None, "data": data}
        with patch.object(settings, "GATEWAY_MAX_RESPONSE_ROWS", 10):
            result = _cap_rows(out)
        assert len(result["data"]) == 10
        assert result["data"] == list(range(10))
        assert result["truncated"] is True

    def test_exactly_at_limit_not_truncated(self):
        data = list(range(10))
        out = {"success": True, "message": None, "data": data}
        with patch.object(settings, "GATEWAY_MAX_RESPONSE_ROWS", 10):
            result = _cap_rows(out)
        assert len(result["data"]) == 10
        assert "truncated" not in result

    def test_limit_zero_means_no_limit(self):
        data = list(range(50000))
        out = {"success": True, "message": None, "data": data}
        with patch.object(settings, "GATEWAY_MAX_RESPONSE_ROWS", 0):
            result = _cap_rows(out)
        assert len(result["data"]) == 50000
        assert "truncated" not in result

    def test_non_list_data_untouched(self):
        out = {"success": True, "message": None, "data": "not a list"}
        with patch.object(settings, "GATEWAY_MAX_RESPONSE_ROWS", 10):
            result = _cap_rows(out)
        assert result["data"] == "not a list"


# ---------------------------------------------------------------------------
# normalize_api_result integration with _cap_rows
# ---------------------------------------------------------------------------


class TestNormalizeWithCap:
    def test_sql_mode_caps_rows(self):
        data = {"data": [list(range(200))]}
        with patch.object(settings, "GATEWAY_MAX_RESPONSE_ROWS", 50):
            result = normalize_api_result(data, "SQL")
        assert len(result["data"]) == 50
        assert result["truncated"] is True

    def test_script_mode_caps_rows(self):
        data = {"data": {"success": True, "message": None, "data": list(range(200))}}
        with patch.object(settings, "GATEWAY_MAX_RESPONSE_ROWS", 50):
            result = normalize_api_result(data, "SCRIPT")
        assert len(result["data"]) == 50
        assert result["truncated"] is True

    def test_generic_envelope_caps_rows(self):
        data = {"success": True, "message": None, "data": list(range(200))}
        with patch.object(settings, "GATEWAY_MAX_RESPONSE_ROWS", 50):
            result = normalize_api_result(data, None)
        assert len(result["data"]) == 50
        assert result["truncated"] is True


# ---------------------------------------------------------------------------
# #41: GATEWAY_MAX_RESPONSE_ROWS default
# ---------------------------------------------------------------------------


class TestResponseRowsDefault:
    def test_default_is_10000(self):
        assert settings.GATEWAY_MAX_RESPONSE_ROWS == 10_000
