"""Write SQL query results into Excel sheets."""
import logging
import re
import uuid
from datetime import date, datetime, time
from decimal import Decimal

from openpyxl import Workbook

_log = logging.getLogger(__name__)


def _sanitize_value(val: object) -> object:
    if val is None:
        return val
    if isinstance(val, (str, int, float, bool, datetime, date, time)):
        return val
    if isinstance(val, Decimal):
        return float(val)
    if isinstance(val, uuid.UUID):
        return str(val)
    if isinstance(val, bytes):
        return val.hex()
    return str(val)


def _col_letter(col: int) -> str:
    """Convert 1-indexed column number to letter(s). 1→A, 26→Z, 27→AA."""
    result = ""
    while col > 0:
        col, remainder = divmod(col - 1, 26)
        result = chr(65 + remainder) + result
    return result


def _parse_cell(cell_ref: str) -> tuple[int, int]:
    m = re.match(r"^([A-Za-z]+)(\d+)$", cell_ref.strip())
    if not m:
        raise ValueError(f"Invalid cell reference: {cell_ref!r}")
    col_str = m.group(1).upper()
    row = int(m.group(2))
    col = 0
    for ch in col_str:
        col = col * 26 + (ord(ch) - ord("A") + 1)
    return row, col


def write_rows(
    wb: Workbook, sheet_name: str, start_cell: str,
    data: list[dict], *, write_headers: bool = False,
) -> int:
    if not data:
        return 0
    if sheet_name not in wb.sheetnames:
        raise ValueError(f"Sheet {sheet_name!r} not found")
    ws = wb[sheet_name]
    start_row, start_col = _parse_cell(start_cell)
    columns = list(data[0].keys())
    current_row = start_row
    if write_headers:
        for ci, col_name in enumerate(columns):
            ws.cell(row=current_row, column=start_col + ci, value=col_name)
        current_row += 1
    for row_data in data:
        for ci, col_name in enumerate(columns):
            ws.cell(row=current_row, column=start_col + ci, value=_sanitize_value(row_data.get(col_name)))
        current_row += 1
    return current_row - start_row


def write_single(wb: Workbook, sheet_name: str, start_cell: str, data: list[dict]) -> None:
    if not data:
        return
    if sheet_name not in wb.sheetnames:
        raise ValueError(f"Sheet {sheet_name!r} not found")
    ws = wb[sheet_name]
    row, col = _parse_cell(start_cell)
    first_key = list(data[0].keys())[0]
    ws.cell(row=row, column=col, value=_sanitize_value(data[0][first_key]))
