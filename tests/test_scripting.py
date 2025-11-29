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
