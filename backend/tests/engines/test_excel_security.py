"""Security + progress regression tests for Excel report engine.

Covers:
- Formula injection escape (_sanitize_value)
- File size limits raise before/after download
- Path traversal validator rejects bad inputs
- Recalc retry logic (timeout doubles, retries up to max_retries)
- Progress tracking updates processed_rows / progress_pct
"""
from unittest.mock import patch

import pytest

from app.engines.excel import excel_writer
from app.engines.excel.excel_writer import _escape_formula, _sanitize_value
from app.engines.excel.minio_client import download_file, upload_file
from app.engines.excel.recalc import recalc_workbook
from app.schemas_report import (
    _validate_bucket,
    _validate_minio_path,
)


# ---------------------------------------------------------------------------
# Formula injection
# ---------------------------------------------------------------------------


class TestFormulaInjection:
    @pytest.mark.parametrize("raw", [
        "=HYPERLINK(\"http://evil\",\"click\")",
        "=cmd|'/c calc'!A1",
        "+1+1",
        "-SUM(A1:A5)",
        "@SUM(1,2)",
        "\t=1+1",
        "\r=1+1",
    ])
    def test_dangerous_prefix_escaped(self, raw: str) -> None:
        """Every trigger char at position 0 is neutralised by leading apostrophe."""
        assert _escape_formula(raw).startswith("'")

    def test_benign_strings_untouched(self) -> None:
        for raw in ["hello", "  = spaced", "a=b", "123", ""]:
            assert _escape_formula(raw) == raw

    def test_sanitize_value_escapes_strings(self) -> None:
        assert _sanitize_value("=1+2") == "'=1+2"
        assert _sanitize_value("@cmd") == "'@cmd"
        assert _sanitize_value("normal") == "normal"

    def test_sanitize_value_preserves_non_strings(self) -> None:
        from datetime import date
        assert _sanitize_value(123) == 123
        assert _sanitize_value(1.5) == 1.5
        assert _sanitize_value(True) is True
        assert _sanitize_value(date(2024, 1, 1)) == date(2024, 1, 1)
        assert _sanitize_value(None) is None

    def test_write_rows_escapes_cell_values(self) -> None:
        """Headers and data both go through sanitiser."""
        from openpyxl import Workbook
        wb = Workbook()
        wb.active.title = "S"
        data = [{"name": "alice", "payload": "=HYPERLINK(\"http://x\")"}]
        excel_writer.write_rows(wb, "S", "A1", data, write_headers=True)
        assert wb["S"]["A1"].value == "name"  # benign header
        assert wb["S"]["B2"].value == "'=HYPERLINK(\"http://x\")"


# ---------------------------------------------------------------------------
# File size limits
# ---------------------------------------------------------------------------


class TestSizeLimits:
    def test_download_rejects_oversized_template(self, tmp_path) -> None:
        fake_stat = type("S", (), {"size": 200 * 1024 * 1024})()
        client = type("C", (), {
            "stat_object": lambda _s, _b, _p: fake_stat,
            "fget_object": lambda *a, **kw: pytest.fail("Should not download"),
        })()
        with pytest.raises(ValueError, match="Template file too large"):
            download_file(
                client, "bucket", "big.xlsx", str(tmp_path / "x.xlsx"),
                max_size_bytes=50 * 1024 * 1024,
            )

    def test_download_no_limit_passes(self, tmp_path) -> None:
        """max_size_bytes=None/0 skips the size check."""
        called = {}

        class _Client:
            def stat_object(self, *_a): raise AssertionError("stat not needed")
            def fget_object(self, bucket, path, local):
                called["ok"] = (bucket, path, local)

        download_file(_Client(), "b", "x.xlsx", str(tmp_path / "x.xlsx"))
        assert called["ok"] == ("b", "x.xlsx", str(tmp_path / "x.xlsx"))

    def test_upload_rejects_oversized_output(self, tmp_path) -> None:
        big = tmp_path / "out.xlsx"
        big.write_bytes(b"x" * (2 * 1024 * 1024))

        class _Client:
            def bucket_exists(self, _b): return True
            def fput_object(self, *_a, **_kw): pytest.fail("Should not upload")

        with pytest.raises(ValueError, match="Output file too large"):
            upload_file(
                _Client(), "bucket", "out.xlsx", str(big),
                max_size_bytes=1 * 1024 * 1024,
            )


# ---------------------------------------------------------------------------
# Path traversal validator
# ---------------------------------------------------------------------------


class TestPathValidator:
    @pytest.mark.parametrize("bad", [
        "../etc/passwd",
        "/etc/passwd",
        "-rf",
        "a/../b",
        "%2e%2e/secret",
        "a%2fb",
        "a\\b",  # backslash not in allowlist
        "a b",   # space not in allowlist
    ])
    def test_rejects_malicious_paths(self, bad: str) -> None:
        with pytest.raises(ValueError):
            _validate_minio_path(bad)

    @pytest.mark.parametrize("good", [
        "folder/file.xlsx",
        "nested/deep/name.xlsx",
        "no_slash.xlsx",
        "with-dash_under.dot",
        "",
        None,
    ])
    def test_accepts_clean_paths(self, good) -> None:
        # Does not raise; passes value through (or returns unchanged None/"").
        assert _validate_minio_path(good) == good

    def test_bucket_validator_rejects_bad(self) -> None:
        for bad in ["ab", "has space", "has/slash", "@bad"]:
            with pytest.raises(ValueError):
                _validate_bucket(bad)

    def test_bucket_validator_accepts_good(self) -> None:
        assert _validate_bucket("my-bucket") == "my-bucket"
        assert _validate_bucket("project.reports") == "project.reports"


# ---------------------------------------------------------------------------
# Recalc retry
# ---------------------------------------------------------------------------


class TestRecalcRetry:
    def test_retries_on_timeout_then_succeeds(self, tmp_path) -> None:
        f = tmp_path / "w.xlsx"
        f.write_bytes(b"fake")
        calls = {"n": 0}

        def fake_run(path, timeout):
            calls["n"] += 1
            if calls["n"] == 1:
                raise TimeoutError("first attempt timed out")
            return path

        with patch("app.engines.excel.recalc._run_recalc", side_effect=fake_run):
            out = recalc_workbook(str(f), timeout=10, max_retries=1)
        assert out == str(f)
        assert calls["n"] == 2

    def test_gives_up_after_max_retries(self, tmp_path) -> None:
        f = tmp_path / "w.xlsx"
        f.write_bytes(b"fake")

        def always_timeout(_path, _timeout):
            raise TimeoutError("nope")

        with patch("app.engines.excel.recalc._run_recalc", side_effect=always_timeout):
            with pytest.raises(RuntimeError, match="failed after 2 attempts"):
                recalc_workbook(str(f), timeout=10, max_retries=1)

    def test_timeout_doubles_on_retry(self, tmp_path) -> None:
        f = tmp_path / "w.xlsx"
        f.write_bytes(b"fake")
        timeouts: list[int] = []

        def record(_path, timeout):
            timeouts.append(timeout)
            if len(timeouts) == 1:
                raise TimeoutError("first")
            return _path

        with patch("app.engines.excel.recalc._run_recalc", side_effect=record):
            recalc_workbook(str(f), timeout=30, max_retries=2)
        assert timeouts[0] == 30
        assert timeouts[1] == 60


# ---------------------------------------------------------------------------
# Progress tracking (integration, reuses test_excel_e2e fixtures)
# ---------------------------------------------------------------------------


class TestProgressTracking:
    """Full executor run; checks execution.processed_rows / progress_pct update."""

    def test_progress_reaches_100_on_success(self, db) -> None:
        # Reuse helpers and fixtures from test_excel_e2e by importing them
        # inside the test (they depend on the `db` fixture from the top-level
        # conftest).
        from tests.engines.test_excel_e2e import (
            _create_ds,
            _make_execution,
            _make_mapping,
            _make_module,
            _make_template,
            _run_executor,
        )
        import uuid as _uuid
        sql_ds = _create_ds(db, f"sec-sql-{_uuid.uuid4().hex[:8]}")
        minio_ds = _create_ds(db, f"sec-minio-{_uuid.uuid4().hex[:8]}")
        mod = _make_module(db, sql_ds, minio_ds)
        tpl = _make_template(db, mod)
        mapping = _make_mapping(
            db, tpl, sql_content="SELECT generate_series(1,3) AS n",
            write_headers=True,
        )
        exc = _make_execution(db, tpl)
        result, _path = _run_executor(db, mod, tpl, [mapping], exc)
        assert result.progress_pct == 100
        # 3 data rows were written (generate_series 1..3).
        assert result.processed_rows == 3
