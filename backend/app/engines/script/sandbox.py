"""
RestrictedPython sandbox for script execution (Phase 3, Task 3.3).

Allowed: dict, list, str, int, float, bool, range, enumerate, zip, sorted,
len, round, min, max, sum, abs, json.loads/dumps, datetime/date/time/timedelta,
and context objects (db, http, cache, env, log, req, tx, ds).

Blocked: open, exec, eval, __import__, compile, os, subprocess, etc.
"""

import json
from datetime import date, datetime, time, timedelta
from typing import Any

from RestrictedPython import compile_restricted
from RestrictedPython.Eval import default_guarded_getitem, default_guarded_getiter
from RestrictedPython.Guards import (
    full_write_guard,
    guarded_iter_unpack_sequence,
    safe_builtins,
    safer_getattr,
)


def _make_safe_builtins() -> dict[str, Any]:
    """Builtins + json/datetime symbols. safe_builtins already has dict, list, range, etc."""
    return dict(safe_builtins)


def _make_guard_globals() -> dict[str, Any]:
    """Guards required by RestrictedPython's rewritten bytecode."""
    return {
        "_getattr_": safer_getattr,
        "_getiter_": default_guarded_getiter,
        "_getitem_": default_guarded_getitem,
        "_iter_unpack_sequence_": guarded_iter_unpack_sequence,
        "_write_": full_write_guard,
    }


def _make_extra_globals() -> dict[str, Any]:
    """Extra safe symbols: json, datetime, date, time, timedelta."""
    return {
        "json": json,
        "datetime": datetime,
        "date": date,
        "time": time,
        "timedelta": timedelta,
    }


def compile_script(script: str, filename: str = "<script>") -> Any:
    """
    Compile script with RestrictedPython. Raises SyntaxError or other on failure.

    Returns a code object suitable for exec(bytecode, globals, locals).
    """
    code = compile_restricted(script, filename, "exec")
    if code is None:
        raise SyntaxError("RestrictedPython: compile failed")
    return code


def build_restricted_globals(context_dict: dict[str, Any]) -> dict[str, Any]:
    """
    Build the globals dict for exec(compiled, globals): safe builtins, guards,
    extra (json, datetime), and context (db, http, cache, env, log, req, tx, ds).
    """
    g: dict[str, Any] = {
        "__builtins__": _make_safe_builtins(),
        "__name__": "script",
    }
    g.update(_make_guard_globals())
    g.update(_make_extra_globals())
    g.update(context_dict)
    return g
