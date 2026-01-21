"""Unit tests for engines.script.sandbox (Phase 3, Task 3.3)."""

import pytest

from app.engines.script.sandbox import build_restricted_globals, compile_script


class TestCompileScript:
    def test_compile_simple(self) -> None:
        code = compile_script("x = 1")
        assert code is not None

    def test_compile_list_comp(self) -> None:
        code = compile_script("result = [x * 2 for x in [1, 2, 3]]")
        assert code is not None

    def test_compile_syntax_error(self) -> None:
        with pytest.raises(SyntaxError):
            compile_script("def f(  ")


class TestBuildRestrictedGlobals:
    def test_includes_builtins_and_guards(self) -> None:
        g = build_restricted_globals({})
        assert "__builtins__" in g
        assert "_getattr_" in g
        assert "_getiter_" in g
        assert "_write_" in g
        assert "json" in g
        assert "datetime" in g
        assert "date" in g

    def test_merges_context(self) -> None:
        g = build_restricted_globals({"db": "db_obj", "req": {"a": 1}})
        assert g["db"] == "db_obj"
        assert g["req"] == {"a": 1}
