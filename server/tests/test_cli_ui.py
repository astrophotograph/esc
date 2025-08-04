"""
Tests for CLI UI components.
Note: These tests are minimal since textual is not installed as a dependency.
"""

import pytest
import sys
from unittest.mock import MagicMock, patch

# Mock textual modules before importing cli.ui
sys.modules['textual'] = MagicMock()
sys.modules['textual.app'] = MagicMock()
sys.modules['textual.containers'] = MagicMock()
sys.modules['textual.widgets'] = MagicMock()
sys.modules['textual.screen'] = MagicMock()
sys.modules['textual.reactive'] = MagicMock()


class TestCLIUI:
    """Test CLI UI components with mocked textual"""
    
    def test_imports(self):
        """Test that CLI UI modules can be imported"""
        # This should not raise ImportError
        try:
            from cli.ui import DevicePickerScreen, MainUIScreen, CombinedSeestarUI
            assert True  # Import successful
        except ImportError as e:
            pytest.fail(f"Failed to import CLI UI modules: {e}")
    
    def test_module_exists(self):
        """Test that cli.ui module exists and has expected attributes"""
        import cli.ui
        
        # Check that expected classes exist
        assert hasattr(cli.ui, 'DevicePickerScreen')
        assert hasattr(cli.ui, 'MainUIScreen') 
        assert hasattr(cli.ui, 'CombinedSeestarUI')
    
    @patch('cli.ui.SeestarClient')
    def test_basic_structure(self, mock_client):
        """Test basic structure of CLI UI classes"""
        import cli.ui
        
        # Verify classes are defined
        assert cli.ui.DevicePickerScreen is not None
        assert cli.ui.MainUIScreen is not None
        assert cli.ui.CombinedSeestarUI is not None
        
        # Since we're mocking textual, the classes won't be real types
        # Just verify they exist and are not None
        assert cli.ui.DevicePickerScreen
        assert cli.ui.MainUIScreen
        assert cli.ui.CombinedSeestarUI


# Note: Comprehensive testing would require textual to be installed.
# These minimal tests ensure the module can be imported and has the expected structure.