"""
Log module for script engine: info, warn, error, debug (Phase 3, Task 3.3).
"""

import logging
from types import SimpleNamespace
from typing import Any

logger = logging.getLogger(__name__)


def make_log_module(
    *,
    logger_instance: logging.Logger | None = None,
    extra: dict[str, Any] | None = None,
) -> Any:
    """Build the `log` object: info, warn, error, debug. extra is passed to logger as context."""
    log = logger_instance or logger
    ext = extra or {}

    def _log(level: int, msg: str, *args: Any, **kwargs: Any) -> None:
        merged = {**ext, **kwargs.pop("extra", {})}
        if merged:
            kwargs["extra"] = merged
        log.log(level, msg, *args, **kwargs)

    def info(msg: str, *args: Any, **kwargs: Any) -> None:
        _log(logging.INFO, msg, *args, **kwargs)

    def warn(msg: str, *args: Any, **kwargs: Any) -> None:
        _log(logging.WARNING, msg, *args, **kwargs)

    def error(msg: str, *args: Any, **kwargs: Any) -> None:
        _log(logging.ERROR, msg, *args, **kwargs)

    def debug(msg: str, *args: Any, **kwargs: Any) -> None:
        _log(logging.DEBUG, msg, *args, **kwargs)

    return SimpleNamespace(info=info, warn=warn, error=error, debug=debug)
