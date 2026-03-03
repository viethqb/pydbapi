"""
ScriptExecutor: execute(script, context) -> result (Phase 3, Task 3.3).

Compiles with RestrictedPython, runs in sandbox, returns context['result'].
Script must set `result`. If not set, returns None.
Optional: SCRIPT_EXEC_TIMEOUT (seconds) — thread-based timeout (all platforms, CPython).
Optional: SCRIPT_EXTRA_MODULES (comma-separated) exposes whitelisted modules (e.g. pandas) in script globals.
"""

import ctypes
import importlib
import logging
import re
import threading
from collections import OrderedDict
from hashlib import md5
from typing import Any

from app.core.config import settings

from .context import ScriptContext
from .sandbox import build_restricted_globals, compile_script

_LOG = logging.getLogger(__name__)

# Only allow top-level module names (e.g. pandas, numpy), no submodules
_SAFE_MODULE_NAME_RE = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]*$")

# Modules that must never be injected into the script sandbox, even if an
# admin accidentally adds them to SCRIPT_EXTRA_MODULES.  These would let
# script authors escape the RestrictedPython sandbox entirely.
_BLOCKED_MODULES = frozenset(
    {
        # OS / process / shell
        "os",
        "sys",
        "subprocess",
        "shutil",
        "signal",
        "posix",
        "nt",
        "multiprocessing",
        "threading",
        "ctypes",
        "_thread",
        # Code execution / import system
        "importlib",
        "code",
        "codeop",
        "compileall",
        "compile",
        "runpy",
        "ast",
        "dis",
        "inspect",
        "types",
        # File / network I/O
        "io",
        "socket",
        "http",
        "urllib",
        "requests",
        "httpx",
        "ftplib",
        "smtplib",
        "poplib",
        "imaplib",
        "xmlrpc",
        "pathlib",
        "glob",
        "fnmatch",
        "tempfile",
        "fileinput",
        # Persistence / serialization (arbitrary code execution via pickle)
        "pickle",
        "shelve",
        "marshal",
        # Security-sensitive internals
        "builtins",
        "_io",
        "_socket",
        "_subprocess",
        "gc",
        "resource",
        "sysconfig",
        "distutils",
        "setuptools",
        "pip",
    }
)

_SCRIPT_CACHE_MAX_SIZE = 256
_script_cache: "OrderedDict[str, object]" = OrderedDict()
_script_cache_lock = threading.Lock()


def _compile_script_cached(script: str) -> object:
    """
    Compile script with a small LRU cache keyed by content hash.
    Reuses code objects across executions for identical script text.
    """
    key = md5(script.encode("utf-8"), usedforsecurity=False).hexdigest()
    with _script_cache_lock:
        code = _script_cache.get(key)
        if code is not None:
            _script_cache.move_to_end(key)
            return code
    code = compile_script(script)
    with _script_cache_lock:
        _script_cache[key] = code
        if len(_script_cache) > _SCRIPT_CACHE_MAX_SIZE:
            _script_cache.popitem(last=False)
    return code


class ScriptTimeoutError(TimeoutError):
    """Raised when script execution exceeds SCRIPT_EXEC_TIMEOUT."""

    pass


def _inject_extra_modules(g: dict[str, Any]) -> None:
    """Inject whitelisted extra modules (e.g. pandas) into script globals.

    Script cannot import; only names in SCRIPT_EXTRA_MODULES are available.
    Modules in ``_BLOCKED_MODULES`` are silently rejected to prevent sandbox
    escape even if an admin misconfigures the allow-list.
    """
    raw = (settings.SCRIPT_EXTRA_MODULES or "").strip()
    if not raw:
        return
    for name in (s.strip() for s in raw.split(",") if s.strip()):
        if not _SAFE_MODULE_NAME_RE.match(name):
            continue
        if name in _BLOCKED_MODULES:
            _LOG.warning("SCRIPT_EXTRA_MODULES: blocked dangerous module '%s'", name)
            continue
        try:
            g[name] = importlib.import_module(name)
        except Exception:
            pass  # Skip missing or broken modules


def _exec_with_timeout(code: object, g: dict[str, Any], timeout_sec: int) -> None:
    """Run exec(code, g) in a daemon thread with a timeout.

    Uses ctypes.pythonapi.PyThreadState_SetAsyncExc to inject
    ScriptTimeoutError into the worker thread. Works on any OS,
    from any calling thread (CPython required).
    """
    exc_info: list[BaseException] = []

    def _target() -> None:
        try:
            exec(code, g)
        except BaseException as e:
            exc_info.append(e)

    t = threading.Thread(target=_target, daemon=True)
    t.start()
    t.join(timeout=timeout_sec)

    if t.is_alive():
        # Inject ScriptTimeoutError into the running thread
        tid = t.ident
        if tid is not None:
            res = ctypes.pythonapi.PyThreadState_SetAsyncExc(
                ctypes.c_ulong(tid),
                ctypes.py_object(ScriptTimeoutError),
            )
            # res > 1 means we accidentally hit multiple threads — undo
            if res > 1:
                ctypes.pythonapi.PyThreadState_SetAsyncExc(ctypes.c_ulong(tid), None)
        # Give the thread a moment to clean up
        t.join(timeout=1.0)
        raise ScriptTimeoutError(f"Script execution timed out after {timeout_sec}s")

    # Re-raise any exception captured in the worker thread
    if exc_info:
        raise exc_info[0]


class ScriptExecutor:
    """
    Run a Python script in a RestrictedPython sandbox with ScriptContext (db, http, cache, env, log, req, tx, ds).
    """

    def execute(self, script: str, context: ScriptContext) -> Any:
        """
        Compile script (with LRU cache), exec in restricted globals, return result.
        The script must assign to `result`. On success, returns context['result']; if missing, returns None.
        If SCRIPT_EXEC_TIMEOUT is set, aborts after N seconds (thread-based, all platforms).
        Always calls context.release_script_connection() in finally.
        """
        code = _compile_script_cached(script)
        g = build_restricted_globals(context.to_dict())
        _inject_extra_modules(g)
        timeout = settings.SCRIPT_EXEC_TIMEOUT
        use_timeout = timeout is not None and timeout > 0
        try:
            if use_timeout:
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
