"""Tests for engines.script.modules.http – SSRF protection.

Covers:
- URL allow-list enforcement (_check_url_allowed)
- DNS-rebinding TOCTOU elimination (_SSRFSafeBackend)
- Redirect-following with per-hop validation
"""

import socket
from unittest.mock import MagicMock, patch

import pytest

from app.engines.script.modules.http import (
    _check_url_allowed,
    _filter_kwargs,
    _is_blocked_ip,
    _SSRFSafeBackend,
    make_http_module,
)

# ---------------------------------------------------------------------------
# _is_blocked_ip
# ---------------------------------------------------------------------------


class TestIsBlockedIp:
    def test_loopback(self):
        assert _is_blocked_ip("127.0.0.1") is True

    def test_metadata(self):
        assert _is_blocked_ip("169.254.169.254") is True

    def test_private_10(self):
        assert _is_blocked_ip("10.0.0.1") is True

    def test_private_172(self):
        assert _is_blocked_ip("172.16.0.1") is True

    def test_private_192(self):
        assert _is_blocked_ip("192.168.1.1") is True

    def test_public(self):
        assert _is_blocked_ip("8.8.8.8") is False

    def test_ipv6_loopback(self):
        assert _is_blocked_ip("::1") is True

    def test_unparseable(self):
        assert _is_blocked_ip("not-an-ip") is True


# ---------------------------------------------------------------------------
# _check_url_allowed  (host allow-list only — IP check is at connect time)
# ---------------------------------------------------------------------------


class TestCheckUrlAllowed:
    def test_blocks_unlisted_host(self):
        hosts = frozenset({"api.example.com"})
        with pytest.raises(PermissionError, match="not in SCRIPT_HTTP_ALLOWED_HOSTS"):
            _check_url_allowed("http://evil.com/data", hosts)

    def test_allows_listed_host(self):
        hosts = frozenset({"example.com"})
        _check_url_allowed("http://example.com/ok", hosts)  # should not raise

    def test_wildcard_allows_any(self):
        hosts = frozenset({"*"})
        _check_url_allowed("http://anything.test/ok", hosts)

    def test_subdomain_wildcard(self):
        hosts = frozenset({"*.example.com"})
        _check_url_allowed("http://api.example.com/ok", hosts)

    def test_subdomain_wildcard_rejects_root(self):
        hosts = frozenset({"*.example.com"})
        with pytest.raises(PermissionError):
            _check_url_allowed("http://example.com/ok", hosts)

    def test_blocks_non_http_scheme(self):
        hosts = frozenset({"*"})
        with pytest.raises(PermissionError, match="scheme"):
            _check_url_allowed("ftp://example.com/file", hosts)

    def test_blocks_empty_hostname(self):
        hosts = frozenset({"*"})
        with pytest.raises(PermissionError, match="no hostname"):
            _check_url_allowed("http:///path", hosts)


# ---------------------------------------------------------------------------
# _SSRFSafeBackend – DNS resolution + IP validation at connect time
# ---------------------------------------------------------------------------


def _fake_getaddrinfo(ip: str):
    """Return a mock getaddrinfo result resolving to a single IP."""

    def _gai(_host, port, _family=0, _type=0, _proto=0, _flags=0):
        return [(socket.AF_INET, socket.SOCK_STREAM, 0, "", (ip, port))]

    return _gai


def _fake_getaddrinfo_multi(ips: list[str]):
    """Return a mock getaddrinfo result resolving to multiple IPs."""

    def _gai(_host, port, _family=0, _type=0, _proto=0, _flags=0):
        return [(socket.AF_INET, socket.SOCK_STREAM, 0, "", (ip, port)) for ip in ips]

    return _gai


class TestSSRFSafeBackend:
    """Verify that the custom network backend blocks private IPs at connect time."""

    def test_blocks_loopback(self):
        backend = _SSRFSafeBackend()
        with patch("socket.getaddrinfo", _fake_getaddrinfo("127.0.0.1")):
            with pytest.raises(PermissionError, match="blocked address 127.0.0.1"):
                backend.connect_tcp("evil.com", 80)

    def test_blocks_metadata_endpoint(self):
        backend = _SSRFSafeBackend()
        with patch("socket.getaddrinfo", _fake_getaddrinfo("169.254.169.254")):
            with pytest.raises(
                PermissionError, match="blocked address 169.254.169.254"
            ):
                backend.connect_tcp("evil.com", 80)

    def test_blocks_private_10(self):
        backend = _SSRFSafeBackend()
        with patch("socket.getaddrinfo", _fake_getaddrinfo("10.0.0.1")):
            with pytest.raises(PermissionError, match="blocked address"):
                backend.connect_tcp("evil.com", 80)

    def test_blocks_if_any_resolved_ip_is_private(self):
        """If DNS returns both a public and a private IP, block the request."""
        backend = _SSRFSafeBackend()
        with patch(
            "socket.getaddrinfo",
            _fake_getaddrinfo_multi(["8.8.8.8", "169.254.169.254"]),
        ):
            with pytest.raises(
                PermissionError, match="blocked address 169.254.169.254"
            ):
                backend.connect_tcp("evil.com", 80)

    def test_allows_public_ip_and_connects(self):
        """Public IP should pass validation and attempt socket connect."""
        backend = _SSRFSafeBackend()
        mock_sock = MagicMock()
        with (
            patch("socket.getaddrinfo", _fake_getaddrinfo("93.184.216.34")),
            patch("socket.socket", return_value=mock_sock),
        ):
            backend.connect_tcp("example.com", 80, timeout=5.0)
            mock_sock.settimeout.assert_any_call(5.0)
            mock_sock.connect.assert_called_once_with(("93.184.216.34", 80))

    def test_dns_failure_raises(self):
        backend = _SSRFSafeBackend()
        with patch("socket.getaddrinfo", side_effect=socket.gaierror("no such host")):
            with pytest.raises(PermissionError, match="Cannot resolve"):
                backend.connect_tcp("nonexistent.invalid", 80)

    def test_socket_closed_on_connect_failure(self):
        """Socket must be closed if connect() raises."""
        backend = _SSRFSafeBackend()
        mock_sock = MagicMock()
        mock_sock.connect.side_effect = OSError("connection refused")
        with (
            patch("socket.getaddrinfo", _fake_getaddrinfo("93.184.216.34")),
            patch("socket.socket", return_value=mock_sock),
        ):
            with pytest.raises(OSError, match="connection refused"):
                backend.connect_tcp("example.com", 80)
            mock_sock.close.assert_called_once()

    def test_dns_rebinding_blocked(self):
        """Simulate DNS rebinding: first call returns public IP (for the
        allow-list check), but the backend resolves to a private IP.
        The backend must block based on its own resolution, not any prior check.
        """
        backend = _SSRFSafeBackend()
        # The backend always does its own getaddrinfo — simulate rebinding
        # by having it resolve to a private address.
        with patch("socket.getaddrinfo", _fake_getaddrinfo("169.254.169.254")):
            with pytest.raises(PermissionError, match="blocked address"):
                backend.connect_tcp("attacker-rebind.example.com", 80)


# ---------------------------------------------------------------------------
# Redirect validation (from fix #2)
# ---------------------------------------------------------------------------


def _make_redirect_response(location: str) -> MagicMock:
    resp = MagicMock()
    resp.is_redirect = True
    resp.headers = {"location": location}
    req = MagicMock()
    req.url = location
    resp.next_request = req
    return resp


def _make_ok_response(body: str = "ok") -> MagicMock:
    resp = MagicMock()
    resp.is_redirect = False
    resp.status_code = 200
    resp.headers = {"content-type": "text/plain"}
    resp.text = body
    resp.raise_for_status = MagicMock()
    return resp


class TestRedirectValidation:
    """Ensure each redirect hop is validated against the allow-list."""

    def test_redirect_to_unlisted_host_raises(self):
        mod = make_http_module(allowed_hosts=frozenset({"good.example.com"}))
        redirect_resp = _make_redirect_response("http://evil.com/steal")

        mock_client = MagicMock()
        mock_client.request.return_value = redirect_resp

        with patch("httpcore.ConnectionPool", return_value=MagicMock()):
            with patch("httpx.Client", return_value=mock_client):
                with pytest.raises(
                    PermissionError, match="not in SCRIPT_HTTP_ALLOWED_HOSTS"
                ):
                    mod.get("http://good.example.com/redirect")

    def test_redirect_to_allowed_host_succeeds(self):
        hosts = frozenset({"a.example.com", "b.example.com"})
        mod = make_http_module(allowed_hosts=hosts)

        redirect_resp = _make_redirect_response("http://b.example.com/final")
        ok_resp = _make_ok_response("success")

        mock_client = MagicMock()
        mock_client.request.side_effect = [redirect_resp, ok_resp]

        with patch("httpcore.ConnectionPool", return_value=MagicMock()):
            with patch("httpx.Client", return_value=mock_client):
                result = mod.get("http://a.example.com/start")
                assert result == "success"

    def test_too_many_redirects_raises(self):
        mod = make_http_module(allowed_hosts=frozenset({"loop.example.com"}))
        redirect_resp = _make_redirect_response("http://loop.example.com/again")

        mock_client = MagicMock()
        mock_client.request.return_value = redirect_resp

        with patch("httpcore.ConnectionPool", return_value=MagicMock()):
            with patch("httpx.Client", return_value=mock_client):
                with pytest.raises(PermissionError, match="Too many redirects"):
                    mod.get("http://loop.example.com/start")


# ---------------------------------------------------------------------------
# kwargs filtering – prevent SSRF bypass via transport/verify/auth/etc.
# ---------------------------------------------------------------------------


class TestFilterKwargs:
    def test_allows_safe_kwargs(self):
        safe = {"headers": {"X-Key": "v"}, "json": {"a": 1}, "params": {"q": "x"}}
        assert _filter_kwargs(safe) == safe

    def test_blocks_transport(self):
        with pytest.raises(PermissionError, match="transport"):
            _filter_kwargs({"transport": "evil"})

    def test_blocks_verify(self):
        with pytest.raises(PermissionError, match="verify"):
            _filter_kwargs({"verify": False})

    def test_blocks_auth(self):
        with pytest.raises(PermissionError, match="auth"):
            _filter_kwargs({"auth": ("user", "pass")})

    def test_blocks_follow_redirects(self):
        with pytest.raises(PermissionError, match="follow_redirects"):
            _filter_kwargs({"follow_redirects": True})

    def test_blocks_cert(self):
        with pytest.raises(PermissionError, match="cert"):
            _filter_kwargs({"cert": "/etc/ssl/key.pem"})

    def test_blocks_mixed_good_and_bad(self):
        with pytest.raises(PermissionError, match="verify"):
            _filter_kwargs({"headers": {}, "verify": False})

    def test_e2e_disallowed_kwarg_via_module(self):
        """Disallowed kwargs are rejected before any network activity."""
        mod = make_http_module(allowed_hosts=frozenset({"example.com"}))
        with pytest.raises(PermissionError, match="transport"):
            mod.get("http://example.com", transport="evil")
