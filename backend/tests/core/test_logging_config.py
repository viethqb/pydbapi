"""Tests for structured logging configuration."""

import logging

from app.core.logging_config import configure_logging, reconfigure_logging


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


def test_reconfigure_logging_restores_after_reset() -> None:
    """reconfigure_logging() restores structlog handler after root logger is cleared."""
    configure_logging()
    # Simulate what uvicorn does: clear and replace with its own handler
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(logging.StreamHandler())
    assert "ProcessorFormatter" not in type(root.handlers[0].formatter).__name__

    # Reconfigure should restore our structlog handler
    reconfigure_logging()
    assert len(root.handlers) == 1
    assert "ProcessorFormatter" in type(root.handlers[0].formatter).__name__
