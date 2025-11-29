"""
Comprehensive tests for WebSocket router and FastAPI integration.
Part of Phase 2: Critical Path Testing - WebSocket router testing
"""

import pytest
import json
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient
from fastapi import FastAPI
from httpx import AsyncClient
import pytest_asyncio

from websocket_router import (
    router,
    get_websocket_manager_dependency,
    get_websocket_manager_global,
    WebSocketManagerProxy,
    _handle_websocket_connection,
)
from websocket_manager import WebSocketManager


class TestWebSocketRouterUtilities:
    """Test utility functions and proxy classes"""
    
    def test_get_websocket_manager_global(self):
        """Test getting global WebSocket manager"""
        manager = get_websocket_manager_global()
        assert manager is not None
        assert isinstance(manager, WebSocketManager)
    
    @pytest.mark.asyncio
    async def test_get_websocket_manager_dependency(self):
        """Test dependency injection for WebSocket manager"""
        manager = await get_websocket_manager_dependency()
        assert manager is not None
        assert isinstance(manager, WebSocketManager)
    
    def test_websocket_manager_proxy(self):
        """Test WebSocketManagerProxy functionality"""
        proxy = WebSocketManagerProxy()
        
        # Test attribute access
        assert hasattr(proxy, 'connections')
        
        # Test that it properly delegates to the manager
        connections = proxy.connections
        assert isinstance(connections, dict)


class TestWebSocketRouterHTTPEndpoints:
    """Test HTTP endpoints provided by the router"""
    
    @pytest.fixture
    def app(self):
        """Create FastAPI app with router for testing"""
        app = FastAPI()
        app.include_router(router)
        return app
    
    @pytest.fixture
    def client(self, app):
        """Create test client"""
        return TestClient(app)
    
    @pytest.fixture
    def mock_manager(self):
        """Create mock WebSocket manager"""
        manager = MagicMock()
        manager._running = True
        manager.connections = {}
        manager.telescope_clients = {}
        manager.remote_clients = {}
        manager.remote_manager = MagicMock()
        manager.remote_manager.clients = {}
        return manager
    
    def test_websocket_health_endpoint(self, client, mock_manager):
        """Test /ws/health endpoint"""
        # Ensure manager appears to be running for healthy status
        mock_manager._running = True
        
        # For FastAPI dependency injection, we need to use app.dependency_overrides
        from websocket_router import router, get_websocket_manager_dependency
        
        # Create a simple function that returns our mock
        def get_mock_manager():
            return mock_manager
        
        # Override the dependency
        client.app.dependency_overrides[get_websocket_manager_dependency] = get_mock_manager
        
        try:
            response = client.get("/ws/health")
        finally:
            # Clean up the override
            client.app.dependency_overrides.clear()
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["status"] == "healthy"
        assert data["active_connections"] == 0
        assert data["registered_telescopes"] == 0
        assert data["connection_details"] == []
    
    def test_websocket_health_endpoint_stopped(self, client, mock_manager):
        """Test /ws/health endpoint when manager is stopped"""
        mock_manager._running = False
        
        with patch('websocket_router.get_websocket_manager_dependency', return_value=mock_manager):
            response = client.get("/ws/health")
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "stopped"
    
    def test_websocket_debug_endpoint(self, client, mock_manager):
        """Test /ws/debug endpoint"""
        from websocket_router import get_websocket_manager_dependency
        
        def get_mock_manager():
            return mock_manager
        
        client.app.dependency_overrides[get_websocket_manager_dependency] = get_mock_manager
        
        try:
            response = client.get("/ws/debug")
        finally:
            client.app.dependency_overrides.clear()
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["status"] == "healthy"
        assert data["active_connections"] == 0
        assert data["local_telescopes"] == []
        assert data["remote_telescopes"] == {}
        assert data["total_registered"] == 0
        assert data["remote_manager_clients"] == 0
        assert data["connection_details"] == []
    
    def test_websocket_debug_endpoint_with_connections(self, client, mock_manager):
        """Test /ws/debug endpoint with mock connections"""
        mock_connection = MagicMock()
        mock_connection.connection_id = "test-connection-123"
        mock_connection.subscriptions = {"telescope_001": ["status"]}
        mock_connection.is_alive = True
        
        mock_manager.connections = {"test-connection-123": mock_connection}
        mock_manager.telescope_clients = {"telescope_001": MagicMock()}
        
        from websocket_router import get_websocket_manager_dependency
        
        def get_mock_manager():
            return mock_manager
        
        client.app.dependency_overrides[get_websocket_manager_dependency] = get_mock_manager
        
        try:
            response = client.get("/ws/debug")
        finally:
            client.app.dependency_overrides.clear()
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["active_connections"] == 1
        assert data["local_telescopes"] == ["telescope_001"]
        assert data["total_registered"] == 1
        assert len(data["connection_details"]) == 1
        assert data["connection_details"][0]["connection_id"] == "test-connection-123"
    
    @pytest.mark.asyncio
    async def test_test_broadcast_endpoint(self, client, mock_manager):
        """Test /ws/test/broadcast endpoint"""
        mock_manager.broadcast_status_update = AsyncMock()
        
        # Mock connections for recipient counting
        mock_connection = MagicMock()
        mock_connection.is_subscribed_to.return_value = True
        mock_manager.connections = {"test-connection-123": mock_connection}
        
        from websocket_router import get_websocket_manager_dependency
        
        def get_mock_manager():
            return mock_manager
        
        client.app.dependency_overrides[get_websocket_manager_dependency] = get_mock_manager
        
        try:
            response = client.post(
                "/ws/test/broadcast?telescope_id=telescope_001&message=test_message"
            )
        finally:
            client.app.dependency_overrides.clear()
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["status"] == "sent"
        assert data["telescope_id"] == "telescope_001"
        assert data["message"] == "test_message"
        assert data["recipients"] == 1
        
        # Verify broadcast was called
        mock_manager.broadcast_status_update.assert_called_once()


class TestWebSocketConnectionHandling:
    """Test WebSocket connection handling logic"""
    
    @pytest.fixture
    def mock_websocket(self):
        """Create mock WebSocket"""
        websocket = AsyncMock()
        websocket.accept = AsyncMock()
        websocket.receive_text = AsyncMock()
        return websocket
    
    @pytest.fixture
    def mock_manager(self):
        """Create mock WebSocket manager"""
        manager = AsyncMock()
        mock_connection = MagicMock()
        mock_connection.is_alive = True
        manager.connect = AsyncMock(return_value=mock_connection)
        manager.disconnect = AsyncMock()
        manager.handle_message = AsyncMock()
        return manager
    
    @pytest.mark.asyncio
    async def test_handle_websocket_connection_basic(self, mock_websocket, mock_manager):
        """Test basic WebSocket connection handling"""
        # Simulate a single message then disconnect
        mock_websocket.receive_text.side_effect = [
            '{"type": "heartbeat"}',
            Exception("Simulated disconnect")
        ]
        
        await _handle_websocket_connection(
            mock_websocket, "telescope_001", "client_123", mock_manager
        )
        
        # Verify connection flow
        mock_websocket.accept.assert_called_once()
        mock_manager.connect.assert_called_once_with(
            mock_websocket, "client_123", skip_accept=True
        )
        mock_manager.handle_message.assert_called_once_with(
            "client_123", '{"type": "heartbeat"}'
        )
        mock_manager.disconnect.assert_called_once_with("client_123")
    
    @pytest.mark.asyncio
    async def test_handle_websocket_connection_no_client_id(self, mock_websocket, mock_manager):
        """Test connection handling when no client_id is provided"""
        mock_websocket.receive_text.side_effect = [Exception("Immediate disconnect")]
        
        await _handle_websocket_connection(
            mock_websocket, "telescope_001", None, mock_manager
        )
        
        # Verify generated client ID was used
        mock_manager.connect.assert_called_once()
        call_args = mock_manager.connect.call_args[0]
        connection_id = call_args[1]
        assert connection_id.startswith("client-")
        assert len(connection_id) == 15  # "client-" + 8 hex chars
    
    @pytest.mark.asyncio
    async def test_handle_websocket_connection_accept_failure(self, mock_websocket, mock_manager):
        """Test handling when WebSocket accept fails"""
        mock_websocket.accept.side_effect = Exception("Accept failed")
        
        await _handle_websocket_connection(
            mock_websocket, "telescope_001", "client_123", mock_manager
        )
        
        # Verify manager.connect was not called due to accept failure
        mock_manager.connect.assert_not_called()
    
    @pytest.mark.asyncio
    async def test_handle_websocket_connection_manager_connect_failure(self, mock_websocket, mock_manager):
        """Test handling when manager.connect fails"""
        mock_manager.connect.side_effect = Exception("Connection failed")
        
        await _handle_websocket_connection(
            mock_websocket, "telescope_001", "client_123", mock_manager
        )
        
        # Verify accept was called but disconnect was not (connection never established)
        mock_websocket.accept.assert_called_once()
        mock_manager.disconnect.assert_not_called()
    
    @pytest.mark.asyncio
    async def test_handle_websocket_connection_dead_connection(self, mock_websocket, mock_manager):
        """Test handling when connection dies during message processing"""
        # Create connection that starts alive then dies
        mock_connection = MagicMock()
        mock_connection.is_alive = False  # Dead connection
        mock_manager.connect.return_value = mock_connection
        
        mock_websocket.receive_text.return_value = '{"type": "heartbeat"}'
        
        await _handle_websocket_connection(
            mock_websocket, "telescope_001", "client_123", mock_manager
        )
        
        # Verify message handling was not called for dead connection
        mock_manager.handle_message.assert_not_called()
        mock_manager.disconnect.assert_called_once_with("client_123")
    
    @pytest.mark.asyncio
    async def test_handle_websocket_connection_message_error(self, mock_websocket, mock_manager):
        """Test handling when message processing raises an error"""
        mock_websocket.receive_text.side_effect = [
            '{"type": "heartbeat"}',
            Exception("Message processing error")
        ]
        
        mock_manager.handle_message.side_effect = Exception("Processing failed")
        
        await _handle_websocket_connection(
            mock_websocket, "telescope_001", "client_123", mock_manager
        )
        
        # Verify disconnect was called despite error
        mock_manager.disconnect.assert_called_once_with("client_123")
    
    @pytest.mark.asyncio
    async def test_handle_websocket_connection_with_telescope_id(self, mock_websocket, mock_manager):
        """Test connection handling with specific telescope ID"""
        mock_websocket.receive_text.side_effect = [Exception("Immediate disconnect")]
        
        await _handle_websocket_connection(
            mock_websocket, "telescope_001", "client_123", mock_manager
        )
        
        # Verify connection was established (telescope_id is just for logging)
        mock_manager.connect.assert_called_once_with(
            mock_websocket, "client_123", skip_accept=True
        )


class TestWebSocketRouterIntegration:
    """Integration tests for the router with FastAPI"""
    
    @pytest.fixture
    def app(self):
        """Create FastAPI app with router"""
        app = FastAPI()
        app.include_router(router)
        return app
    
    @pytest.mark.asyncio
    async def test_websocket_endpoint_integration(self, app):
        """Test WebSocket endpoint integration with FastAPI"""
        with patch('websocket_router._handle_websocket_connection') as mock_handler:
            mock_handler.return_value = None
            
            # For WebSocket testing, we should use WebSocketTestSession or similar
            # For now, just verify the handler is properly imported and can be mocked
            # This test ensures the WebSocket endpoint exists and the handler can be patched
            
            # Verify the router has the WebSocket routes
            routes = [route for route in app.routes if hasattr(route, 'path')]
            websocket_routes = [r for r in routes if hasattr(r, 'endpoint')]
            
            # Verify routes exist (this tests that the router was properly included)
            assert any("/ws" in str(route.path) for route in routes), "WebSocket routes should be included"
    
    def test_router_includes_all_endpoints(self, app):
        """Test that all expected endpoints are included in the router"""
        routes = [route.path for route in app.routes]
        
        assert "/ws" in [route.path for route in app.routes if hasattr(route, 'path')]
        assert "/ws/{telescope_id}" in [route.path for route in app.routes if hasattr(route, 'path')]
        
        # Test HTTP endpoints exist
        client = TestClient(app)
        
        # Health endpoint should be accessible
        from websocket_router import get_websocket_manager_dependency
        
        mock_manager = MagicMock()
        mock_manager._running = True
        mock_manager.connections = {}
        mock_manager.telescope_clients = {}
        mock_manager.remote_clients = {}
        mock_manager.remote_manager = MagicMock()
        mock_manager.remote_manager.clients = {}
        
        def get_mock_manager():
            return mock_manager
        
        client.app.dependency_overrides[get_websocket_manager_dependency] = get_mock_manager
        
        try:
            response = client.get("/ws/health")
            assert response.status_code == 200
            
            # Debug endpoint should be accessible  
            response = client.get("/ws/debug")
            assert response.status_code == 200
        finally:
            client.app.dependency_overrides.clear()


class TestWebSocketRouterErrorHandling:
    """Test error handling scenarios in the router"""
    
    @pytest.fixture
    def mock_websocket(self):
        """Create mock WebSocket that can simulate various error conditions"""
        websocket = AsyncMock()
        websocket.accept = AsyncMock()
        websocket.receive_text = AsyncMock()
        return websocket
    
    @pytest.fixture
    def mock_manager(self):
        """Create mock manager for error testing"""
        manager = AsyncMock()
        mock_connection = MagicMock()
        mock_connection.is_alive = True
        manager.connect = AsyncMock(return_value=mock_connection)
        manager.disconnect = AsyncMock()
        manager.handle_message = AsyncMock()
        return manager
    
    @pytest.mark.asyncio
    async def test_websocket_disconnect_exception(self, mock_websocket, mock_manager):
        """Test handling of WebSocketDisconnect exception"""
        from fastapi import WebSocketDisconnect
        
        mock_websocket.receive_text.side_effect = WebSocketDisconnect()
        
        await _handle_websocket_connection(
            mock_websocket, "telescope_001", "client_123", mock_manager
        )
        
        # Verify cleanup was performed
        mock_manager.disconnect.assert_called_once_with("client_123")
    
    @pytest.mark.asyncio
    async def test_websocket_disconnect_during_handshake(self, mock_websocket, mock_manager):
        """Test handling disconnect during initial handshake"""
        from fastapi import WebSocketDisconnect
        
        # Simulate disconnect right after connection establishment
        mock_manager.connect.side_effect = WebSocketDisconnect()
        
        await _handle_websocket_connection(
            mock_websocket, "telescope_001", "client_123", mock_manager
        )
        
        # Verify disconnect was NOT called since connection never succeeded
        mock_manager.disconnect.assert_not_called()
    
    @pytest.mark.asyncio
    async def test_multiple_exception_handling(self, mock_websocket, mock_manager):
        """Test that multiple exceptions are handled gracefully"""
        # First message succeeds, second fails, third fails differently
        mock_websocket.receive_text.side_effect = [
            '{"type": "heartbeat"}',
            ConnectionError("Network error"),
            Exception("Generic error")
        ]
        
        await _handle_websocket_connection(
            mock_websocket, "telescope_001", "client_123", mock_manager
        )
        
        # Verify only one message was processed before error
        mock_manager.handle_message.assert_called_once()
        mock_manager.disconnect.assert_called_once_with("client_123")