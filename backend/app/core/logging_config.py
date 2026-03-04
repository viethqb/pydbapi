"""Structured logging configuration using structlog as a stdlib ProcessorFormatter."""

import logging
import sys

import structlog


def configure_logging() -> None:
    """Configure structlog as the logging framework.

    Uses structlog's ``ProcessorFormatter`` so that *all* existing
    ``logging.getLogger()`` calls get structured output for free.

    - Local dev (``LOG_JSON=False``): coloured, human-readable console output.
    - Production (``LOG_JSON=True``): one JSON object per line.
    """
    from app.core.config import settings

    log_level = getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO)
    use_json = settings.LOG_JSON or settings.ENVIRONMENT in ("staging", "production")

    # Shared processors applied to every log event
    shared_processors: list[structlog.types.Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
    ]

    structlog.configure(
        processors=shared_processors,
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    if use_json:
        renderer: structlog.types.Processor = structlog.processors.JSONRenderer()
    else:
        renderer = structlog.dev.ConsoleRenderer()

    formatter = structlog.stdlib.ProcessorFormatter(
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            renderer,
        ],
    )

    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(formatter)

    root_logger = logging.getLogger()
    root_logger.handlers.clear()
    root_logger.addHandler(handler)
    root_logger.setLevel(log_level)

    # Quiet noisy loggers
    for name in ("uvicorn.access", "httpcore", "httpx"):
        logging.getLogger(name).setLevel(logging.WARNING)
