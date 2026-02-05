"""
Gateway (Phase 4, Task 4.1): dynamic /{module}/{path:path}.

Flow: IP -> firewall -> auth -> rate limit -> resolve -> parse_params -> run -> format_response.
runner_run is sync/blocking; run it in a thread pool so the event loop can accept
concurrent requests and the concurrent limit (max_concurrent per client) works.
"""

import asyncio
import json
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
from app.core.gateway.resolver import (
    resolve_api_assignment,
    resolve_module,
    resolve_root_module,
)
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
) -> dict:
    """Run runner_run in a thread with a fresh session (session is not thread-safe)."""
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
        )


def _get_client_ip(request: Request) -> str:
    """Client IP: X-Forwarded-For (rightmost) or request.client.host. Plan: rightmost if multiple."""
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[-1].strip()
    return getattr(getattr(request, "client", None), "host", None) or "0.0.0.0"


def _gateway_error(request: Request, status_code: int, detail: str) -> JSONResponse:
    """Return standard envelope { success: false, message, data: [] } for gateway errors."""
    body = {"success": False, "message": str(detail), "data": []}
    return JSONResponse(status_code=status_code, content=format_response(body, request))


@router.api_route(
    "/{module}/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"]
)
async def gateway_proxy(
    module: str,
    path: str,
    request: Request,
    session: SessionDep,
) -> JSONResponse:
    """
    Dynamic gateway: resolve {module}/{path} to ApiAssignment, run SQL/Script, return JSON.
    For public APIs: no auth required. For private APIs: requires auth (Bearer/Basic/X-API-Key).
    Always requires: firewall allow, rate limit. 404 if no match.
    """
    ip = _get_client_ip(request)
    if not check_firewall(ip, session):
        return _gateway_error(request, 403, "Forbidden")

    mod = resolve_module(module, session)
    if not mod:
        # Try root modules (path_prefix='/'): endpoint is /{path} without module segment
        full_path = f"{module}/{path}".rstrip("/") if path else module
        root_resolved = resolve_root_module(full_path, request.method, session)
        if root_resolved:
            api, path_params, mod = root_resolved
        else:
            return _gateway_error(request, 404, "Not Found")
    else:
        resolved = resolve_api_assignment(mod.id, path, request.method, session)
        if not resolved:
            return _gateway_error(request, 404, "Not Found")
        api, path_params = resolved

    # Check access_type: public APIs don't require authentication
    app_client = None
    if api.access_type == ApiAccessTypeEnum.PRIVATE:
        app_client = verify_gateway_client(request, session)
        if not app_client:
            return _gateway_error(request, 401, "Unauthorized")
        # Client can only call APIs in assigned groups (or direct API links)
        if not client_can_access_api(session, app_client.id, api.id):
            return _gateway_error(request, 403, "Forbidden")

    # Client key for rate limit and concurrent (client_id or ip)
    client_key = app_client.client_id if app_client else f"ip:{ip}"

    # Max concurrent per client first (503 if over limit; does not consume rate limit)
    client_max = getattr(app_client, "max_concurrent", None) if app_client else None
    if not acquire_concurrent_slot(client_key, client_max):
        return _gateway_error(request, 503, "Service Unavailable")

    # Rate limit: only when API or client has rate_limit_per_minute configured (default: no limit)
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
        release_concurrent_slot(client_key)  # release slot we just acquired
        return _gateway_error(request, 429, "Too Many Requests")

    try:
        # Get params definition from cache or DB (for header extraction)
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
            request_params_str = json.dumps(params) if params else None
        except Exception:
            pass

        # Run in thread pool so event loop is not blocked; concurrent limit can then work
        result = await asyncio.to_thread(
            _run_runner_in_thread,
            api.id,
            params,
            app_client.id if app_client else None,
            ip,
            request.method,
            f"{module}/{path}".rstrip("/"),
            body_for_log,
            request_headers_str,
            request_params_str,
        )
    except HTTPException as he:
        # Convert to standard envelope; preserve status code
        return _gateway_error(request, he.status_code, str(he.detail))
    except Exception as e:
        # Return standard envelope on error: { success: false, message: "...", data: [] }
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
