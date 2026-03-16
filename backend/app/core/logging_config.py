"""Structured logging configuration using structlog + stdlib ProcessorFormatter.

Every ``logging.getLogger()`` call gets structured output (timestamp, level,
logger name, contextvars) because we install a ``ProcessorFormatter`` with a
``foreign_pre_chain`` that enriches stdlib LogRecords before the renderer.
"""

import logging
import sys

import structlog

# Module-level state so we can re-apply after uvicorn resets the root logger.
_handler: logging.Handler | None = None
_log_level: int = logging.INFO


def configure_logging() -> None:
    """Configure structlog as the logging framework.

    - Local dev (``LOG_JSON=False``): coloured, human-readable console output.
    - Production (``LOG_JSON=True``): one JSON object per line.
    """
    global _handler, _log_level  # noqa: PLW0603
    from app.core.config import settings

    _log_level = getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO)
    use_json = settings.LOG_JSON or settings.ENVIRONMENT in ("staging", "production")

    # Processors that enrich every event (structlog-native *and* stdlib).
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

    # foreign_pre_chain: runs on stdlib LogRecords *before* the final
    # renderer so that timestamp / level / logger name are present.
    foreign_pre_chain: list[structlog.types.Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso"),
    ]

    if use_json:
        renderer: structlog.types.Processor = structlog.processors.JSONRenderer()
    else:
        renderer = structlog.dev.ConsoleRenderer()

    formatter = structlog.stdlib.ProcessorFormatter(
        foreign_pre_chain=foreign_pre_chain,
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            renderer,
        ],
    )

    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(formatter)
    _handler = handler

    _apply_root_handler()


def _apply_root_handler() -> None:
    """Replace all root-logger handlers with our structlog handler."""
    root_logger = logging.getLogger()
    root_logger.handlers.clear()
    if _handler is not None:
        root_logger.addHandler(_handler)
    root_logger.setLevel(_log_level)

    # Quiet noisy loggers
    for name in ("uvicorn.access", "httpcore", "httpx"):
        logging.getLogger(name).setLevel(logging.WARNING)


def reconfigure_logging() -> None:
    """Re-apply structlog handler after uvicorn has reset the root logger."""
    if _handler is None:
        configure_logging()
    else:
        _apply_root_handler()
