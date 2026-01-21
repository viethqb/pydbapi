"""Tests for Gateway (Phase 4): token endpoint (4.2a) and gateway proxy (4.1)."""

from collections.abc import Generator

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.api.deps import get_db
from app.core.config import settings
from app.core.security import get_password_hash
from app.models_dbapi import AppClient, FirewallRuleTypeEnum, FirewallRules, HttpMethodEnum
from tests.utils.api_assignment import create_random_assignment
from tests.utils.datasource import create_random_datasource
from tests.utils.module import create_random_module


def _base() -> str:
    return "/token"


def test_gateway_token_success_json(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    """Create AppClient via API, then exchange client_id+secret for JWT (JSON body)."""
    # Create client with known secret
    cr = client.post(
        f"{settings.API_V1_STR}/clients/create",
        headers=superuser_token_headers,
        json={
            "name": "gw-token-test",
            "client_secret": "GatewayTestSecret123",
            "is_active": True,
        },
    )
    assert cr.status_code == 200
    client_id = cr.json()["client_id"]
    assert client_id

    # Exchange for token (JSON)
    r = client.post(
        f"{_base()}/generate",
        json={
            "client_id": client_id,
            "client_secret": "GatewayTestSecret123",
            "grant_type": "client_credentials",
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["expires_in"] == settings.GATEWAY_JWT_EXPIRE_SECONDS
    assert len(data["access_token"]) > 0


def test_gateway_token_success_form(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    """Exchange client_id+secret for JWT (form-urlencoded body)."""
    cr = client.post(
        f"{settings.API_V1_STR}/clients/create",
        headers=superuser_token_headers,
        json={
            "name": "gw-token-form-test",
            "client_secret": "FormTestSecret456",
            "is_active": True,
        },
    )
    assert cr.status_code == 200
    client_id = cr.json()["client_id"]

    r = client.post(
        f"{_base()}/generate",
        data={
            "client_id": client_id,
            "client_secret": "FormTestSecret456",
            "grant_type": "client_credentials",
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert data["token_type"] == "bearer"
    assert "access_token" in data


def test_gateway_token_invalid_client(client: TestClient) -> None:
    """Wrong client_id or client_secret -> 401."""
    r = client.post(
        f"{_base()}/generate",
        json={
            "client_id": "nonexistent-client-id-12345",
            "client_secret": "any",
        },
    )
    assert r.status_code == 401
    assert "Invalid" in r.json()["detail"]


def test_gateway_token_invalid_secret(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    """Valid client_id, wrong client_secret -> 401."""
    cr = client.post(
        f"{settings.API_V1_STR}/clients/create",
        headers=superuser_token_headers,
        json={"name": "gw-bad-secret", "client_secret": "CorrectSecret789", "is_active": True},
    )
    assert cr.status_code == 200
    client_id = cr.json()["client_id"]

    r = client.post(
        f"{_base()}/generate",
        json={"client_id": client_id, "client_secret": "WrongSecret"},
    )
    assert r.status_code == 401


def test_gateway_token_no_auth_required(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    """POST /token/generate does not require Authorization header."""
    cr = client.post(
        f"{settings.API_V1_STR}/clients/create",
        headers=superuser_token_headers,
        json={"name": "gw-no-auth", "client_secret": "NoAuthSecret111", "is_active": True},
    )
    assert cr.status_code == 200
    client_id = cr.json()["client_id"]

    # No Authorization header
    r = client.post(
        f"{_base()}/generate",
        json={"client_id": client_id, "client_secret": "NoAuthSecret111"},
    )
    assert r.status_code == 200


# --- Gateway proxy (4.1) ---

_GW_CLIENT_ID = "gw-proxy-test"
_GW_SECRET = "GatewayProxySecret123"


def _allow_localhost(db: Session) -> None:
    """Ensure 127.0.0.x is allowed (TestClient). Evaluated before any DENY 0.0.0.0/0."""
    r = FirewallRules(
        rule_type=FirewallRuleTypeEnum.ALLOW,
        ip_range="127.0.0.0/8",
        is_active=True,
        sort_order=-9999,
    )
    db.add(r)
    db.commit()


def _gw_headers(token: str | None = None) -> dict[str, str]:
    """Headers for gateway: X-Forwarded-For so firewall allows (TestClient uses 'testclient')."""
    h: dict[str, str] = {"X-Forwarded-For": "127.0.0.1"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return h


def test_gateway_proxy_200(
    client: TestClient,
    db: Session,
) -> None:
    """GET /api/{module}/{path} with Bearer: resolve, run SQL, 200 JSON."""
    _allow_localhost(db)

    def _db_override() -> Generator[Session, None, None]:
        yield db

    client.app.dependency_overrides[get_db] = _db_override
    try:
        _test_gateway_proxy_200_impl(client, db)
    finally:
        client.app.dependency_overrides.pop(get_db, None)


def _test_gateway_proxy_200_impl(client: TestClient, db: Session) -> None:
    # AppClient with known secret
    c = AppClient(
        name="gw-proxy",
        client_id=_GW_CLIENT_ID,
        client_secret=get_password_hash(_GW_SECRET),
        is_active=True,
    )
    db.add(c)
    db.commit()

    # Module /public -> segment "public"
    mod = create_random_module(db, path_prefix="/public", is_active=True)
    ds = create_random_datasource(db)
    create_random_assignment(
        db,
        module_id=mod.id,
        path="ping",
        http_method=HttpMethodEnum.GET,
        datasource_id=ds.id,
        is_published=True,
        content="SELECT 1 as x",
    )
    db.commit()

    # Token
    tr = client.post(
        f"{_base()}/generate",
        json={"client_id": _GW_CLIENT_ID, "client_secret": _GW_SECRET},
    )
    assert tr.status_code == 200
    token = tr.json()["access_token"]

    # Gateway
    r = client.get(
        "/api/public/ping",
        headers=_gw_headers(token),
    )
    assert r.status_code == 200
    data = r.json()
    assert "data" in data
    assert data["data"] == [{"x": 1}]


def test_gateway_proxy_401_without_auth(client: TestClient, db: Session) -> None:
    """Gateway without Authorization -> 401."""
    _allow_localhost(db)

    def _ov() -> Generator[Session, None, None]:
        yield db

    client.app.dependency_overrides[get_db] = _ov
    try:
        mod = create_random_module(db, path_prefix="/a", is_active=True)
        ds = create_random_datasource(db)
        create_random_assignment(
            db, module_id=mod.id, path="r", http_method=HttpMethodEnum.GET,
            datasource_id=ds.id, is_published=True, content="SELECT 1",
        )
        db.commit()

        r = client.get("/api/a/r", headers=_gw_headers())
        assert r.status_code == 401
    finally:
        client.app.dependency_overrides.pop(get_db, None)


def test_gateway_proxy_404_module(client: TestClient, db: Session) -> None:
    """Gateway with unknown module -> 404."""
    _allow_localhost(db)

    def _ov() -> Generator[Session, None, None]:
        yield db

    client.app.dependency_overrides[get_db] = _ov
    try:
        c = AppClient(
            name="gw-404", client_id="gw-404", client_secret=get_password_hash("s"),
            is_active=True,
        )
        db.add(c)
        db.commit()
        tr = client.post(f"{_base()}/generate", json={"client_id": "gw-404", "client_secret": "s"})
        assert tr.status_code == 200
        token = tr.json()["access_token"]

        r = client.get(
            "/api/nonexistent/any",
            headers=_gw_headers(token),
        )
        assert r.status_code == 404
    finally:
        client.app.dependency_overrides.pop(get_db, None)


def test_gateway_proxy_404_path(client: TestClient, db: Session) -> None:
    """Gateway with unknown path in module -> 404."""
    _allow_localhost(db)

    def _ov() -> Generator[Session, None, None]:
        yield db

    client.app.dependency_overrides[get_db] = _ov
    try:
        c = AppClient(
            name="gw-404p", client_id="gw-404p", client_secret=get_password_hash("s2"),
            is_active=True,
        )
        db.add(c)
        db.commit()
        create_random_module(db, path_prefix="/m", is_active=True)
        db.commit()

        tr = client.post(f"{_base()}/generate", json={"client_id": "gw-404p", "client_secret": "s2"})
        assert tr.status_code == 200
        token = tr.json()["access_token"]

        r = client.get(
            "/api/m/nonexistent",
            headers=_gw_headers(token),
        )
        assert r.status_code == 404
    finally:
        client.app.dependency_overrides.pop(get_db, None)
