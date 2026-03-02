"""
HTTP module for script engine: get, post, put, delete (Phase 3, Task 3.3).

Uses httpx with timeout.  Outbound requests are restricted to hosts listed
in ``SCRIPT_HTTP_ALLOWED_HOSTS`` to prevent SSRF.

DNS resolution is performed once at connect time and all resolved IPs are
validated against a private/reserved blocklist *before* the TCP socket is
opened.  This eliminates the DNS-rebinding TOCTOU window that would exist
if the check and the connection used separate DNS lookups.
"""

import ipaddress
import socket
from typing import Any
from urllib.parse import urlparse

import httpcore
import httpx
from httpcore._backends.sync import SyncBackend, SyncStream

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


def _is_blocked_ip(ip_str: str) -> bool:
    """Return True if *ip_str* falls within a private/reserved network."""
    try:
        addr = ipaddress.ip_address(ip_str)
    except ValueError:
        return True  # unparseable → block
    return any(addr in net for net in _BLOCKED_NETWORKS)


class _SSRFSafeBackend(SyncBackend):
    """Network backend that validates ALL resolved IPs before connecting.

    This replaces the default httpcore ``SyncBackend`` so that DNS resolution
    and IP validation happen in a single step — the same ``getaddrinfo`` result
    used for validation is used for the actual ``connect()``, eliminating the
    DNS-rebinding TOCTOU window.
    """

    def connect_tcp(
        self,
        host: str,
        port: int,
        timeout: float | None = None,
        local_address: str | None = None,
        socket_options: list[tuple[int, int, int | bytes]] | None = None,
    ) -> SyncStream:
        # Resolve hostname to ALL addresses in one call.
        try:
            infos = socket.getaddrinfo(host, port, socket.AF_UNSPEC, socket.SOCK_STREAM)
        except (socket.gaierror, OSError) as exc:
            raise PermissionError(f"Cannot resolve host: {host}") from exc

        if not infos:
            raise PermissionError(f"No addresses found for host: {host}")

        # Validate EVERY resolved IP — block if any is private/reserved.
        for _family, _type, _proto, _canonname, sockaddr in infos:
            ip_str = sockaddr[0]
            if _is_blocked_ip(ip_str):
                raise PermissionError(
                    f"DNS for {host} resolved to blocked address {ip_str}"
                )

        # Connect to the first validated address (same result we just checked).
        family, type_, proto, _canonname, sockaddr = infos[0]
        sock = socket.socket(family, type_, proto)
        try:
            sock.settimeout(timeout)
            if local_address:
                sock.bind((local_address, 0))
            if socket_options:
                for option in socket_options:
                    sock.setsockopt(*option)
            sock.connect(sockaddr)
            # httpcore expects a blocking socket after connect.
            sock.settimeout(None)
        except Exception:
            sock.close()
            raise
        return SyncStream(sock)


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
    """Raise ``PermissionError`` when the URL target is not allowed.

    Validates the URL scheme and hostname against the allow-list.  The actual
    IP-level validation happens in ``_SSRFSafeBackend.connect_tcp`` at
    connect time — this function handles the host allow-list policy.
    """
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise PermissionError(f"URL scheme '{parsed.scheme}' is not allowed; only http/https.")

    hostname = (parsed.hostname or "").lower()
    if not hostname:
        raise PermissionError("URL has no hostname.")

    if not _host_matches(hostname, allowed_hosts):
        raise PermissionError(
            f"Host '{hostname}' is not in SCRIPT_HTTP_ALLOWED_HOSTS. "
            f"Allowed: {', '.join(sorted(allowed_hosts)) or '(none)'}."
        )


_MAX_REDIRECTS = 10

# Only these httpx request kwargs are allowed from scripts.  Anything else
# (e.g. transport, auth, verify, cert, follow_redirects, extensions) is
# rejected to prevent bypassing SSRF protections or leaking data.
_ALLOWED_REQUEST_KWARGS = frozenset({
    "params",    # query parameters
    "headers",   # request headers
    "cookies",   # request cookies
    "json",      # JSON body
    "data",      # form-encoded body
    "content",   # raw bytes body
})


def _filter_kwargs(kwargs: dict[str, Any]) -> dict[str, Any]:
    """Return only whitelisted kwargs; raise on disallowed keys."""
    bad = kwargs.keys() - _ALLOWED_REQUEST_KWARGS
    if bad:
        raise PermissionError(
            f"Disallowed http request option(s): {', '.join(sorted(bad))}. "
            f"Allowed: {', '.join(sorted(_ALLOWED_REQUEST_KWARGS))}."
        )
    return kwargs


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
            # Use _SSRFSafeBackend to validate resolved IPs at connect time,
            # eliminating the DNS-rebinding TOCTOU window.
            pool = httpcore.ConnectionPool(network_backend=_SSRFSafeBackend())
            self._client = httpx.Client(
                timeout=self._timeout,
                follow_redirects=False,
                transport=pool,
            )
        return self._client

    def _request(self, method: str, url: str, **kwargs: Any) -> Any:
        safe_kwargs = _filter_kwargs(kwargs)
        _check_url_allowed(url, self._hosts)
        resp = self._get_client().request(method, url, **safe_kwargs)

        # Manually follow redirects, validating each target against
        # the allow-list and private-IP check to prevent SSRF via
        # open redirects on allowed hosts.
        redirects = 0
        while resp.is_redirect and redirects < _MAX_REDIRECTS:
            redirects += 1
            location = resp.headers.get("location", "")
            if not location:
                break
            next_url = str(resp.next_request.url) if resp.next_request else location
            _check_url_allowed(next_url, self._hosts)
            resp = self._get_client().request(method, next_url)

        if resp.is_redirect:
            raise PermissionError(f"Too many redirects (>{_MAX_REDIRECTS}).")

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
