"""Excel report executor: orchestrates the full generate flow."""
import logging
import os
import shutil
import uuid
from datetime import UTC, datetime
from typing import Any

from openpyxl import Workbook, load_workbook
from sqlmodel import Session

from app.core.config import settings
from app.engines.excel.excel_extractor import extract_sheet
from app.engines.excel import excel_writer
from app.engines.excel.excel_writer import write_rows, write_single
from app.engines.excel.minio_client import download_file, get_minio_client, upload_file
from app.engines.excel.recalc import recalc_workbook
from app.engines.sql import SQLTemplateEngine, execute_sql
from app.models_dbapi import DataSource
from app.models_report import (
    ExecutionStatusEnum, ReportExecution, ReportModule,
    ReportSheetMapping, ReportTemplate, SheetWriteModeEnum,
)

_log = logging.getLogger(__name__)


class ExcelReportExecutor:
    def execute(
        self,
        session: Session,
        module: ReportModule,
        template: ReportTemplate,
        mappings: list[ReportSheetMapping],
        execution: ReportExecution,
        params: dict[str, Any] | None = None,
    ) -> ReportExecution:
        _params = params or {}
        work_dir = os.path.join(settings.REPORT_TEMP_DIR, str(execution.id))

        try:
            os.makedirs(work_dir, exist_ok=True)
            execution.status = ExecutionStatusEnum.RUNNING
            execution.started_at = datetime.now(UTC)
            session.add(execution)
            session.commit()

            # Datasources from module
            minio_ds = session.get(DataSource, module.minio_datasource_id)
            sql_ds = session.get(DataSource, module.sql_datasource_id)
            if not minio_ds or not minio_ds.is_active:
                raise ValueError("MinIO datasource not found or inactive")
            if not sql_ds or not sql_ds.is_active:
                raise ValueError("SQL datasource not found or inactive")

            # Resolve buckets: template override → module default
            tpl_bucket = template.template_bucket or module.default_template_bucket
            out_bucket = template.output_bucket or module.default_output_bucket

            # Download template or create blank workbook
            template_local = os.path.join(work_dir, "template.xlsx")
            minio = get_minio_client(minio_ds)
            use_blank = not template.template_path or not template.template_path.strip()

            if not use_blank:
                try:
                    download_file(minio, tpl_bucket, template.template_path, template_local)
                except Exception as dl_err:
                    _log.warning("Template download failed, using blank workbook: %s", dl_err)
                    use_blank = True

            if use_blank:
                # Create blank workbook with sheets from mappings
                wb = Workbook()
                default_sheet = wb.active
                sheet_names = {m.sheet_name for m in mappings if m.is_active}
                first = True
                for sn in sorted(sheet_names):
                    if first:
                        default_sheet.title = sn
                        first = False
                    else:
                        wb.create_sheet(sn)
                if first:
                    default_sheet.title = "Sheet1"
                _log.info("Created blank workbook with sheets: %s", list(wb.sheetnames))
            else:
                wb = load_workbook(template_local)
            active_mappings = sorted(
                [m for m in mappings if m.is_active], key=lambda m: m.sort_order
            )
            sql_engine = SQLTemplateEngine()
            chunk_size = settings.REPORT_SQL_CHUNK_SIZE
            max_rows = settings.REPORT_MAX_ROWS_PER_SHEET

            for mapping in active_mappings:
                rendered_sql = sql_engine.render(mapping.sql_content, _params)

                if mapping.write_mode == SheetWriteModeEnum.SINGLE:
                    results = execute_sql(sql_ds, rendered_sql, use_pool=True)
                    data = results[0] if results else []
                    if not isinstance(data, int):
                        write_single(wb, mapping.sheet_name, mapping.start_cell, data)
                    continue

                # Chunked pagination for ROWS mode
                # Check if SQL already has LIMIT (user-controlled pagination)
                sql_upper = rendered_sql.strip().upper()
                user_has_limit = "LIMIT" in sql_upper.split("--")[0].split("/*")[0]

                if user_has_limit:
                    # User controls pagination — execute as-is
                    results = execute_sql(sql_ds, rendered_sql, use_pool=True)
                    data = results[0] if results else []
                    if isinstance(data, int):
                        continue
                    if max_rows > 0 and len(data) > max_rows:
                        data = data[:max_rows]
                    write_rows(wb, mapping.sheet_name, mapping.start_cell, data, write_headers=mapping.write_headers)
                else:
                    # Auto-paginate: fetch in chunks to reduce memory
                    total_written = 0
                    headers_written = False
                    offset = 0
                    start_row, start_col = excel_writer._parse_cell(mapping.start_cell)
                    current_row = start_row

                    while total_written < max_rows:
                        chunk_sql = f"{rendered_sql} LIMIT {chunk_size} OFFSET {offset}"
                        results = execute_sql(sql_ds, chunk_sql, use_pool=True)
                        chunk = results[0] if results else []
                        if isinstance(chunk, int) or not chunk:
                            break

                        if mapping.write_headers and not headers_written:
                            columns = list(chunk[0].keys())
                            ws = wb[mapping.sheet_name]
                            for ci, col_name in enumerate(columns):
                                ws.cell(row=current_row, column=start_col + ci, value=col_name)
                            current_row += 1
                            headers_written = True

                        # Respect max rows limit
                        remaining = max_rows - total_written
                        if len(chunk) > remaining:
                            chunk = chunk[:remaining]

                        # Write chunk at current_row position
                        rows_written = write_rows(
                            wb, mapping.sheet_name,
                            f"{excel_writer._col_letter(start_col)}{current_row}",
                            chunk, write_headers=False,
                        )
                        current_row += rows_written
                        total_written += len(chunk)
                        offset += chunk_size

                        _log.info(
                            "Chunk written: %d rows (total %d) for %s",
                            len(chunk), total_written, mapping.sheet_name,
                        )

                        # If chunk < chunk_size, no more data
                        if len(chunk) < chunk_size:
                            break

            filled_path = os.path.join(work_dir, "filled.xlsx")
            wb.save(filled_path)
            wb.close()

            # Recalc (auto-enable when output_sheet is set)
            output_path = filled_path
            needs_recalc = template.recalc_enabled or bool(template.output_sheet)
            if needs_recalc:
                output_path = recalc_workbook(filled_path)

            # Extract sheet (TH2)
            if template.output_sheet:
                extracted_path = os.path.join(work_dir, "output.xlsx")
                extract_sheet(output_path, template.output_sheet, extracted_path)
                output_path = extracted_path

            # Upload
            import re as _re
            timestamp = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
            safe_name = _re.sub(r'[^a-z0-9_-]', '_', template.name.lower())
            output_filename = f"{timestamp}_{safe_name}.xlsx"
            object_path = f"{template.output_prefix}{output_filename}"
            upload_file(minio, out_bucket, object_path, output_path)

            execution.status = ExecutionStatusEnum.SUCCESS
            execution.output_minio_path = f"{out_bucket}/{object_path}"
            execution.output_url = None  # Use /download proxy endpoint instead
            execution.completed_at = datetime.now(UTC)
            session.add(execution)
            session.commit()
            return execution

        except Exception as e:
            _log.error("Report generation failed: %s", e, exc_info=True)
            execution.status = ExecutionStatusEnum.FAILED
            execution.error_message = str(e)[:4000]
            execution.completed_at = datetime.now(UTC)
            session.add(execution)
            session.commit()
            return execution
        finally:
            if os.path.exists(work_dir):
                shutil.rmtree(work_dir, ignore_errors=True)
