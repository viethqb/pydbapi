"""
ScriptExecutor: execute(script, context) -> result (Phase 3, Task 3.3).

Compiles with RestrictedPython, runs in sandbox, returns context['result'].
Script must set `result`. If not set, returns None.
Optional: SCRIPT_EXEC_TIMEOUT (signal.SIGALRM on Unix) aborts long-running scripts.
Optional: SCRIPT_EXTRA_MODULES (comma-separated) exposes whitelisted modules (e.g. pandas) in script globals.
"""

import importlib
import re
import signal
from typing import Any

from app.core.config import settings

from .context import ScriptContext
from .sandbox import build_restricted_globals, compile_script

# Only allow top-level module names (e.g. pandas, numpy), no submodules
_SAFE_MODULE_NAME_RE = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]*$")


class ScriptTimeoutError(TimeoutError):
    """Raised when script execution exceeds SCRIPT_EXEC_TIMEOUT."""

    pass


def _inject_extra_modules(g: dict[str, Any]) -> None:
    """Inject whitelisted extra modules (e.g. pandas) into script globals. Script cannot import; only names in SCRIPT_EXTRA_MODULES are available."""
    raw = (settings.SCRIPT_EXTRA_MODULES or "").strip()
    if not raw:
        return
    for name in (s.strip() for s in raw.split(",") if s.strip()):
        if not _SAFE_MODULE_NAME_RE.match(name):
            continue
        try:
            g[name] = importlib.import_module(name)
        except Exception:
            pass  # Skip missing or broken modules


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
        _inject_extra_modules(g)
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
            # Prefer execute(params) function (like transform result); fallback to global result
            execute_fn = g.get("execute")
            if callable(execute_fn):
                return execute_fn(context.req)
            return g.get("result")
        finally:
            context.release_script_connection()
