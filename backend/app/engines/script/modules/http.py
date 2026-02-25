"""
HTTP module for script engine: get, post, put, delete (Phase 3, Task 3.3).

Uses httpx with timeout.  Outbound requests are restricted to hosts listed
in ``SCRIPT_HTTP_ALLOWED_HOSTS`` to prevent SSRF.
"""

import ipaddress
import socket
from types import SimpleNamespace
from typing import Any
from urllib.parse import urlparse

import httpx

DEFAULT_HTTP_TIMEOUT = 30.0

_BLOCKED_NETWORKS = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),  # link-local / cloud metadata
    ipaddress.ip_network("0.0.0.0/8"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),  # IPv6 private
    ipaddress.ip_network("fe80::/10"),  # IPv6 link-local
]


def _is_private_ip(host: str) -> bool:
    """Return True if *host* resolves to a private/reserved IP address."""
    try:
        addr = ipaddress.ip_address(host)
    except ValueError:
        try:
            resolved = socket.getaddrinfo(host, None, socket.AF_UNSPEC, socket.SOCK_STREAM)
            addr = ipaddress.ip_address(resolved[0][4][0])
        except (socket.gaierror, OSError, IndexError):
            return True  # cannot resolve → block
    return any(addr in net for net in _BLOCKED_NETWORKS)


def _host_matches(hostname: str, allowed_hosts: frozenset[str]) -> bool:
    """Check if *hostname* is permitted by the allow-list.

    Supported patterns:
    - ``*``             → allow all public hosts
    - ``api.example.com`` → exact match
    - ``*.example.com``   → any subdomain of example.com (not example.com itself)
    """
    if "*" in allowed_hosts:
        return True
    if hostname in allowed_hosts:
        return True
    for pattern in allowed_hosts:
        if pattern.startswith("*.") and hostname.endswith(pattern[1:]):
            return True
    return False


def _check_url_allowed(url: str, allowed_hosts: frozenset[str]) -> None:
    """Raise ``PermissionError`` when the URL target is not allowed."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise PermissionError(f"URL scheme '{parsed.scheme}' is not allowed; only http/https.")

    hostname = (parsed.hostname or "").lower()
    if not hostname:
        raise PermissionError("URL has no hostname.")

    if _is_private_ip(hostname):
        raise PermissionError(f"Requests to private/internal addresses are blocked: {hostname}")

    if not _host_matches(hostname, allowed_hosts):
        raise PermissionError(
            f"Host '{hostname}' is not in SCRIPT_HTTP_ALLOWED_HOSTS. "
            f"Allowed: {', '.join(sorted(allowed_hosts)) or '(none)'}."
        )


class _HttpModule:
    """HTTP module that reuses a single httpx.Client for the lifetime of a
    script execution, avoiding repeated TCP/TLS handshakes."""

    __slots__ = ("_client", "_hosts", "_timeout")

    def __init__(
        self,
        *,
        timeout: float = DEFAULT_HTTP_TIMEOUT,
        allowed_hosts: frozenset[str] | None = None,
    ) -> None:
        self._timeout = timeout
        self._hosts = allowed_hosts if allowed_hosts is not None else frozenset()
        self._client: httpx.Client | None = None

    def _get_client(self) -> httpx.Client:
        if self._client is None:
            self._client = httpx.Client(timeout=self._timeout)
        return self._client

    def _request(self, method: str, url: str, **kwargs: Any) -> Any:
        _check_url_allowed(url, self._hosts)
        resp = self._get_client().request(method, url, **kwargs)
        resp.raise_for_status()
        ct = resp.headers.get("content-type", "")
        if "application/json" in ct:
            return resp.json()
        return resp.text

    def get(self, url: str, **kwargs: Any) -> Any:
        return self._request("GET", url, **kwargs)

    def post(self, url: str, **kwargs: Any) -> Any:
        return self._request("POST", url, **kwargs)

    def put(self, url: str, **kwargs: Any) -> Any:
        return self._request("PUT", url, **kwargs)

    def delete(self, url: str, **kwargs: Any) -> Any:
        return self._request("DELETE", url, **kwargs)

    def close(self) -> None:
        if self._client is not None:
            try:
                self._client.close()
            except Exception:
                pass
            self._client = None


def make_http_module(
    *,
    timeout: float = DEFAULT_HTTP_TIMEOUT,
    allowed_hosts: frozenset[str] | None = None,
) -> _HttpModule:
    """Build the ``http`` object: get, post, put, delete.

    *allowed_hosts*: parsed from ``SCRIPT_HTTP_ALLOWED_HOSTS``.
    Empty set means **no** outbound HTTP is permitted from scripts.
    """
    return _HttpModule(timeout=timeout, allowed_hosts=allowed_hosts)
