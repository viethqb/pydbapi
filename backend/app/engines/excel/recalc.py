"""LibreOffice headless recalculation."""
import logging
import os
import shutil
import subprocess

from app.core.config import settings

_log = logging.getLogger(__name__)


def recalc_workbook(file_path: str, timeout: int | None = None) -> str:
    """Recalculate formulas using LibreOffice headless.

    Uses a separate output directory to avoid overwrite errors,
    then moves the result back.
    """
    if timeout is None:
        timeout = settings.REPORT_RECALC_TIMEOUT

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

    _log.info("LibreOffice recalc: %s → %s", file_path, out_dir)

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired as e:
        shutil.rmtree(out_dir, ignore_errors=True)
        raise RuntimeError(f"LibreOffice recalc timed out after {timeout}s") from e

    if result.returncode != 0:
        shutil.rmtree(out_dir, ignore_errors=True)
        raise RuntimeError(f"LibreOffice recalc failed (exit {result.returncode}): {result.stderr}")

    # Find the output file
    base_name = os.path.basename(file_path)
    recalced = os.path.join(out_dir, base_name)
    if not os.path.exists(recalced):
        shutil.rmtree(out_dir, ignore_errors=True)
        raise RuntimeError("LibreOffice recalc output not found")

    # Replace original with recalculated
    shutil.move(recalced, file_path)
    shutil.rmtree(out_dir, ignore_errors=True)

    _log.info("LibreOffice recalc completed: %s", file_path)
    return file_path
