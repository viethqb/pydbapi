"""
Gateway (Phase 4): auth, firewall, ratelimit, request/response, resolver, runner.
"""

from app.core.gateway.auth import client_can_access_api, verify_gateway_client
from app.core.gateway.firewall import check_firewall
from app.core.gateway.ratelimit import check_rate_limit
from app.core.gateway.request_response import (
    format_response,
    keys_to_camel,
    keys_to_snake,
    parse_params,
)
from app.core.gateway.resolver import path_to_regex, resolve_api_assignment, resolve_module
from app.core.gateway.runner import run as run_api

__all__ = [
    "check_firewall",
    "check_rate_limit",
    "client_can_access_api",
    "format_response",
    "keys_to_camel",
    "keys_to_snake",
    "parse_params",
    "path_to_regex",
    "resolve_api_assignment",
    "resolve_module",
    "run_api",
    "verify_gateway_client",
]
