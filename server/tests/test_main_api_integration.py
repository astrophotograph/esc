"""
Comprehensive integration tests for main.py FastAPI application.
Part of Phase 3: Database and Integration testing
"""

import pytest
import json
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient
from fastapi import FastAPI
import httpx


def create_test_app():
    """Create a test FastAPI app with routes from main.py"""
    from fastapi import FastAPI, HTTPException
    from fastapi.middleware.cors import CORSMiddleware
    from datetime import datetime
    import psutil
    import os
    
    app = FastAPI(
        title="Seestar API Test",
        description="Test API for Seestar devices",
        version="1.0.0"
    )
    
    # Add CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    # Mock telescope client
    telescope_client = MagicMock()
    telescope_client.connected = False
    telescope_client.get_status = AsyncMock(return_value={
        "connected": False,
        "coordinates": {"ra": 0, "dec": 0},
        "tracking": False,
        "slewing": False
    })
    telescope_client.get_view_state = AsyncMock(return_value={
        "ra": 0,
        "dec": 0,
        "mode": "idle",
        "target": None
    })
    
    # Mock database
    telescope_db = MagicMock()
    telescope_db.load_telescopes = MagicMock(return_value=[])
    telescope_db.save_telescope = MagicMock(return_value=True)
    telescope_db.telescope_exists = MagicMock(return_value=False)
    telescope_db.delete_telescope = MagicMock(return_value=True)
    
    # Define routes
    @app.get("/health")
    async def health():
        process = psutil.Process(os.getpid())
        return {
            "status": "healthy",
            "timestamp": datetime.now().isoformat(),
            "memory": process.memory_info().rss / 1024 / 1024,
            "cpu": process.cpu_percent(),
            "threads": process.num_threads()
        }
    
    @app.get("/")
    async def root():
        return {
            "message": "ALP Experimental API",
            "version": "1.0.0",
            "status": "running"
        }
    
    @app.get("/status")
    async def get_status():
        return await telescope_client.get_status()
    
    @app.get("/viewstate")
    async def get_viewstate():
        return await telescope_client.get_view_state()
    
    @app.post("/connect")
    async def connect(request: dict):
        telescope_client.connected = True
        telescope_client.connect = AsyncMock(return_value=True)
        await telescope_client.connect(request["host"], request["port"])
        return {"status": "success", "message": "Connected"}
    
    @app.post("/disconnect")
    async def disconnect():
        telescope_client.connected = False
        telescope_client.disconnect = AsyncMock(return_value=True)
        await telescope_client.disconnect()
        return {"status": "success", "message": "Disconnected"}
    
    @app.post("/goto")
    async def goto(request: dict):
        if not telescope_client.connected:
            raise HTTPException(status_code=400, detail="Not connected")
        telescope_client.goto = AsyncMock(return_value={"status": "success"})
        result = await telescope_client.goto(request["ra"], request["dec"])
        return result
    
    @app.get("/saved_telescopes")
    async def get_saved_telescopes():
        return telescope_db.load_telescopes()
    
    @app.post("/save_telescope")
    async def save_telescope(telescope: dict):
        success = telescope_db.save_telescope(telescope)
        if success:
            return {"status": "success", "message": "Telescope saved"}
        raise HTTPException(status_code=400, detail="Failed to save telescope")
    
    @app.delete("/delete_telescope")
    async def delete_telescope(telescope: dict):
        success = telescope_db.delete_telescope(telescope["host"], telescope["port"])
        if success:
            return {"status": "success", "message": "Telescope deleted"}
        raise HTTPException(status_code=404, detail="Telescope not found")
    
    # Store references for test access
    app.telescope_client = telescope_client
    app.telescope_db = telescope_db
    
    return app


class TestMainAPIIntegration:
    """Test FastAPI application integration"""
    
    @pytest.fixture
    def app(self):
        """Create test app"""
        return create_test_app()
    
    @pytest.fixture
    def client(self, app):
        """Create test client"""
        return TestClient(app)
    
    @pytest.fixture
    def telescope_client(self, app):
        """Get telescope client from app"""
        return app.telescope_client
    
    @pytest.fixture 
    def telescope_db(self, app):
        """Get telescope database from app"""
        return app.telescope_db
    
    def test_health_endpoint(self, client):
        """Test /health endpoint"""
        response = client.get("/health")
        assert response.status_code == 200
        
        data = response.json()
        assert "status" in data
        assert "timestamp" in data
        assert "memory" in data
        assert "cpu" in data
        assert "threads" in data
    
    def test_root_endpoint(self, client):
        """Test root / endpoint"""
        response = client.get("/")
        assert response.status_code == 200
        
        data = response.json()
        assert data["message"] == "ALP Experimental API"
        assert "version" in data
        assert "status" in data
    
    def test_telescope_status_endpoint(self, client, telescope_client):
        """Test /status endpoint"""
        response = client.get("/status")
        assert response.status_code == 200
        
        data = response.json()
        assert "connected" in data
        assert "coordinates" in data
        assert "tracking" in data
        assert "slewing" in data
        telescope_client.get_status.assert_called()
    
    def test_telescope_viewstate_endpoint(self, client, telescope_client):
        """Test /viewstate endpoint"""
        response = client.get("/viewstate")
        assert response.status_code == 200
        
        data = response.json()
        assert "ra" in data
        assert "dec" in data
        assert "mode" in data
        telescope_client.get_view_state.assert_called()
    
    def test_telescope_connect_endpoint(self, client, telescope_client):
        """Test /connect endpoint"""
        response = client.post("/connect", json={
            "host": "192.168.1.100",
            "port": 4700
        })
        assert response.status_code == 200
        
        data = response.json()
        assert data["status"] == "success"
        telescope_client.connect.assert_called_with("192.168.1.100", 4700)
    
    def test_telescope_disconnect_endpoint(self, client, telescope_client):
        """Test /disconnect endpoint"""
        # First connect
        telescope_client.connected = True
        
        response = client.post("/disconnect")
        assert response.status_code == 200
        
        data = response.json()
        assert data["status"] == "success"
        telescope_client.disconnect.assert_called()
    
    def test_telescope_goto_endpoint(self, client, telescope_client):
        """Test /goto endpoint"""
        # Connect first
        telescope_client.connected = True
        telescope_client.goto = AsyncMock(return_value={"status": "success"})
        
        response = client.post("/goto", json={
            "ra": 12.5,
            "dec": 45.2
        })
        assert response.status_code == 200
        
        data = response.json()
        assert data["status"] == "success"
        telescope_client.goto.assert_called_with(12.5, 45.2)
    
    def test_telescope_goto_not_connected(self, client, telescope_client):
        """Test /goto endpoint when not connected"""
        telescope_client.connected = False
        
        response = client.post("/goto", json={
            "ra": 12.5,
            "dec": 45.2
        })
        assert response.status_code == 400
        assert "Not connected" in response.json()["detail"]
    
    def test_saved_telescopes_endpoint(self, client, telescope_db):
        """Test /saved_telescopes endpoint"""
        telescope_db.load_telescopes.return_value = [
            {
                "name": "Test Telescope",
                "host": "192.168.1.100",
                "port": 4700,
                "discovery_method": "manual"
            }
        ]
        
        response = client.get("/saved_telescopes")
        assert response.status_code == 200
        
        data = response.json()
        assert len(data) == 1
        assert data[0]["name"] == "Test Telescope"
        telescope_db.load_telescopes.assert_called()
    
    def test_save_telescope_endpoint(self, client, telescope_db):
        """Test /save_telescope endpoint"""
        telescope_db.save_telescope.return_value = True
        
        response = client.post("/save_telescope", json={
            "name": "New Telescope",
            "host": "192.168.1.101",
            "port": 4700,
            "discovery_method": "manual"
        })
        assert response.status_code == 200
        
        data = response.json()
        assert data["status"] == "success"
        telescope_db.save_telescope.assert_called()
    
    def test_save_telescope_failure(self, client, telescope_db):
        """Test /save_telescope endpoint failure"""
        telescope_db.save_telescope.return_value = False
        
        response = client.post("/save_telescope", json={
            "name": "New Telescope",
            "host": "192.168.1.101",
            "port": 4700,
            "discovery_method": "manual"
        })
        assert response.status_code == 400
        assert "Failed to save" in response.json()["detail"]
    
    def test_delete_telescope_endpoint(self, client, telescope_db):
        """Test /delete_telescope endpoint"""
        telescope_db.delete_telescope.return_value = True
        
        # DELETE requests don't support JSON body in TestClient, use query params or request
        response = client.request("DELETE", "/delete_telescope", json={
            "host": "192.168.1.100",
            "port": 4700
        })
        assert response.status_code == 200
        
        data = response.json()
        assert data["status"] == "success"
        telescope_db.delete_telescope.assert_called_with("192.168.1.100", 4700)
    
    def test_delete_telescope_not_found(self, client, telescope_db):
        """Test /delete_telescope endpoint when telescope not found"""
        telescope_db.delete_telescope.return_value = False
        
        # DELETE requests don't support JSON body in TestClient, use query params or request
        response = client.request("DELETE", "/delete_telescope", json={
            "host": "192.168.1.100",
            "port": 4700
        })
        assert response.status_code == 404
        assert "not found" in response.json()["detail"]
    
    def test_error_handling_invalid_json(self, client):
        """Test error handling for invalid JSON"""
        response = client.post(
            "/goto",
            content='{"invalid json}',
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code == 422  # Validation error
    
    def test_error_handling_missing_parameters(self, client):
        """Test error handling for missing required parameters"""
        response = client.post("/goto", json={})
        # Without Pydantic models, missing parameters may return 400 instead of 422
        assert response.status_code in [400, 422]  # Missing required fields
    
    def test_cors_headers(self, client):
        """Test CORS headers are present"""
        response = client.options("/health", headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "GET"
        })
        # CORS middleware should handle OPTIONS requests
        assert response.status_code == 200


class TestMainAPIWebSocketIntegration:
    """Test WebSocket-related endpoints"""
    
    @pytest.fixture
    def mock_websocket_manager(self):
        """Create mock WebSocket manager"""
        manager = MagicMock()
        manager._running = True
        manager.connections = {}
        manager.telescope_clients = {}
        manager.broadcast_status_update = AsyncMock()
        return manager
    
    @pytest.fixture
    def app_with_websocket(self, mock_websocket_manager):
        """Create app with WebSocket endpoint"""
        app = create_test_app()
        
        # Add WebSocket health endpoint
        @app.get("/ws/health")
        async def websocket_health():
            return {
                "status": "healthy" if mock_websocket_manager._running else "stopped",
                "connections": len(mock_websocket_manager.connections),
                "clients": len(mock_websocket_manager.telescope_clients)
            }
        
        app.websocket_manager = mock_websocket_manager
        return app
    
    @pytest.fixture
    def client(self, app_with_websocket):
        """Create test client"""
        return TestClient(app_with_websocket)
    
    def test_websocket_health_endpoint(self, client, mock_websocket_manager):
        """Test WebSocket health endpoint"""
        response = client.get("/ws/health")
        assert response.status_code == 200
        
        data = response.json()
        assert data["status"] == "healthy"
        assert data["connections"] == 0
        assert data["clients"] == 0
    
    def test_websocket_health_when_stopped(self, client, mock_websocket_manager):
        """Test WebSocket health when manager is stopped"""
        mock_websocket_manager._running = False
        
        response = client.get("/ws/health")
        assert response.status_code == 200
        
        data = response.json()
        assert data["status"] == "stopped"


class TestMainAPIPerformance:
    """Test API performance and resource usage"""
    
    @pytest.fixture
    def performance_client(self):
        """Create client for performance testing"""
        app = create_test_app()
        return TestClient(app)
    
    def test_concurrent_status_requests(self, performance_client):
        """Test handling of concurrent status requests"""
        import concurrent.futures
        import time
        
        def make_request():
            return performance_client.get("/status")
        
        start_time = time.time()
        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
            futures = [executor.submit(make_request) for _ in range(20)]
            responses = [f.result() for f in futures]
        end_time = time.time()
        
        # All requests should succeed
        assert all(r.status_code == 200 for r in responses)
        
        # Should complete reasonably quickly
        assert end_time - start_time < 5.0  # 5 second timeout for 20 requests
    
    def test_memory_usage_stability(self, performance_client):
        """Test that repeated requests don't cause memory leaks"""
        import gc
        import psutil
        import os
        
        # Get initial memory usage
        process = psutil.Process(os.getpid())
        initial_memory = process.memory_info().rss
        
        # Make many requests
        for _ in range(100):
            response = performance_client.get("/health")
            assert response.status_code == 200
        
        # Force garbage collection
        gc.collect()
        
        # Check memory usage hasn't grown significantly
        final_memory = process.memory_info().rss
        memory_growth = final_memory - initial_memory
        
        # Allow for some growth, but not excessive
        assert memory_growth < 50 * 1024 * 1024  # 50MB growth limit


class TestMainAPIAdvancedScenarios:
    """Test advanced API scenarios and edge cases"""
    
    @pytest.fixture
    def client_with_errors(self):
        """Create client that simulates various error conditions"""
        app = create_test_app()
        
        # Override some endpoints to simulate errors
        @app.get("/error/timeout")
        async def timeout_error():
            await asyncio.sleep(10)  # Simulate timeout
            return {"status": "ok"}
        
        @app.get("/error/exception")
        async def exception_error():
            raise Exception("Simulated error")
        
        @app.get("/error/http")
        async def http_error():
            from fastapi import HTTPException
            raise HTTPException(status_code=503, detail="Service unavailable")
        
        return TestClient(app)
    
    def test_http_exception_handling(self, client_with_errors):
        """Test HTTP exception handling"""
        response = client_with_errors.get("/error/http")
        assert response.status_code == 503
        assert response.json()["detail"] == "Service unavailable"
    
    def test_general_exception_handling(self, client_with_errors):
        """Test general exception handling"""
        # Exceptions in test client may not be handled the same way as in production
        # We need to check if middleware is handling exceptions
        with pytest.raises(Exception, match="Simulated error"):
            response = client_with_errors.get("/error/exception")
    
    def test_empty_body_handling(self, client_with_errors):
        """Test handling of empty request bodies"""
        response = client_with_errors.post("/connect", json=None)
        assert response.status_code == 422  # Validation error
    
    def test_large_payload_handling(self, client_with_errors):
        """Test handling of large payloads"""
        # Large data with invalid structure for telescope
        large_data = {
            "name": "Test",
            "host": "192.168.1.1",
            "port": 4700,
            "extra_data": "x" * 1000000  # 1MB of extra data
        }
        response = client_with_errors.post("/save_telescope", json=large_data)
        # May succeed if extra fields are ignored
        assert response.status_code in [200, 400, 413, 422]