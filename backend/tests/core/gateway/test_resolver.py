"""Unit tests for gateway resolver: path_to_regex, resolve_module, resolve_api_assignment (Phase 4, Task 4.1)."""

from sqlmodel import Session

from app.core.gateway.resolver import (
    get_root_modules,
    path_to_regex,
    resolve_api_assignment,
    resolve_module,
    resolve_root_module,
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


def test_resolve_module_by_path_prefix(db: Session) -> None:
    # Use a unique segment so other tests' modules (e.g. path_prefix=/public) don't match
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


def test_resolve_module_path_prefix_slash(db: Session) -> None:
    """path_prefix '/' -> derived key is ''; we need a segment. Use _slug(name) when stripped is empty."""
    m = create_random_module(db, path_prefix="/", name="default", is_active=True)
    # _module_gateway_key: stripped("/") = "" -> _slug("default") = "default"
    got = resolve_module("default", db)
    assert got is not None
    assert got.id == m.id


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


def test_get_root_modules(db: Session) -> None:
    """path_prefix='/' -> in root modules; path_prefix='/x' -> not."""
    m_root = create_random_module(db, path_prefix="/", name="default", is_active=True)
    create_random_module(db, path_prefix="/api", is_active=True)
    roots = get_root_modules(db)
    assert len(roots) >= 1
    ids = [m.id for m in roots]
    assert m_root.id in ids


def test_resolve_root_module_path(db: Session) -> None:
    """path_prefix='/' module with path 'ping' -> resolve_root_module('ping') finds it."""
    mod = create_random_module(db, path_prefix="/", name="root", is_active=True)
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
    resolved = resolve_root_module("ping", "GET", db)
    assert resolved is not None
    api, params, m = resolved
    assert api.id == a.id
    assert m.id == mod.id
    assert params == {}


def test_resolve_root_module_multi_segment(db: Session) -> None:
    """path_prefix='/' with path 'users/{id}' -> resolve_root_module('users/abc') finds it."""
    mod = create_random_module(db, path_prefix="/", name="api", is_active=True)
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
    resolved = resolve_root_module("users/xyz", "GET", db)
    assert resolved is not None
    api, params, _ = resolved
    assert api.id == a.id
    assert params == {"id": "xyz"}
