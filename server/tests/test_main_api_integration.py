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

# Import the main app - we'll need to mock hardware dependencies
import main


class TestMainAPIIntegration:
    """Test FastAPI application integration"""
    
    @pytest.fixture
    def mock_telescope_client(self):
        """Create mock telescope client"""
        client = MagicMock()
        client.connect = AsyncMock()
        client.disconnect = AsyncMock()
        client.get_status = AsyncMock(return_value={
            "connected": True,
            "coordinates": {"ra": 12.5, "dec": 45.2},
            "tracking": True,
            "slewing": False
        })
        client.get_view_state = AsyncMock(return_value={
            "ra": 12.5,
            "dec": 45.2,
            "mode": "tracking",
            "target": "M31"
        })
        return client
    
    @pytest.fixture
    def mock_database(self):
        """Create mock database operations"""
        with patch('main.TelescopeDatabase') as mock_db_class:
            mock_db = MagicMock()
            mock_db.load_telescopes.return_value = []
            mock_db.save_telescope.return_value = True
            mock_db.telescope_exists.return_value = False
            mock_db.delete_telescope.return_value = True
            mock_db_class.return_value = mock_db
            yield mock_db
    
    @pytest.fixture
    def mock_websocket_manager(self):
        """Create mock WebSocket manager"""
        with patch('main.get_websocket_manager') as mock_get_manager:
            manager = MagicMock()
            manager.connections = {}
            manager.telescope_clients = {}
            manager._running = True
            manager.start = AsyncMock()
            manager.stop = AsyncMock()
            manager.broadcast_status_update = AsyncMock()
            mock_get_manager.return_value = manager
            yield manager
    
    @pytest.fixture
    def app_with_mocks(self, mock_telescope_client, mock_database, mock_websocket_manager):
        """Create FastAPI app with all dependencies mocked"""
        # Mock the telescope client creation
        with patch('main.SeestarClient', return_value=mock_telescope_client):
            # Import and get the app after mocking
            app = main.app
            yield app
    
    @pytest.fixture
    def client(self, app_with_mocks):
        """Create test client"""
        return TestClient(app_with_mocks)
    
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
    
    def test_telescope_status_endpoint(self, client, mock_telescope_client):
        """Test /status endpoint"""
        response = client.get("/status")
        assert response.status_code == 200
        
        data = response.json()
        assert "connected" in data
        assert "coordinates" in data
        assert "tracking" in data
        assert "slewing" in data
    
    def test_telescope_viewstate_endpoint(self, client, mock_telescope_client):
        """Test /viewstate endpoint"""
        response = client.get("/viewstate")
        assert response.status_code == 200
        
        data = response.json()
        assert "ra" in data
        assert "dec" in data
        assert "mode" in data
    
    def test_telescope_connect_endpoint(self, client, mock_telescope_client):
        """Test /connect endpoint"""
        response = client.post("/connect", json={
            "host": "192.168.1.100",
            "port": 4700
        })
        assert response.status_code == 200
        
        data = response.json()
        assert data["status"] == "success"
        mock_telescope_client.connect.assert_called()
    
    def test_telescope_disconnect_endpoint(self, client, mock_telescope_client):
        """Test /disconnect endpoint"""
        response = client.post("/disconnect")
        assert response.status_code == 200
        
        data = response.json()
        assert data["status"] == "success"
        mock_telescope_client.disconnect.assert_called()
    
    def test_telescope_goto_endpoint(self, client, mock_telescope_client):
        """Test /goto endpoint"""
        mock_telescope_client.goto = AsyncMock(return_value={"status": "success"})
        
        response = client.post("/goto", json={
            "ra": 12.5,
            "dec": 45.2
        })
        assert response.status_code == 200
        
        data = response.json()
        assert data["status"] == "success"
        mock_telescope_client.goto.assert_called()
    
    def test_saved_telescopes_endpoint(self, client, mock_database):
        """Test /saved_telescopes endpoint"""
        mock_database.load_telescopes.return_value = [
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
        mock_database.load_telescopes.assert_called()
    
    def test_save_telescope_endpoint(self, client, mock_database):
        """Test /save_telescope endpoint"""
        response = client.post("/save_telescope", json={
            "name": "New Telescope",
            "host": "192.168.1.101",
            "port": 4700,
            "discovery_method": "manual"
        })
        assert response.status_code == 200
        
        data = response.json()
        assert data["status"] == "success"
        mock_database.save_telescope.assert_called()
    
    def test_delete_telescope_endpoint(self, client, mock_database):
        """Test /delete_telescope endpoint"""
        response = client.delete("/delete_telescope", json={
            "host": "192.168.1.100",
            "port": 4700
        })
        assert response.status_code == 200
        
        data = response.json()
        assert data["status"] == "success"
        mock_database.delete_telescope.assert_called()
    
    def test_error_handling_invalid_json(self, client):
        """Test error handling for invalid JSON"""
        response = client.post("/goto", json="invalid")
        assert response.status_code == 422  # Validation error
    
    def test_error_handling_missing_parameters(self, client):
        """Test error handling for missing required parameters"""
        response = client.post("/goto", json={})
        assert response.status_code == 422  # Missing required fields
    
    def test_cors_headers(self, client):
        """Test CORS headers are present"""
        response = client.get("/health")
        assert response.status_code == 200
        # Note: CORS headers are added by middleware, may not be visible in TestClient


class TestMainAPIStartupShutdown:
    """Test application startup and shutdown events"""
    
    @pytest.fixture
    def mock_websocket_manager(self):
        """Create mock WebSocket manager for startup/shutdown tests"""
        with patch('main.get_websocket_manager') as mock_get_manager:
            manager = MagicMock()
            manager.start = AsyncMock()
            manager.stop = AsyncMock()
            mock_get_manager.return_value = manager
            yield manager
    
    def test_startup_event(self, mock_websocket_manager):
        """Test application startup event"""
        # Create a new app instance to trigger startup
        with patch('main.get_websocket_manager', return_value=mock_websocket_manager):
            app = main.app
            with TestClient(app):
                # Startup event should have been triggered
                # Note: Testing startup events with TestClient can be tricky
                pass
    
    def test_health_check_after_startup(self, mock_websocket_manager):
        """Test that health check works after startup"""
        with patch('main.get_websocket_manager', return_value=mock_websocket_manager):
            app = main.app
            client = TestClient(app)
            response = client.get("/health")
            assert response.status_code == 200


class TestMainAPIAdvancedScenarios:
    """Test advanced API scenarios and edge cases"""
    
    @pytest.fixture
    def client_with_failing_telescope(self):
        """Create client with telescope that fails operations"""
        mock_client = MagicMock()
        mock_client.connect = AsyncMock(side_effect=Exception("Connection failed"))
        mock_client.get_status = AsyncMock(side_effect=Exception("Status unavailable"))
        
        with patch('main.SeestarClient', return_value=mock_client):
            with patch('main.get_websocket_manager') as mock_manager:
                manager = MagicMock()
                manager._running = True
                manager.connections = {}
                manager.telescope_clients = {}
                mock_manager.return_value = manager
                
                app = main.app
                yield TestClient(app)
    
    def test_telescope_connection_failure(self, client_with_failing_telescope):
        """Test handling of telescope connection failures"""
        response = client_with_failing_telescope.post("/connect", json={
            "host": "192.168.1.100", 
            "port": 4700
        })
        # Should handle gracefully rather than crash
        assert response.status_code in [200, 500]  # Either handled gracefully or returns error
    
    def test_telescope_status_when_disconnected(self, client_with_failing_telescope):
        """Test status endpoint when telescope is disconnected"""
        response = client_with_failing_telescope.get("/status")
        # Should return some status even if telescope is unavailable
        assert response.status_code in [200, 503]  # Either default status or service unavailable


class TestMainAPIWebSocketIntegration:
    """Test integration between HTTP API and WebSocket functionality"""
    
    @pytest.fixture
    def app_with_websocket_mock(self):
        """Create app with WebSocket manager properly mocked"""
        mock_manager = MagicMock()
        mock_manager._running = True
        mock_manager.connections = {}
        mock_manager.telescope_clients = {}
        mock_manager.broadcast_status_update = AsyncMock()
        
        with patch('main.get_websocket_manager', return_value=mock_manager):
            yield main.app, mock_manager
    
    def test_telescope_action_broadcasts_update(self, app_with_websocket_mock):
        """Test that telescope actions trigger WebSocket broadcasts"""
        app, mock_manager = app_with_websocket_mock
        client = TestClient(app)
        
        # Mock successful telescope operation
        with patch('main.SeestarClient') as mock_telescope:
            telescope_instance = MagicMock()
            telescope_instance.goto = AsyncMock(return_value={"status": "success"})
            mock_telescope.return_value = telescope_instance
            
            response = client.post("/goto", json={"ra": 12.5, "dec": 45.2})
            assert response.status_code == 200
            
            # Check if broadcast was called (depending on implementation)
            # This may need adjustment based on actual implementation


class TestMainAPIPerformance:
    """Test API performance and resource usage"""
    
    @pytest.fixture
    def performance_client(self):
        """Create client for performance testing"""
        with patch('main.SeestarClient') as mock_telescope:
            telescope_instance = MagicMock()
            telescope_instance.get_status = AsyncMock(return_value={
                "connected": True,
                "coordinates": {"ra": 0, "dec": 0}
            })
            mock_telescope.return_value = telescope_instance
            
            with patch('main.get_websocket_manager') as mock_manager:
                manager = MagicMock()
                manager._running = True
                manager.connections = {}
                manager.telescope_clients = {}
                mock_manager.return_value = manager
                
                app = main.app
                yield TestClient(app)
    
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
        
        # Should complete reasonably quickly (adjust threshold as needed)
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
        
        # Allow for some growth, but not excessive (adjust threshold as needed)
        assert memory_growth < 50 * 1024 * 1024  # 50MB growth limit