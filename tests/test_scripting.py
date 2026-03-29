"""
Tests for scripting module
"""

import pytest
from scripting.script_engine import ScriptEngine


def test_script_engine_execute_simple() -> None:
    """Test executing a simple Python script"""
    engine = ScriptEngine()

    code = "print('Hello, world!')"
    result = engine.execute(code)

    assert result["success"] is True
    assert "Hello, world!" in result["stdout"]
    assert result["error"] is None


def test_script_engine_execute_with_error() -> None:
    """Test executing a script with an error"""
    engine = ScriptEngine()

    code = "raise ValueError('Test error')"
    result = engine.execute(code)

    assert result["success"] is False
    assert result["error"] is not None
    assert "error" in result["error"].lower()


def test_script_engine_variables() -> None:
    """Test setting and getting variables"""
    engine = ScriptEngine()

    engine.set_variable("test_var", 42)
    value = engine.get_variable("test_var")

    assert value == 42


def test_script_engine_reset() -> None:
    """Test resetting the script environment"""
    engine = ScriptEngine()

    engine.set_variable("test_var", 42)
    engine.reset()
    value = engine.get_variable("test_var")

    assert value is None


def test_script_engine_get_falsy_zero() -> None:
    """Bug regression: get_variable must return 0, not None (falsy value)"""
    engine = ScriptEngine()
    engine.set_variable("count", 0)
    assert engine.get_variable("count") == 0


def test_script_engine_get_falsy_false() -> None:
    """Bug regression: get_variable must return False, not None"""
    engine = ScriptEngine()
    engine.set_variable("flag", False)
    assert engine.get_variable("flag") is False


def test_script_engine_get_falsy_empty_string() -> None:
    """Bug regression: get_variable must return '', not None"""
    engine = ScriptEngine()
    engine.set_variable("label", "")
    assert engine.get_variable("label") == ""


def test_script_engine_get_falsy_empty_list() -> None:
    """Bug regression: get_variable must return [], not None"""
    engine = ScriptEngine()
    engine.set_variable("items", [])
    assert engine.get_variable("items") == []


def test_script_engine_missing_variable_returns_none() -> None:
    """get_variable for an unset name should still return None."""
    engine = ScriptEngine()
    assert engine.get_variable("nonexistent") is None


def test_script_engine_stderr_captured() -> None:
    """stderr output is captured separately from stdout."""
    engine = ScriptEngine()
    result = engine.execute("import sys; sys.stderr.write('err_msg')")
    assert result["success"] is True
    assert "err_msg" in result["stderr"]
    assert "err_msg" not in result["stdout"]


def test_script_engine_variable_set_in_exec_readable() -> None:
    """Variables set by executed code should be readable via get_variable."""
    engine = ScriptEngine()
    engine.execute("answer = 42")
    # Variables from exec land in locals dict
    value = engine.get_variable("answer")
    assert value == 42
