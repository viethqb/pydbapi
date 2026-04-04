"""Extract a single sheet from a workbook with values + styles."""
import logging
from copy import copy

from openpyxl import Workbook, load_workbook

_log = logging.getLogger(__name__)


def extract_sheet(source_path: str, sheet_name: str, output_path: str) -> None:
    src_wb = load_workbook(source_path, data_only=True)
    if sheet_name not in src_wb.sheetnames:
        raise ValueError(f"Sheet {sheet_name!r} not found")
    src_ws = src_wb[sheet_name]
    dst_wb = Workbook()
    dst_ws = dst_wb.active
    dst_ws.title = sheet_name

    for col_letter, dim in src_ws.column_dimensions.items():
        dst_ws.column_dimensions[col_letter].width = dim.width
        dst_ws.column_dimensions[col_letter].hidden = dim.hidden
    for row_idx, dim in src_ws.row_dimensions.items():
        dst_ws.row_dimensions[row_idx].height = dim.height
        dst_ws.row_dimensions[row_idx].hidden = dim.hidden

    for row in src_ws.iter_rows():
        for cell in row:
            dst_cell = dst_ws.cell(row=cell.row, column=cell.column, value=cell.value)
            if cell.has_style:
                dst_cell.font = copy(cell.font)
                dst_cell.fill = copy(cell.fill)
                dst_cell.border = copy(cell.border)
                dst_cell.alignment = copy(cell.alignment)
                dst_cell.number_format = cell.number_format
                dst_cell.protection = copy(cell.protection)

    for merged_range in src_ws.merged_cells.ranges:
        dst_ws.merge_cells(str(merged_range))
    dst_ws.sheet_format = copy(src_ws.sheet_format)
    dst_ws.freeze_panes = src_ws.freeze_panes

    dst_wb.save(output_path)
    src_wb.close()
    dst_wb.close()
