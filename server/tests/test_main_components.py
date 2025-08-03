"""
Tests for main.py components - focusing on testable classes and functions.
Part of Phase 1: Critical Path Testing - Core application component testing
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import FastAPI
import json

from main import (
    AddTelescopeRequest,
    SaveConfigurationRequest,
    AddRemoteControllerRequest,
    ConfigurationResponse,
    RemoteControllerResponse,
    ImageEnhancementSettingsRequest,
    ImageEnhancementSettingsResponse,
    Telescope,
    TestTelescope,
    MockSeestarClient,
    MockImagingClient,
    Controller
)


class TestMainDataModels:
    """Test Pydantic models defined in main.py"""
    
    def test_add_telescope_request_model(self):
        """Test AddTelescopeRequest model validation"""
        request_data = {
            "host": "192.168.1.100",
            "port": 4700,
            "serial_number": "SN123456",
            "product_model": "Seestar S50",
            "ssid": "SEESTAR_123456",
            "location": "Test Observatory",
            "discovery_method": "manual"
        }
        
        request = AddTelescopeRequest(**request_data)
        
        assert request.host == "192.168.1.100"
        assert request.port == 4700
        assert request.serial_number == "SN123456"
        assert request.product_model == "Seestar S50"
        assert request.discovery_method == "manual"
    
    def test_add_telescope_request_validation(self):
        """Test AddTelescopeRequest validation errors"""
        # Test missing required fields
        with pytest.raises(Exception):  # Pydantic validation error
            AddTelescopeRequest(host="192.168.1.100")  # Missing port
        
        # Test invalid port range
        with pytest.raises(Exception):
            AddTelescopeRequest(
                host="192.168.1.100",
                port=70000,  # Port too high
                serial_number="SN123456",
                product_model="Seestar S50"
            )
    
    def test_save_configuration_request_model(self):
        """Test SaveConfigurationRequest model"""
        config_data = {
            "name": "test_config",
            "description": "Test configuration",
            "configuration": {"gain": 100, "exposure": 30}
        }
        
        request = SaveConfigurationRequest(**config_data)
        
        assert request.name == "test_config"
        assert request.description == "Test configuration"
        assert request.configuration == {"gain": 100, "exposure": 30}
    
    def test_configuration_response_model(self):
        """Test ConfigurationResponse model"""
        response_data = {
            "name": "test_config",
            "description": "Test configuration",
            "configuration": {"gain": 100, "exposure": 30},
            "created_at": "2025-01-01T00:00:00",
            "updated_at": "2025-01-01T00:00:00"
        }
        
        response = ConfigurationResponse(**response_data)
        
        assert response.name == "test_config"
        assert response.description == "Test configuration"
        assert response.configuration == {"gain": 100, "exposure": 30}
    
    def test_remote_controller_request_model(self):
        """Test AddRemoteControllerRequest model"""
        controller_data = {
            "host": "192.168.1.200",
            "port": 8080
        }
        
        request = AddRemoteControllerRequest(**controller_data)
        
        assert request.host == "192.168.1.200"
        assert request.port == 8080
    
    def test_image_enhancement_settings_model(self):
        """Test ImageEnhancementSettingsRequest model"""
        settings_data = {
            "upscaling_enabled": True,
            "upscaling_method": "fast",
            "upscaling_factor": 2.0,
            "sharpening_enabled": True,
            "sharpening_method": "soft",
            "sharpening_intensity": 0.5,
            "graxpert_enabled": False,
            "graxpert_strength": 1.0,
            "graxpert_smoothing": 0.5
        }
        
        request = ImageEnhancementSettingsRequest(**settings_data)
        
        assert request.upscaling_enabled is True
        assert request.upscaling_method == "fast"
        assert request.upscaling_factor == 2.0
        assert request.sharpening_enabled is True
        assert request.graxpert_enabled is False


class TestTelescopeModel:
    """Test Telescope model class"""
    
    @pytest.fixture
    def mock_client(self):
        """Create a mock SeestarClient"""
        return AsyncMock()
    
    @pytest.fixture
    def mock_imaging_client(self):
        """Create a mock SeestarImagingClient"""
        return AsyncMock()
    
    def test_telescope_model_creation(self, mock_client, mock_imaging_client):
        """Test Telescope model instantiation"""
        telescope_data = {
            "host": "192.168.1.100",
            "port": 4700,
            "client": mock_client,
            "imaging_client": mock_imaging_client,
            "serial_number": "SN123456",
            "product_model": "Seestar S50",
            "ssid": "SEESTAR_123456",
            "discovery_method": "manual"
        }
        
        telescope = Telescope(**telescope_data)
        
        assert telescope.host == "192.168.1.100"
        assert telescope.port == 4700
        assert telescope.client == mock_client
        assert telescope.imaging_client == mock_imaging_client
        assert telescope.serial_number == "SN123456"
        assert telescope.product_model == "Seestar S50"
    
    def test_telescope_model_defaults(self, mock_client, mock_imaging_client):
        """Test Telescope model with default values"""
        telescope_data = {
            "host": "192.168.1.100",
            "port": 4700,
            "client": mock_client,
            "imaging_client": mock_imaging_client
        }
        
        telescope = Telescope(**telescope_data)
        
        assert telescope.host == "192.168.1.100"
        assert telescope.port == 4700
        assert telescope.serial_number is None
        assert telescope.product_model is None
        assert telescope.ssid is None
        assert telescope.location is None
        assert telescope.discovery_method == "manual"  # default value


class TestMockComponents:
    """Test mock components for testing"""
    
    def test_mock_seestar_client_creation(self):
        """Test MockSeestarClient instantiation"""
        mock_client = MockSeestarClient()
        
        assert mock_client is not None
        assert hasattr(mock_client, 'connected')
        assert mock_client.connected is False
    
    @pytest.mark.asyncio
    async def test_mock_seestar_client_connect(self):
        """Test MockSeestarClient connect method"""
        mock_client = MockSeestarClient()
        
        result = await mock_client.connect()
        
        assert result is True
        assert mock_client.connected is True
    
    @pytest.mark.asyncio
    async def test_mock_seestar_client_disconnect(self):
        """Test MockSeestarClient disconnect method"""
        mock_client = MockSeestarClient()
        await mock_client.connect()
        
        await mock_client.disconnect()
        
        assert mock_client.connected is False
    
    def test_mock_imaging_client_creation(self):
        """Test MockImagingClient instantiation"""
        mock_imaging = MockImagingClient()
        
        assert mock_imaging is not None
        assert hasattr(mock_imaging, 'connected')
        assert mock_imaging.connected is False
    
    @pytest.mark.asyncio
    async def test_mock_imaging_client_connect(self):
        """Test MockImagingClient connect method"""
        mock_imaging = MockImagingClient()
        
        result = await mock_imaging.connect()
        
        assert result is True
        assert mock_imaging.connected is True


class TestTestTelescope:
    """Test TestTelescope model for WebRTC testing"""
    
    def test_test_telescope_creation(self):
        """Test TestTelescope model creation"""
        mock_client = MockSeestarClient()
        mock_imaging = MockImagingClient()
        
        telescope_data = {
            "host": "127.0.0.1",
            "port": 8000,
            "client": mock_client,
            "imaging_client": mock_imaging,
            "serial_number": "TEST123",
            "product_model": "Test Telescope",
            "ssid": "TEST_TELESCOPE",
            "discovery_method": "test"
        }
        
        test_telescope = TestTelescope(**telescope_data)
        
        assert test_telescope.host == "127.0.0.1"
        assert test_telescope.port == 8000
        assert test_telescope.serial_number == "TEST123"
        assert test_telescope.product_model == "Test Telescope"
    
    def test_test_telescope_with_defaults(self):
        """Test TestTelescope with default values"""
        mock_client = MockSeestarClient()
        mock_imaging = MockImagingClient()
        
        telescope_data = {
            "host": "127.0.0.1",
            "port": 8000,
            "client": mock_client,
            "imaging_client": mock_imaging
        }
        
        test_telescope = TestTelescope(**telescope_data)
        
        assert test_telescope.host == "127.0.0.1"
        assert test_telescope.port == 8000
        assert test_telescope.serial_number is None
        assert test_telescope.product_model is None


class TestControllerBasics:
    """Test Controller class basic functionality"""
    
    @pytest.fixture
    def mock_app(self):
        """Create a mock FastAPI app"""
        return MagicMock()
    
    @pytest.fixture
    def controller(self, mock_app):
        """Create a Controller instance with mocked dependencies"""
        with patch('main.TelescopeDatabase') as mock_db:
            mock_db_instance = AsyncMock()
            mock_db.return_value = mock_db_instance
            
            controller = Controller(
                app=mock_app,
                service_port=8000,
                discover=False,
                reload=False
            )
            
            # Override the database with our mock
            controller.db = mock_db_instance
            
            yield controller
    
    def test_controller_initialization(self, controller, mock_app):
        """Test Controller initialization"""
        assert controller.app == mock_app
        assert controller.service_port == 8000
        assert controller.discover is False
        assert controller.reload is False
        assert controller.telescopes == {}
        assert controller.remote_telescopes == {}
        assert controller.remote_controllers == {}
        assert controller.db is not None
    
    def test_controller_telescopes_dict(self, controller):
        """Test Controller telescopes dictionary management"""
        # Initially empty
        assert len(controller.telescopes) == 0
        
        # Add a mock telescope
        mock_telescope = MagicMock()
        controller.telescopes["test_telescope"] = mock_telescope
        
        assert len(controller.telescopes) == 1
        assert "test_telescope" in controller.telescopes
        assert controller.telescopes["test_telescope"] == mock_telescope
    
    def test_controller_remote_management(self, controller):
        """Test Controller remote telescope and controller management"""
        # Test remote telescopes
        assert len(controller.remote_telescopes) == 0
        
        remote_telescope_data = {
            "host": "192.168.1.100",
            "port": 4700,
            "status": "connected"
        }
        controller.remote_telescopes["remote1"] = remote_telescope_data
        
        assert len(controller.remote_telescopes) == 1
        assert controller.remote_telescopes["remote1"]["host"] == "192.168.1.100"
        
        # Test remote controllers
        assert len(controller.remote_controllers) == 0
        
        remote_controller_data = {
            "host": "192.168.1.200",
            "port": 8080,
            "status": "connected"
        }
        controller.remote_controllers["controller1"] = remote_controller_data
        
        assert len(controller.remote_controllers) == 1
        assert controller.remote_controllers["controller1"]["host"] == "192.168.1.200"


class TestMainFunctionImports:
    """Test that key components can be imported correctly"""
    
    def test_model_imports(self):
        """Test that all Pydantic models can be imported"""
        from main import (
            AddTelescopeRequest,
            SaveConfigurationRequest,
            AddRemoteControllerRequest,
            ConfigurationResponse,
            ConfigurationListItem,
            RemoteControllerResponse,
            ImageEnhancementSettingsRequest,
            ImageEnhancementSettingsResponse,
            UpscalingSettingsRequest,
            UpscalingSettingsResponse
        )
        
        # All imports should succeed
        assert AddTelescopeRequest is not None
        assert SaveConfigurationRequest is not None
        assert AddRemoteControllerRequest is not None
        assert ConfigurationResponse is not None
        assert ConfigurationListItem is not None
        assert RemoteControllerResponse is not None
        assert ImageEnhancementSettingsRequest is not None
        assert ImageEnhancementSettingsResponse is not None
        assert UpscalingSettingsRequest is not None
        assert UpscalingSettingsResponse is not None
    
    def test_class_imports(self):
        """Test that main classes can be imported"""
        from main import (
            Telescope,
            TestTelescope,
            MockSeestarClient,
            MockImagingClient,
            Controller
        )
        
        # All imports should succeed
        assert Telescope is not None
        assert TestTelescope is not None
        assert MockSeestarClient is not None
        assert MockImagingClient is not None
        assert Controller is not None
    
    def test_handler_import(self):
        """Test that InterceptHandler can be imported"""
        from main import InterceptHandler
        
        assert InterceptHandler is not None
        # Test that it's a logging handler
        import logging
        assert issubclass(InterceptHandler, logging.Handler)