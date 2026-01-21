"""
ScriptExecutor: execute(script, context) -> result (Phase 3, Task 3.3).

Compiles with RestrictedPython, runs in sandbox, returns context['result'].
Script must set `result`. If not set, returns None.
"""

from typing import Any

from .context import ScriptContext
from .sandbox import build_restricted_globals, compile_script


class ScriptExecutor:
    """
    Run a Python script in a RestrictedPython sandbox with ScriptContext (db, http, cache, env, log, req, tx, ds).
    """

    def execute(self, script: str, context: ScriptContext) -> Any:
        """
        Compile script, exec in restricted globals, return result.
        The script must assign to `result`. On success, returns context['result']; if missing, returns None.
        Always calls context.release_script_connection() in finally.
        """
        code = compile_script(script)
        g = build_restricted_globals(context.to_dict())
        try:
            exec(code, g)
            return g.get("result")
        finally:
            context.release_script_connection()
