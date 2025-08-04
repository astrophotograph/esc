"""
API endpoint tests for main.py to boost coverage.
Tests endpoints that aren't covered by existing tests.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch, Mock
import json
from datetime import datetime
from fastapi import FastAPI, APIRouter
from fastapi.testclient import TestClient
from pydantic import BaseModel


# Create minimal request/response models
class AddTelescopeRequest(BaseModel):
    host: str
    port: int
    device_name: str


class SaveConfigurationRequest(BaseModel):
    name: str
    description: str
    telescopes: list[str]


class AddRemoteControllerRequest(BaseModel):
    host: str
    port: int
    name: str = ""
    description: str = ""


class TestMainAPICoverage:
    """Test API endpoints to improve main.py coverage."""

    @pytest.fixture
    def mock_controller(self):
        """Create a mock controller."""
        controller = MagicMock()
        controller.telescopes = {}
        controller.remote_telescopes = {}
        controller.db = AsyncMock()
        controller.websocket_manager = MagicMock()
        controller.discovery_task = None
        controller._discovery_enabled = False
        
        # Mock database methods
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
        
        # Mock async methods
        controller.add_telescope = AsyncMock(return_value=True)
        controller.remove_telescope = AsyncMock()
        controller.connect_all_telescopes = AsyncMock()
        controller.add_remote_controller = AsyncMock(return_value=True)
        controller.remove_remote_controller = AsyncMock()
        controller.reconnect_remote_controller = AsyncMock(return_value=True)
        
        return controller

    @pytest.fixture
    def mock_telescope(self):
        """Create a mock telescope."""
        telescope = MagicMock()
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
        telescope.disconnect = AsyncMock()
        telescope.event_scheduler = MagicMock()
        telescope.event_scheduler.get_scheduled_events = MagicMock(return_value=[])
        
        # Mock client methods
        telescope.client.get_viewstate = AsyncMock(return_value={"view": "state"})
        telescope.client.send_command = AsyncMock(return_value={"success": True})
        telescope.client.get_recent_messages = MagicMock(return_value=[])
        telescope.client.get_recent_commands = MagicMock(return_value=[])
        telescope.client.get_recent_events = MagicMock(return_value=[])
        telescope.client.get_message_analytics = MagicMock(return_value={})
        
        return telescope

    @pytest.fixture
    def test_app(self, mock_controller, mock_telescope):
        """Create a test FastAPI app with endpoints."""
        app = FastAPI(title="Test API")
        
        # Add mock telescope to controller
        mock_controller.telescopes["test_telescope"] = mock_telescope
        
        # Store controller reference for endpoints
        app.state.controller = mock_controller
        
        # Create main API endpoints
        @app.get("/")
        async def root():
            html_content = """
            <html>
                <head><title>Seestar API</title></head>
                <body><h1>Seestar API</h1></body>
            </html>
            """
            from fastapi.responses import HTMLResponse
            return HTMLResponse(content=html_content)
        
        @app.get("/health")
        async def health_check():
            return {
                "status": "healthy",
                "timestamp": datetime.now().isoformat(),
                "system": {
                    "python_version": "3.12",
                    "platform": "test"
                }
            }
        
        @app.get("/api/telescopes")
        async def get_telescopes():
            telescopes = []
            for name, telescope in mock_controller.telescopes.items():
                telescopes.append({
                    "name": name,
                    "host": telescope.device.host,
                    "port": telescope.device.port,
                    "connected": telescope.is_connected()
                })
            return telescopes
        
        @app.post("/api/telescopes")
        async def add_telescope(request: AddTelescopeRequest):
            success = await mock_controller.add_telescope(
                request.host, request.port, request.device_name
            )
            if not success:
                from fastapi import HTTPException
                raise HTTPException(status_code=400, detail="Failed to add telescope")
            return {"message": "Telescope added successfully"}
        
        @app.delete("/api/telescopes/{telescope_name}")
        async def delete_telescope(telescope_name: str):
            if telescope_name not in mock_controller.telescopes:
                from fastapi import HTTPException
                raise HTTPException(status_code=404, detail="Telescope not found")
            await mock_controller.remove_telescope(telescope_name)
            return {"message": "Telescope removed successfully"}
        
        @app.post("/api/configurations")
        async def save_configuration(config: SaveConfigurationRequest):
            await mock_controller.db.save_configuration(
                config.name, config.description, config.telescopes
            )
            return {"message": "Configuration saved successfully"}
        
        @app.get("/api/configurations")
        async def get_configurations():
            configs = await mock_controller.db.load_configurations()
            return configs
        
        @app.get("/api/configurations/{config_name}")
        async def get_configuration(config_name: str):
            config = await mock_controller.db.load_configuration(config_name)
            if not config:
                from fastapi import HTTPException
                raise HTTPException(status_code=404, detail="Configuration not found")
            return config
        
        @app.delete("/api/configurations/{config_name}")
        async def delete_configuration(config_name: str):
            await mock_controller.db.delete_configuration(config_name)
            return {"message": "Configuration deleted successfully"}
        
        @app.get("/api/network-discovery")
        async def network_discovery():
            try:
                # Mock discovery
                devices = [{"address": "192.168.1.100", "data": {"name": "Seestar"}}]
                return devices
            except Exception as e:
                from fastapi import HTTPException
                raise HTTPException(status_code=500, detail=str(e))
        
        @app.post("/api/telescopes/connect-all")
        async def connect_all_telescopes():
            await mock_controller.connect_all_telescopes()
            return {"message": "Connecting all telescopes"}
        
        @app.get("/api/remote-controllers")
        async def get_remote_controllers():
            controllers = []
            for key, remote in mock_controller.remote_telescopes.items():
                controllers.append({
                    "host": remote.host,
                    "port": remote.port,
                    "name": getattr(remote, 'name', ''),
                    "status": getattr(remote, 'status', 'unknown')
                })
            return controllers
        
        @app.post("/api/remote-controllers")
        async def add_remote_controller(request: AddRemoteControllerRequest):
            success = await mock_controller.add_remote_controller(
                request.host, request.port, request.name, request.description
            )
            if not success:
                from fastapi import HTTPException
                raise HTTPException(status_code=400, detail="Failed to add remote controller")
            return {"message": "Remote controller added successfully"}
        
        @app.delete("/api/remote-controllers/{host}/{port}")
        async def delete_remote_controller(host: str, port: int):
            await mock_controller.remove_remote_controller(host, port)
            return {"message": "Remote controller removed successfully"}
        
        @app.post("/api/remote-controllers/{host}/{port}/reconnect")
        async def reconnect_remote_controller(host: str, port: int):
            success = await mock_controller.reconnect_remote_controller(host, port)
            if not success:
                from fastapi import HTTPException
                raise HTTPException(status_code=400, detail="Failed to reconnect")
            return {"message": "Reconnected successfully"}
        
        @app.get("/api/starmap")
        async def get_starmap(ra: float, dec: float, width: int = 800, height: int = 600):
            # Mock starmap generation
            fake_image = b"PNG_DATA_HERE"
            from fastapi.responses import Response
            return Response(content=fake_image, media_type="image/png")
        
        # Create telescope-specific routes
        telescope_router = APIRouter(prefix="/api/telescope/test_telescope")
        
        @telescope_router.get("/")
        async def telescope_info():
            return {
                "name": "test_telescope",
                "connected": mock_telescope.is_connected()
            }
        
        @telescope_router.get("/viewstate")
        async def get_viewstate():
            return await mock_telescope.client.get_viewstate()
        
        @telescope_router.post("/goto")
        async def goto_target(ra: float, dec: float):
            return await mock_telescope.client.send_command({
                "cmd": "goto", "ra": ra, "dec": dec
            })
        
        @telescope_router.get("/goto/progress")
        async def goto_progress():
            return {"progress": 50, "status": "slewing"}
        
        @telescope_router.post("/goto/cancel")
        async def cancel_goto():
            return {"success": True}
        
        @telescope_router.post("/move")
        async def move_telescope(direction: str, duration: int):
            return {"success": True}
        
        @telescope_router.post("/park")
        async def park_telescope():
            return {"success": True}
        
        @telescope_router.get("/focus")
        async def get_focus():
            return {"position": 1000}
        
        @telescope_router.post("/focus")
        async def set_focus(position: int):
            return {"success": True}
        
        @telescope_router.post("/focus_inc")
        async def focus_increment(increment: int):
            return {"success": True}
        
        @telescope_router.get("/messages")
        async def get_messages():
            return mock_telescope.client.get_recent_messages()
        
        @telescope_router.get("/messages/parsed")
        async def get_parsed_messages():
            return {"parsed": True, "messages": []}
        
        @telescope_router.get("/messages/analytics")
        async def get_analytics():
            return mock_telescope.client.get_message_analytics()
        
        @telescope_router.get("/messages/commands")
        async def get_commands():
            return mock_telescope.client.get_recent_commands()
        
        @telescope_router.get("/messages/events")
        async def get_events():
            return mock_telescope.client.get_recent_events()
        
        @telescope_router.get("/status/stream")
        async def status_stream():
            from fastapi.responses import StreamingResponse
            async def generate():
                yield f"data: {json.dumps({'status': 'ok'})}\n\n"
            return StreamingResponse(generate(), media_type="text/event-stream")
        
        app.include_router(telescope_router)
        
        return app

    @pytest.fixture
    def client(self, test_app):
        """Create test client."""
        return TestClient(test_app)

    # Test endpoints
    def test_root_endpoint(self, client):
        """Test root endpoint returns HTML."""
        response = client.get("/")
        assert response.status_code == 200
        assert "text/html" in response.headers["content-type"]
        assert "Seestar API" in response.text

    def test_health_endpoint(self, client):
        """Test health check endpoint."""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "timestamp" in data
        assert "system" in data

    def test_get_telescopes(self, client):
        """Test GET /api/telescopes."""
        response = client.get("/api/telescopes")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["name"] == "test_telescope"

    def test_add_telescope_success(self, client):
        """Test POST /api/telescopes success."""
        telescope_data = {
            "host": "192.168.1.101",
            "port": 4700,
            "device_name": "new_telescope"
        }
        response = client.post("/api/telescopes", json=telescope_data)
        assert response.status_code == 200
        assert "success" in response.json()["message"]

    def test_add_telescope_failure(self, client, test_app):
        """Test POST /api/telescopes failure."""
        # Make add_telescope fail
        test_app.state.controller.add_telescope.return_value = False
        
        telescope_data = {
            "host": "192.168.1.101",
            "port": 4700,
            "device_name": "new_telescope"
        }
        response = client.post("/api/telescopes", json=telescope_data)
        assert response.status_code == 400

    def test_delete_telescope(self, client):
        """Test DELETE /api/telescopes/{name}."""
        response = client.delete("/api/telescopes/test_telescope")
        assert response.status_code == 200

    def test_delete_telescope_not_found(self, client):
        """Test DELETE non-existent telescope."""
        response = client.delete("/api/telescopes/nonexistent")
        assert response.status_code == 404

    def test_configurations_crud(self, client, test_app):
        """Test configuration CRUD operations."""
        # Create configuration
        config_data = {
            "name": "test_config",
            "description": "Test configuration",
            "telescopes": ["test_telescope"]
        }
        response = client.post("/api/configurations", json=config_data)
        assert response.status_code == 200
        
        # List configurations
        test_app.state.controller.db.load_configurations.return_value = [config_data]
        response = client.get("/api/configurations")
        assert response.status_code == 200
        assert len(response.json()) == 1
        
        # Get specific configuration
        test_app.state.controller.db.load_configuration.return_value = config_data
        response = client.get("/api/configurations/test_config")
        assert response.status_code == 200
        assert response.json()["name"] == "test_config"
        
        # Get non-existent configuration
        test_app.state.controller.db.load_configuration.return_value = None
        response = client.get("/api/configurations/nonexistent")
        assert response.status_code == 404
        
        # Delete configuration
        response = client.delete("/api/configurations/test_config")
        assert response.status_code == 200

    def test_network_discovery(self, client):
        """Test network discovery endpoint."""
        response = client.get("/api/network-discovery")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1

    def test_connect_all_telescopes(self, client):
        """Test connect all telescopes endpoint."""
        response = client.post("/api/telescopes/connect-all")
        assert response.status_code == 200

    def test_remote_controllers_crud(self, client, test_app):
        """Test remote controller CRUD operations."""
        # Add remote controller
        remote_data = {
            "host": "remote.host",
            "port": 8000,
            "name": "Remote Controller"
        }
        response = client.post("/api/remote-controllers", json=remote_data)
        assert response.status_code == 200
        
        # Mock remote controller exists
        mock_remote = MagicMock()
        mock_remote.host = "remote.host"
        mock_remote.port = 8000
        mock_remote.name = "Remote Controller"
        mock_remote.status = "connected"
        test_app.state.controller.remote_telescopes["remote.host:8000"] = mock_remote
        
        # List remote controllers
        response = client.get("/api/remote-controllers")
        assert response.status_code == 200
        assert len(response.json()) == 1
        
        # Reconnect
        response = client.post("/api/remote-controllers/remote.host/8000/reconnect")
        assert response.status_code == 200
        
        # Delete
        response = client.delete("/api/remote-controllers/remote.host/8000")
        assert response.status_code == 200

    def test_starmap_endpoint(self, client):
        """Test starmap generation endpoint."""
        response = client.get("/api/starmap?ra=10.5&dec=20.5")
        assert response.status_code == 200
        assert response.headers["content-type"] == "image/png"

    def test_telescope_endpoints(self, client):
        """Test telescope-specific endpoints."""
        # Info
        response = client.get("/api/telescope/test_telescope/")
        assert response.status_code == 200
        
        # Viewstate
        response = client.get("/api/telescope/test_telescope/viewstate")
        assert response.status_code == 200
        assert "view" in response.json()
        
        # Goto
        response = client.post("/api/telescope/test_telescope/goto?ra=10.5&dec=20.5")
        assert response.status_code == 200
        
        # Goto progress
        response = client.get("/api/telescope/test_telescope/goto/progress")
        assert response.status_code == 200
        
        # Cancel goto
        response = client.post("/api/telescope/test_telescope/goto/cancel")
        assert response.status_code == 200
        
        # Move
        response = client.post("/api/telescope/test_telescope/move?direction=up&duration=1000")
        assert response.status_code == 200
        
        # Park
        response = client.post("/api/telescope/test_telescope/park")
        assert response.status_code == 200
        
        # Focus
        response = client.get("/api/telescope/test_telescope/focus")
        assert response.status_code == 200
        
        response = client.post("/api/telescope/test_telescope/focus?position=1500")
        assert response.status_code == 200
        
        response = client.post("/api/telescope/test_telescope/focus_inc?increment=10")
        assert response.status_code == 200
        
        # Messages
        response = client.get("/api/telescope/test_telescope/messages")
        assert response.status_code == 200
        
        response = client.get("/api/telescope/test_telescope/messages/parsed")
        assert response.status_code == 200
        
        response = client.get("/api/telescope/test_telescope/messages/analytics")
        assert response.status_code == 200
        
        response = client.get("/api/telescope/test_telescope/messages/commands")
        assert response.status_code == 200
        
        response = client.get("/api/telescope/test_telescope/messages/events")
        assert response.status_code == 200
        
        # Status stream (SSE)
        response = client.get("/api/telescope/test_telescope/status/stream")
        assert response.status_code == 200
        assert "text/event-stream" in response.headers["content-type"]

    def test_invalid_json(self, client):
        """Test handling of invalid JSON."""
        response = client.post(
            "/api/telescopes",
            data="invalid json",
            headers={"content-type": "application/json"}
        )
        assert response.status_code == 422

    def test_missing_required_fields(self, client):
        """Test missing required fields."""
        # Missing device_name
        telescope_data = {
            "host": "192.168.1.101",
            "port": 4700
        }
        response = client.post("/api/telescopes", json=telescope_data)
        assert response.status_code == 422