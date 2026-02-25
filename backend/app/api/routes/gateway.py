"""
Gateway (Phase 4, Task 4.1): dynamic /api/{path:path}.

Module is only for grouping/permissions — it does NOT appear in the URL.
URL pattern: /api/{path} where path = module.path_prefix + api.path.

Flow: IP -> firewall -> auth -> rate limit -> resolve -> parse_params -> run -> format_response.
runner_run is sync/blocking; run it in a thread pool so the event loop can accept
concurrent requests and the concurrent limit (max_concurrent per client) works.
"""

import asyncio
import json
import time
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlmodel import Session

from app.api.deps import SessionDep
from app.core.db import engine
from app.core.gateway import (
    check_firewall,
    check_rate_limit,
    client_can_access_api,
    format_response,
    normalize_api_result,
    parse_params,
    release_concurrent_slot,
    acquire_concurrent_slot,
    verify_gateway_client,
)
from app.core.gateway.config_cache import get_or_load_gateway_config
from app.core.gateway.resolver import resolve_gateway_api
from app.core.gateway.runner import run as runner_run
from app.models_dbapi import ApiAccessTypeEnum, ApiAssignment

router = APIRouter(prefix="", tags=["gateway"], include_in_schema=False)


def _run_runner_in_thread(
    api_id: UUID,
    params: dict,
    app_client_id: UUID | None,
    ip: str,
    http_method: str,
    request_path: str,
    request_body: str | None,
    request_headers: str | None = None,
    request_params: str | None = None,
    *,
    gateway_start_time: float | None = None,
) -> dict:
    """Run runner_run in a thread with a fresh session (session is not thread-safe).

    We must re-fetch ApiAssignment because SQLModel objects are bound to their
    originating session and are not safe to share across threads.
    The session.get() call will hit SQLAlchemy's identity map (no DB round-trip)
    if the object was already loaded in this session, but since this is a new
    session we accept the single SELECT as necessary.
    """
    with Session(engine) as session:
        api = session.get(ApiAssignment, api_id)
        if not api:
            raise ValueError(f"ApiAssignment {api_id} not found")
        return runner_run(
            api,
            params,
            session=session,
            app_client_id=app_client_id,
            ip=ip,
            http_method=http_method,
            request_path=request_path,
            request_body=request_body,
            request_headers=request_headers,
            request_params=request_params,
            gateway_start_time=gateway_start_time,
        )


def _get_client_ip(request: Request) -> str:
    """Client IP: X-Forwarded-For (rightmost) or request.client.host."""
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[-1].strip()
    return getattr(getattr(request, "client", None), "host", None) or "0.0.0.0"


def _gateway_error(request: Request, status_code: int, detail: str) -> JSONResponse:
    """Return standard envelope { success: false, message, data: [] } for gateway errors."""
    body = {"success": False, "message": str(detail), "data": []}
    return JSONResponse(status_code=status_code, content=format_response(body, request))


@router.api_route(
    "/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"]
)
async def gateway_proxy(
    path: str,
    request: Request,
    session: SessionDep,
) -> JSONResponse:
    """
    Dynamic gateway: resolve /api/{path} to ApiAssignment, run SQL/Script, return JSON.
    Module is resolved internally for permissions — not part of URL.
    """
    gateway_start = time.perf_counter()
    ip = _get_client_ip(request)
    if not check_firewall(ip, session):
        return _gateway_error(request, 403, "Forbidden")

    resolved = resolve_gateway_api(path, request.method, session)
    if not resolved:
        return _gateway_error(request, 404, "Not Found")
    api, path_params, mod = resolved

    # Check access_type: public APIs don't require authentication
    app_client = None
    if api.access_type == ApiAccessTypeEnum.PRIVATE:
        app_client = verify_gateway_client(request, session)
        if not app_client:
            return _gateway_error(request, 401, "Unauthorized")
        if not client_can_access_api(session, app_client.id, api.id):
            return _gateway_error(request, 403, "Forbidden")

    # Client key for rate limit and concurrent (client_id or ip)
    client_key = app_client.client_id if app_client else f"ip:{ip}"

    # Max concurrent per client first (503 if over limit; does not consume rate limit)
    client_max = getattr(app_client, "max_concurrent", None) if app_client else None
    if not acquire_concurrent_slot(client_key, client_max):
        return _gateway_error(request, 503, "Service Unavailable")

    # Rate limit: only when API or client has rate_limit_per_minute configured
    api_limit = getattr(api, "rate_limit_per_minute", None)
    client_limit = (
        getattr(app_client, "rate_limit_per_minute", None) if app_client else None
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
        release_concurrent_slot(client_key)
        return _gateway_error(request, 429, "Too Many Requests")

    try:
        config = get_or_load_gateway_config(api, session)
        params_definition = (
            (config.get("params_definition") or None) if config else None
        )

        params, body_for_log = await parse_params(
            request, path_params, request.method, params_definition=params_definition
        )
        request_headers_str: str | None = None
        try:
            request_headers_str = json.dumps(dict(request.headers))
        except Exception:
            pass
        request_params_str: str | None = None
        try:
            request_params_str = json.dumps(params, default=str) if params else None
        except Exception:
            pass

        result = await asyncio.to_thread(
            _run_runner_in_thread,
            api.id,
            params,
            app_client.id if app_client else None,
            ip,
            request.method,
            path,
            body_for_log,
            request_headers_str,
            request_params_str,
            gateway_start_time=gateway_start,
        )
    except HTTPException as he:
        return _gateway_error(request, he.status_code, str(he.detail))
    except Exception as e:
        error_body = {"success": False, "message": str(e), "data": []}
        out = format_response(error_body, request)
        return JSONResponse(status_code=500, content=out)
    finally:
        release_concurrent_slot(client_key)

    engine = getattr(api, "execute_engine", None)
    engine_value = engine.value if hasattr(engine, "value") else (engine or None)
    normalized = normalize_api_result(result, engine_value)
    out = format_response(normalized, request)
    return JSONResponse(content=out)
