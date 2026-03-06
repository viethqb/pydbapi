"""
Gateway (Phase 4): auth, firewall, ratelimit, request/response, resolver, runner.
"""

from app.core.gateway.auth import client_can_access_api, verify_gateway_client
from app.core.gateway.concurrent import acquire_concurrent_slot, release_concurrent_slot
from app.core.gateway.firewall import check_firewall
from app.core.gateway.ratelimit import check_rate_limit
from app.core.gateway.request_response import (
    format_response,
    get_response_naming,
    keys_to_camel,
    keys_to_snake,
    merge_params,
    normalize_api_result,
    parse_params,
)
from app.core.gateway.resolver import (
    invalidate_route_cache,
    path_to_regex,
    resolve_gateway_api,
)
from app.core.gateway.runner import run as run_api

__all__ = [
    "acquire_concurrent_slot",
    "check_firewall",
    "check_rate_limit",
    "client_can_access_api",
    "format_response",
    "get_response_naming",
    "invalidate_route_cache",
    "keys_to_camel",
    "keys_to_snake",
    "merge_params",
    "normalize_api_result",
    "parse_params",
    "path_to_regex",
    "release_concurrent_slot",
    "resolve_gateway_api",
    "run_api",
    "verify_gateway_client",
]
