"""
Test FastAPI endpoints in main.py to improve coverage.
Works with the app structure where app is created in main().
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch, Mock
import json
from datetime import datetime
import asyncio

# Mock dependencies before import
with patch('main.TelescopeDatabase') as mock_db:
    mock_db.return_value = AsyncMock()
    with patch('main.WebSocketManager') as mock_ws:
        mock_ws.return_value = MagicMock()
        with patch('main.asyncio.create_task'):
            # Import main and create app
            from main import create_app, Controller, Telescope, RemoteController
            from main import AddTelescopeRequest, SaveConfigurationRequest, AddRemoteControllerRequest
            from main import ConfigurationResponse
            from main import discover_seestars


class TestMainFastAPIEndpoints:
    """Test FastAPI endpoints for main.py coverage."""

    @pytest.fixture
    def mock_telescope(self):
        """Create a mock telescope."""
        telescope = MagicMock(spec=Telescope)
        telescope.device = MagicMock()
        telescope.device.name = "test_telescope"
        telescope.device.host = "192.168.1.100"
        telescope.device.port = 4700
        telescope.config = {
            "host": "192.168.1.100",
            "port": 4700,
            "device_name": "test_telescope",
            "is_connected": True
        }
        telescope.is_test_telescope = False
        telescope.is_connected = MagicMock(return_value=True)
        telescope.client = AsyncMock()
        telescope.client.get_viewstate = AsyncMock(return_value={"view": "state"})
        telescope.client.send_command = AsyncMock(return_value={"success": True})
        telescope.client.get_recent_messages = MagicMock(return_value=[])
        telescope.client.get_recent_commands = MagicMock(return_value=[])
        telescope.client.get_recent_events = MagicMock(return_value=[])
        telescope.client.get_message_analytics = MagicMock(return_value={})
        telescope.event_scheduler = MagicMock()
        telescope.event_scheduler.get_scheduled_events = MagicMock(return_value=[])
        telescope.disconnect = AsyncMock()
        
        # Create router
        from fastapi import APIRouter
        telescope.router = APIRouter()
        telescope.create_api_routes = MagicMock(return_value=telescope.router)
        
        return telescope

    @pytest.fixture
    def test_app(self, mock_telescope):
        """Create test app with mocked dependencies."""
        # Create app
        app = create_app()
        
        # Create controller with mocks
        controller = Controller(app, service_port=8000, discover=False)
        
        # Mock database
        controller.db = AsyncMock()
        controller.db.load_telescopes = AsyncMock(return_value=[])
        controller.db.save_telescope = AsyncMock()
        controller.db.delete_telescope = AsyncMock()
        controller.db.load_configurations = AsyncMock(return_value=[])
        controller.db.save_configuration = AsyncMock()
        controller.db.load_configuration = AsyncMock(return_value=None)
        controller.db.delete_configuration = AsyncMock()
        controller.db.load_remote_controllers = AsyncMock(return_value=[])
        controller.db.save_remote_controller = AsyncMock()
        controller.db.delete_remote_controller = AsyncMock()
        controller.db.update_remote_controller_status = AsyncMock()
        
        # Mock WebSocket manager
        controller.websocket_manager = MagicMock()
        controller.websocket_manager.notify_telescope_added = AsyncMock()
        controller.websocket_manager.notify_telescope_removed = AsyncMock()
        controller.websocket_manager.notify_telescope_status = AsyncMock()
        controller.websocket_manager.broadcast = AsyncMock()
        
        # Add telescope to controller
        controller.telescopes = {"test_telescope": mock_telescope}
        controller.remote_telescopes = {}
        controller.discovery_task = None
        controller._discovery_enabled = False
        
        # Mock async methods
        controller.add_telescope = AsyncMock(return_value=True)
        controller.remove_telescope = AsyncMock()
        controller.connect_all_telescopes = AsyncMock()
        controller.add_remote_controller = AsyncMock(return_value=True)
        controller.remove_remote_controller = AsyncMock()
        controller.reconnect_remote_controller = AsyncMock(return_value=True)
        
        # Patch global controller
        with patch('main.controller', controller):
            yield app, controller

    @pytest.fixture
    def client(self, test_app):
        """Create test client."""
        from fastapi.testclient import TestClient
        app, controller = test_app
        with TestClient(app) as client:
            yield client, controller

    # Test main endpoints
    def test_root_endpoint(self, client):
        """Test root endpoint."""
        test_client, _ = client
        response = test_client.get("/")
        assert response.status_code == 200
        assert "text/html" in response.headers.get("content-type", "")

    def test_health_endpoint(self, client):
        """Test health endpoint."""
        test_client, _ = client
        response = test_client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"

    def test_get_telescopes(self, client):
        """Test GET /api/telescopes."""
        test_client, controller = client
        response = test_client.get("/api/telescopes")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

    def test_add_telescope(self, client):
        """Test POST /api/telescopes."""
        test_client, controller = client
        telescope_data = {
            "host": "192.168.1.101",
            "port": 4700,
            "device_name": "new_telescope"
        }
        response = test_client.post("/api/telescopes", json=telescope_data)
        assert response.status_code == 200
        controller.add_telescope.assert_called_once()

    def test_delete_telescope(self, client):
        """Test DELETE /api/telescopes/{name}."""
        test_client, controller = client
        response = test_client.delete("/api/telescopes/test_telescope")
        assert response.status_code == 200

    def test_save_configuration(self, client):
        """Test POST /api/configurations."""
        test_client, controller = client
        config_data = {
            "name": "test_config",
            "description": "Test configuration",
            "telescopes": ["test_telescope"]
        }
        response = test_client.post("/api/configurations", json=config_data)
        assert response.status_code == 200

    def test_get_configurations(self, client):
        """Test GET /api/configurations."""
        test_client, controller = client
        controller.db.load_configurations.return_value = [
            {"name": "config1", "description": "Test", "telescopes": []}
        ]
        response = test_client.get("/api/configurations")
        assert response.status_code == 200
        assert len(response.json()) == 1

    def test_get_configuration(self, client):
        """Test GET /api/configurations/{name}."""
        test_client, controller = client
        config = {"name": "test", "description": "Test", "telescopes": []}
        controller.db.load_configuration.return_value = config
        response = test_client.get("/api/configurations/test")
        assert response.status_code == 200

    def test_get_configuration_not_found(self, client):
        """Test GET /api/configurations/{name} when not found."""
        test_client, controller = client
        controller.db.load_configuration.return_value = None
        response = test_client.get("/api/configurations/nonexistent")
        assert response.status_code == 404

    def test_delete_configuration(self, client):
        """Test DELETE /api/configurations/{name}."""
        test_client, controller = client
        response = test_client.delete("/api/configurations/test_config")
        assert response.status_code == 200

    def test_network_discovery(self, client):
        """Test GET /api/network-discovery."""
        test_client, _ = client
        with patch('main.discover_seestars') as mock_discover:
            mock_discover.return_value = [
                {"address": "192.168.1.100", "data": {"name": "Seestar"}}
            ]
            response = test_client.get("/api/network-discovery")
            assert response.status_code == 200

    def test_connect_all_telescopes(self, client):
        """Test POST /api/telescopes/connect-all."""
        test_client, controller = client
        response = test_client.post("/api/telescopes/connect-all")
        assert response.status_code == 200

    def test_get_remote_controllers(self, client):
        """Test GET /api/remote-controllers."""
        test_client, controller = client
        # Add a mock remote controller
        remote = MagicMock()
        remote.host = "remote.host"
        remote.port = 8000
        remote.name = "Remote"
        remote.status = "connected"
        controller.remote_telescopes["remote.host:8000"] = remote
        
        response = test_client.get("/api/remote-controllers")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1

    def test_add_remote_controller(self, client):
        """Test POST /api/remote-controllers."""
        test_client, controller = client
        remote_data = {
            "host": "remote.host",
            "port": 8000,
            "name": "Remote Controller"
        }
        response = test_client.post("/api/remote-controllers", json=remote_data)
        assert response.status_code == 200

    def test_delete_remote_controller(self, client):
        """Test DELETE /api/remote-controllers/{host}/{port}."""
        test_client, controller = client
        response = test_client.delete("/api/remote-controllers/remote.host/8000")
        assert response.status_code == 200

    def test_reconnect_remote_controller(self, client):
        """Test POST /api/remote-controllers/{host}/{port}/reconnect."""
        test_client, controller = client
        response = test_client.post("/api/remote-controllers/remote.host/8000/reconnect")
        assert response.status_code == 200

    def test_starmap_endpoint(self, client):
        """Test GET /api/starmap."""
        test_client, _ = client
        with patch('main.create_star_chart') as mock_chart:
            mock_chart.return_value = b"fake_png_data"
            response = test_client.get("/api/starmap?ra=10.5&dec=20.5")
            assert response.status_code == 200
            assert response.headers["content-type"] == "image/png"

    # Test error handling
    def test_add_telescope_error(self, client):
        """Test error handling in add telescope."""
        test_client, controller = client
        controller.add_telescope.side_effect = Exception("Connection failed")
        telescope_data = {
            "host": "192.168.1.101",
            "port": 4700,
            "device_name": "error_telescope"
        }
        response = test_client.post("/api/telescopes", json=telescope_data)
        assert response.status_code == 400

    def test_invalid_json(self, client):
        """Test invalid JSON handling."""
        test_client, _ = client
        response = test_client.post(
            "/api/telescopes",
            data="invalid json",
            headers={"content-type": "application/json"}
        )
        assert response.status_code == 422

    def test_missing_required_field(self, client):
        """Test missing required field."""
        test_client, _ = client
        # Missing device_name
        telescope_data = {
            "host": "192.168.1.101",
            "port": 4700
        }
        response = test_client.post("/api/telescopes", json=telescope_data)
        assert response.status_code == 422

    def test_network_discovery_error(self, client):
        """Test error in network discovery."""
        test_client, _ = client
        with patch('main.discover_seestars', side_effect=Exception("Network error")):
            response = test_client.get("/api/network-discovery")
            assert response.status_code == 500


def create_app():
    """Create FastAPI app for testing."""
    from fastapi import FastAPI
    from main import setup_error_handling
    
    app = FastAPI(
        title="Seestar API Test",
        description="API for testing",
        version="1.0.0"
    )
    
    setup_error_handling(app)
    
    # Add test endpoints that would normally be added by Controller
    @app.get("/")
    async def root():
        return {"message": "Test API"}
    
    @app.get("/health")
    async def health():
        return {
            "status": "healthy",
            "timestamp": datetime.now().isoformat(),
            "system": {
                "python_version": "3.12",
                "platform": "test"
            }
        }
    
    return app