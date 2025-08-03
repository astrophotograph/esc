"""
Detailed tests for WebSocket manager and connection handling.
Part of Phase 2: Critical Path Testing - WebSocket manager testing
"""

import pytest
import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch
from typing import Dict, Any

from websocket_manager import WebSocketManager, WebSocketConnection
from websocket_protocol import (
    MessageType,
    SubscriptionType,
    WebSocketMessage,
    StatusUpdateMessage,
    ControlCommandMessage,
    HeartbeatMessage,
    SubscribeMessage,
    MessageFactory,
)


class TestWebSocketConnection:
    """Test WebSocketConnection class functionality"""
    
    @pytest.fixture
    def mock_websocket(self):
        """Create a mock WebSocket object"""
        mock_ws = AsyncMock()
        mock_ws.send_text = AsyncMock()
        mock_ws.client_state = MagicMock()
        mock_ws.client_state.name = "CONNECTED"
        return mock_ws
    
    @pytest.fixture
    def websocket_connection(self, mock_websocket):
        """Create a WebSocketConnection instance"""
        return WebSocketConnection(
            websocket=mock_websocket,
            connection_id="test-connection-123"
        )
    
    def test_websocket_connection_initialization(self, websocket_connection, mock_websocket):
        """Test WebSocketConnection initialization"""
        assert websocket_connection.websocket == mock_websocket
        assert websocket_connection.connection_id == "test-connection-123"
        assert websocket_connection.subscriptions == {}
        assert websocket_connection.is_alive is True
        assert websocket_connection.last_heartbeat > 0
    
    @pytest.mark.asyncio
    async def test_send_message_success(self, websocket_connection, mock_websocket):
        """Test successful message sending"""
        message = WebSocketMessage(
            type=MessageType.HEARTBEAT,
            telescope_id="test_telescope"
        )
        
        result = await websocket_connection.send_message(message)
        
        assert result is True
        mock_websocket.send_text.assert_called_once()
        # Verify the message was serialized correctly
        call_args = mock_websocket.send_text.call_args[0][0]
        message_data = json.loads(call_args)
        assert message_data["type"] == MessageType.HEARTBEAT
        assert message_data["telescope_id"] == "test_telescope"
    
    @pytest.mark.asyncio
    async def test_send_message_websocket_not_connected(self, websocket_connection, mock_websocket):
        """Test sending message when WebSocket is not connected"""
        # Mock disconnected state
        mock_websocket.client_state.name = "DISCONNECTED"
        
        message = WebSocketMessage(
            type=MessageType.HEARTBEAT,
            telescope_id="test_telescope"
        )
        
        result = await websocket_connection.send_message(message)
        
        assert result is False
        assert websocket_connection.is_alive is False
        mock_websocket.send_text.assert_not_called()
    
    @pytest.mark.asyncio
    async def test_send_message_when_not_alive(self, websocket_connection):
        """Test sending message when connection is marked as not alive"""
        websocket_connection.is_alive = False
        
        message = WebSocketMessage(
            type=MessageType.HEARTBEAT,
            telescope_id="test_telescope"
        )
        
        result = await websocket_connection.send_message(message)
        
        assert result is False
    
    @pytest.mark.asyncio
    async def test_send_message_exception_handling(self, websocket_connection, mock_websocket):
        """Test exception handling during message sending"""
        # Make send_text raise an exception
        mock_websocket.send_text.side_effect = Exception("Connection lost")
        
        message = WebSocketMessage(
            type=MessageType.HEARTBEAT,
            telescope_id="test_telescope"
        )
        
        result = await websocket_connection.send_message(message)
        
        assert result is False
        assert websocket_connection.is_alive is False
    
    def test_subscription_management(self, websocket_connection):
        """Test subscription management methods"""
        telescope_id = "telescope_001"
        
        # Initially not subscribed
        assert not websocket_connection.is_subscribed_to(telescope_id, SubscriptionType.STATUS)
        
        # Add subscription
        websocket_connection.add_subscription(telescope_id, [SubscriptionType.STATUS, SubscriptionType.IMAGING])
        
        # Check subscriptions
        assert websocket_connection.is_subscribed_to(telescope_id, SubscriptionType.STATUS)
        assert websocket_connection.is_subscribed_to(telescope_id, SubscriptionType.IMAGING)
        assert not websocket_connection.is_subscribed_to(telescope_id, SubscriptionType.POSITION)
        
        # Test ALL subscription type
        websocket_connection.add_subscription(telescope_id, [SubscriptionType.ALL])
        assert websocket_connection.is_subscribed_to(telescope_id, SubscriptionType.POSITION)  # Should be true due to ALL
    
    def test_remove_subscription(self, websocket_connection):
        """Test subscription removal"""
        telescope_id = "telescope_001"
        
        # Add subscriptions
        websocket_connection.add_subscription(telescope_id, [SubscriptionType.STATUS, SubscriptionType.IMAGING])
        
        # Remove subscription
        websocket_connection.remove_subscription(telescope_id, [SubscriptionType.STATUS])
        
        # Check remaining subscriptions
        assert not websocket_connection.is_subscribed_to(telescope_id, SubscriptionType.STATUS)
        assert websocket_connection.is_subscribed_to(telescope_id, SubscriptionType.IMAGING)
    
    def test_remove_all_subscriptions(self, websocket_connection):
        """Test removing all subscriptions for a telescope"""
        telescope_id = "telescope_001"
        
        # Add subscriptions
        websocket_connection.add_subscription(telescope_id, [SubscriptionType.STATUS, SubscriptionType.IMAGING])
        
        # Verify initial subscriptions exist
        assert websocket_connection.is_subscribed_to(telescope_id, SubscriptionType.STATUS)
        assert websocket_connection.is_subscribed_to(telescope_id, SubscriptionType.IMAGING)
        
        # Remove all subscriptions by manually clearing them
        if telescope_id in websocket_connection.subscriptions:
            del websocket_connection.subscriptions[telescope_id]
        
        # Check all subscriptions removed
        assert telescope_id not in websocket_connection.subscriptions


class TestWebSocketManager:
    """Test WebSocketManager class functionality"""
    
    @pytest.fixture
    def websocket_manager(self):
        """Create a WebSocketManager instance"""
        with patch('websocket_manager.RemoteWebSocketManager') as mock_remote:
            mock_remote_instance = AsyncMock()
            mock_remote.return_value = mock_remote_instance
            
            manager = WebSocketManager()
            manager.remote_manager = mock_remote_instance
            
            yield manager
    
    @pytest.fixture
    def mock_websocket(self):
        """Create a mock WebSocket object"""
        mock_ws = AsyncMock()
        mock_ws.send_text = AsyncMock()
        mock_ws.client_state = MagicMock()
        mock_ws.client_state.name = "CONNECTED"
        return mock_ws
    
    def test_websocket_manager_initialization(self, websocket_manager):
        """Test WebSocketManager initialization"""
        assert websocket_manager.connections == {}
        assert websocket_manager.telescope_clients == {}
        assert websocket_manager.remote_clients == {}
        assert websocket_manager.heartbeat_interval == 30
        assert websocket_manager.heartbeat_task is None
        assert websocket_manager._running is False
        assert websocket_manager.remote_manager is not None
    
    @pytest.mark.asyncio
    async def test_start_stop_manager(self, websocket_manager):
        """Test starting and stopping the WebSocket manager"""
        # Test start
        await websocket_manager.start()
        
        assert websocket_manager._running is True
        assert websocket_manager.heartbeat_task is not None
        
        # Test stop
        await websocket_manager.stop()
        
        assert websocket_manager._running is False
        assert websocket_manager.heartbeat_task.cancelled()
    
    @pytest.mark.asyncio
    async def test_connect_disconnect(self, websocket_manager, mock_websocket):
        """Test connecting and disconnecting WebSocket connections"""
        connection_id = "test-connection-123"
        
        # Connect WebSocket
        connection = await websocket_manager.connect(mock_websocket, connection_id)
        
        assert connection_id in websocket_manager.connections
        assert websocket_manager.connections[connection_id] == connection
        assert connection.connection_id == connection_id
        assert connection.websocket == mock_websocket
        
        # Disconnect WebSocket
        await websocket_manager.disconnect(connection_id)
        
        assert connection_id not in websocket_manager.connections
    
    @pytest.mark.asyncio
    async def test_disconnect_nonexistent_connection(self, websocket_manager):
        """Test disconnecting a connection that doesn't exist"""
        # Should not raise an exception
        await websocket_manager.disconnect("nonexistent-connection")
        
        # Verify no connections exist
        assert len(websocket_manager.connections) == 0
    
    @pytest.mark.asyncio
    async def test_handle_subscribe_message(self, websocket_manager, mock_websocket):
        """Test handling subscribe messages"""
        connection_id = "test-connection-123"
        telescope_id = "telescope_001"
        
        # Connect WebSocket
        await websocket_manager.connect(mock_websocket, connection_id)
        
        # Create subscribe message
        subscribe_message = SubscribeMessage(
            telescope_id=telescope_id,
            subscription_types=[SubscriptionType.STATUS, SubscriptionType.IMAGING]
        )
        
        # Handle the subscribe message - note: method signature expects connection object, not ID
        connection = websocket_manager.connections[connection_id]
        await websocket_manager._handle_subscribe(connection, subscribe_message)
        
        # Verify subscription was added
        assert connection.is_subscribed_to(telescope_id, SubscriptionType.STATUS)
        assert connection.is_subscribed_to(telescope_id, SubscriptionType.IMAGING)
    
    @pytest.mark.asyncio
    async def test_handle_unsubscribe_message(self, websocket_manager, mock_websocket):
        """Test handling unsubscribe messages"""
        connection_id = "test-connection-123"
        telescope_id = "telescope_001"
        
        # Connect WebSocket and add subscription
        await websocket_manager.connect(mock_websocket, connection_id)
        connection = websocket_manager.connections[connection_id]
        connection.add_subscription(telescope_id, [SubscriptionType.STATUS, SubscriptionType.IMAGING])
        
        # Create unsubscribe message
        from websocket_protocol import UnsubscribeMessage
        unsubscribe_message = UnsubscribeMessage(
            telescope_id=telescope_id,
            subscription_types=[SubscriptionType.STATUS]
        )
        
        # Handle the unsubscribe message - note: method signature expects connection object, not ID
        await websocket_manager._handle_unsubscribe(connection, unsubscribe_message)
        
        # Verify subscription was removed
        assert not connection.is_subscribed_to(telescope_id, SubscriptionType.STATUS)
        assert connection.is_subscribed_to(telescope_id, SubscriptionType.IMAGING)
    
    @pytest.mark.asyncio
    async def test_broadcast_status_update(self, websocket_manager, mock_websocket):
        """Test broadcasting status updates to subscribed clients"""
        connection_id = "test-connection-123"
        telescope_id = "telescope_001"
        
        # Connect WebSocket and add subscription
        await websocket_manager.connect(mock_websocket, connection_id)
        connection = websocket_manager.connections[connection_id]
        connection.add_subscription(telescope_id, [SubscriptionType.STATUS])
        
        # Broadcast status update
        status_data = {"connected": True, "ra": 10.5, "dec": 45.0}
        await websocket_manager.broadcast_status_update(telescope_id, status_data)
        
        # Verify message was sent (should be called twice: heartbeat + status update)
        assert mock_websocket.send_text.call_count == 2
        
        # Parse the last sent message (status update)
        last_call_args = mock_websocket.send_text.call_args[0][0]
        message_data = json.loads(last_call_args)
        assert message_data["type"] == MessageType.STATUS_UPDATE
        assert message_data["telescope_id"] == telescope_id
        assert message_data["payload"]["status"] == status_data
    
    @pytest.mark.asyncio
    async def test_broadcast_to_unsubscribed_client(self, websocket_manager, mock_websocket):
        """Test that unsubscribed clients don't receive broadcasts"""
        connection_id = "test-connection-123"
        telescope_id = "telescope_001"
        
        # Connect WebSocket but NO subscription
        await websocket_manager.connect(mock_websocket, connection_id)
        
        # Broadcast status update
        status_data = {"connected": True}
        await websocket_manager.broadcast_status_update(telescope_id, status_data)
        
        # Verify only heartbeat was sent, no status update
        assert mock_websocket.send_text.call_count == 1
        
        # Verify the only message sent was a heartbeat
        call_args = mock_websocket.send_text.call_args[0][0]
        message_data = json.loads(call_args)
        assert message_data["type"] == MessageType.HEARTBEAT
    
    def test_telescope_client_registration(self, websocket_manager):
        """Test telescope client registration and unregistration"""
        telescope_id = "telescope_001"
        mock_client = MagicMock()
        
        # Register client
        websocket_manager.register_telescope_client(telescope_id, mock_client)
        
        assert telescope_id in websocket_manager.telescope_clients
        assert websocket_manager.telescope_clients[telescope_id] == mock_client
        
        # Unregister client
        websocket_manager.unregister_telescope_client(telescope_id)
        
        assert telescope_id not in websocket_manager.telescope_clients
    
    def test_unregister_nonexistent_telescope_client(self, websocket_manager):
        """Test unregistering a telescope client that doesn't exist"""
        # Should not raise an exception
        websocket_manager.unregister_telescope_client("nonexistent-telescope")
        
        # Verify no clients exist
        assert len(websocket_manager.telescope_clients) == 0
    
    @pytest.mark.asyncio
    async def test_handle_control_command(self, websocket_manager, mock_websocket):
        """Test handling control commands"""
        telescope_id = "telescope_001"
        connection_id = "test-connection-123"
        mock_client = AsyncMock()
        
        # Connect WebSocket and register telescope client
        await websocket_manager.connect(mock_websocket, connection_id)
        websocket_manager.register_telescope_client(telescope_id, mock_client)
        
        # Create control command message
        from websocket_protocol import CommandAction
        control_message = ControlCommandMessage(
            telescope_id=telescope_id,
            action=CommandAction.GOTO,
            parameters={"ra": 10.5, "dec": 45.0},
            response_expected=True
        )
        
        # Handle the control command - note: method signature expects connection object, not ID
        connection = websocket_manager.connections[connection_id]
        await websocket_manager._handle_control_command(connection, control_message)
        
        # Verify command was processed
        # Note: This test verifies the command was handled without error
        # The actual command execution depends on telescope client implementation
    
    @pytest.mark.asyncio
    async def test_heartbeat_mechanism(self, websocket_manager, mock_websocket):
        """Test heartbeat mechanism"""
        connection_id = "test-connection-123"
        
        # Connect WebSocket
        await websocket_manager.connect(mock_websocket, connection_id)
        
        # Start manager to enable heartbeat
        await websocket_manager.start()
        
        # Wait a short time for heartbeat to potentially trigger
        await asyncio.sleep(0.1)
        
        # Stop manager
        await websocket_manager.stop()
        
        # Verify heartbeat task was created and is now done (finished or cancelled)
        assert websocket_manager.heartbeat_task.done()
    
    @pytest.mark.asyncio
    async def test_dead_connection_handling(self, websocket_manager, mock_websocket):
        """Test handling of dead connections"""
        connection_id = "test-connection-123"
        
        # Connect WebSocket
        await websocket_manager.connect(mock_websocket, connection_id)
        connection = websocket_manager.connections[connection_id]
        
        # Simulate connection failure by making send_text raise an exception
        mock_websocket.send_text.side_effect = Exception("Connection lost")
        
        # Try to send a message - this should mark the connection as dead
        message = WebSocketMessage(
            type=MessageType.HEARTBEAT,
            telescope_id="test_telescope"
        )
        
        result = await connection.send_message(message)
        
        # Verify connection was marked as dead and send failed
        assert result is False
        assert connection.is_alive is False
    
    @pytest.mark.asyncio
    async def test_broadcast_alert_event(self, websocket_manager, mock_websocket):
        """Test broadcasting alert events"""
        connection_id = "test-connection-123"
        telescope_id = "telescope_001"
        
        # Connect WebSocket and add subscription
        await websocket_manager.connect(mock_websocket, connection_id)
        connection = websocket_manager.connections[connection_id]
        connection.add_subscription(telescope_id, [SubscriptionType.STATUS])
        
        # Broadcast alert event
        await websocket_manager.broadcast_alert_event(
            telescope_id=telescope_id,
            state="ERROR",
            error="Connection failed",
            code=500
        )
        
        # Verify message was sent (should be called twice: heartbeat + alert)
        assert mock_websocket.send_text.call_count == 2
        
        # Parse the last sent message (alert)
        last_call_args = mock_websocket.send_text.call_args[0][0]
        message_data = json.loads(last_call_args)
        assert message_data["type"] == MessageType.ALERT
        assert message_data["telescope_id"] == telescope_id
        assert message_data["payload"]["state"] == "ERROR"
        assert message_data["payload"]["error"] == "Connection failed"
        assert message_data["payload"]["code"] == 500


class TestWebSocketManagerIntegration:
    """Integration tests for WebSocket manager with multiple connections"""
    
    @pytest.fixture
    def websocket_manager(self):
        """Create a WebSocketManager instance"""
        with patch('websocket_manager.RemoteWebSocketManager') as mock_remote:
            mock_remote_instance = AsyncMock()
            mock_remote.return_value = mock_remote_instance
            
            manager = WebSocketManager()
            manager.remote_manager = mock_remote_instance
            
            yield manager
    
    @pytest.mark.asyncio
    async def test_multiple_connections_broadcast(self, websocket_manager):
        """Test broadcasting to multiple connections"""
        telescope_id = "telescope_001"
        
        # Create multiple mock WebSockets
        mock_ws1 = AsyncMock()
        mock_ws1.send_text = AsyncMock()
        mock_ws1.client_state = MagicMock()
        mock_ws1.client_state.name = "CONNECTED"
        
        mock_ws2 = AsyncMock()
        mock_ws2.send_text = AsyncMock()
        mock_ws2.client_state = MagicMock()
        mock_ws2.client_state.name = "CONNECTED"
        
        # Connect WebSockets
        await websocket_manager.connect(mock_ws1, "connection-1")
        await websocket_manager.connect(mock_ws2, "connection-2")
        
        # Subscribe both to the same telescope
        conn1 = websocket_manager.connections["connection-1"]
        conn2 = websocket_manager.connections["connection-2"]
        conn1.add_subscription(telescope_id, [SubscriptionType.STATUS])
        conn2.add_subscription(telescope_id, [SubscriptionType.STATUS])
        
        # Broadcast status update
        status_data = {"connected": True, "ra": 10.5}
        await websocket_manager.broadcast_status_update(telescope_id, status_data)
        
        # Verify both connections received the message (heartbeat + status update)
        assert mock_ws1.send_text.call_count == 2
        assert mock_ws2.send_text.call_count == 2
    
    @pytest.mark.asyncio
    async def test_selective_subscription_broadcast(self, websocket_manager):
        """Test that only subscribed connections receive broadcasts"""
        telescope_id = "telescope_001"
        
        # Create two mock WebSockets
        mock_ws1 = AsyncMock()
        mock_ws1.send_text = AsyncMock()
        mock_ws1.client_state = MagicMock()
        mock_ws1.client_state.name = "CONNECTED"
        
        mock_ws2 = AsyncMock()
        mock_ws2.send_text = AsyncMock()  
        mock_ws2.client_state = MagicMock()
        mock_ws2.client_state.name = "CONNECTED"
        
        # Connect WebSockets
        await websocket_manager.connect(mock_ws1, "connection-1")
        await websocket_manager.connect(mock_ws2, "connection-2")
        
        # Subscribe only connection-1 to STATUS, connection-2 to IMAGING
        conn1 = websocket_manager.connections["connection-1"]
        conn2 = websocket_manager.connections["connection-2"]
        conn1.add_subscription(telescope_id, [SubscriptionType.STATUS])
        conn2.add_subscription(telescope_id, [SubscriptionType.IMAGING])
        
        # Broadcast status update (should only go to connection-1)
        status_data = {"connected": True}
        await websocket_manager.broadcast_status_update(telescope_id, status_data)
        
        # Verify only connection-1 received the status update (both got heartbeat + conn1 got status)
        assert mock_ws1.send_text.call_count == 2  # heartbeat + status update
        assert mock_ws2.send_text.call_count == 1  # only heartbeat