"""
Pytest configuration and fixtures
"""

import sys
from pathlib import Path

# Add src-tauri/python to Python path
python_path = Path(__file__).parent.parent / "src-tauri" / "python"
sys.path.insert(0, str(python_path))
