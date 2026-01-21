"""
Gateway request/response (Phase 4, Task 4.3): parse_params, keys_to_snake, keys_to_camel, format_response.

- parse_params: merge path, query, body (path > query > body); optional camel→snake for body/query.
  Returns (params, body_for_log) for AccessRecord when GATEWAY_ACCESS_LOG_BODY.
- format_response: optional snake→camel for result; always JSON-serializable structure.
"""

import json
import re
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
) -> tuple[dict[str, Any], str | None]:
    """
    Merge path, query, and body into a single params dict for ApiExecutor.
    Conflict order: path > query > body (path wins).

    - Path: from resolver path_params.
    - Query: request.query_params (any method).
    - Body: application/json → request.json(); application/x-www-form-urlencoded or
      multipart/form-data → request.form() (fields only).

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

    # path > query > body
    out: dict[str, Any] = {}
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


def _response_naming(request: Request) -> str:
    """'camel' if ?naming=camel or X-Response-Naming: camel; else 'snake'."""
    q = (request.query_params.get("naming") or "").strip().lower()
    if q == "camel":
        return "camel"
    h = (request.headers.get("x-response-naming") or "").strip().lower()
    return "camel" if h == "camel" else "snake"


def format_response(result: dict[str, Any] | Any, request: Request) -> dict[str, Any] | list[Any] | Any:
    """
    Apply response naming and return JSON-serializable structure.

    - Result: from ApiExecutor, e.g. {"data": [...]} or {"rowcount": int}.
    - If ?naming=camel or X-Response-Naming: camel: recursively convert keys to camelCase.
    - Default: leave as-is (snake_case from DB/engine).
    """
    if not isinstance(result, dict):
        return result
    if _response_naming(request) == "camel":
        return keys_to_camel(result)
    return result
