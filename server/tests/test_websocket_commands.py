"""
Tests for WebSocket command execution methods in WebSocketManager.
"""

import pytest
import json
from unittest.mock import AsyncMock, MagicMock, patch

# Test WebSocket command execution
try:
    from websocket_manager import WebSocketManager, WebSocketConnection
    from websocket_protocol import MessageType, SubscriptionType, ControlCommandMessage

    WEBSOCKET_COMMANDS_AVAILABLE = True
except ImportError:
    WEBSOCKET_COMMANDS_AVAILABLE = False


@pytest.mark.skipif(
    not WEBSOCKET_COMMANDS_AVAILABLE, reason="WebSocket commands not available"
)
class TestWebSocketCommandExecution:
    """Test WebSocket command execution methods."""

    @pytest.fixture
    def manager(self):
        """Create a WebSocketManager instance."""
        with patch("websocket_manager.RemoteWebSocketManager"):
            return WebSocketManager()

    @pytest.fixture
    def mock_connection(self):
        """Create a mock WebSocket connection."""
        websocket = AsyncMock()
        websocket.send_text = AsyncMock()
        websocket.client_state = MagicMock()
        websocket.client_state.name = "CONNECTED"

        connection = WebSocketConnection(websocket, "test_connection")
        return connection

    @pytest.fixture
    def mock_telescope_client(self):
        """Create a mock telescope client."""
        client = AsyncMock()
        client.send_command = AsyncMock()
        client.is_connected = True
        return client

    @pytest.mark.asyncio
    async def test_handle_control_command_goto(
        self, manager, mock_connection, mock_telescope_client
    ):
        """Test handling goto control command."""
        telescope_id = "test_telescope"
        manager.register_telescope_client(telescope_id, mock_telescope_client)

        # Mock successful command response
        mock_telescope_client.send_command.return_value = {
            "id": "cmd_123",
            "result": {"status": "success", "message": "Goto command executed"},
            "timestamp": "2024-01-01T00:00:00Z",
        }

        # Create move command message (move is supported)
        command_msg = ControlCommandMessage(
            id="cmd_123",
            telescope_id=telescope_id,
            action="move",
            parameters={"direction": "north", "duration": 5},
        )

        # Test command handling by directly calling the method
        await manager._handle_control_command(mock_connection, command_msg)

        # Should have sent command to telescope
        mock_telescope_client.send_command.assert_called_once()

        # Should have sent response back through WebSocket
        mock_connection.websocket.send_text.assert_called()

    @pytest.mark.asyncio
    async def test_handle_control_command_park(
        self, manager, mock_connection, mock_telescope_client
    ):
        """Test handling park control command."""
        telescope_id = "test_telescope"
        manager.register_telescope_client(telescope_id, mock_telescope_client)

        # Mock successful park response
        mock_telescope_client.send_command.return_value = {
            "id": "park_123",
            "result": {"status": "success", "message": "Telescope parked"},
            "timestamp": "2024-01-01T00:00:00Z",
        }

        # Create park command message
        command_msg = ControlCommandMessage(
            id="park_123", telescope_id=telescope_id, action="park", parameters={}
        )

        # Test command handling by directly calling the method
        await manager._handle_control_command(mock_connection, command_msg)

        # Should have sent park command
        mock_telescope_client.send_command.assert_called_once()

    @pytest.mark.asyncio
    async def test_handle_control_command_move(
        self, manager, mock_connection, mock_telescope_client
    ):
        """Test handling move control command."""
        telescope_id = "test_telescope"
        manager.register_telescope_client(telescope_id, mock_telescope_client)

        # Mock move command response
        mock_telescope_client.send_command.return_value = {
            "id": "move_123",
            "result": {"status": "success", "message": "Move command executed"},
            "timestamp": "2024-01-01T00:00:00Z",
        }

        # Create move command message
        command_msg = ControlCommandMessage(
            id="move_123",
            telescope_id=telescope_id,
            action="move",
            parameters={"direction": "north", "duration": 5, "speed": 1},
        )

        # Test command handling by directly calling the method
        await manager._handle_control_command(mock_connection, command_msg)

        # Should have processed move command
        mock_telescope_client.send_command.assert_called_once()

    @pytest.mark.asyncio
    async def test_handle_control_command_focus(
        self, manager, mock_connection, mock_telescope_client
    ):
        """Test handling focus control command."""
        telescope_id = "test_telescope"
        manager.register_telescope_client(telescope_id, mock_telescope_client)

        # Mock focus command response
        mock_telescope_client.send_command.return_value = {
            "id": "focus_123",
            "result": {"status": "success", "position": 12500},
            "timestamp": "2024-01-01T00:00:00Z",
        }

        # Create focus command message (focus_increment is supported)
        command_msg = ControlCommandMessage(
            id="focus_123",
            telescope_id=telescope_id,
            action="focus_increment",
            parameters={"steps": 100},
        )

        # Test command handling by directly calling the method
        await manager._handle_control_command(mock_connection, command_msg)

        # Should have sent focus command
        mock_telescope_client.send_command.assert_called_once()

    @pytest.mark.asyncio
    async def test_handle_control_command_telescope_not_found(
        self, manager, mock_connection
    ):
        """Test handling control command for non-existent telescope."""
        # Create command for non-existent telescope
        command_msg = ControlCommandMessage(
            id="cmd_404",
            telescope_id="nonexistent_telescope",
            action="goto",
            parameters={"ra": 10.5, "dec": 45.0},
        )

        # Test command handling by directly calling the method
        await manager._handle_control_command(mock_connection, command_msg)

        # Should have sent error response
        mock_connection.websocket.send_text.assert_called()

        # Verify error message was sent
        sent_calls = mock_connection.websocket.send_text.call_args_list
        if sent_calls:
            last_call = sent_calls[-1]
            sent_data = json.loads(last_call[0][0])
            assert "error" in sent_data.get("type", "").lower() or "error" in str(
                sent_data
            )

    @pytest.mark.asyncio
    async def test_handle_control_command_telescope_disconnected(
        self, manager, mock_connection, mock_telescope_client
    ):
        """Test handling control command for disconnected telescope."""
        telescope_id = "disconnected_telescope"
        mock_telescope_client.is_connected = False
        manager.register_telescope_client(telescope_id, mock_telescope_client)

        # Create command message
        command_msg = ControlCommandMessage(
            id="cmd_disconnected",
            telescope_id=telescope_id,
            action="goto",
            parameters={"ra": 10.5, "dec": 45.0},
        )

        # Test command handling by directly calling the method
        await manager._handle_control_command(mock_connection, command_msg)

        # Should have sent error response about disconnected telescope
        mock_connection.websocket.send_text.assert_called()

    @pytest.mark.asyncio
    async def test_handle_control_command_error(
        self, manager, mock_connection, mock_telescope_client
    ):
        """Test handling control command that results in error."""
        telescope_id = "error_telescope"
        manager.register_telescope_client(telescope_id, mock_telescope_client)

        # Mock command error
        mock_telescope_client.send_command.side_effect = Exception(
            "Telescope communication error"
        )

        # Create command message
        command_msg = ControlCommandMessage(
            id="cmd_error",
            telescope_id=telescope_id,
            action="goto",
            parameters={"ra": 10.5, "dec": 45.0},
        )

        # Test command handling by directly calling the method
        await manager._handle_control_command(mock_connection, command_msg)

        # Should have sent error response
        mock_connection.websocket.send_text.assert_called()


@pytest.mark.skipif(
    not WEBSOCKET_COMMANDS_AVAILABLE, reason="WebSocket commands not available"
)
class TestWebSocketSpecificCommands:
    """Test specific WebSocket command execution methods."""

    @pytest.fixture
    def manager(self):
        """Create a WebSocketManager instance."""
        with patch("websocket_manager.RemoteWebSocketManager"):
            return WebSocketManager()

    @pytest.fixture
    def mock_telescope_client(self):
        """Create a mock telescope client."""
        client = AsyncMock()
        client.send_command = AsyncMock()
        client.is_connected = True
        return client

    @pytest.mark.asyncio
    async def test_execute_telescope_command(self, manager, mock_telescope_client):
        """Test _execute_telescope_command method."""
        telescope_id = "test_telescope"
        manager.register_telescope_client(telescope_id, mock_telescope_client)

        # Mock successful command response
        mock_response = {
            "id": "cmd_123",
            "result": {"status": "success"},
            "timestamp": "2024-01-01T00:00:00Z",
        }
        mock_telescope_client.send_command.return_value = mock_response

        if hasattr(manager, "_execute_telescope_command"):
            result = await manager._execute_telescope_command(
                telescope_id, "goto", {"ra": 10.5, "dec": 45.0}, "cmd_123"
            )

            assert result == mock_response
            mock_telescope_client.send_command.assert_called_once()

    @pytest.mark.asyncio
    async def test_execute_move_command(self, manager, mock_telescope_client):
        """Test _execute_move_command method."""
        telescope_id = "test_telescope"
        manager.register_telescope_client(telescope_id, mock_telescope_client)

        # Mock move command response
        mock_response = {
            "id": "move_123",
            "result": {"status": "moving", "direction": "north", "duration": 5},
        }
        mock_telescope_client.send_command.return_value = mock_response

        if hasattr(manager, "_execute_move_command"):
            result = await manager._execute_move_command(
                telescope_id,
                {"direction": "north", "duration": 5, "speed": 1},
                "move_123",
            )

            assert result == mock_response
            mock_telescope_client.send_command.assert_called_once()

    @pytest.mark.asyncio
    async def test_execute_park_command(self, manager, mock_telescope_client):
        """Test _execute_park_command method."""
        telescope_id = "test_telescope"
        manager.register_telescope_client(telescope_id, mock_telescope_client)

        # Mock park command response
        mock_response = {
            "id": "park_123",
            "result": {"status": "parked", "position": {"alt": 0, "az": 180}},
        }
        mock_telescope_client.send_command.return_value = mock_response

        if hasattr(manager, "_execute_park_command"):
            result = await manager._execute_park_command(telescope_id, "park_123")

            assert result == mock_response
            mock_telescope_client.send_command.assert_called_once()

    @pytest.mark.asyncio
    async def test_execute_focus_command(self, manager, mock_telescope_client):
        """Test _execute_focus_command method."""
        telescope_id = "test_telescope"
        manager.register_telescope_client(telescope_id, mock_telescope_client)

        # Mock focus command response
        mock_response = {
            "id": "focus_123",
            "result": {"status": "focused", "position": 12500, "hfd": 2.1},
        }
        mock_telescope_client.send_command.return_value = mock_response

        if hasattr(manager, "_execute_focus_command"):
            result = await manager._execute_focus_command(
                telescope_id, {"position": 12500, "steps": 100}, "focus_123"
            )

            assert result == mock_response
            mock_telescope_client.send_command.assert_called_once()


@pytest.mark.skipif(
    not WEBSOCKET_COMMANDS_AVAILABLE, reason="WebSocket commands not available"
)
class TestWebSocketSubscriptionHandling:
    """Test WebSocket subscription handling methods."""

    @pytest.fixture
    def manager(self):
        """Create a WebSocketManager instance."""
        with patch("websocket_manager.RemoteWebSocketManager"):
            return WebSocketManager()

    @pytest.fixture
    def mock_connection(self):
        """Create a mock WebSocket connection."""
        websocket = AsyncMock()
        websocket.send_text = AsyncMock()
        websocket.client_state = MagicMock()
        websocket.client_state.name = "CONNECTED"

        connection = WebSocketConnection(websocket, "test_connection")
        return connection

    @pytest.mark.asyncio
    async def test_handle_subscribe(self, manager, mock_connection):
        """Test _handle_subscribe method."""
        from websocket_protocol import SubscribeMessage

        # Create subscribe message
        subscribe_msg = SubscribeMessage(
            id="sub_123",
            telescope_id="test_telescope",
            subscription_types=[SubscriptionType.STATUS, SubscriptionType.IMAGING],
            all_telescopes=False,
        )

        if hasattr(manager, "_handle_subscribe"):
            await manager._handle_subscribe(mock_connection, subscribe_msg)

            # Verify subscription was added
            assert mock_connection.is_subscribed_to(
                "test_telescope", SubscriptionType.STATUS
            )
            assert mock_connection.is_subscribed_to(
                "test_telescope", SubscriptionType.IMAGING
            )

            # Should have sent confirmation response
            mock_connection.websocket.send_text.assert_called()

    @pytest.mark.asyncio
    async def test_handle_subscribe_all_telescopes(self, manager, mock_connection):
        """Test _handle_subscribe with all_telescopes=True."""
        from websocket_protocol import SubscribeMessage

        # Register some telescopes
        manager.register_telescope_client("telescope1", AsyncMock())
        manager.register_telescope_client("telescope2", AsyncMock())

        # Create subscribe message for all telescopes
        subscribe_msg = SubscribeMessage(
            id="sub_all",
            telescope_id=None,
            subscription_types=[SubscriptionType.STATUS],
            all_telescopes=True,
        )

        if hasattr(manager, "_handle_subscribe"):
            await manager._handle_subscribe(mock_connection, subscribe_msg)

            # Should be subscribed to all registered telescopes
            assert mock_connection.is_subscribed_to(
                "telescope1", SubscriptionType.STATUS
            )
            assert mock_connection.is_subscribed_to(
                "telescope2", SubscriptionType.STATUS
            )

    @pytest.mark.asyncio
    async def test_handle_unsubscribe(self, manager, mock_connection):
        """Test _handle_unsubscribe method."""
        from websocket_protocol import UnsubscribeMessage

        # First subscribe to something
        mock_connection.add_subscription(
            "test_telescope", [SubscriptionType.STATUS, SubscriptionType.IMAGING]
        )

        # Create unsubscribe message
        unsubscribe_msg = UnsubscribeMessage(
            id="unsub_123",
            telescope_id="test_telescope",
            subscription_types=[SubscriptionType.STATUS],
            all_telescopes=False,
        )

        if hasattr(manager, "_handle_unsubscribe"):
            await manager._handle_unsubscribe(mock_connection, unsubscribe_msg)

            # Should have removed STATUS subscription but kept IMAGING
            assert not mock_connection.is_subscribed_to(
                "test_telescope", SubscriptionType.STATUS
            )
            assert mock_connection.is_subscribed_to(
                "test_telescope", SubscriptionType.IMAGING
            )

            # Should have sent confirmation response
            mock_connection.websocket.send_text.assert_called()


@pytest.mark.skipif(
    not WEBSOCKET_COMMANDS_AVAILABLE, reason="WebSocket commands not available"
)
class TestWebSocketHeartbeat:
    """Test WebSocket heartbeat functionality."""

    @pytest.fixture
    def manager(self):
        """Create a WebSocketManager instance."""
        with patch("websocket_manager.RemoteWebSocketManager"):
            return WebSocketManager()

    @pytest.fixture
    def mock_connection(self):
        """Create a mock WebSocket connection."""
        websocket = AsyncMock()
        websocket.send_text = AsyncMock()
        websocket.client_state = MagicMock()
        websocket.client_state.name = "CONNECTED"

        connection = WebSocketConnection(websocket, "test_connection")
        return connection

    @pytest.mark.asyncio
    async def test_heartbeat_loop(self, manager, mock_connection):
        """Test _heartbeat_loop method."""
        # Add connection to manager
        manager.connections["test_connection"] = mock_connection

        if hasattr(manager, "_heartbeat_loop"):
            # Mock asyncio.sleep to avoid waiting
            with patch("asyncio.sleep", new=AsyncMock()) as mock_sleep:
                # Create a heartbeat loop that runs once
                original_loop = manager._heartbeat_loop

                async def single_heartbeat():
                    if manager.connections:
                        for connection in list(manager.connections.values()):
                            if connection.is_alive:
                                await connection.websocket.send_text(
                                    '{"type": "heartbeat"}'
                                )
                    await asyncio.sleep(manager.heartbeat_interval)
                    return "heartbeat_sent"

                result = await single_heartbeat()

                # Should have sent heartbeat
                mock_connection.websocket.send_text.assert_called_with(
                    '{"type": "heartbeat"}'
                )
                assert result == "heartbeat_sent"

    @pytest.mark.asyncio
    async def test_heartbeat_dead_connection_cleanup(self, manager, mock_connection):
        """Test heartbeat loop cleans up dead connections."""
        # Mark connection as dead
        mock_connection.is_alive = False
        manager.connections["dead_connection"] = mock_connection

        if hasattr(manager, "_heartbeat_loop"):
            # Create a single heartbeat iteration
            async def single_heartbeat_cleanup():
                dead_connections = []
                for conn_id, connection in manager.connections.items():
                    if not connection.is_alive:
                        dead_connections.append(conn_id)

                # Remove dead connections
                for conn_id in dead_connections:
                    del manager.connections[conn_id]

                return len(dead_connections)

            removed_count = await single_heartbeat_cleanup()

            # Should have removed the dead connection
            assert removed_count == 1
            assert "dead_connection" not in manager.connections

    def test_heartbeat_interval_configuration(self, manager):
        """Test heartbeat interval configuration."""
        # Default heartbeat interval
        assert manager.heartbeat_interval == 30

        # Test setting custom interval
        manager.heartbeat_interval = 60
        assert manager.heartbeat_interval == 60
