"""
Param validate runner.

Executes per-parameter validation scripts stored in ApiContext.param_validates.
Each script is expected to define:

    def validate(value, params=None):
        return True/False
"""

from __future__ import annotations

from typing import Any

from app.engines.script.sandbox import build_restricted_globals, compile_script


class ParamValidateError(ValueError):
    """Raised when a parameter validation fails."""

    pass


def run_param_validates(
    param_validates: list[dict[str, Any]] | None,
    params: dict[str, Any] | None,
) -> None:
    """
    Run validation scripts for params.

    - param_validates: list of {name, validation_script, message_when_fail}
    - params: request params dict

    Raises ParamValidateError on first failure.
    """
    if not param_validates:
        return
    _params = params or {}

    for rule in param_validates:
        if not isinstance(rule, dict):
            continue
        name = rule.get("name")
        if not name or not isinstance(name, str):
            continue
        script = rule.get("validation_script") or ""
        if not isinstance(script, str) or script.strip() == "":
            # no script => skip
            continue
        message = rule.get("message_when_fail") or f"Validation failed for param '{name}'"
        if not isinstance(message, str) or message.strip() == "":
            message = f"Validation failed for param '{name}'"

        value = _params.get(name)

        # Compile/exec in RestrictedPython globals; provide value + params.
        code = compile_script(script, filename=f"<param_validate:{name}>")
        g = build_restricted_globals({"value": value, "params": _params})
        exec(code, g)  # noqa: S102 - RestrictedPython compiled code

        fn = g.get("validate")
        if not callable(fn):
            raise ParamValidateError(
                f"Param validate script for '{name}' must define function validate(value, params=None)"
            )

        ok = False
        try:
            ok = bool(fn(value, _params))
        except Exception as e:
            raise ParamValidateError(f"{message}. Error: {e}") from e

        if not ok:
            raise ParamValidateError(message)

