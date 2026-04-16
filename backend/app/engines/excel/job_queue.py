"""Redis-based job queue for async report generation.

Jobs are pushed to a Redis list. A background worker thread polls the list
and processes jobs. On startup, orphaned executions (pending/running) are
marked as failed for recovery.
"""

import json
import logging
import threading
import time
import uuid

from app.core.config import settings
from app.core.redis_client import get_redis

_log = logging.getLogger(__name__)

QUEUE_KEY = "report:jobs"
_worker_thread: threading.Thread | None = None
_stop_event = threading.Event()


def enqueue_report_job(
    execution_id: uuid.UUID,
    module_id: uuid.UUID,
    template_id: uuid.UUID,
    params: dict | None = None,
) -> bool:
    """Push a report generation job to Redis queue.

    Returns True if enqueued successfully, False if Redis unavailable.
    """
    r = get_redis(decode_responses=True)
    if not r:
        return False

    job = json.dumps({
        "execution_id": str(execution_id),
        "module_id": str(module_id),
        "template_id": str(template_id),
        "params": params or {},
    })
    try:
        r.rpush(QUEUE_KEY, job)
        _log.info("Enqueued report job: exec=%s", execution_id)
        return True
    except Exception as e:
        _log.error("Failed to enqueue report job: %s", e)
        return False


def _process_job(job_data: dict) -> None:
    """Process a single report generation job."""
    from sqlmodel import Session, select

    from app.core.db import engine
    from app.engines.excel.executor import ExcelReportExecutor
    from app.models_report import (
        ExecutionStatusEnum,
        ReportExecution,
        ReportModule,
        ReportSheetMapping,
        ReportTemplate,
    )

    exec_id = uuid.UUID(job_data["execution_id"])
    mod_id = uuid.UUID(job_data["module_id"])
    tpl_id = uuid.UUID(job_data["template_id"])
    params = job_data.get("params", {})

    try:
        with Session(engine) as session:
            mod = session.get(ReportModule, mod_id)
            tpl = session.get(ReportTemplate, tpl_id)
            exc = session.get(ReportExecution, exec_id)

            if not mod or not tpl or not exc:
                _log.warning(
                    "Job skipped: missing entities (exec=%s, mod=%s, tpl=%s)",
                    exec_id, mod_id, tpl_id,
                )
                if exc:
                    exc.status = ExecutionStatusEnum.FAILED
                    exc.error_message = "Module or template was deleted"
                    session.add(exc)
                    session.commit()
                return

            mappings = list(
                session.exec(
                    select(ReportSheetMapping).where(
                        ReportSheetMapping.report_template_id == tpl_id
                    )
                ).all()
            )
            ExcelReportExecutor().execute(session, mod, tpl, mappings, exc, params)
    except Exception as e:
        _log.error("Job failed: exec=%s error=%s", exec_id, e, exc_info=True)


def _create_worker_redis():
    """Create a dedicated Redis client for the worker with longer timeout."""
    try:
        import redis
        return redis.Redis.from_url(
            settings.redis_url,
            decode_responses=True,
            socket_timeout=10,
            socket_connect_timeout=5,
        )
    except Exception as e:
        _log.warning("Failed to create worker Redis client: %s", e)
        return None


def _worker_loop() -> None:
    """Background worker that polls Redis for jobs."""
    _log.info("Report job worker started")
    r = _create_worker_redis()
    if not r:
        _log.warning("Redis not available — report worker exiting")
        return

    while not _stop_event.is_set():
        try:
            # BLPOP with 5-second timeout so we can check stop_event
            result = r.blpop(QUEUE_KEY, timeout=5)
            if result is None:
                continue
            _, job_str = result
            job_data = json.loads(job_str)
            _log.info("Processing report job: exec=%s", job_data.get("execution_id"))
            _process_job(job_data)
        except json.JSONDecodeError as e:
            _log.error("Invalid job data: %s", e)
        except (ConnectionError, TimeoutError, OSError) as e:
            _log.warning("Redis connection lost, reconnecting in 3s: %s", e)
            time.sleep(3)
            r = _create_worker_redis()
            if not r:
                _log.error("Redis reconnect failed — worker exiting")
                break
        except Exception as e:
            _log.error("Worker error: %s", e, exc_info=True)
            time.sleep(1)

    _log.info("Report job worker stopped")


def start_worker() -> None:
    """Start the background worker thread (idempotent)."""
    global _worker_thread
    if _worker_thread and _worker_thread.is_alive():
        return
    _stop_event.clear()
    _worker_thread = threading.Thread(target=_worker_loop, daemon=True, name="report-worker")
    _worker_thread.start()


def stop_worker() -> None:
    """Signal the worker to stop."""
    _stop_event.set()


def recover_orphaned_executions() -> None:
    """Mark any pending/running executions as failed on startup."""
    from datetime import UTC, datetime

    from sqlmodel import Session, select

    from app.core.db import engine
    from app.models_report import ExecutionStatusEnum, ReportExecution

    try:
        with Session(engine) as session:
            orphaned = session.exec(
                select(ReportExecution).where(
                    ReportExecution.status.in_([
                        ExecutionStatusEnum.PENDING,
                        ExecutionStatusEnum.RUNNING,
                    ])
                )
            ).all()
            if orphaned:
                for exc in orphaned:
                    exc.status = ExecutionStatusEnum.FAILED
                    exc.error_message = "Server restarted during execution"
                    exc.completed_at = datetime.now(UTC)
                    session.add(exc)
                session.commit()
                _log.info("Recovered %d orphaned report executions", len(orphaned))
    except Exception as e:
        _log.warning("Failed to recover orphaned executions: %s", e)
