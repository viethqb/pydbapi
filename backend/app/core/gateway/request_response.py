"""
Gateway request/response (Phase 4, Task 4.3): parse_params, keys_to_snake, keys_to_camel, format_response.

- parse_params: merge path, query, body (path > query > body); optional camel→snake for body/query.
  Returns (params, body_for_log) for AccessRecord when GATEWAY_ACCESS_LOG_BODY.
- format_response: optional snake→camel for result; always JSON-serializable structure.
"""

import json
import re
import uuid
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from typing import Any

from starlette.requests import Request


def _to_snake_str(s: str) -> str:
    """camelCase → snake_case. E.g. userId → user_id, firstName → first_name."""
    s = str(s)
    return re.sub(r"(?<!^)(?=[A-Z])", "_", s).lower()


def _to_camel_str(s: str) -> str:
    """snake_case → camelCase. E.g. user_id → userId, first_name → firstName."""
    s = str(s)
    parts = s.split("_")
    if not parts:
        return ""
    return parts[0].lower() + "".join(p.capitalize() for p in parts[1:])


def keys_to_snake(obj: Any) -> Any:
    """
    Recursively convert dict keys from camelCase to snake_case.
    Lists: recurse into items. Other values: unchanged.
    """
    if isinstance(obj, dict):
        return {_to_snake_str(k): keys_to_snake(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [keys_to_snake(x) for x in obj]
    return obj


def keys_to_camel(obj: Any) -> Any:
    """
    Recursively convert dict keys from snake_case to camelCase.
    Lists: recurse into items. Other values: unchanged.
    """
    if isinstance(obj, dict):
        return {_to_camel_str(k): keys_to_camel(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [keys_to_camel(x) for x in obj]
    return obj


async def _read_body(request: Request) -> dict[str, Any]:
    """Read JSON or form body; return {} on no body or unsupported type."""
    ct = (request.headers.get("content-type") or "").split(";")[0].strip().lower()
    if ct == "application/json":
        try:
            raw = await request.json()
        except Exception:
            return {}
        return raw if isinstance(raw, dict) else {}
    if ct in ("application/x-www-form-urlencoded", "multipart/form-data"):
        try:
            form = await request.form()
            return dict(form)
        except Exception:
            return {}
    return {}


async def parse_params(
    request: Request,
    path_params: dict[str, Any],
    http_method: str,  # noqa: ARG001 reserved for future (e.g. skip body for GET)
    params_definition: list[dict[str, Any]] | None = None,
) -> tuple[dict[str, Any], str | None]:
    """
    Merge path, query, body, and header into a single params dict for ApiExecutor.
    Conflict order: path > query > body > header (path wins).

    - Path: from resolver path_params.
    - Query: request.query_params (any method).
    - Body: application/json → request.json(); application/x-www-form-urlencoded or
      multipart/form-data → request.form() (fields only).
    - Header: extract from request.headers based on params_definition with location="header".

    Request naming: ?naming=snake (default) or ?naming=camel. If camel, convert
    body and query keys from camelCase to snake_case before merge. Path params are
    not converted.

    Returns: (params for ApiExecutor.execute(..., params=...), body_for_log for
      AccessRecord when GATEWAY_ACCESS_LOG_BODY; body_for_log is JSON string or None).
    """
    query = dict(request.query_params)
    naming_req = (query.get("naming") or "snake").strip().lower()
    if naming_req not in ("snake", "camel"):
        naming_req = "snake"

    body = await _read_body(request)
    if naming_req == "camel":
        body = keys_to_snake(body)
        query = keys_to_snake(query)

    # Build params honoring configured locations when params_definition is provided.
    #
    # Important: when params_definition exists, we DO NOT merge freely across sources.
    # A param configured as "header" must come from headers (not query/body).
    # Path params are always included (resolved by router).
    out: dict[str, Any] = dict(path_params)

    if params_definition:
        # Case-insensitive header lookup map
        headers_ci: dict[str, str] = {k.lower(): v for k, v in request.headers.items()}

        def _get_header_value(name: str) -> str | None:
            if not name:
                return None
            v = request.headers.get(name)
            if v is not None:
                return v
            return headers_ci.get(name.lower())

        for param_def in params_definition:
            if not isinstance(param_def, dict):
                continue
            name = param_def.get("name")
            if not isinstance(name, str) or not name.strip():
                continue
            name = name.strip()
            loc = (param_def.get("location") or "query")
            if isinstance(loc, str):
                loc = loc.strip().lower()
            else:
                loc = "query"

            if loc == "header":
                hv = _get_header_value(name)
                if hv is not None:
                    out[name] = hv
                continue

            if loc == "body":
                if name in body:
                    out[name] = body.get(name)
                continue

            # default: query
            if name in query:
                out[name] = query.get(name)
        # Note: unknown params (not in definition) are ignored (except path params).
    else:
        # Backward-compatible: merge path > query > body; and include extracted header params.
        # Header extraction only applies when params_definition exists, so here it's just body/query/path.
        out.update(body)
        out.update(query)
        out.update(path_params)

    body_for_log: str | None = None
    if body:
        try:
            body_for_log = json.dumps(body, default=str)
        except Exception:
            pass
    return (out, body_for_log)


def normalize_api_result(result: Any, execute_engine: str | None = None) -> dict[str, Any]:
    """
    Format executor result for API response. All responses use envelope:
    { "success": true|false, "message": str|null, "data": list }.
    Applied for all HTTP methods (GET, POST, PUT, PATCH, DELETE) in gateway and debug.
    Preserves extra keys from result_transform (e.g. offset, limit, total).
    """
    # SQL mode: wrap in envelope { success, message, data }. Single statement -> data = rows (no extra list wrap).
    if execute_engine == "SQL":
        if isinstance(result, dict) and "data" in result:
            data = result["data"]
            # Unwrap only when single result set [[row1, row2]] -> [row1, row2].
            # Do NOT unwrap [row1] (already rows from result_transform) -> keep as [row1].
            if isinstance(data, list) and len(data) == 1 and isinstance(data[0], list):
                data = data[0]
            elif not isinstance(data, list):
                data = [data] if data is not None else []
            out = {"success": True, "message": None, "data": data}
            # Preserve extra keys from result_transform (offset, limit, total, etc.)
            for k, v in result.items():
                if k not in ("data", "success", "message"):
                    out[k] = v
            return out
        raw = result if isinstance(result, list) else [result] if result is not None else []
        return {"success": True, "message": None, "data": raw}

    # SCRIPT mode: unwrap envelope to top level
    if isinstance(result, dict) and "data" in result:
        inner = result["data"]
        if (
            isinstance(inner, dict)
            and "success" in inner
            and "message" in inner
            and "data" in inner
        ):
            data = inner["data"]
            if not isinstance(data, list):
                data = [data] if data is not None else []
            out = dict(inner)
            out["data"] = data
            return out
        # Script returned something else -> wrap
        data = result["data"]
        if not isinstance(data, list):
            data = [data] if data is not None else []
        return {"success": True, "message": None, "data": data}
    # Result transform or raw (result already has success, message, data)
    if isinstance(result, dict) and "success" in result and "message" in result and "data" in result:
        data = result["data"]
        if not isinstance(data, list):
            data = [data] if data is not None else []
        out = {
            "success": bool(result.get("success", True)),
            "message": result.get("message"),
            "data": data,
        }
        for k, v in result.items():
            if k not in ("success", "message", "data"):
                out[k] = v
        return out
    if isinstance(result, list):
        return {"success": True, "message": None, "data": result}
    return {"success": True, "message": None, "data": [result] if result is not None else []}


def _response_naming(request: Request) -> str:
    """'camel' if ?naming=camel or X-Response-Naming: camel; else 'snake'."""
    q = (request.query_params.get("naming") or "").strip().lower()
    if q == "camel":
        return "camel"
    h = (request.headers.get("x-response-naming") or "").strip().lower()
    return "camel" if h == "camel" else "snake"


def _make_json_safe(obj: Any) -> Any:
    """Recursively convert non-JSON-serializable types to safe primitives.

    Handles: datetime, date, time, timedelta, Decimal, UUID, bytes, sets.
    This prevents ``TypeError: Object of type datetime is not JSON serializable``
    when DB rows contain native Python date/time or Decimal values.
    """
    if obj is None or isinstance(obj, (bool, int, float, str)):
        return obj
    if isinstance(obj, datetime):
        return obj.isoformat()
    if isinstance(obj, date):
        return obj.isoformat()
    if isinstance(obj, time):
        return obj.isoformat()
    if isinstance(obj, timedelta):
        return obj.total_seconds()
    if isinstance(obj, Decimal):
        # Preserve integer-valued decimals as int, otherwise float
        if obj == int(obj):
            return int(obj)
        return float(obj)
    if isinstance(obj, uuid.UUID):
        return str(obj)
    if isinstance(obj, bytes):
        return obj.decode("utf-8", errors="replace")
    if isinstance(obj, dict):
        return {k: _make_json_safe(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_make_json_safe(item) for item in obj]
    if isinstance(obj, set):
        return [_make_json_safe(item) for item in sorted(obj, key=str)]
    # Fallback: use str() for unknown types
    return str(obj)


def format_response(result: dict[str, Any] | Any, request: Request) -> dict[str, Any] | list[Any] | Any:
    """
    Apply response naming and return JSON-serializable structure.

    Expects result to be normalized to { success, message, data } (see normalize_api_result).
    If ?naming=camel or X-Response-Naming: camel: recursively convert keys to camelCase.

    Always ensures the output is JSON-safe (datetime, Decimal, UUID etc. are converted).
    """
    if not isinstance(result, dict):
        return _make_json_safe(result)
    if _response_naming(request) == "camel":
        return _make_json_safe(keys_to_camel(result))
    return _make_json_safe(result)
