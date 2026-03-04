"""Tests for structured logging configuration."""

import logging

from app.core.logging_config import configure_logging


def test_configure_logging_sets_root_handler() -> None:
    """After configure_logging(), the root logger should have a structlog handler."""
    configure_logging()
    root = logging.getLogger()
    assert len(root.handlers) >= 1
    # The handler should use structlog's ProcessorFormatter
    handler = root.handlers[0]
    assert handler.formatter is not None
    assert "ProcessorFormatter" in type(handler.formatter).__name__


def test_configure_logging_quiets_noisy_loggers() -> None:
    """Noisy loggers should be set to WARNING or above."""
    configure_logging()
    for name in ("uvicorn.access", "httpcore", "httpx"):
        assert logging.getLogger(name).level >= logging.WARNING
