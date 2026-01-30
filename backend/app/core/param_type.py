"""
Parameter type validation and coercion.

Validates and coerces request params according to params_definition[].data_type.
Runs after required check, before param_validates (script). Used by gateway and debug.
"""

from __future__ import annotations

import json
from typing import Any


class ParamTypeError(ValueError):
    """Raised when a parameter fails type validation or coercion."""

    pass


def _coerce_string(value: Any) -> str:
    if value is None:
        raise ParamTypeError("Value is empty")
    return str(value).strip()


def _coerce_number(value: Any) -> float:
    if value is None:
        raise ParamTypeError("Value is empty")
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    s = str(value).strip()
    if not s:
        raise ParamTypeError("Value is empty")
    try:
        x = float(s)
    except ValueError as e:
        raise ParamTypeError(f"Invalid number: {s!r}") from e
    return x


def _coerce_integer(value: Any) -> int:
    if value is None:
        raise ParamTypeError("Value is empty")
    if isinstance(value, bool):
        raise ParamTypeError("Boolean not allowed for integer")
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        if not value.is_integer():
            raise ParamTypeError(f"Expected integer, got float: {value}")
        return int(value)
    s = str(value).strip()
    if not s:
        raise ParamTypeError("Value is empty")
    try:
        x = float(s)
    except ValueError as e:
        raise ParamTypeError(f"Invalid integer: {s!r}") from e
    if not x.is_integer():
        raise ParamTypeError(f"Expected integer, got: {s!r}")
    return int(x)


def _coerce_boolean(value: Any) -> bool:
    if value is None:
        raise ParamTypeError("Value is empty")
    if isinstance(value, bool):
        return value
    if isinstance(value, int):
        if value == 0:
            return False
        if value == 1:
            return True
        raise ParamTypeError(f"Expected boolean, got integer: {value}")
    s = str(value).strip().lower()
    if s in ("true", "1", "yes"):
        return True
    if s in ("false", "0", "no"):
        return False
    raise ParamTypeError(f"Expected boolean (true/false, 1/0, yes/no), got: {value!r}")


def _coerce_array(value: Any) -> list[Any]:
    if value is None:
        raise ParamTypeError("Value is empty")
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        s = value.strip()
        if not s:
            raise ParamTypeError("Value is empty")
        if s.startswith("["):
            try:
                out = json.loads(s)
            except json.JSONDecodeError as e:
                raise ParamTypeError(f"Invalid JSON array: {e}") from e
            if not isinstance(out, list):
                raise ParamTypeError("JSON is not an array")
            return out
        return [x.strip() for x in s.split(",") if x.strip()]
    raise ParamTypeError(f"Expected array or JSON array string, got: {type(value).__name__}")


def _coerce_object(value: Any) -> dict[str, Any]:
    if value is None:
        raise ParamTypeError("Value is empty")
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        s = value.strip()
        if not s:
            raise ParamTypeError("Value is empty")
        try:
            out = json.loads(s)
        except json.JSONDecodeError as e:
            raise ParamTypeError(f"Invalid JSON object: {e}") from e
        if not isinstance(out, dict):
            raise ParamTypeError("JSON is not an object")
        return out
    raise ParamTypeError(f"Expected object or JSON object string, got: {type(value).__name__}")


_COERCERS: dict[str, type] = {
    "string": _coerce_string,
    "number": _coerce_number,
    "integer": _coerce_integer,
    "int": _coerce_integer,
    "boolean": _coerce_boolean,
    "bool": _coerce_boolean,
    "array": _coerce_array,
    "object": _coerce_object,
    "obj": _coerce_object,
}


def validate_and_coerce_params(
    params_definition: list[dict[str, Any]] | None,
    params: dict[str, Any] | None,
) -> dict[str, Any]:
    """
    Validate and coerce params by data_type. Params in definition are coerced;
    others (e.g. path params not in definition) are passed through unchanged.

    - params_definition: list of {name, data_type, is_required, default_value, ...}
    - params: raw request params (from parse_params or debug body)

    Returns coerced params dict. Raises ParamTypeError on first failure.
    """
    _params = dict(params or {})
    if not params_definition:
        return _params

    for param_def in params_definition:
        if not isinstance(param_def, dict):
            continue
        name = param_def.get("name")
        if not name or not isinstance(name, str):
            continue
        name = name.strip()
        data_type = param_def.get("data_type")
        dtype = (data_type or "string").strip().lower() if isinstance(data_type, str) else "string"
        coerce_fn = _COERCERS.get(dtype) or _coerce_string

        raw = _params.get(name)
        if raw is None or raw == "":
            default = param_def.get("default_value")
            if default is not None and default != "":
                try:
                    _params[name] = coerce_fn(default)
                except ParamTypeError as e:
                    raise ParamTypeError(f"Parameter '{name}' default_value invalid: {e}") from e
            else:
                _params.pop(name, None)
            continue

        try:
            _params[name] = coerce_fn(raw)
        except ParamTypeError as e:
            raise ParamTypeError(f"Parameter '{name}' {e}") from e

    return _params
