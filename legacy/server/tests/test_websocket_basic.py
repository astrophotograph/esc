"""
Basic tests for WebSocket components.
Part of Phase 1: Critical Path Testing - WebSocket component testing
"""

import pytest
from unittest.mock import MagicMock, patch

from websocket_protocol import (
    MessageType,
    CommandAction,
    SubscriptionType,
    WebSocketMessage,
    StatusUpdateMessage,
)


class TestWebSocketProtocolBasics:
    """Test basic WebSocket protocol functionality"""
    
    def test_message_types_exist(self):
        """Test that message types are defined"""
        assert MessageType.STATUS_UPDATE == "status_update"
        assert MessageType.HEARTBEAT == "heartbeat"
        assert MessageType.ERROR == "error"
        assert MessageType.CONTROL_COMMAND == "control_command"
    
    def test_command_actions_exist(self):
        """Test that command actions are defined"""
        assert CommandAction.GOTO == "goto"
        assert CommandAction.START_IMAGING == "start_imaging"
        assert CommandAction.STOP_IMAGING == "stop_imaging"
        assert CommandAction.FOCUS == "focus"
    
    def test_subscription_types_exist(self):
        """Test that subscription types are defined"""
        assert SubscriptionType.ALL == "all"
        assert SubscriptionType.STATUS == "status"
        assert SubscriptionType.IMAGING == "imaging"
        assert SubscriptionType.POSITION == "position"
    
    def test_websocket_message_creation(self):
        """Test creating a basic WebSocket message"""
        message = WebSocketMessage(
            type=MessageType.HEARTBEAT,
            telescope_id="test_telescope"
        )
        
        assert message.type == MessageType.HEARTBEAT
        assert message.telescope_id == "test_telescope"
        assert isinstance(message.id, str)
        assert isinstance(message.timestamp, (int, float))
    
    def test_status_update_message_creation(self):
        """Test creating a status update message"""
        status_data = {"connected": True, "ra": 10.5}
        
        message = StatusUpdateMessage(
            telescope_id="test_telescope",
            status=status_data
        )
        
        assert message.type == MessageType.STATUS_UPDATE
        assert message.telescope_id == "test_telescope"
        assert message.payload["status"] == status_data


class TestWebSocketManager:
    """Test basic WebSocket manager functionality"""
    
    def test_websocket_manager_import(self):
        """Test that WebSocket manager can be imported"""
        from websocket_manager import WebSocketManager, get_websocket_manager
        
        # Basic smoke test
        assert WebSocketManager is not None
        assert get_websocket_manager is not None
    
    def test_websocket_connection_import(self):
        """Test that WebSocket connection can be imported"""
        from websocket_manager import WebSocketConnection
        
        # Basic smoke test
        assert WebSocketConnection is not None


class TestWebSocketRouter:
    """Test basic WebSocket router functionality"""
    
    def test_websocket_router_import(self):
        """Test that WebSocket router can be imported"""
        from websocket_router import get_websocket_manager_global, WebSocketManagerProxy
        
        # Basic smoke test
        assert get_websocket_manager_global is not None
        assert WebSocketManagerProxy is not None