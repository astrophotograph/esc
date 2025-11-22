"""
Comprehensive tests for main.py FastAPI application endpoints.
Part of Phase 1: Critical Path Testing
"""

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch, mock_open
from datetime import datetime

import pytest
from fastapi.testclient import TestClient
from httpx import AsyncClient
from fastapi import FastAPI

# Import the functions we need to test
import main


class TestHealthEndpoint:
    """Test the /health endpoint"""
    
    def test_health_endpoint_basic(self):
        """Test basic health check returns 200"""
        with TestClient(app) as client:
            response = client.get("/health")
            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "healthy"
            assert "system" in data
            assert "timestamp" in data
    
    def test_health_endpoint_with_telescope_connected(self):
        """Test health check with telescope connected"""
        with patch.object(controller, 'telescopes', {'test': MagicMock(is_connected=True)}):
            with TestClient(app) as client:
                response = client.get("/health")
                assert response.status_code == 200
                data = response.json()
                assert data["telescope_connected"] is True
                assert data["connected_telescopes"] == 1
    
    def test_health_endpoint_system_metrics(self):
        """Test health check includes system metrics"""
        with TestClient(app) as client:
            response = client.get("/health")
            data = response.json()
            
            # Check system metrics
            assert "cpu_percent" in data["system"]
            assert "memory_percent" in data["system"]
            assert "memory_used_mb" in data["system"]
            assert "memory_available_mb" in data["system"]
            assert "thread_count" in data["system"]
            assert "network_simulation" in data["system"]


class TestTelescopeEndpoints:
    """Test telescope-related endpoints"""
    
    def test_get_telescopes_empty(self):
        """Test getting telescopes when none are connected"""
        with patch.object(controller, 'telescopes', {}):
            with TestClient(app) as client:
                response = client.get("/telescopes")
                assert response.status_code == 200
                assert response.json() == []
    
    def test_get_telescopes_with_data(self):
        """Test getting telescopes with connected devices"""
        mock_telescope = MagicMock()
        mock_telescope.is_connected = True
        mock_telescope.device_name = "Seestar S50"
        mock_telescope.ssid = "SEESTAR_12345"
        
        with patch.object(controller, 'telescopes', {'test_id': mock_telescope}):
            with TestClient(app) as client:
                response = client.get("/telescopes")
                assert response.status_code == 200
                data = response.json()
                assert len(data) == 1
                assert data[0]["id"] == "test_id"
                assert data[0]["name"] == "Seestar S50"
                assert data[0]["status"] == "connected"
    
    @pytest.mark.asyncio
    async def test_connect_telescope_success(self):
        """Test successful telescope connection"""
        mock_telescope = AsyncMock()
        mock_telescope.connect = AsyncMock(return_value=True)
        
        with patch.object(controller, 'telescopes', {'test_id': mock_telescope}):
            async with AsyncClient(app=app, base_url="http://test") as ac:
                response = await ac.post("/telescope/test_id/connect")
                assert response.status_code == 200
                assert response.json() == {"status": "connected", "telescope_id": "test_id"}
                mock_telescope.connect.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_disconnect_telescope_success(self):
        """Test successful telescope disconnection"""
        mock_telescope = AsyncMock()
        mock_telescope.disconnect = AsyncMock()
        
        with patch.object(controller, 'telescopes', {'test_id': mock_telescope}):
            async with AsyncClient(app=app, base_url="http://test") as ac:
                response = await ac.post("/telescope/test_id/disconnect")
                assert response.status_code == 200
                assert response.json() == {"status": "disconnected", "telescope_id": "test_id"}
                mock_telescope.disconnect.assert_called_once()


class TestImagingEndpoints:
    """Test imaging-related endpoints"""
    
    @pytest.mark.asyncio
    async def test_start_imaging_success(self):
        """Test starting imaging session"""
        mock_telescope = AsyncMock()
        mock_telescope.start_imaging = AsyncMock(return_value={"status": "started"})
        
        with patch.object(controller, 'telescopes', {'test_id': mock_telescope}):
            async with AsyncClient(app=app, base_url="http://test") as ac:
                response = await ac.post("/telescope/test_id/imaging/start", 
                                       json={"exposure": 10, "gain": 100})
                assert response.status_code == 200
                assert response.json()["status"] == "started"
    
    @pytest.mark.asyncio
    async def test_stop_imaging_success(self):
        """Test stopping imaging session"""
        mock_telescope = AsyncMock()
        mock_telescope.stop_imaging = AsyncMock(return_value={"status": "stopped"})
        
        with patch.object(controller, 'telescopes', {'test_id': mock_telescope}):
            async with AsyncClient(app=app, base_url="http://test") as ac:
                response = await ac.post("/telescope/test_id/imaging/stop")
                assert response.status_code == 200
                assert response.json()["status"] == "stopped"
    
    @pytest.mark.asyncio
    async def test_capture_image_success(self):
        """Test capturing a single image"""
        mock_telescope = AsyncMock()
        mock_telescope.capture_image = AsyncMock(return_value={"image_id": "12345", "status": "captured"})
        
        with patch.object(controller, 'telescopes', {'test_id': mock_telescope}):
            async with AsyncClient(app=app, base_url="http://test") as ac:
                response = await ac.post("/telescope/test_id/capture")
                assert response.status_code == 200
                data = response.json()
                assert data["status"] == "captured"
                assert data["image_id"] == "12345"


class TestGotoEndpoints:
    """Test goto/movement endpoints"""
    
    @pytest.mark.asyncio
    async def test_goto_coordinates_success(self):
        """Test goto with coordinates"""
        mock_telescope = AsyncMock()
        mock_telescope.goto = AsyncMock(return_value={"status": "moving", "target_ra": 10.5, "target_dec": 41.2})
        
        with patch.object(controller, 'telescopes', {'test_id': mock_telescope}):
            async with AsyncClient(app=app, base_url="http://test") as ac:
                response = await ac.post("/telescope/test_id/goto", 
                                       json={"ra": 10.5, "dec": 41.2})
                assert response.status_code == 200
                data = response.json()
                assert data["status"] == "moving"
                assert data["target_ra"] == 10.5
                assert data["target_dec"] == 41.2
    
    @pytest.mark.asyncio
    async def test_goto_object_success(self):
        """Test goto with object name"""
        mock_telescope = AsyncMock()
        mock_telescope.goto_object = AsyncMock(return_value={"status": "moving", "object": "M31"})
        
        with patch.object(controller, 'telescopes', {'test_id': mock_telescope}):
            async with AsyncClient(app=app, base_url="http://test") as ac:
                response = await ac.post("/telescope/test_id/goto", 
                                       json={"object": "M31"})
                assert response.status_code == 200
                data = response.json()
                assert data["status"] == "moving"
                assert data["object"] == "M31"
    
    @pytest.mark.asyncio
    async def test_stop_goto_success(self):
        """Test stopping goto operation"""
        mock_telescope = AsyncMock()
        mock_telescope.stop_goto = AsyncMock(return_value={"status": "stopped"})
        
        with patch.object(controller, 'telescopes', {'test_id': mock_telescope}):
            async with AsyncClient(app=app, base_url="http://test") as ac:
                response = await ac.post("/telescope/test_id/goto/stop")
                assert response.status_code == 200
                assert response.json()["status"] == "stopped"


class TestStatusEndpoints:
    """Test status and streaming endpoints"""
    
    @pytest.mark.asyncio
    async def test_get_status_success(self):
        """Test getting telescope status"""
        mock_telescope = AsyncMock()
        mock_telescope.get_status = AsyncMock(return_value={
            "connected": True,
            "ra": 10.5,
            "dec": 41.2,
            "tracking": True,
            "temperature": 20.5
        })
        
        with patch.object(controller, 'telescopes', {'test_id': mock_telescope}):
            async with AsyncClient(app=app, base_url="http://test") as ac:
                response = await ac.get("/telescope/test_id/status")
                assert response.status_code == 200
                data = response.json()
                assert data["connected"] is True
                assert data["ra"] == 10.5
                assert data["dec"] == 41.2
    
    def test_status_stream_endpoint(self):
        """Test SSE status stream endpoint exists"""
        with TestClient(app) as client:
            # Just test that the endpoint exists and returns SSE headers
            with patch.object(controller, 'telescopes', {'test_id': MagicMock()}):
                response = client.get("/telescope/test_id/status/stream", 
                                    headers={"Accept": "text/event-stream"},
                                    stream=True)
                assert response.status_code == 200
                assert response.headers["content-type"] == "text/event-stream"
                response.close()


class TestSettingsEndpoints:
    """Test settings management endpoints"""
    
    @pytest.mark.asyncio
    async def test_get_settings_success(self):
        """Test getting telescope settings"""
        mock_telescope = AsyncMock()
        mock_telescope.get_settings = AsyncMock(return_value={
            "gain": 100,
            "exposure": 10,
            "binning": 1
        })
        
        with patch.object(controller, 'telescopes', {'test_id': mock_telescope}):
            async with AsyncClient(app=app, base_url="http://test") as ac:
                response = await ac.get("/telescope/test_id/settings")
                assert response.status_code == 200
                data = response.json()
                assert data["gain"] == 100
                assert data["exposure"] == 10
    
    @pytest.mark.asyncio
    async def test_update_settings_success(self):
        """Test updating telescope settings"""
        mock_telescope = AsyncMock()
        mock_telescope.update_settings = AsyncMock(return_value={"status": "updated"})
        
        with patch.object(controller, 'telescopes', {'test_id': mock_telescope}):
            async with AsyncClient(app=app, base_url="http://test") as ac:
                response = await ac.put("/telescope/test_id/settings", 
                                      json={"gain": 150, "exposure": 20})
                assert response.status_code == 200
                assert response.json()["status"] == "updated"


class TestErrorHandling:
    """Test error handling across endpoints"""
    
    def test_telescope_not_found(self):
        """Test 404 when telescope not found"""
        with patch.object(controller, 'telescopes', {}):
            with TestClient(app) as client:
                response = client.get("/telescope/invalid_id/status")
                assert response.status_code == 404
                assert "not found" in response.json()["detail"].lower()
    
    @pytest.mark.asyncio
    async def test_telescope_connection_error(self):
        """Test handling connection errors"""
        mock_telescope = AsyncMock()
        mock_telescope.connect = AsyncMock(side_effect=Exception("Connection failed"))
        
        with patch.object(controller, 'telescopes', {'test_id': mock_telescope}):
            async with AsyncClient(app=app, base_url="http://test") as ac:
                response = await ac.post("/telescope/test_id/connect")
                assert response.status_code == 500
    
    @pytest.mark.asyncio
    async def test_invalid_goto_parameters(self):
        """Test validation of goto parameters"""
        with patch.object(controller, 'telescopes', {'test_id': AsyncMock()}):
            async with AsyncClient(app=app, base_url="http://test") as ac:
                # Missing both ra/dec and object
                response = await ac.post("/telescope/test_id/goto", json={})
                assert response.status_code == 422


class TestNetworkSimulation:
    """Test network simulation endpoints"""
    
    def test_get_network_simulation_status(self):
        """Test getting network simulation status"""
        with TestClient(app) as client:
            response = client.get("/api/network-simulation/status")
            assert response.status_code == 200
            data = response.json()
            assert "enabled" in data
            assert "config" in data
    
    def test_set_network_simulation_preset(self):
        """Test setting network simulation preset"""
        with TestClient(app) as client:
            response = client.post("/api/network-simulation/preset/slow_3g")
            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "Network simulation updated"
            assert data["preset"] == "slow_3g"
    
    def test_disable_network_simulation(self):
        """Test disabling network simulation"""
        with TestClient(app) as client:
            response = client.post("/api/network-simulation/disable")
            assert response.status_code == 200
            assert response.json()["status"] == "Network simulation disabled"


class TestFileServing:
    """Test static file serving endpoints"""
    
    def test_processed_files_endpoint(self):
        """Test processed files are served"""
        test_content = b"test image content"
        with patch("builtins.open", mock_open(read_data=test_content)):
            with patch("os.path.exists", return_value=True):
                with TestClient(app) as client:
                    response = client.get("/processed/test.png")
                    assert response.status_code == 200
                    assert response.content == test_content
    
    def test_uploads_files_endpoint(self):
        """Test uploaded files are served"""
        test_content = b"test FITS content"
        with patch("builtins.open", mock_open(read_data=test_content)):
            with patch("os.path.exists", return_value=True):
                with TestClient(app) as client:
                    response = client.get("/uploads/test.fit")
                    assert response.status_code == 200
                    assert response.content == test_content


class TestStartupAndShutdown:
    """Test application lifecycle events"""
    
    @pytest.mark.asyncio
    async def test_startup_event(self):
        """Test startup event handler"""
        with patch.object(controller, 'load_saved_telescopes', new_callable=AsyncMock) as mock_load:
            with patch.object(controller, 'load_saved_remote_controllers', new_callable=AsyncMock) as mock_remote:
                with patch.object(controller, 'connect_all_telescopes', new_callable=AsyncMock) as mock_connect:
                    # Simulate startup
                    async with AsyncClient(app=app, base_url="http://test") as ac:
                        # Startup happens automatically with AsyncClient
                        pass
                    
                    # Verify startup methods were called
                    mock_load.assert_called_once()
                    mock_remote.assert_called_once()
                    mock_connect.assert_called_once()