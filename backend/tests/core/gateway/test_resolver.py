"""Unit tests for gateway resolver: path_to_regex, resolve_gateway_api (Phase 4, Task 4.1)."""

from sqlmodel import Session

from app.core.gateway.resolver import (
    path_to_regex,
    resolve_api_assignment,
    resolve_gateway_api,
    resolve_module,
)
from app.models_dbapi import HttpMethodEnum
from tests.utils.api_assignment import create_random_assignment
from tests.utils.datasource import create_random_datasource
from tests.utils.module import create_random_module
from tests.utils.utils import random_lower_string


def test_path_to_regex_static() -> None:
    r = path_to_regex("list")
    assert r.match("list") is not None
    assert r.match("list").groupdict() == {}
    assert r.match("other") is None
    assert r.match("list/") is None


def test_path_to_regex_one_param() -> None:
    r = path_to_regex("users/{id}")
    m = r.match("users/123")
    assert m is not None
    assert m.groupdict() == {"id": "123"}
    assert r.match("users") is None
    assert r.match("users/1/2") is None


def test_path_to_regex_two_params() -> None:
    r = path_to_regex("orders/{order_id}/items/{item_id}")
    m = r.match("orders/o1/items/i2")
    assert m is not None
    assert m.groupdict() == {"order_id": "o1", "item_id": "i2"}


def test_path_to_regex_special_chars_static() -> None:
    r = path_to_regex("v1.0/report")
    assert r.match("v1.0/report") is not None
    assert r.match("v10/report") is None


# --- Legacy resolve_module / resolve_api_assignment (kept for backward compat) ---


def test_resolve_module_by_path_prefix(db: Session) -> None:
    seg = f"r-{random_lower_string()}"
    m = create_random_module(db, path_prefix=f"/{seg}", is_active=True)
    got = resolve_module(seg, db)
    assert got is not None
    assert got.id == m.id


def test_resolve_module_not_found(db: Session) -> None:
    create_random_module(db, path_prefix="/public", is_active=True)
    assert resolve_module("nonexistent", db) is None


def test_resolve_module_inactive(db: Session) -> None:
    create_random_module(db, path_prefix="/hidden", is_active=False)
    assert resolve_module("hidden", db) is None


def test_resolve_api_assignment_static_path(db: Session) -> None:
    mod = create_random_module(db, path_prefix="/api", is_active=True)
    ds = create_random_datasource(db)
    a = create_random_assignment(
        db,
        module_id=mod.id,
        path="ping",
        http_method=HttpMethodEnum.GET,
        datasource_id=ds.id,
        is_published=True,
        content="SELECT 1 as x",
    )
    resolved = resolve_api_assignment(mod.id, "ping", "GET", db)
    assert resolved is not None
    api, params = resolved
    assert api.id == a.id
    assert params == {}


def test_resolve_api_assignment_with_param(db: Session) -> None:
    mod = create_random_module(db, path_prefix="/v1", is_active=True)
    ds = create_random_datasource(db)
    a = create_random_assignment(
        db,
        module_id=mod.id,
        path="users/{id}",
        http_method=HttpMethodEnum.GET,
        datasource_id=ds.id,
        is_published=True,
        content="SELECT 1 as x",
    )
    resolved = resolve_api_assignment(mod.id, "users/abc", "GET", db)
    assert resolved is not None
    api, params = resolved
    assert api.id == a.id
    assert params == {"id": "abc"}


def test_resolve_api_assignment_unpublished(db: Session) -> None:
    mod = create_random_module(db, path_prefix="/x", is_active=True)
    ds = create_random_datasource(db)
    create_random_assignment(
        db,
        module_id=mod.id,
        path="secret",
        http_method=HttpMethodEnum.GET,
        datasource_id=ds.id,
        is_published=False,
        content="SELECT 1",
    )
    assert resolve_api_assignment(mod.id, "secret", "GET", db) is None


def test_resolve_api_assignment_wrong_method(db: Session) -> None:
    mod = create_random_module(db, path_prefix="/x", is_active=True)
    ds = create_random_datasource(db)
    create_random_assignment(
        db,
        module_id=mod.id,
        path="r",
        http_method=HttpMethodEnum.POST,
        datasource_id=ds.id,
        is_published=True,
        content="SELECT 1",
    )
    assert resolve_api_assignment(mod.id, "r", "GET", db) is None


# --- resolve_gateway_api: the main resolver (module not in URL) ---


def test_resolve_gateway_api_simple(db: Session) -> None:
    """api.path='ping' -> resolve 'ping'. Module prefix is irrelevant to URL."""
    mod = create_random_module(db, path_prefix="/whatever", is_active=True)
    ds = create_random_datasource(db)
    a = create_random_assignment(
        db,
        module_id=mod.id,
        path="ping",
        http_method=HttpMethodEnum.GET,
        datasource_id=ds.id,
        is_published=True,
        content="SELECT 1 as x",
    )
    resolved = resolve_gateway_api("ping", "GET", db)
    assert resolved is not None
    api, params, m = resolved
    assert api.id == a.id
    assert m.id == mod.id
    assert params == {}


def test_resolve_gateway_api_nested_path(db: Session) -> None:
    """api.path='users/list' -> resolve 'users/list'. Module prefix NOT in URL."""
    mod = create_random_module(db, path_prefix="/admin", is_active=True)
    ds = create_random_datasource(db)
    a = create_random_assignment(
        db,
        module_id=mod.id,
        path="users/list",
        http_method=HttpMethodEnum.GET,
        datasource_id=ds.id,
        is_published=True,
        content="SELECT 1",
    )
    resolved = resolve_gateway_api("users/list", "GET", db)
    assert resolved is not None
    api, params, m = resolved
    assert api.id == a.id
    assert m.id == mod.id
    assert params == {}


def test_resolve_gateway_api_with_path_params(db: Session) -> None:
    """api.path='users/{id}' -> resolve 'users/abc'."""
    mod = create_random_module(db, path_prefix="/some-group", is_active=True)
    ds = create_random_datasource(db)
    a = create_random_assignment(
        db,
        module_id=mod.id,
        path="users/{id}",
        http_method=HttpMethodEnum.GET,
        datasource_id=ds.id,
        is_published=True,
        content="SELECT 1",
    )
    resolved = resolve_gateway_api("users/abc", "GET", db)
    assert resolved is not None
    api, params, _ = resolved
    assert api.id == a.id
    assert params == {"id": "abc"}


def test_resolve_gateway_api_not_found(db: Session) -> None:
    """No matching api.path -> None."""
    assert resolve_gateway_api("nonexistent", "GET", db) is None


def test_resolve_gateway_api_inactive_module(db: Session) -> None:
    """Inactive module -> not resolved even if api.path matches."""
    mod = create_random_module(db, path_prefix="/hidden", is_active=False)
    ds = create_random_datasource(db)
    create_random_assignment(
        db,
        module_id=mod.id,
        path="ping",
        http_method=HttpMethodEnum.GET,
        datasource_id=ds.id,
        is_published=True,
        content="SELECT 1",
    )
    assert resolve_gateway_api("ping", "GET", db) is None
