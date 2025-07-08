"""
Tests for remote WebSocket client functionality.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import asyncio
import json

from remote_websocket_client import RemoteController, RemoteWebSocketClient, RemoteWebSocketManager


class TestRemoteController:
    """Test RemoteController data class."""
    
    def test_remote_controller_creation(self):
        """Test creating a RemoteController instance."""
        controller = RemoteController(
            host="192.168.1.100",
            port=8000,
            telescope_id="test_telescope",
            controller_id="test_controller"
        )
        
        assert controller.host == "192.168.1.100"
        assert controller.port == 8000
        assert controller.telescope_id == "test_telescope"
        assert controller.controller_id == "test_controller"
        assert controller.max_reconnect_attempts == -1  # Unlimited retries
        assert controller.reconnect_delay == 1.0
        assert controller.health_check_interval == 60.0
    
    def test_remote_controller_defaults(self):
        """Test RemoteController with default values."""
        controller = RemoteController(
            host="test.host",
            port=8000,
            telescope_id="test",
            controller_id="test"
        )
        
        # Test default values
        assert controller.heartbeat_interval == 30.0
        assert controller.message_timeout == 120.0
        assert controller.max_reconnect_attempts == -1
    
    def test_remote_controller_custom_values(self):
        """Test RemoteController with custom values."""
        controller = RemoteController(
            host="test.host",
            port=8000,
            telescope_id="test",
            controller_id="test",
            max_reconnect_attempts=5,
            reconnect_delay=2.0,
            heartbeat_interval=15.0
        )
        
        assert controller.max_reconnect_attempts == 5
        assert controller.reconnect_delay == 2.0
        assert controller.heartbeat_interval == 15.0


class TestRemoteWebSocketClient:
    """Test RemoteWebSocketClient functionality."""
    
    @pytest.fixture
    def controller(self):
        """Create a test RemoteController."""
        return RemoteController(
            host="localhost",
            port=8000,
            telescope_id="test_telescope",
            controller_id="test_controller"
        )
    
    @pytest.fixture
    def mock_message_handler(self):
        """Create a mock message handler."""
        return AsyncMock()
    
    @pytest.fixture
    def client(self, controller, mock_message_handler):
        """Create a RemoteWebSocketClient instance."""
        return RemoteWebSocketClient(controller, mock_message_handler)
    
    def test_client_initialization(self, client, controller):
        """Test client initialization."""
        assert client.controller == controller
        assert client.connection_state.value == "disconnected"
        assert client.websocket is None
        assert client.reconnect_attempts == 0
        assert client.last_message_time == 0
        assert client.active_subscriptions == {}
    
    def test_websocket_url_generation(self, client):
        """Test WebSocket URL generation."""
        expected_url = "ws://localhost:8000/api/ws/test_telescope"
        assert client.websocket_url == expected_url
    
    def test_is_connected_property(self, client):
        """Test is_connected property."""
        # Initially not connected
        assert client.is_connected is False
        
        # Mock a connected state
        from remote_websocket_client import RemoteConnectionState
        client.connection_state = RemoteConnectionState.CONNECTED
        client.websocket = MagicMock()
        
        # Should be connected now (without checking websocket state)
        assert client.is_connected is True
    
    @pytest.mark.asyncio
    async def test_send_subscription(self, client):
        """Test sending subscription messages."""
        # Mock websocket
        client.websocket = AsyncMock()
        client.connection_state = "connected"
        
        # Mock send_message method
        client.send_message = AsyncMock()
        
        subscription_types = ["status", "imaging"]
        await client.send_subscription(subscription_types)
        
        # Verify subscription was tracked
        assert "test_telescope" in client.active_subscriptions
        assert client.active_subscriptions["test_telescope"] == subscription_types
        
        # Verify send_message was called
        client.send_message.assert_called_once()
    
    def test_force_reconnect(self, client):
        """Test manual force reconnection."""
        # Should not raise an exception
        client.force_reconnect("Test reconnection")
        
        # Verify method exists and can be called
        assert hasattr(client, 'force_reconnect')
    
    def test_get_health_status(self, client):
        """Test health status reporting."""
        status = client.get_health_status()
        
        required_keys = [
            "is_connected", "connection_state", "reconnect_attempts",
            "last_message_time", "last_heartbeat", "time_since_last_message",
            "time_since_last_heartbeat", "active_subscriptions"
        ]
        
        for key in required_keys:
            assert key in status
        
        assert status["is_connected"] is False
        assert status["reconnect_attempts"] == 0
        assert isinstance(status["active_subscriptions"], dict)
    
    @pytest.mark.asyncio
    @patch('websockets.connect')
    async def test_connect_success(self, mock_connect, client):
        """Test successful connection."""
        # Mock websocket connection
        mock_websocket = AsyncMock()
        mock_connect.return_value = mock_websocket
        
        # Mock other async methods
        client._start_heartbeat = AsyncMock()
        client._start_health_check = AsyncMock()
        client._restore_subscriptions = AsyncMock()
        
        result = await client.connect()
        
        assert result is True
        assert client.websocket == mock_websocket
        assert client.reconnect_attempts == 0
    
    @pytest.mark.asyncio
    @patch('websockets.connect')
    async def test_connect_failure(self, mock_connect, client):
        """Test connection failure handling."""
        # Mock connection failure
        mock_connect.side_effect = ConnectionRefusedError("Connection refused")
        
        # Mock reconnection scheduling
        client._schedule_reconnect = AsyncMock()
        
        result = await client.connect()
        
        assert result is False
        client._schedule_reconnect.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_disconnect(self, client):
        """Test disconnection."""
        # Setup connected state
        client.websocket = AsyncMock()
        client.reconnect_task = AsyncMock()
        client.heartbeat_task = AsyncMock()
        client.health_check_task = AsyncMock()
        
        await client.disconnect()
        
        # Verify cleanup
        client.reconnect_task.cancel.assert_called_once()
        client.heartbeat_task.cancel.assert_called_once()
        client.health_check_task.cancel.assert_called_once()
        client.websocket.close.assert_called_once()
        assert client.websocket is None


class TestRemoteWebSocketManager:
    """Test RemoteWebSocketManager functionality."""
    
    @pytest.fixture
    def mock_message_handler(self):
        """Create a mock message handler."""
        return AsyncMock()
    
    @pytest.fixture
    def manager(self, mock_message_handler):
        """Create a RemoteWebSocketManager instance."""
        return RemoteWebSocketManager(mock_message_handler)
    
    @pytest.fixture
    def controller(self):
        """Create a test RemoteController."""
        return RemoteController(
            host="localhost",
            port=8000,
            telescope_id="test_telescope",
            controller_id="test_controller"
        )
    
    def test_manager_initialization(self, manager):
        """Test manager initialization."""
        assert manager.clients == {}
        assert manager.message_handler is not None
    
    @pytest.mark.asyncio
    async def test_add_remote_controller(self, manager, controller):
        """Test adding a remote controller."""
        # Mock the client connection
        with patch.object(RemoteWebSocketClient, 'connect', return_value=True) as mock_connect:
            with patch.object(RemoteWebSocketClient, 'send_subscription') as mock_subscribe:
                result = await manager.add_remote_controller(controller)
                
                assert result is True
                assert controller.controller_id in manager.clients
                mock_connect.assert_called_once()
                mock_subscribe.assert_called_once_with(["all"])
    
    @pytest.mark.asyncio
    async def test_remove_remote_controller(self, manager, controller):
        """Test removing a remote controller."""
        # First add a controller
        client_mock = AsyncMock()
        manager.clients[controller.controller_id] = client_mock
        
        await manager.remove_remote_controller(controller.controller_id)
        
        assert controller.controller_id not in manager.clients
        client_mock.disconnect.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_send_to_telescope(self, manager, controller):
        """Test sending message to specific telescope."""
        # Add a mock client
        client_mock = AsyncMock()
        client_mock.controller = controller
        client_mock.is_connected = True
        client_mock.send_message = AsyncMock(return_value={"status": "ok"})
        manager.clients[controller.controller_id] = client_mock
        
        message = {"type": "test", "data": "test_data"}
        result = await manager.send_to_telescope(controller.telescope_id, message)
        
        assert result == {"status": "ok"}
        client_mock.send_message.assert_called_once_with(message)
    
    @pytest.mark.asyncio
    async def test_send_to_telescope_no_connection(self, manager):
        """Test sending to telescope with no connection."""
        with pytest.raises(ConnectionError):
            await manager.send_to_telescope("nonexistent_telescope", {"test": "message"})
    
    def test_get_telescope_connection_status(self, manager, controller):
        """Test getting telescope connection status."""
        # Test with no client
        status = manager.get_telescope_connection_status(controller.telescope_id)
        assert status == "disconnected"
        
        # Add a mock client
        client_mock = MagicMock()
        client_mock.controller = controller
        client_mock.connection_state.value = "connected"
        manager.clients[controller.controller_id] = client_mock
        
        status = manager.get_telescope_connection_status(controller.telescope_id)
        assert status == "connected"
    
    def test_force_reconnect_telescope(self, manager, controller):
        """Test forcing reconnection for specific telescope."""
        # Add a mock client
        client_mock = MagicMock()
        client_mock.controller = controller
        client_mock.force_reconnect = MagicMock()
        manager.clients[controller.controller_id] = client_mock
        
        result = manager.force_reconnect_telescope(controller.telescope_id, "Test reason")
        
        assert result is True
        client_mock.force_reconnect.assert_called_once_with("Test reason")
    
    def test_get_all_health_status(self, manager, controller):
        """Test getting health status for all controllers."""
        # Add a mock client
        client_mock = MagicMock()
        client_mock.controller = controller
        client_mock.get_health_status.return_value = {"status": "healthy"}
        manager.clients[controller.controller_id] = client_mock
        
        health_status = manager.get_all_health_status()
        
        assert controller.telescope_id in health_status
        assert health_status[controller.telescope_id] == {"status": "healthy"}
    
    @pytest.mark.asyncio
    async def test_disconnect_all(self, manager, controller):
        """Test disconnecting all controllers."""
        # Add mock clients
        client1 = AsyncMock()
        client2 = AsyncMock()
        manager.clients["controller1"] = client1
        manager.clients["controller2"] = client2
        
        await manager.disconnect_all()
        
        # Verify all clients were disconnected
        client1.disconnect.assert_called_once()
        client2.disconnect.assert_called_once()
        assert manager.clients == {}


class TestConnectionStateEnum:
    """Test RemoteConnectionState enum."""
    
    def test_connection_states(self):
        """Test all connection state values."""
        from remote_websocket_client import RemoteConnectionState
        
        expected_states = {
            "DISCONNECTED": "disconnected",
            "CONNECTING": "connecting",
            "CONNECTED": "connected", 
            "RECONNECTING": "reconnecting",
            "ERROR": "error"
        }
        
        for state_name, state_value in expected_states.items():
            state = getattr(RemoteConnectionState, state_name)
            assert state.value == state_value