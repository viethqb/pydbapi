"""
Gateway (Phase 4, Task 4.1): dynamic /{module}/{path:path}.

Flow: IP -> firewall -> auth -> rate limit -> resolve -> parse_params -> run -> format_response.
"""

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

from sqlmodel import select

from app.api.deps import SessionDep
from app.core.gateway import (
    check_firewall,
    check_rate_limit,
    client_can_access_api,
    format_response,
    parse_params,
    verify_gateway_client,
)
from app.core.gateway.resolver import resolve_api_assignment, resolve_module
from app.core.gateway.runner import run as runner_run
from app.models_dbapi import ApiAccessTypeEnum, ApiContext

router = APIRouter(prefix="", tags=["gateway"])


def _get_client_ip(request: Request) -> str:
    """Client IP: X-Forwarded-For (rightmost) or request.client.host. Plan: rightmost if multiple."""
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[-1].strip()
    return getattr(getattr(request, "client", None), "host", None) or "0.0.0.0"


@router.api_route("/{module}/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
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
        raise HTTPException(status_code=403, detail="Forbidden")

    mod = resolve_module(module, session)
    if not mod:
        raise HTTPException(status_code=404, detail="Not Found")

    resolved = resolve_api_assignment(mod.id, path, request.method, session)
    if not resolved:
        raise HTTPException(status_code=404, detail="Not Found")
    api, path_params = resolved

    # Check access_type: public APIs don't require authentication
    app_client = None
    if api.access_type == ApiAccessTypeEnum.PRIVATE:
        app_client = verify_gateway_client(request, session)
        if not app_client:
            raise HTTPException(status_code=401, detail="Unauthorized")
        # Client can only call APIs in assigned groups (or direct API links)
        if not client_can_access_api(session, app_client.id, api.id):
            raise HTTPException(status_code=403, detail="Forbidden")

    # Rate limit: use client_id if authenticated, otherwise use IP
    rate_limit_key = app_client.client_id if app_client else ip
    if not check_rate_limit(rate_limit_key):
        raise HTTPException(status_code=429, detail="Too Many Requests")

    # Load ApiContext to get params definition for header extraction
    ctx = session.exec(
        select(ApiContext).where(ApiContext.api_assignment_id == api.id)
    ).first()
    params_definition = ctx.params if ctx and ctx.params else None

    params, body_for_log = await parse_params(
        request, path_params, request.method, params_definition=params_definition
    )

    try:
        result = runner_run(
            api,
            params,
            session=session,
            app_client_id=app_client.id if app_client else None,
            ip=ip,
            http_method=request.method,
            request_path=f"{module}/{path}".rstrip("/"),
            request_body=body_for_log,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

    out = format_response(result, request)
    return JSONResponse(content=out)
