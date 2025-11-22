"""
Comprehensive tests for logging configuration utilities.
Part of Phase 4: UI and Utilities testing
"""

import pytest
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch, call
import tempfile
import shutil

from utils.logging_config import (
    setup_logging,
    setup_component_logging,
    get_logger,
    log_telescope_event,
    log_performance,
    log_error
)


class TestSetupLogging:
    """Test the setup_logging function"""
    
    @pytest.fixture
    def temp_log_dir(self):
        """Create temporary directory for log files"""
        temp_dir = tempfile.mkdtemp()
        yield temp_dir
        shutil.rmtree(temp_dir, ignore_errors=True)
    
    @patch('utils.logging_config.logger')
    def test_setup_logging_default_config(self, mock_logger):
        """Test setup_logging with default configuration"""
        # Call setup_logging
        setup_logging()
        
        # Verify logger was reset
        mock_logger.remove.assert_called_once()
        
        # Verify console handler was added
        mock_logger.add.assert_called()
        
        # Get the first add call (console handler)
        console_call = mock_logger.add.call_args_list[0]
        assert console_call[0][0] == sys.stderr
        assert console_call[1]['level'] == "INFO"
        assert console_call[1]['colorize'] is True
        assert console_call[1]['backtrace'] is True
        assert console_call[1]['diagnose'] is True
    
    @patch('utils.logging_config.logger')
    def test_setup_logging_with_file(self, mock_logger, temp_log_dir):
        """Test setup_logging with file output"""
        log_file = Path(temp_log_dir) / "test.log"
        
        setup_logging(
            log_level="DEBUG",
            log_file=str(log_file),
            log_rotation="10 MB",
            log_retention="3 days"
        )
        
        # Verify file handler was added
        assert mock_logger.add.call_count >= 2  # Console + file
        
        # Find the file handler call
        file_handler_call = None
        for call_args in mock_logger.add.call_args_list:
            if isinstance(call_args[0][0], str) and str(log_file) in str(call_args[0][0]):
                file_handler_call = call_args
                break
        
        assert file_handler_call is not None
        assert file_handler_call[1]['level'] == "DEBUG"
        assert file_handler_call[1]['rotation'] == "10 MB"
        assert file_handler_call[1]['retention'] == "3 days"
        assert file_handler_call[1]['compression'] == "zip"
        assert file_handler_call[1]['enqueue'] is True
    
    @patch('utils.logging_config.logger')
    def test_setup_logging_json_format(self, mock_logger):
        """Test setup_logging with JSON format"""
        setup_logging(enable_json=True)
        
        # Verify JSON format was used
        console_call = mock_logger.add.call_args_list[0]
        format_str = console_call[1]['format']
        assert '"time"' in format_str
        assert '"level"' in format_str
        assert '"message"' in format_str
        assert '"request_id"' in format_str
    
    @patch('utils.logging_config.logger')
    @patch('utils.logging_config.setup_component_logging')
    def test_setup_logging_calls_component_setup(self, mock_component_setup, mock_logger):
        """Test setup_logging calls setup_component_logging"""
        setup_logging()
        
        # Verify component logging was set up
        mock_component_setup.assert_called_once()
    
    @patch('utils.logging_config.logger')
    def test_setup_logging_creates_log_directory(self, mock_logger, temp_log_dir):
        """Test setup_logging creates log directory if needed"""
        log_file = Path(temp_log_dir) / "subdir" / "test.log"
        
        setup_logging(log_file=str(log_file))
        
        # Verify directory was created
        assert log_file.parent.exists()


class TestSetupComponentLogging:
    """Test the setup_component_logging function"""
    
    @patch('utils.logging_config.logger')
    @patch('utils.logging_config.Path.mkdir')
    def test_setup_component_logging(self, mock_mkdir, mock_logger):
        """Test setup_component_logging creates component-specific loggers"""
        setup_component_logging()
        
        # Verify logs directory creation
        mock_mkdir.assert_called_once_with(exist_ok=True)
        
        # Verify all component loggers were added
        assert mock_logger.add.call_count == 4  # telescope, websocket, errors, performance
        
        # Check each logger configuration
        call_args_list = mock_logger.add.call_args_list
        
        # Telescope logger
        telescope_call = call_args_list[0]
        assert "telescope_" in str(telescope_call[0][0])
        assert telescope_call[1]['retention'] == "30 days"
        assert telescope_call[1]['level'] == "DEBUG"
        
        # WebSocket logger
        websocket_call = call_args_list[1]
        assert "websocket_" in str(websocket_call[0][0])
        assert websocket_call[1]['retention'] == "7 days"
        
        # Error logger
        error_call = call_args_list[2]
        assert "errors_" in str(error_call[0][0])
        assert error_call[1]['level'] == "ERROR"
        assert error_call[1]['backtrace'] is True
        
        # Performance logger
        perf_call = call_args_list[3]
        assert "performance_" in str(perf_call[0][0])
        assert perf_call[1]['level'] == "INFO"
    
    @patch('utils.logging_config.logger')
    def test_component_filters(self, mock_logger):
        """Test component logger filters"""
        setup_component_logging()
        
        # Get the filter functions
        telescope_filter = mock_logger.add.call_args_list[0][1]['filter']
        websocket_filter = mock_logger.add.call_args_list[1][1]['filter']
        perf_filter = mock_logger.add.call_args_list[3][1]['filter']
        
        # Test telescope filter
        record_telescope = {"module": "telescope_client"}
        record_seestar = {"module": "seestar_connection"}
        record_other = {"module": "main"}
        
        assert telescope_filter(record_telescope) is True
        assert telescope_filter(record_seestar) is True
        assert telescope_filter(record_other) is False
        
        # Test websocket filter
        record_ws = {"module": "websocket_manager"}
        assert websocket_filter(record_ws) is True
        assert websocket_filter(record_other) is False
        
        # Test performance filter
        record_perf = {"extra": {"performance": True}, "message": "test"}
        record_duration = {"extra": {}, "message": "Duration: 1.5s"}
        
        assert perf_filter(record_perf) is True
        assert perf_filter(record_duration) is True
        assert perf_filter({"extra": {}, "message": "regular log"}) is False


class TestGetLogger:
    """Test the get_logger function"""
    
    @patch('utils.logging_config.logger')
    def test_get_logger_without_name(self, mock_logger):
        """Test get_logger without name returns base logger"""
        result = get_logger()
        
        assert result == mock_logger
        mock_logger.bind.assert_not_called()
    
    @patch('utils.logging_config.logger')
    def test_get_logger_with_name(self, mock_logger):
        """Test get_logger with name binds module"""
        mock_bound_logger = MagicMock()
        mock_logger.bind.return_value = mock_bound_logger
        
        result = get_logger("test_module")
        
        mock_logger.bind.assert_called_once_with(module="test_module")
        assert result == mock_bound_logger


class TestLoggingHelpers:
    """Test the logging helper functions"""
    
    @patch('utils.logging_config.logger')
    def test_log_telescope_event(self, mock_logger):
        """Test log_telescope_event function"""
        log_telescope_event(
            event_type="connection",
            telescope_id="seestar-123",
            data={"status": "connected", "ip": "192.168.1.100"}
        )
        
        mock_logger.info.assert_called_once()
        call_args = mock_logger.info.call_args
        
        assert "Telescope event" in call_args[0][0]
        assert "Type: connection" in call_args[0][0]
        assert "ID: seestar-123" in call_args[0][0]
        
        extra = call_args[1]['extra']
        assert extra['telescope_id'] == "seestar-123"
        assert extra['event_data'] == {"status": "connected", "ip": "192.168.1.100"}
    
    @patch('utils.logging_config.logger')
    def test_log_performance(self, mock_logger):
        """Test log_performance function"""
        log_performance(
            operation="image_processing",
            duration=1.234,
            details={"image_size": "1920x1080", "format": "PNG"}
        )
        
        mock_logger.info.assert_called_once()
        call_args = mock_logger.info.call_args
        
        assert "Performance" in call_args[0][0]
        assert "Operation: image_processing" in call_args[0][0]
        assert "Duration: 1.234s" in call_args[0][0]
        
        extra = call_args[1]['extra']
        assert extra['performance'] is True
        assert extra['operation'] == "image_processing"
        assert extra['duration'] == 1.234
        assert extra['details'] == {"image_size": "1920x1080", "format": "PNG"}
    
    @patch('utils.logging_config.logger')
    def test_log_error(self, mock_logger):
        """Test log_error function"""
        test_error = ValueError("Test error message")
        context = {"user_id": "123", "action": "telescope_connect"}
        
        log_error(test_error, context)
        
        mock_logger.error.assert_called_once()
        call_args = mock_logger.error.call_args
        
        assert "Error occurred" in call_args[0][0]
        assert "Type: ValueError" in call_args[0][0]
        assert "Message: Test error message" in call_args[0][0]
        
        extra = call_args[1]['extra']
        assert extra['error_type'] == "ValueError"
        assert extra['error_context'] == context


class TestLoggingIntegration:
    """Integration tests for logging system"""
    
    def test_full_logging_setup(self, tmp_path):
        """Test complete logging setup with real file output"""
        log_file = tmp_path / "test.log"
        
        # Patch logger to avoid actual logging during tests
        with patch('utils.logging_config.logger') as mock_logger:
            setup_logging(
                log_level="DEBUG",
                log_file=str(log_file),
                enable_json=False
            )
            
            # Verify basic setup
            assert mock_logger.remove.called
            assert mock_logger.add.called
            
            # Verify info logs were called
            info_calls = [call for call in mock_logger.info.call_args_list]
            assert len(info_calls) >= 2  # Config info + platform info
    
    def test_logging_with_all_features(self):
        """Test logging with all features enabled"""
        with patch('utils.logging_config.logger') as mock_logger:
            # Setup logging
            setup_logging(
                log_level="DEBUG",
                log_file="test.log",
                log_rotation="1 MB",
                log_retention="1 day",
                enable_json=True
            )
            
            # Use all helper functions
            log_telescope_event("test", "123")
            log_performance("test_op", 0.5)
            log_error(Exception("test"), {"context": "test"})
            
            # Verify all logging methods were used
            assert mock_logger.info.called
            assert mock_logger.error.called