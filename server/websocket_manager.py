"""
WebSocket connection manager for telescope control.

This module manages WebSocket connections, handles message routing,
and coordinates between telescope clients and web clients.
"""

import asyncio
import json
import logging
from typing import Dict, List, Set, Optional, Any
from weakref import WeakSet

from fastapi import WebSocket, WebSocketDisconnect
from loguru import logger

from websocket_protocol import (
    WebSocketMessage, MessageFactory, MessageType, SubscriptionType,
    StatusUpdateMessage, ControlCommandMessage, CommandResponseMessage,
    HeartbeatMessage, ErrorMessage, SubscribeMessage, UnsubscribeMessage
)


class WebSocketConnection:
    """Represents a single WebSocket connection from a client."""
    
    def __init__(self, websocket: WebSocket, connection_id: str):
        self.websocket = websocket
        self.connection_id = connection_id
        self.subscriptions: Dict[str, Set[SubscriptionType]] = {}  # telescope_id -> subscription_types
        self.is_alive = True
        self.last_heartbeat = asyncio.get_event_loop().time()
    
    async def send_message(self, message: WebSocketMessage) -> bool:
        """Send a message to the client. Returns True if successful."""
        if not self.is_alive:
            return False
        
        try:
            await self.websocket.send_text(message.model_dump_json())
            return True
        except Exception as e:
            logger.error(f"Failed to send message to {self.connection_id}: {e}")
            self.is_alive = False
            return False
    
    def is_subscribed_to(self, telescope_id: str, subscription_type: SubscriptionType) -> bool:
        """Check if this connection is subscribed to updates for a telescope."""
        if telescope_id not in self.subscriptions:
            return False
        
        telescope_subs = self.subscriptions[telescope_id]
        return (SubscriptionType.ALL in telescope_subs or 
                subscription_type in telescope_subs)
    
    def add_subscription(self, telescope_id: str, subscription_types: List[SubscriptionType]):
        """Add subscriptions for a telescope."""
        if telescope_id not in self.subscriptions:
            self.subscriptions[telescope_id] = set()
        
        self.subscriptions[telescope_id].update(subscription_types)
        logger.debug(f"Connection {self.connection_id} subscribed to {subscription_types} for telescope {telescope_id}")
    
    def remove_subscription(self, telescope_id: str, subscription_types: List[SubscriptionType]):
        """Remove subscriptions for a telescope."""
        if telescope_id not in self.subscriptions:
            return
        
        self.subscriptions[telescope_id].difference_update(subscription_types)
        
        # Remove telescope entry if no subscriptions remain
        if not self.subscriptions[telescope_id]:
            del self.subscriptions[telescope_id]
        
        logger.debug(f"Connection {self.connection_id} unsubscribed from {subscription_types} for telescope {telescope_id}")


class WebSocketManager:
    """Manages all WebSocket connections and message routing."""
    
    def __init__(self):
        self.connections: Dict[str, WebSocketConnection] = {}
        self.telescope_clients: Dict[str, Any] = {}  # telescope_id -> SeestarClient
        self.heartbeat_interval = 30  # seconds
        self.heartbeat_task: Optional[asyncio.Task] = None
        self._running = False
    
    async def start(self):
        """Start the WebSocket manager and background tasks."""
        if self._running:
            return
        
        self._running = True
        self.heartbeat_task = asyncio.create_task(self._heartbeat_loop())
        logger.info("WebSocket manager started")
    
    async def stop(self):
        """Stop the WebSocket manager and clean up resources."""
        self._running = False
        
        if self.heartbeat_task:
            self.heartbeat_task.cancel()
            try:
                await self.heartbeat_task
            except asyncio.CancelledError:
                pass
        
        # Close all connections
        for connection in list(self.connections.values()):
            await self.disconnect(connection.connection_id)
        
        logger.info("WebSocket manager stopped")
    
    async def connect(self, websocket: WebSocket, connection_id: str) -> WebSocketConnection:
        """Handle a new WebSocket connection."""
        await websocket.accept()
        
        connection = WebSocketConnection(websocket, connection_id)
        self.connections[connection_id] = connection
        
        logger.info(f"WebSocket connection established: {connection_id}")
        
        # Send initial heartbeat
        await connection.send_message(HeartbeatMessage())
        
        return connection
    
    async def disconnect(self, connection_id: str):
        """Handle WebSocket disconnection."""
        if connection_id not in self.connections:
            return
        
        connection = self.connections[connection_id]
        connection.is_alive = False
        
        try:
            await connection.websocket.close()
        except Exception as e:
            logger.debug(f"Error closing WebSocket {connection_id}: {e}")
        
        del self.connections[connection_id]
        logger.info(f"WebSocket connection closed: {connection_id}")
    
    async def handle_message(self, connection_id: str, message_data: str):
        """Handle incoming message from a WebSocket client."""
        if connection_id not in self.connections:
            logger.warning(f"Received message from unknown connection: {connection_id}")
            return
        
        connection = self.connections[connection_id]
        
        try:
            # Parse JSON message
            data = json.loads(message_data)
            message = MessageFactory.parse_message(data)
            
            # Update heartbeat
            connection.last_heartbeat = asyncio.get_event_loop().time()
            
            # Route message based on type
            if isinstance(message, ControlCommandMessage):
                await self._handle_control_command(connection, message)
            elif isinstance(message, SubscribeMessage):
                await self._handle_subscribe(connection, message)
            elif isinstance(message, UnsubscribeMessage):
                await self._handle_unsubscribe(connection, message)
            elif isinstance(message, HeartbeatMessage):
                # Echo heartbeat back
                await connection.send_message(HeartbeatMessage())
            else:
                logger.warning(f"Unhandled message type: {message.type}")
        
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON from {connection_id}: {e}")
            await connection.send_message(
                MessageFactory.create_error("INVALID_JSON", f"Invalid JSON: {e}")
            )
        except Exception as e:
            logger.error(f"Error handling message from {connection_id}: {e}")
            await connection.send_message(
                MessageFactory.create_error("MESSAGE_ERROR", f"Error processing message: {e}")
            )
    
    async def broadcast_status_update(self, telescope_id: str, status: Dict[str, Any], 
                                    changes: Optional[List[str]] = None):
        """Broadcast status update to all subscribed clients."""
        message = StatusUpdateMessage(telescope_id=telescope_id, status=status, changes=changes)
        
        # Send to all subscribed connections
        for connection in self.connections.values():
            if connection.is_subscribed_to(telescope_id, SubscriptionType.STATUS):
                await connection.send_message(message)
    
    async def broadcast_telescope_discovered(self, telescope_info: Dict[str, Any]):
        """Broadcast telescope discovery to all connections."""
        message = MessageFactory.create_telescope_discovered(telescope_info)
        
        for connection in self.connections.values():
            await connection.send_message(message)
    
    async def broadcast_telescope_lost(self, telescope_id: str, reason: str = "Connection lost"):
        """Broadcast telescope loss to all connections."""
        message = MessageFactory.create_telescope_lost(telescope_id, reason)
        
        for connection in self.connections.values():
            await connection.send_message(message)
    
    def register_telescope_client(self, telescope_id: str, client: Any):
        """Register a telescope client for command execution."""
        self.telescope_clients[telescope_id] = client
        logger.info(f"Registered telescope client: {telescope_id}")
    
    def unregister_telescope_client(self, telescope_id: str):
        """Unregister a telescope client."""
        if telescope_id in self.telescope_clients:
            del self.telescope_clients[telescope_id]
            logger.info(f"Unregistered telescope client: {telescope_id}")
    
    async def _handle_control_command(self, connection: WebSocketConnection, message: ControlCommandMessage):
        """Handle control command from client."""
        telescope_id = message.telescope_id
        command_payload = message.payload
        
        if not telescope_id:
            await connection.send_message(
                MessageFactory.create_error("MISSING_TELESCOPE_ID", "Telescope ID is required for control commands")
            )
            return
        
        if telescope_id not in self.telescope_clients:
            await connection.send_message(
                MessageFactory.create_command_response(
                    telescope_id=telescope_id,
                    command_id=message.id,
                    success=False,
                    error=f"Telescope {telescope_id} not available"
                )
            )
            return
        
        try:
            # Execute command on telescope client
            client = self.telescope_clients[telescope_id]
            action = command_payload["action"]
            parameters = command_payload.get("parameters", {})
            
            # Map WebSocket actions to telescope client methods
            result = await self._execute_telescope_command(client, action, parameters)
            
            # Send response back to client
            await connection.send_message(
                MessageFactory.create_command_response(
                    telescope_id=telescope_id,
                    command_id=message.id,
                    success=True,
                    result=result
                )
            )
            
        except Exception as e:
            logger.error(f"Error executing command {command_payload['action']} on {telescope_id}: {e}")
            await connection.send_message(
                MessageFactory.create_command_response(
                    telescope_id=telescope_id,
                    command_id=message.id,
                    success=False,
                    error=str(e)
                )
            )
    
    async def _execute_telescope_command(self, client: Any, action: str, parameters: Dict[str, Any]) -> Dict[str, Any]:
        """Execute a command on the telescope client."""
        # This will be implemented based on the specific SeestarClient interface
        # For now, return a placeholder response
        logger.info(f"Executing command: {action} with parameters: {parameters}")
        
        # TODO: Implement actual command execution based on SeestarClient methods
        return {"status": "executed", "action": action, "parameters": parameters}
    
    async def _handle_subscribe(self, connection: WebSocketConnection, message: SubscribeMessage):
        """Handle subscription request from client."""
        payload = message.payload
        telescope_id = message.telescope_id
        subscription_types = [SubscriptionType(t) for t in payload.get("subscription_types", [SubscriptionType.ALL])]
        
        if payload.get("all_telescopes", False):
            # Subscribe to all telescopes
            for tid in self.telescope_clients.keys():
                connection.add_subscription(tid, subscription_types)
        elif telescope_id:
            connection.add_subscription(telescope_id, subscription_types)
        else:
            await connection.send_message(
                MessageFactory.create_error("INVALID_SUBSCRIPTION", "Must specify telescope_id or all_telescopes")
            )
    
    async def _handle_unsubscribe(self, connection: WebSocketConnection, message: UnsubscribeMessage):
        """Handle unsubscription request from client."""
        payload = message.payload
        telescope_id = message.telescope_id
        subscription_types = [SubscriptionType(t) for t in payload.get("subscription_types", [SubscriptionType.ALL])]
        
        if payload.get("all_telescopes", False):
            # Unsubscribe from all telescopes
            for tid in list(connection.subscriptions.keys()):
                connection.remove_subscription(tid, subscription_types)
        elif telescope_id:
            connection.remove_subscription(telescope_id, subscription_types)
    
    async def _heartbeat_loop(self):
        """Background task to send heartbeats and check connection health."""
        while self._running:
            try:
                current_time = asyncio.get_event_loop().time()
                dead_connections = []
                
                for connection_id, connection in self.connections.items():
                    # Check if connection is stale
                    if current_time - connection.last_heartbeat > self.heartbeat_interval * 2:
                        logger.warning(f"Connection {connection_id} appears dead (no heartbeat)")
                        dead_connections.append(connection_id)
                        continue
                    
                    # Send heartbeat
                    if not await connection.send_message(HeartbeatMessage()):
                        dead_connections.append(connection_id)
                
                # Clean up dead connections
                for connection_id in dead_connections:
                    await self.disconnect(connection_id)
                
                await asyncio.sleep(self.heartbeat_interval)
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in heartbeat loop: {e}")
                await asyncio.sleep(5)  # Wait before retrying


# Global WebSocket manager instance
websocket_manager = WebSocketManager()