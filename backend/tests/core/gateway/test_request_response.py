"""Unit tests for gateway request/response: parse_params, keys_to_snake, keys_to_camel, format_response (Phase 4, Task 4.3)."""

import asyncio

from starlette.requests import Request

from app.core.gateway.request_response import (
    format_response,
    keys_to_camel,
    keys_to_snake,
    normalize_api_result,
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
        params, _ = await parse_params(req, {"id": "123"}, "GET")
        return params

    assert _run(run()) == {"id": "123"}


def test_parse_params_path_and_query() -> None:
    async def run() -> dict:
        req = _make_request(query_string=b"a=1&b=2")
        params, _ = await parse_params(req, {"id": "123"}, "GET")
        return params

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
        params, _ = await parse_params(req, {"c": "p", "d": "p"}, "POST")
        return params

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
        params, _ = await parse_params(req, {}, "POST")
        return params

    out = _run(run())
    assert out == {"x": 1, "y": [2, 3]}


def test_parse_params_form_body() -> None:
    async def run() -> dict:
        req = _make_request(
            method="POST",
            headers=[(b"content-type", b"application/x-www-form-urlencoded")],
            body=b"k1=v1&k2=v2",
        )
        params, _ = await parse_params(req, {}, "POST")
        return params

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
        params, _ = await parse_params(req, {"id": "x"}, "POST")
        return params

    out = _run(run())
    assert out["user_id"] == 1
    assert out["first_name"] == "Joe"
    assert out["some_key"] == "qv"
    assert out["id"] == "x"
    assert out.get("naming") == "camel"


def test_parse_params_no_body_returns_empty_body() -> None:
    async def run() -> dict:
        req = _make_request(method="GET", headers=[])
        params, _ = await parse_params(req, {}, "GET")
        return params

    assert _run(run()) == {}


def test_parse_params_unknown_content_type_body_empty() -> None:
    async def run() -> tuple[dict, str | None]:
        req = _make_request(
            method="POST",
            headers=[(b"content-type", b"text/plain")],
            body=b"raw",
        )
        return await parse_params(req, {}, "POST")

    params, body_for_log = _run(run())
    assert params == {}
    assert body_for_log is None


def test_parse_params_body_for_log_returned() -> None:
    """When body is present, body_for_log is JSON string; when empty, None."""
    async def run_json() -> tuple[dict, str | None]:
        req = _make_request(
            method="POST",
            headers=[(b"content-type", b"application/json")],
            body=b'{"a": 1}',
        )
        return await parse_params(req, {}, "POST")

    params, body_for_log = _run(run_json())
    assert params == {"a": 1}
    assert body_for_log == '{"a": 1}'

    async def run_no_body() -> tuple[dict, str | None]:
        req = _make_request(method="GET")
        return await parse_params(req, {"x": "y"}, "GET")

    params2, body_for_log2 = _run(run_no_body())
    assert params2 == {"x": "y"}
    assert body_for_log2 is None


def test_parse_params_respects_location_header_only() -> None:
    async def run() -> dict:
        req = _make_request(
            method="POST",
            query_string=b"col1=query",
            headers=[(b"content-type", b"application/json"), (b"col1", b"header")],
            body=b'{"col1": "body"}',
        )
        params, _ = await parse_params(
            req,
            {},
            "POST",
            params_definition=[{"name": "col1", "location": "header"}],
        )
        return params

    out = _run(run())
    assert out == {"col1": "header"}


def test_parse_params_wrong_location_is_ignored() -> None:
    async def run() -> dict:
        req = _make_request(
            method="GET",
            query_string=b"col1=query",
            headers=[],
        )
        params, _ = await parse_params(
            req,
            {},
            "GET",
            params_definition=[{"name": "col1", "location": "header"}],
        )
        return params

    out = _run(run())
    # col1 exists in query, but configured as header => ignored
    assert out == {}


def test_parse_params_respects_location_body_only() -> None:
    async def run() -> dict:
        req = _make_request(
            method="POST",
            query_string=b"col1=query",
            headers=[(b"content-type", b"application/json")],
            body=b'{"col1": "body"}',
        )
        params, _ = await parse_params(
            req,
            {},
            "POST",
            params_definition=[{"name": "col1", "location": "body"}],
        )
        return params

    out = _run(run())
    assert out == {"col1": "body"}


# --- normalize_api_result ---


def test_normalize_api_result_sql_mode_single_stmt() -> None:
    """SQL mode, 1 statement: data = result directly (no extra list wrap)."""
    result = {"data": [[{"x": 1}, {"x": 2}]]}
    out = normalize_api_result(result, "SQL")
    assert out == {"data": [{"x": 1}, {"x": 2}]}
    assert "success" not in out


def test_normalize_api_result_sql_mode_multi_stmt() -> None:
    """SQL mode, multiple statements: data = [stmt1_result, stmt2_result, ...]."""
    result = {"data": [[{"x": 1}], 2]}
    out = normalize_api_result(result, "SQL")
    assert out == {"data": [[{"x": 1}], 2]}
    assert "success" not in out


def test_normalize_api_result_script_mode_envelope() -> None:
    """SCRIPT mode: unwrap script return (envelope) to top level."""
    result = {"data": {"success": True, "message": None, "data": [1, 2], "total": 10}}
    out = normalize_api_result(result, "SCRIPT")
    assert out == {"success": True, "message": None, "data": [1, 2], "total": 10}


def test_normalize_api_result_script_mode_wrap() -> None:
    """SCRIPT mode: script returned non-envelope -> wrap in { success, message, data }."""
    result = {"data": [1, 2, 3]}
    out = normalize_api_result(result, "SCRIPT")
    assert out == {"success": True, "message": None, "data": [1, 2, 3]}


def test_normalize_api_result_already_envelope() -> None:
    """Result transform returned envelope directly (SCRIPT path)."""
    result = {"success": False, "message": "error", "data": []}
    out = normalize_api_result(result, "SCRIPT")
    assert out == {"success": False, "message": "error", "data": []}


def test_normalize_api_result_raw_list_no_engine() -> None:
    """No engine: wrap raw list in envelope."""
    result = [{"a": 1}]
    out = normalize_api_result(result, None)
    assert out == {"success": True, "message": None, "data": [{"a": 1}]}


# --- format_response ---


def test_format_response_snake_default() -> None:
    req = _make_request(query_string=b"")
    result = {"success": True, "message": None, "data": [{"user_id": 1}]}
    assert format_response(result, req) == {"success": True, "message": None, "data": [{"user_id": 1}]}


def test_format_response_camel_query() -> None:
    req = _make_request(query_string=b"naming=camel")
    result = {"success": True, "message": None, "data": [{"user_id": 1, "first_name": "x"}]}
    out = format_response(result, req)
    assert out == {"success": True, "message": None, "data": [{"userId": 1, "firstName": "x"}]}


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
