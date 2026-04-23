"""LibreOffice headless recalculation."""
import logging
import os
import shutil
import subprocess

from app.core.config import settings

_log = logging.getLogger(__name__)


def _run_recalc(file_path: str, timeout: int) -> str:
    """Single LibreOffice invocation. Raises RuntimeError on timeout / non-zero exit."""
    # Validate file path to prevent argument injection
    base = os.path.basename(file_path)
    if base.startswith("-") or ".." in file_path:
        raise RuntimeError(f"Invalid file path: {file_path}")

    work_dir = os.path.dirname(file_path)
    out_dir = os.path.join(work_dir, "_recalc_out")
    os.makedirs(out_dir, exist_ok=True)

    cmd = [
        settings.LIBREOFFICE_PATH, "--headless", "--calc",
        "--convert-to", "xlsx",
        "--outdir", out_dir,
        file_path,
    ]

    _log.info("LibreOffice recalc (timeout=%ds): %s → %s", timeout, file_path, out_dir)

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired as e:
        shutil.rmtree(out_dir, ignore_errors=True)
        raise TimeoutError(f"LibreOffice recalc timed out after {timeout}s") from e

    if result.returncode != 0:
        shutil.rmtree(out_dir, ignore_errors=True)
        raise RuntimeError(
            f"LibreOffice recalc failed (exit {result.returncode}): {result.stderr}"
        )

    recalced = os.path.join(out_dir, os.path.basename(file_path))
    if not os.path.exists(recalced):
        shutil.rmtree(out_dir, ignore_errors=True)
        raise RuntimeError("LibreOffice recalc output not found")

    shutil.move(recalced, file_path)
    shutil.rmtree(out_dir, ignore_errors=True)
    _log.info("LibreOffice recalc completed: %s", file_path)
    return file_path


def recalc_workbook(
    file_path: str,
    timeout: int | None = None,
    max_retries: int | None = None,
) -> str:
    """Recalculate formulas using LibreOffice headless, with retry on timeout.

    The timeout doubles on each retry (e.g. 120s → 240s → 480s) so long-running
    recalculations can complete without a permanent raise of the global timeout.

    Args:
        file_path: Absolute path to xlsx file.
        timeout: Base timeout in seconds. Defaults to REPORT_RECALC_TIMEOUT.
        max_retries: Retries on TimeoutError. Defaults to REPORT_RECALC_MAX_RETRIES.
    """
    if timeout is None:
        timeout = settings.REPORT_RECALC_TIMEOUT
    if max_retries is None:
        max_retries = settings.REPORT_RECALC_MAX_RETRIES

    current_timeout = timeout
    attempts = max_retries + 1
    last_err: Exception | None = None
    for attempt in range(1, attempts + 1):
        try:
            return _run_recalc(file_path, current_timeout)
        except TimeoutError as e:
            last_err = e
            _log.warning(
                "Recalc timeout on attempt %d/%d (timeout=%ds): %s",
                attempt, attempts, current_timeout, e,
            )
            if attempt >= attempts:
                break
            current_timeout = min(current_timeout * 2, 3600)  # cap at 1h
    # Exhausted retries
    raise RuntimeError(
        f"LibreOffice recalc failed after {attempts} attempts: {last_err}"
    ) from last_err
