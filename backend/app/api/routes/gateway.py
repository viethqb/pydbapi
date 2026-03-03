"""
Gateway (Phase 4, Task 4.1): dynamic /api/{path:path}.

Module is only for grouping/permissions — it does NOT appear in the URL.
URL pattern: /api/{path} where path = module.path_prefix + api.path.

Flow: pre-read body (async) → worker thread → firewall → resolve → auth →
concurrent → rate limit → config → merge_params → runner → return.

ALL synchronous I/O (database, Redis, runner execution) runs inside a single
``asyncio.to_thread()`` call so the async event loop is never blocked.
"""

import asyncio
import json
import logging
import time

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlmodel import Session

from app.core.config import settings
from app.core.db import engine
from app.core.gateway import (
    acquire_concurrent_slot,
    check_firewall,
    check_rate_limit,
    client_can_access_api,
    format_response,
    merge_params,
    normalize_api_result,
    release_concurrent_slot,
    verify_gateway_client,
)
from app.core.gateway.config_cache import get_or_load_gateway_config
from app.core.gateway.request_response import _read_body, get_response_naming
from app.core.gateway.resolver import resolve_gateway_api
from app.core.gateway.runner import run as runner_run
from app.models_dbapi import ApiAccessTypeEnum

_logger = logging.getLogger(__name__)

router = APIRouter(prefix="", tags=["gateway"], include_in_schema=False)


class _GatewayAbort(Exception):
    """Raised inside the sync pipeline to signal an HTTP error to the async handler."""

    __slots__ = ("status_code", "detail")

    def __init__(self, status_code: int, detail: str) -> None:
        self.status_code = status_code
        self.detail = detail


def _get_client_ip(request: Request) -> str:
    """Extract client IP respecting ``TRUSTED_PROXY_COUNT``.

    When ``TRUSTED_PROXY_COUNT`` is 0 (default) X-Forwarded-For is ignored
    to prevent IP spoofing.  When set to N, the Nth entry from the right
    of the XFF header is used (each trusted proxy appends one entry).
    """
    n = settings.TRUSTED_PROXY_COUNT
    if n > 0:
        xff = request.headers.get("x-forwarded-for")
        if xff:
            parts = [p.strip() for p in xff.split(",") if p.strip()]
            if parts:
                idx = max(len(parts) - n, 0)
                return parts[idx]
    return getattr(getattr(request, "client", None), "host", None) or "0.0.0.0"


def _gateway_pipeline(
    *,
    path: str,
    method: str,
    ip: str,
    auth_header: str,
    headers: dict[str, str],
    query: dict[str, str],
    body: dict,
    gateway_start: float,
) -> dict:
    """Run the entire gateway pipeline synchronously.

    Creates its own DB session (SQLModel sessions are not thread-safe).
    Returns a dict with ``_result``, ``_engine`` keys on success.
    Raises ``_GatewayAbort`` for expected HTTP errors (401, 403, 404, 429, 503).
    """
    with Session(engine) as session:
        # 1. Firewall
        if not check_firewall(ip, session):
            raise _GatewayAbort(403, "Forbidden")

        # 2. Resolve route
        resolved = resolve_gateway_api(path, method, session)
        if not resolved:
            raise _GatewayAbort(404, "Not Found")
        api, path_params, mod = resolved

        # 3. Auth (private APIs)
        app_client = None
        if api.access_type == ApiAccessTypeEnum.PRIVATE:
            app_client = verify_gateway_client(auth_header, session)
            if not app_client:
                raise _GatewayAbort(401, "Unauthorized")
            if not client_can_access_api(session, app_client.id, api.id):
                raise _GatewayAbort(403, "Forbidden")

        # Client key for rate limit and concurrent (client_id or ip)
        client_key = app_client.client_id if app_client else f"ip:{ip}"

        # 4. Max concurrent per client (503 if over limit)
        client_max = getattr(app_client, "max_concurrent", None) if app_client else None
        if not acquire_concurrent_slot(client_key, client_max):
            raise _GatewayAbort(503, "Service Unavailable")

        try:
            # 5. Rate limit
            api_limit = getattr(api, "rate_limit_per_minute", None)
            client_limit = (
                getattr(app_client, "rate_limit_per_minute", None)
                if app_client
                else None
            )
            effective_limit: int | None = None
            rate_limit_key: str = ""
            if api_limit is not None and api_limit > 0:
                effective_limit = api_limit
                rate_limit_key = f"api:{api.id}:{client_key}"
            elif client_limit is not None and client_limit > 0:
                effective_limit = client_limit
                rate_limit_key = f"client:{client_key}"
            if effective_limit is not None and not check_rate_limit(
                rate_limit_key, limit=effective_limit
            ):
                raise _GatewayAbort(429, "Too Many Requests")

            # 6. Config cache
            config = get_or_load_gateway_config(api, session)
            params_definition = (
                (config.get("params_definition") or None) if config else None
            )

            # 7. Merge params (sync — body was pre-read by the async handler)
            params, body_for_log = merge_params(
                query,
                body,
                path_params,
                headers,
                method,
                params_definition=params_definition,
            )

            # 8. Serialize request metadata for access log
            #    Strip sensitive headers to avoid leaking credentials in logs.
            _REDACTED_HEADERS = frozenset(
                {"authorization", "cookie", "proxy-authorization"}
            )
            request_headers_str: str | None = None
            try:
                safe_headers = {
                    k: v
                    for k, v in headers.items()
                    if k.lower() not in _REDACTED_HEADERS
                }
                request_headers_str = json.dumps(safe_headers)
            except Exception:
                pass
            request_params_str: str | None = None
            try:
                request_params_str = json.dumps(params, default=str) if params else None
            except Exception:
                pass

            # 9. Run SQL/Script executor
            result = runner_run(
                api,
                params,
                session=session,
                app_client_id=app_client.id if app_client else None,
                ip=ip,
                http_method=method,
                request_path=path,
                request_body=body_for_log,
                request_headers=request_headers_str,
                request_params=request_params_str,
                gateway_start_time=gateway_start,
                config=config,
            )

            engine_attr = getattr(api, "execute_engine", None)
            engine_value = (
                engine_attr.value
                if hasattr(engine_attr, "value")
                else (engine_attr or None)
            )
            return {"_result": result, "_engine": engine_value}
        finally:
            release_concurrent_slot(client_key)


@router.api_route("/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def gateway_proxy(
    path: str,
    request: Request,
) -> JSONResponse:
    """
    Dynamic gateway: resolve /api/{path} to ApiAssignment, run SQL/Script, return JSON.

    All synchronous I/O (DB, Redis, runner) runs in a worker thread via
    ``asyncio.to_thread`` so the async event loop is never blocked.
    """
    gateway_start = time.perf_counter()

    # --- Extract all needed data from the request (async-safe) ---
    ip = _get_client_ip(request)
    method = request.method
    auth_header = request.headers.get("Authorization", "")
    headers = dict(request.headers)
    query = dict(request.query_params)
    naming = get_response_naming(query, headers)

    # Pre-read body — the only truly async I/O in the handler
    body = await _read_body(request)

    # --- Run the entire sync pipeline in a worker thread ---
    try:
        out = await asyncio.to_thread(
            _gateway_pipeline,
            path=path,
            method=method,
            ip=ip,
            auth_header=auth_header,
            headers=headers,
            query=query,
            body=body,
            gateway_start=gateway_start,
        )
    except _GatewayAbort as abort:
        error_body = {"success": False, "message": abort.detail, "data": []}
        return JSONResponse(
            status_code=abort.status_code,
            content=format_response(error_body, naming),
        )
    except HTTPException as he:
        error_body = {"success": False, "message": str(he.detail), "data": []}
        return JSONResponse(
            status_code=he.status_code,
            content=format_response(error_body, naming),
        )
    except Exception as e:
        _logger.exception("Gateway error on %s /api/%s", method, path)
        detail = "Internal server error"
        if settings.ENVIRONMENT == "local":
            detail = str(e)
        error_body = {"success": False, "message": detail, "data": []}
        return JSONResponse(
            status_code=500,
            content=format_response(error_body, naming),
        )

    normalized = normalize_api_result(out["_result"], out["_engine"])
    return JSONResponse(content=format_response(normalized, naming))
