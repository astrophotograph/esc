"""
Script execution engine for user-provided Python scripts
"""

from typing import Dict, Any, Optional
import sys
from io import StringIO


class ScriptEngine:
    """Execute user Python scripts in a controlled environment"""

    def __init__(self):
        self.globals: Dict[str, Any] = {}
        self.locals: Dict[str, Any] = {}

    def execute(self, code: str) -> Dict[str, Any]:
        """
        Execute Python code and capture output

        Args:
            code: Python code to execute

        Returns:
            Dictionary with execution results
        """
        # Capture stdout and stderr
        old_stdout = sys.stdout
        old_stderr = sys.stderr
        stdout_buffer = StringIO()
        stderr_buffer = StringIO()

        try:
            sys.stdout = stdout_buffer
            sys.stderr = stderr_buffer

            # Execute the code
            exec(code, self.globals, self.locals)

            return {
                "success": True,
                "stdout": stdout_buffer.getvalue(),
                "stderr": stderr_buffer.getvalue(),
                "error": None,
            }

        except Exception as e:
            return {
                "success": False,
                "stdout": stdout_buffer.getvalue(),
                "stderr": stderr_buffer.getvalue(),
                "error": str(e),
            }

        finally:
            # Restore stdout and stderr
            sys.stdout = old_stdout
            sys.stderr = old_stderr

    def set_variable(self, name: str, value: Any) -> None:
        """
        Set a variable in the script environment

        Args:
            name: Variable name
            value: Variable value
        """
        self.globals[name] = value

    def get_variable(self, name: str) -> Optional[Any]:
        """
        Get a variable from the script environment

        Args:
            name: Variable name

        Returns:
            Variable value or None if not found
        """
        _sentinel = object()
        val = self.globals.get(name, _sentinel)
        if val is not _sentinel:
            return val
        return self.locals.get(name)

    def reset(self) -> None:
        """Reset the script environment"""
        self.globals.clear()
        self.locals.clear()
