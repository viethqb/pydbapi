"""
HTTP module for script engine: get, post, put, delete (Phase 3, Task 3.3).

Uses httpx with timeout; optional URL allowlist in later phases.
"""

from types import SimpleNamespace
from typing import Any

import httpx

# Default timeout when not provided
DEFAULT_HTTP_TIMEOUT = 30.0


def make_http_module(*, timeout: float = DEFAULT_HTTP_TIMEOUT) -> Any:
    """Build the `http` object: get, post, put, delete."""

    def _request(method: str, url: str, **kwargs: Any) -> Any:
        with httpx.Client(timeout=timeout) as client:
            resp = client.request(method, url, **kwargs)
            resp.raise_for_status()
            # Prefer JSON; otherwise text
            ct = resp.headers.get("content-type", "")
            if "application/json" in ct:
                return resp.json()
            return resp.text

    def get(url: str, **kwargs: Any) -> Any:
        return _request("GET", url, **kwargs)

    def post(url: str, **kwargs: Any) -> Any:
        return _request("POST", url, **kwargs)

    def put(url: str, **kwargs: Any) -> Any:
        return _request("PUT", url, **kwargs)

    def delete(url: str, **kwargs: Any) -> Any:
        return _request("DELETE", url, **kwargs)

    return SimpleNamespace(get=get, post=post, put=put, delete=delete)
