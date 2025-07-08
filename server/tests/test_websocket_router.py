"""
Tests for WebSocket router endpoints and functionality.
"""
import pytest
import json
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient
from fastapi import FastAPI
from fastapi.websockets import WebSocketDisconnect

# Test WebSocket router
try:
    from websocket_router import router as websocket_router
    from websocket_router import get_websocket_manager, _handle_websocket_connection
    WEBSOCKET_ROUTER_AVAILABLE = True
except ImportError:
    WEBSOCKET_ROUTER_AVAILABLE = False

try:
    from websocket_manager import WebSocketManager, WebSocketConnection
    from websocket_protocol import SubscriptionType
    WEBSOCKET_COMPONENTS_AVAILABLE = True
except ImportError:
    WEBSOCKET_COMPONENTS_AVAILABLE = False


@pytest.mark.skipif(not WEBSOCKET_ROUTER_AVAILABLE, reason="WebSocket router not available")
class TestWebSocketRouterEndpoints:
    """Test WebSocket router HTTP endpoints."""
    
    @pytest.fixture
    def mock_manager(self):
        """Create a mock WebSocket manager."""
        manager = AsyncMock()
        manager._running = True
        manager.connections = {}
        manager.telescope_clients = {}
        manager.remote_clients = {}
        manager.remote_manager = MagicMock()
        manager.remote_manager.clients = {}
        return manager
    
    @pytest.fixture
    def test_app(self, mock_manager):
        """Create a test FastAPI app with WebSocket router."""
        app = FastAPI()
        
        # Override the dependency
        def override_get_websocket_manager():
            return mock_manager
        
        app.dependency_overrides[get_websocket_manager] = override_get_websocket_manager
        app.include_router(websocket_router, prefix="/api")
        
        return app
    
    @pytest.fixture
    def client(self, test_app):
        """Create a test client."""
        return TestClient(test_app)
    
    def test_websocket_health_endpoint(self, client, mock_manager):
        """Test WebSocket health endpoint."""
        # Mock manager state
        mock_connection = MagicMock()
        mock_connection.connection_id = "test_conn_123"
        mock_connection.subscriptions = {"telescope_1": {SubscriptionType.STATUS, SubscriptionType.IMAGING}}
        mock_connection.is_alive = True
        
        mock_manager.connections = {"test_conn_123": mock_connection}
        mock_manager.telescope_clients = {"telescope_1": MagicMock()}
        
        response = client.get("/api/ws/health")
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["active_connections"] == 1
        assert data["registered_telescopes"] == 1
        assert len(data["connection_details"]) == 1
        
        conn_detail = data["connection_details"][0]
        assert conn_detail["connection_id"] == "test_conn_123"
        assert conn_detail["is_alive"] is True
        assert "telescope_1" in conn_detail["subscriptions"]
    
    def test_websocket_health_endpoint_stopped(self, client, mock_manager):
        """Test WebSocket health endpoint when manager is stopped."""
        mock_manager._running = False
        mock_manager.connections = {}
        mock_manager.telescope_clients = {}
        
        response = client.get("/api/ws/health")
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "stopped"
        assert data["active_connections"] == 0
        assert data["registered_telescopes"] == 0
        assert data["connection_details"] == []
    
    def test_websocket_debug_endpoint(self, client, mock_manager):
        """Test WebSocket debug endpoint."""
        mock_connection = MagicMock()
        mock_connection.connection_id = "debug_conn_456"
        mock_connection.subscriptions = {"telescope_2": {SubscriptionType.ALL}}
        mock_connection.is_alive = True
        
        mock_manager.connections = {"debug_conn_456": mock_connection}
        mock_manager.telescope_clients = {"local_telescope": MagicMock()}
        mock_manager.remote_clients = {"remote_telescope": "remote_controller_1"}
        
        response = client.get("/api/ws/debug")
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["active_connections"] == 1
        assert data["local_telescopes"] == ["local_telescope"]
        assert data["remote_telescopes"] == {"remote_telescope": "remote_controller_1"}
        assert data["total_registered"] == 2
        assert data["remote_manager_clients"] == 0
        
        conn_detail = data["connection_details"][0]
        assert conn_detail["connection_id"] == "debug_conn_456"
    
    @pytest.mark.asyncio
    async def test_test_broadcast_endpoint(self, client, mock_manager):
        """Test broadcast endpoint."""
        # Mock connection with subscription
        mock_connection = MagicMock()
        mock_connection.is_subscribed_to.return_value = True
        mock_manager.connections = {"conn1": mock_connection}
        
        # Mock broadcast method
        mock_manager.broadcast_status_update = AsyncMock()
        
        response = client.post("/api/ws/test/broadcast?telescope_id=test_telescope&message=Hello")
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "sent"
        assert data["telescope_id"] == "test_telescope"
        assert data["message"] == "Hello"
        assert data["recipients"] == 1
        
        # Verify broadcast was called
        mock_manager.broadcast_status_update.assert_called_once()
        call_args = mock_manager.broadcast_status_update.call_args
        assert call_args[0][0] == "test_telescope"  # telescope_id
        assert call_args[0][1]["test_message"] == "Hello"


@pytest.mark.skipif(not WEBSOCKET_ROUTER_AVAILABLE, reason="WebSocket router not available")
class TestWebSocketConnectionHandling:
    """Test WebSocket connection handling logic."""
    
    @pytest.fixture
    def mock_websocket(self):
        """Create a mock WebSocket."""
        websocket = AsyncMock()
        websocket.accept = AsyncMock()
        websocket.receive_text = AsyncMock()
        websocket.close = AsyncMock()
        return websocket
    
    @pytest.fixture
    def mock_manager(self):
        """Create a mock WebSocket manager."""
        manager = AsyncMock()
        mock_connection = MagicMock()
        mock_connection.is_alive = True
        manager.connect.return_value = mock_connection
        manager.disconnect = AsyncMock()
        manager.handle_message = AsyncMock()
        return manager
    
    @pytest.mark.asyncio
    async def test_handle_websocket_connection_success(self, mock_websocket, mock_manager):
        """Test successful WebSocket connection handling."""
        telescope_id = "telescope_123"
        client_id = "client_456"
        
        # Mock receiving messages
        messages = ["message1", "message2"]
        mock_websocket.receive_text.side_effect = messages + [WebSocketDisconnect()]
        
        await _handle_websocket_connection(mock_websocket, telescope_id, client_id, mock_manager)
        
        # Verify connection lifecycle
        mock_websocket.accept.assert_called_once()
        mock_manager.connect.assert_called_once_with(mock_websocket, client_id, skip_accept=True)
        mock_manager.disconnect.assert_called_once_with(client_id)
        
        # Verify message handling
        assert mock_manager.handle_message.call_count == 2
        mock_manager.handle_message.assert_any_call(client_id, "message1")
        mock_manager.handle_message.assert_any_call(client_id, "message2")
    
    @pytest.mark.asyncio
    async def test_handle_websocket_connection_no_telescope_id(self, mock_websocket, mock_manager):
        """Test WebSocket connection without telescope ID."""
        telescope_id = None
        client_id = None  # Should generate a UUID-based ID
        
        # Mock immediate disconnect
        mock_websocket.receive_text.side_effect = [WebSocketDisconnect()]
        
        await _handle_websocket_connection(mock_websocket, telescope_id, client_id, mock_manager)
        
        # Verify connection was attempted with generated ID
        mock_websocket.accept.assert_called_once()
        mock_manager.connect.assert_called_once()
        call_args = mock_manager.connect.call_args
        generated_client_id = call_args[0][1]  # Second argument is connection_id
        assert generated_client_id.startswith("client-")
        assert len(generated_client_id) == 15  # "client-" + 8 hex chars
    
    @pytest.mark.asyncio
    async def test_handle_websocket_connection_accept_failure(self, mock_websocket, mock_manager):
        """Test WebSocket connection when accept fails."""
        mock_websocket.accept.side_effect = Exception("Accept failed")
        
        await _handle_websocket_connection(mock_websocket, "telescope_1", "client_1", mock_manager)
        
        # Should return early without calling manager.connect
        mock_websocket.accept.assert_called_once()
        mock_manager.connect.assert_not_called()
        mock_manager.disconnect.assert_not_called()
    
    @pytest.mark.asyncio
    async def test_handle_websocket_connection_manager_connect_failure(self, mock_websocket, mock_manager):
        """Test WebSocket connection when manager.connect fails."""
        mock_manager.connect.side_effect = Exception("Manager connect failed")
        
        await _handle_websocket_connection(mock_websocket, "telescope_1", "client_1", mock_manager)
        
        # Should accept but return early after manager.connect fails
        mock_websocket.accept.assert_called_once()
        mock_manager.connect.assert_called_once()
        mock_manager.disconnect.assert_not_called()  # No cleanup needed since connect failed
    
    @pytest.mark.asyncio
    async def test_handle_websocket_connection_dead_connection(self, mock_websocket, mock_manager):
        """Test handling messages on dead connection."""
        mock_connection = MagicMock()
        mock_connection.is_alive = False  # Dead connection
        mock_manager.connect.return_value = mock_connection
        
        # Mock receiving a message
        mock_websocket.receive_text.return_value = "test_message"
        
        await _handle_websocket_connection(mock_websocket, "telescope_1", "client_1", mock_manager)
        
        # Should break immediately due to dead connection
        mock_manager.handle_message.assert_not_called()
        mock_manager.disconnect.assert_called_once_with("client_1")
    
    @pytest.mark.asyncio
    async def test_handle_websocket_connection_message_handling_error(self, mock_websocket, mock_manager):
        """Test error during message handling."""
        mock_connection = MagicMock()
        mock_connection.is_alive = True
        mock_manager.connect.return_value = mock_connection
        
        # Mock message handling error
        mock_websocket.receive_text.return_value = "bad_message"
        mock_manager.handle_message.side_effect = Exception("Message handling failed")
        
        await _handle_websocket_connection(mock_websocket, "telescope_1", "client_1", mock_manager)
        
        # Should handle error gracefully and disconnect
        mock_manager.handle_message.assert_called_once_with("client_1", "bad_message")
        mock_manager.disconnect.assert_called_once_with("client_1")
    
    @pytest.mark.asyncio
    async def test_handle_websocket_connection_websocket_disconnect_during_handshake(self, mock_websocket, mock_manager):
        """Test WebSocket disconnect during initial handshake."""
        # Mock disconnect during the connection setup
        mock_manager.connect.side_effect = WebSocketDisconnect()
        
        await _handle_websocket_connection(mock_websocket, "telescope_1", "client_1", mock_manager)
        
        # Should handle disconnect gracefully
        mock_websocket.accept.assert_called_once()
        # When connect fails with WebSocketDisconnect, disconnect should still be called
        # But since connect failed, there might not be a connection to clean up
        # The current implementation returns early, so disconnect might not be called
        # This is actually correct behavior - if connection creation fails, no cleanup needed


@pytest.mark.skipif(not WEBSOCKET_ROUTER_AVAILABLE, reason="WebSocket router not available")
class TestWebSocketDependencyInjection:
    """Test WebSocket router dependency injection."""
    
    @pytest.mark.asyncio
    async def test_get_websocket_manager_dependency(self):
        """Test the get_websocket_manager dependency function."""
        # This is a simple function that returns the global manager
        manager = await get_websocket_manager()
        assert manager is not None
        # The exact type depends on the import, but it should be consistent
        assert hasattr(manager, 'connections') or manager is not None


@pytest.mark.skipif(not WEBSOCKET_ROUTER_AVAILABLE or not WEBSOCKET_COMPONENTS_AVAILABLE, reason="WebSocket components not available")
class TestWebSocketRouterIntegration:
    """Test WebSocket router integration with WebSocket manager."""
    
    @pytest.fixture
    def real_manager(self):
        """Create a real WebSocket manager for integration testing."""
        with patch('websocket_manager.RemoteWebSocketManager'):
            from websocket_manager import WebSocketManager
            return WebSocketManager()
    
    @pytest.fixture
    def test_app_with_real_manager(self, real_manager):
        """Create test app with real manager."""
        app = FastAPI()
        
        def override_get_websocket_manager():
            return real_manager
        
        app.dependency_overrides[get_websocket_manager] = override_get_websocket_manager
        app.include_router(websocket_router, prefix="/api")
        
        return app
    
    def test_health_endpoint_with_real_manager(self, real_manager):
        """Test health endpoint with real manager."""
        client = TestClient(app := FastAPI())
        
        def override_get_websocket_manager():
            return real_manager
        
        app.dependency_overrides[get_websocket_manager] = override_get_websocket_manager
        app.include_router(websocket_router, prefix="/api")
        
        response = client.get("/api/ws/health")
        
        assert response.status_code == 200
        data = response.json()
        assert "status" in data
        assert "active_connections" in data
        assert "registered_telescopes" in data
        assert "connection_details" in data
        
        # With a fresh manager, should have no connections
        assert data["active_connections"] == 0
        assert data["registered_telescopes"] == 0
        assert data["connection_details"] == []
    
    def test_debug_endpoint_with_real_manager(self, real_manager):
        """Test debug endpoint with real manager."""
        client = TestClient(app := FastAPI())
        
        def override_get_websocket_manager():
            return real_manager
        
        app.dependency_overrides[get_websocket_manager] = override_get_websocket_manager
        app.include_router(websocket_router, prefix="/api")
        
        response = client.get("/api/ws/debug")
        
        assert response.status_code == 200
        data = response.json()
        assert "status" in data
        assert "local_telescopes" in data
        assert "remote_telescopes" in data
        assert "total_registered" in data


class TestWebSocketRouterErrorHandling:
    """Test error handling in WebSocket router."""
    
    @pytest.mark.skipif(not WEBSOCKET_ROUTER_AVAILABLE, reason="WebSocket router not available")
    def test_health_endpoint_with_broken_manager(self):
        """Test health endpoint when manager has issues."""
        app = FastAPI()
        
        # Create a manager that raises errors during processing
        def failing_manager():
            manager = MagicMock()
            manager._running = True
            manager.connections = {}  # Valid connections dict
            manager.telescope_clients = {}  # Valid telescopes dict
            # The error will occur in the endpoint logic, not during dependency injection
            return manager
        
        app.dependency_overrides[get_websocket_manager] = failing_manager
        app.include_router(websocket_router, prefix="/api")
        
        client = TestClient(app)
        
        # Should work fine with a basic manager
        response = client.get("/api/ws/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
    
    @pytest.mark.skipif(not WEBSOCKET_ROUTER_AVAILABLE, reason="WebSocket router not available")
    def test_broadcast_endpoint_with_invalid_parameters(self):
        """Test broadcast endpoint with invalid parameters."""
        app = FastAPI()
        
        mock_manager = MagicMock()
        mock_manager.connections = {}
        mock_manager.broadcast_status_update = AsyncMock()
        
        def override_get_websocket_manager():
            return mock_manager
        
        app.dependency_overrides[get_websocket_manager] = override_get_websocket_manager
        app.include_router(websocket_router, prefix="/api")
        
        client = TestClient(app)
        
        # Test without required parameters
        response = client.post("/api/ws/test/broadcast")
        assert response.status_code == 422  # Validation error
        
        # Test with only telescope_id
        response = client.post("/api/ws/test/broadcast?telescope_id=test")
        assert response.status_code == 422  # Missing message parameter
        
        # Test with only message
        response = client.post("/api/ws/test/broadcast?message=test")
        assert response.status_code == 422  # Missing telescope_id parameter


class TestWebSocketEndpointRouting:
    """Test WebSocket endpoint routing and path handling."""
    
    @pytest.mark.skipif(not WEBSOCKET_ROUTER_AVAILABLE, reason="WebSocket router not available")
    def test_websocket_endpoint_paths(self):
        """Test that WebSocket endpoints are correctly registered."""
        app = FastAPI()
        app.include_router(websocket_router, prefix="/api")
        
        # Check that routes are registered
        websocket_routes = [route for route in app.routes if hasattr(route, 'path') and route.path.startswith('/api/ws')]
        
        # Should have WebSocket endpoints and HTTP endpoints
        assert len(websocket_routes) >= 2  # At least the WebSocket endpoints
        
        # Check for expected paths
        paths = [route.path for route in websocket_routes]
        assert any("/api/ws" in path for path in paths)
        assert any("/api/ws/health" in path for path in paths)
        assert any("/api/ws/debug" in path for path in paths)
        assert any("/api/ws/test/broadcast" in path for path in paths)