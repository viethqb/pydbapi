"""
Result transform runner.

Executes a Python transform script against the raw result returned by ApiExecutor.

The script is executed in a RestrictedPython sandbox (same as the SCRIPT engine)
and is expected to define:

    def transform(result, params=None):
        # mutate and/or return a new result
        return result

If transform(...) returns a value other than None, that value is used as the
final result. Otherwise, the (possibly mutated) ``result`` object is used.
"""

from __future__ import annotations

from typing import Any

from app.engines.script.sandbox import build_restricted_globals, compile_script


class ResultTransformError(ValueError):
    """Raised when a result transform script fails or is invalid."""

    pass


def run_result_transform(
    script: str | None,
    result: Any,
    params: dict[str, Any] | None = None,
    *,
    macros_prepend: list[str] | None = None,
) -> Any:
    """
    Run the given transform script on result and return the transformed result.

    - script: Python source code. If empty/None, result is returned unchanged.
    - result: raw result from ApiExecutor (dict or any JSON-serializable object).
    - params: request parameters dict (query/body/header/path) for context.
    - macros_prepend: optional Python macro definitions prepended to script (helpers usable in transform).
    """
    if not script or not isinstance(script, str) or script.strip() == "":
        return result

    _macros = macros_prepend or []
    if _macros:
        script = "\n\n".join(_macros) + "\n\n" + script

    try:
        code = compile_script(script, filename="<result_transform>")
        g = build_restricted_globals({"result": result, "params": params or {}})
        # Execute script; it may define transform() and/or mutate ``result``.
        exec(code, g)  # noqa: S102 - restricted environment

        fn = g.get("transform")
        if callable(fn):
            transformed = fn(result, params or {})
            # If transform() returns something non-None, use it; otherwise use result.
            return transformed if transformed is not None else g.get("result", result)

        # No transform() defined: fall back to possibly mutated ``result`` variable.
        return g.get("result", result)
    except Exception as e:  # pragma: no cover - error path mainly for runtime
        raise ResultTransformError(f"Result transform failed: {e}") from e
