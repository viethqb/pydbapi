"""
Gateway (Phase 4): auth, firewall, ratelimit, resolver, request/response, runner.
"""

from app.core.gateway.auth import verify_gateway_client
from app.core.gateway.firewall import check_firewall

__all__ = ["verify_gateway_client", "check_firewall"]
