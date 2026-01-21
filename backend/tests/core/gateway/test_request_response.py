"""Unit tests for gateway request/response: parse_params, keys_to_snake, keys_to_camel, format_response (Phase 4, Task 4.3)."""

import asyncio

from starlette.requests import Request

from app.core.gateway.request_response import (
    format_response,
    keys_to_camel,
    keys_to_snake,
    parse_params,
)


# --- keys_to_snake / keys_to_camel ---


def test_keys_to_snake_simple() -> None:
    assert keys_to_snake({"userId": 1, "firstName": "x"}) == {"user_id": 1, "first_name": "x"}


def test_keys_to_snake_nested() -> None:
    assert keys_to_snake({"userName": {"first": "a", "lastName": "b"}}) == {
        "user_name": {"first": "a", "last_name": "b"},
    }


def test_keys_to_snake_list_of_dicts() -> None:
    assert keys_to_snake([{"itemId": 1}, {"itemId": 2}]) == [{"item_id": 1}, {"item_id": 2}]


def test_keys_to_snake_non_dict_unchanged() -> None:
    assert keys_to_snake([1, 2, "x"]) == [1, 2, "x"]
    assert keys_to_snake("x") == "x"


def test_keys_to_camel_simple() -> None:
    assert keys_to_camel({"user_id": 1, "first_name": "x"}) == {"userId": 1, "firstName": "x"}


def test_keys_to_camel_nested() -> None:
    assert keys_to_camel({"user_name": {"first": "a", "last_name": "b"}}) == {
        "userName": {"first": "a", "lastName": "b"},
    }


def test_keys_to_camel_list_of_dicts() -> None:
    assert keys_to_camel([{"item_id": 1}, {"item_id": 2}]) == [{"itemId": 1}, {"itemId": 2}]


def test_keys_to_camel_row_count_key() -> None:
    """Keys with underscore become camelCase; 'row_count' -> 'rowCount'."""
    assert keys_to_camel({"row_count": 5}) == {"rowCount": 5}


# --- parse_params: build Request helpers ---


def _make_request(
    *,
    method: str = "GET",
    query_string: bytes = b"",
    headers: list[tuple[bytes, bytes]] | None = None,
    body: bytes = b"",
) -> Request:
    scope: dict = {
        "type": "http",
        "method": method,
        "path": "/",
        "query_string": query_string,
        "headers": headers or [],
        "server": ("localhost", 80),
        "client": ("127.0.0.1", 0),
        "scheme": "http",
        "root_path": "",
    }

    async def receive() -> dict:
        return {"type": "http.request", "body": body, "more_body": False}

    async def send(_: object) -> None:
        pass

    return Request(scope, receive, send)


def _run(coro) -> object:
    return asyncio.run(coro)


# --- parse_params ---


def test_parse_params_path_only() -> None:
    async def run() -> dict:
        req = _make_request()
        return await parse_params(req, {"id": "123"}, "GET")

    assert _run(run()) == {"id": "123"}


def test_parse_params_path_and_query() -> None:
    async def run() -> dict:
        req = _make_request(query_string=b"a=1&b=2")
        return await parse_params(req, {"id": "123"}, "GET")

    out = _run(run())
    assert out["id"] == "123"
    assert out["a"] == "1"
    assert out["b"] == "2"


def test_parse_params_merge_order_path_wins() -> None:
    async def run() -> dict:
        # body has a,b; query has b,c; path has c,d. path > query > body.
        req = _make_request(
            method="POST",
            query_string=b"b=q&c=q",
            headers=[(b"content-type", b"application/json")],
            body=b'{"a": "b", "b": "b", "c": "b"}',
        )
        return await parse_params(req, {"c": "p", "d": "p"}, "POST")

    out = _run(run())
    assert out["a"] == "b"
    assert out["b"] == "q"
    assert out["c"] == "p"
    assert out["d"] == "p"


def test_parse_params_json_body() -> None:
    async def run() -> dict:
        req = _make_request(
            method="POST",
            headers=[(b"content-type", b"application/json")],
            body=b'{"x": 1, "y": [2, 3]}',
        )
        return await parse_params(req, {}, "POST")

    out = _run(run())
    assert out == {"x": 1, "y": [2, 3]}


def test_parse_params_form_body() -> None:
    async def run() -> dict:
        req = _make_request(
            method="POST",
            headers=[(b"content-type", b"application/x-www-form-urlencoded")],
            body=b"k1=v1&k2=v2",
        )
        return await parse_params(req, {}, "POST")

    out = _run(run())
    assert out["k1"] == "v1"
    assert out["k2"] == "v2"


def test_parse_params_naming_camel_converts_body_and_query() -> None:
    async def run() -> dict:
        req = _make_request(
            method="POST",
            query_string=b"naming=camel&someKey=qv",
            headers=[(b"content-type", b"application/json")],
            body=b'{"userId": 1, "firstName": "Joe"}',
        )
        return await parse_params(req, {"id": "x"}, "POST")

    out = _run(run())
    assert out["user_id"] == 1
    assert out["first_name"] == "Joe"
    assert out["some_key"] == "qv"
    assert out["id"] == "x"
    assert out.get("naming") == "camel"


def test_parse_params_no_body_returns_empty_body() -> None:
    async def run() -> dict:
        req = _make_request(method="GET", headers=[])
        return await parse_params(req, {}, "GET")

    assert _run(run()) == {}


def test_parse_params_unknown_content_type_body_empty() -> None:
    async def run() -> dict:
        req = _make_request(
            method="POST",
            headers=[(b"content-type", b"text/plain")],
            body=b"raw",
        )
        return await parse_params(req, {}, "POST")

    assert _run(run()) == {}


# --- format_response ---


def test_format_response_snake_default() -> None:
    req = _make_request(query_string=b"")
    result = {"data": [{"user_id": 1}], "rowcount": 1}
    assert format_response(result, req) == {"data": [{"user_id": 1}], "rowcount": 1}


def test_format_response_camel_query() -> None:
    req = _make_request(query_string=b"naming=camel")
    result = {"data": [{"user_id": 1, "first_name": "x"}], "rowcount": 1}
    out = format_response(result, req)
    # data/rowcount: only keys with underscore are converted; "rowcount" stays as-is
    assert out == {"data": [{"userId": 1, "firstName": "x"}], "rowcount": 1}


def test_format_response_camel_header() -> None:
    req = _make_request(
        query_string=b"",
        headers=[(b"x-response-naming", b"camel")],
    )
    result = {"row_count": 5}
    assert format_response(result, req) == {"rowCount": 5}


def test_format_response_non_dict_unchanged() -> None:
    req = _make_request()
    assert format_response([1, 2], req) == [1, 2]
    assert format_response("x", req) == "x"
