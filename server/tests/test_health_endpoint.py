"""Test the enhanced health check endpoint."""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from unittest.mock import MagicMock, patch

from api.routers.system import router


@pytest.fixture
def test_app():
    """Create a test FastAPI app with system router."""
    app = FastAPI()
    app.include_router(router)
    
    # Mock controller in app state
    mock_controller = MagicMock()
    mock_controller.telescopes = {}
    mock_controller.remote_telescopes = {}
    app.state.controller = mock_controller
    
    return app


def test_basic_health_endpoint(test_app):
    """Test the basic health endpoint."""
    client = TestClient(test_app)
    response = client.get("/api/system/health")
        
    assert response.status_code == 200
    data = response.json()
    
    assert "status" in data
    assert data["status"] == "healthy"
    assert "timestamp" in data
    assert "uptime_seconds" in data
    assert data["uptime_seconds"] >= 0


def test_detailed_health_endpoint(test_app):
    """Test the detailed health endpoint."""
    client = TestClient(test_app)
    response = client.get("/api/system/health/detailed")
        
    assert response.status_code == 200
    data = response.json()
    
    # Check top-level fields
    assert data["status"] in ["healthy", "warning", "critical"]
    assert "timestamp" in data
    assert "uptime_seconds" in data
    assert data["uptime_seconds"] >= 0
    
    # Check memory info
    assert "memory" in data
    memory = data["memory"]
    assert "total" in memory
    assert "available" in memory
    assert "used" in memory
    assert "percent" in memory
    assert 0 <= memory["percent"] <= 100
    assert "process_rss" in memory
    assert "process_vms" in memory
    
    # Check CPU info
    assert "cpu" in data
    cpu = data["cpu"]
    assert "percent" in cpu
    assert "count" in cpu
    assert cpu["count"] > 0
    assert "process_percent" in cpu
    
    # Check thread info
    assert "threads" in data
    threads = data["threads"]
    assert "thread_count" in threads
    assert threads["thread_count"] > 0
    assert "active_tasks" in threads
    assert "pending_tasks" in threads
    
    # Check telescope info
    assert "telescopes" in data
    assert isinstance(data["telescopes"], list)
    
    # Check other fields
    assert "active_connections" in data
    assert "python_version" in data
    assert "platform" in data
    assert "pid" in data


def test_health_endpoint_with_telescopes(test_app):
    """Test health endpoint with mock telescopes."""
    # Add mock telescopes to controller
    mock_telescope = MagicMock()
    mock_telescope.name = "TestScope1"
    mock_telescope.serial_number = "TEST001"
    mock_telescope.host = "192.168.1.100"
    mock_telescope.port = 4700
    mock_telescope.discovery_method = "manual"
    
    # Mock client
    mock_client = MagicMock()
    mock_client.connected = True
    mock_telescope.client = mock_client
    
    test_app.state.controller.telescopes = {"TestScope1": mock_telescope}
    
    client = TestClient(test_app)
    response = client.get("/api/system/health/detailed")
        
    assert response.status_code == 200
    data = response.json()
    
    # Check telescope data
    assert len(data["telescopes"]) == 1
    telescope = data["telescopes"][0]
    assert telescope["name"] == "TestScope1"
    assert telescope["serial_number"] == "TEST001"
    assert telescope["host"] == "192.168.1.100"
    assert telescope["port"] == 4700
    assert telescope["connected"] is True
    assert telescope["discovery_method"] == "manual"
    assert telescope["is_test"] is False
    
    # Active connections should be 1
    assert data["active_connections"] == 1


def test_performance_metrics_endpoint(test_app):
    """Test the performance metrics endpoint."""
    client = TestClient(test_app)
    response = client.get("/api/system/metrics")
        
    assert response.status_code == 200
    data = response.json()
    
    # Check structure
    assert "timestamp" in data
    assert "uptime_seconds" in data
    assert "requests" in data
    assert "memory" in data
    assert "cpu" in data
    assert "connections" in data
    
    # Check requests metrics
    requests = data["requests"]
    assert "total" in requests
    assert "errors" in requests
    assert "error_rate_percent" in requests
    assert "recent_errors" in requests
    
    # Check connections
    assert "active" in data["connections"]


def test_metrics_reset_endpoint(test_app):
    """Test the metrics reset endpoint."""
    client = TestClient(test_app)
    response = client.get("/api/system/metrics/reset")
        
    assert response.status_code == 200
    data = response.json()
    
    assert data["status"] == "reset"
    assert "message" in data
    assert "timestamp" in data


if __name__ == "__main__":
    pytest.main([__file__, "-v"])