"""
ScriptExecutor: execute(script, context) -> result (Phase 3, Task 3.3).

Compiles with RestrictedPython, runs in sandbox, returns context['result'].
Script must set `result`. If not set, returns None.
Optional: SCRIPT_EXEC_TIMEOUT (signal.SIGALRM on Unix) aborts long-running scripts.
"""

import signal
from typing import Any

from app.core.config import settings

from .context import ScriptContext
from .sandbox import build_restricted_globals, compile_script


class ScriptTimeoutError(TimeoutError):
    """Raised when script execution exceeds SCRIPT_EXEC_TIMEOUT."""

    pass


def _exec_with_timeout(code: object, g: dict[str, Any], timeout_sec: int) -> None:
    """Run exec(code, g) with signal.SIGALRM. Unix only; requires hasattr(signal, 'SIGALRM')."""
    def _handler(signum: int, frame: Any) -> None:
        raise ScriptTimeoutError(f"Script execution timed out after {timeout_sec}s")

    old = signal.signal(signal.SIGALRM, _handler)
    try:
        signal.alarm(timeout_sec)
        try:
            exec(code, g)
        finally:
            signal.alarm(0)
    finally:
        signal.signal(signal.SIGALRM, old)


class ScriptExecutor:
    """
    Run a Python script in a RestrictedPython sandbox with ScriptContext (db, http, cache, env, log, req, tx, ds).
    """

    def execute(self, script: str, context: ScriptContext) -> Any:
        """
        Compile script, exec in restricted globals, return result.
        The script must assign to `result`. On success, returns context['result']; if missing, returns None.
        If SCRIPT_EXEC_TIMEOUT is set and SIGALRM is available (Unix), aborts after N seconds.
        Always calls context.release_script_connection() in finally.
        """
        code = compile_script(script)
        g = build_restricted_globals(context.to_dict())
        timeout = settings.SCRIPT_EXEC_TIMEOUT
        use_signal = (
            timeout is not None
            and timeout > 0
            and hasattr(signal, "SIGALRM")
        )
        try:
            if use_signal:
                _exec_with_timeout(code, g, timeout)
            else:
                exec(code, g)
            return g.get("result")
        finally:
            context.release_script_connection()
