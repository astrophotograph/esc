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
from remote_websocket_client import RemoteWebSocketManager, RemoteController


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
            # Check if WebSocket is still connected
            try:
                if hasattr(self.websocket, 'client_state') and self.websocket.client_state.name != "CONNECTED":
                    logger.warning(f"WebSocket not connected for {self.connection_id}, state: {self.websocket.client_state.name}")
                    self.is_alive = False
                    return False
            except Exception as state_check_error:
                logger.debug(f"Could not check WebSocket state for {self.connection_id}: {state_check_error}")
            
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
        self.remote_clients: Dict[str, str] = {}  # telescope_id -> controller_id mapping
        self.heartbeat_interval = 30  # seconds
        self.heartbeat_task: Optional[asyncio.Task] = None
        self._running = False
        
        # Initialize remote WebSocket manager
        self.remote_manager = RemoteWebSocketManager(self._handle_remote_message)
    
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
        
        # Disconnect all remote controllers
        await self.remote_manager.disconnect_all()
        
        logger.info("WebSocket manager stopped")
    
    async def connect(self, websocket: WebSocket, connection_id: str, skip_accept: bool = False) -> WebSocketConnection:
        """Handle a new WebSocket connection."""
        if not skip_accept:
            try:
                await websocket.accept()
                logger.debug(f"WebSocket accepted for connection: {connection_id}")
            except Exception as e:
                logger.error(f"Failed to accept WebSocket for {connection_id}: {e}")
                raise
        
        connection = WebSocketConnection(websocket, connection_id)
        self.connections[connection_id] = connection
        
        logger.info(f"WebSocket connection established: {connection_id}")
        
        # Wait a moment to ensure connection is fully ready
        await asyncio.sleep(0.1)
        
        # Send initial heartbeat
        try:
            await connection.send_message(HeartbeatMessage())
            logger.debug(f"Sent initial heartbeat to {connection_id}")
        except Exception as e:
            logger.error(f"Failed to send initial heartbeat to {connection_id}: {e}")
        
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
        logger.debug(f"Handling message from {connection_id}: {message_data[:100]}...")
        
        try:
            # Parse JSON message
            data = json.loads(message_data)
            message = MessageFactory.parse_message(data)
            logger.debug(f"Parsed message type: {message.type} from {connection_id}")
            
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
                # Don't echo heartbeat back - each side sends its own heartbeats
                logger.debug(f"Received heartbeat from {connection_id}")
                # Just update the last heartbeat time (already done above)
            else:
                logger.warning(f"Unhandled message type: {message.type}")
        
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON from {connection_id}: {e}")
            # Skip sending error messages to avoid WebSocket issues
            logger.debug(f"Skipping error message send to {connection_id}")
        except Exception as e:
            logger.error(f"Error handling message from {connection_id}: {e}")
            # Skip sending error messages to avoid WebSocket issues
            logger.debug(f"Skipping error message send to {connection_id}")
    
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
    
    async def register_remote_controller(self, controller: RemoteController) -> bool:
        """Register and connect to a remote controller."""
        try:
            success = await self.remote_manager.add_remote_controller(controller)
            if success:
                self.remote_clients[controller.telescope_id] = controller.controller_id
                logger.info(f"Registered remote controller {controller.controller_id} for telescope {controller.telescope_id}")
            return success
        except Exception as e:
            logger.error(f"Failed to register remote controller {controller.controller_id}: {e}")
            return False
    
    async def unregister_remote_controller(self, controller_id: str, telescope_id: str = None):
        """Unregister a remote controller."""
        try:
            await self.remote_manager.remove_remote_controller(controller_id)
            
            # Remove from mapping (find by controller_id if telescope_id not provided)
            if telescope_id:
                self.remote_clients.pop(telescope_id, None)
            else:
                # Find telescope_id by controller_id
                telescope_to_remove = None
                for tid, cid in self.remote_clients.items():
                    if cid == controller_id:
                        telescope_to_remove = tid
                        break
                if telescope_to_remove:
                    self.remote_clients.pop(telescope_to_remove)
                    
            logger.info(f"Unregistered remote controller: {controller_id}")
        except Exception as e:
            logger.error(f"Failed to unregister remote controller {controller_id}: {e}")
    
    def is_telescope_remote(self, telescope_id: str) -> bool:
        """Check if a telescope is managed by a remote controller."""
        return telescope_id in self.remote_clients
    
    def is_telescope_local(self, telescope_id: str) -> bool:
        """Check if a telescope is a local SeestarClient."""
        return telescope_id in self.telescope_clients
    
    async def _handle_remote_message(self, telescope_id: str, message: Dict[str, Any]):
        """Handle messages received from remote controllers."""
        try:
            # Convert to WebSocket message and broadcast to subscribed clients
            if message.get("type") == "status_update":
                status = message.get("payload", {}).get("status", {})
                changes = message.get("payload", {}).get("changes", [])
                await self.broadcast_status_update(telescope_id, status, changes)
            else:
                # Forward other message types as-is
                ws_message = MessageFactory.parse_message(message)
                ws_message.telescope_id = telescope_id
                await self._broadcast_to_subscribers(ws_message, telescope_id, SubscriptionType.ALL)
                
        except Exception as e:
            logger.error(f"Error handling remote message from {telescope_id}: {e}")
    
    async def _handle_control_command(self, connection: WebSocketConnection, message: ControlCommandMessage):
        """Handle control command from client."""
        telescope_id = message.telescope_id
        command_payload = message.payload
        
        if not telescope_id:
            await connection.send_message(
                MessageFactory.create_error("MISSING_TELESCOPE_ID", "Telescope ID is required for control commands")
            )
            return
        
        # Check if telescope is available (either local or remote)
        if not (self.is_telescope_local(telescope_id) or self.is_telescope_remote(telescope_id)):
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
            action = command_payload["action"]
            parameters = command_payload.get("parameters", {})
            
            # Route command to appropriate handler
            if self.is_telescope_local(telescope_id):
                # Execute on local telescope client
                client = self.telescope_clients[telescope_id]
                result = await self._execute_telescope_command(client, action, parameters)
            else:
                # Forward to remote controller
                result = await self._execute_remote_command(telescope_id, message)
            
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
        logger.info(f"Executing command: {action} with parameters: {parameters}")
        
        try:
            if action == "move":
                return await self._execute_move_command(client, parameters)
            elif action == "park":
                return await self._execute_park_command(client, parameters)
            elif action == "focus_increment":
                return await self._execute_focus_command(client, parameters)
            else:
                logger.warning(f"Unknown command action: {action}")
                return {"status": "error", "message": f"Unknown action: {action}"}
                
        except Exception as e:
            logger.error(f"Error executing telescope command {action}: {e}")
            return {"status": "error", "message": str(e)}
    
    async def _execute_remote_command(self, telescope_id: str, message: ControlCommandMessage) -> Dict[str, Any]:
        """Execute a command on a remote telescope via its controller."""
        try:
            # Convert WebSocket message to dict for remote transmission
            remote_message = {
                "id": message.id,
                "type": message.type.value,
                "telescope_id": telescope_id,
                "timestamp": message.timestamp,
                "payload": message.payload
            }
            
            # Send to remote controller and wait for response
            response = await self.remote_manager.send_to_telescope(telescope_id, remote_message)
            
            if response and response.get("type") == "command_response":
                payload = response.get("payload", {})
                if payload.get("success"):
                    return payload.get("result", {"status": "success"})
                else:
                    raise Exception(payload.get("error", "Remote command failed"))
            else:
                return {"status": "success", "response": "Command sent to remote controller"}
                
        except Exception as e:
            logger.error(f"Error executing remote command on {telescope_id}: {e}")
            raise
    
    async def _execute_move_command(self, client: Any, parameters: Dict[str, Any]) -> Dict[str, Any]:
        """Execute telescope movement command."""
        direction = parameters.get("direction", "").lower()
        
        # Map WebSocket directions to telescope angles (degrees)
        # Adjusted for 90-degree rotation based on actual telescope behavior
        direction_angles = {
            "north": 90,   # Swapped with south
            "east": 0,     # Correct
            "south": 270,  # Swapped with north  
            "west": 180,   # Correct
            "stop": None
        }
        
        if direction not in direction_angles:
            return {"status": "error", "message": f"Invalid direction: {direction}"}
        
        try:
            if direction == "stop":
                # Stop movement by sending 0 percent
                from smarttel.seestar.commands.parameterized import ScopeSpeedMove, ScopeSpeedMoveParameters
                command = ScopeSpeedMove(
                    params=ScopeSpeedMoveParameters(
                        angle=0,  # Direction doesn't matter for stop
                        level=1,  # Speed level
                        dur_sec=1,  # Duration
                        percent=0  # 0 percent means stop
                    )
                )
            else:
                # Move in specified direction
                from smarttel.seestar.commands.parameterized import ScopeSpeedMove, ScopeSpeedMoveParameters
                command = ScopeSpeedMove(
                    params=ScopeSpeedMoveParameters(
                        angle=direction_angles[direction],
                        level=2,  # Medium speed level
                        dur_sec=5,  # Move for 5 seconds
                        percent=100  # 100% speed
                    )
                )
            
            # Send command to telescope
            
            # Start position monitoring task (like in main.py)
            if direction != "stop":
                async def _fetch_position():
                    """Fetch the current position from the scope."""
                    try:
                        # Fetch the position after movement has stopped...
                        await asyncio.sleep(0.25)
                        await client.update_current_coords()
                    except Exception as e:
                        logger.error(f"Error fetching position: {e}")
                
                import asyncio
                asyncio.create_task(_fetch_position())
            
            response = await client.send_and_recv(command)
            
            if response:
                return {"status": "success", "action": "move", "direction": direction, "response": response.model_dump() if hasattr(response, 'model_dump') else str(response)}
            else:
                return {"status": "success", "action": "move", "direction": direction, "response": "No response"}
                
        except Exception as e:
            logger.error(f"Error executing move command: {e}")
            return {"status": "error", "message": str(e)}
    
    async def _execute_park_command(self, client: Any, parameters: Dict[str, Any]) -> Dict[str, Any]:
        """Execute telescope park command."""
        try:
            from smarttel.seestar.commands.simple import ScopePark
            
            # Start position monitoring task (like in main.py)
            async def _position_updater():
                """Fetch the current position from the scope until it stops moving."""
                await asyncio.sleep(0.5)
                while await client.update_current_coords():
                    await asyncio.sleep(0.5)
            
            import asyncio
            asyncio.create_task(_position_updater())
            
            response = await client.send_and_recv(ScopePark())
            
            if response:
                return {"status": "success", "action": "park", "response": response.model_dump() if hasattr(response, 'model_dump') else str(response)}
            else:
                return {"status": "success", "action": "park", "response": "No response"}
                
        except Exception as e:
            logger.error(f"Error executing park command: {e}")
            return {"status": "error", "message": str(e)}
    
    async def _execute_focus_command(self, client: Any, parameters: Dict[str, Any]) -> Dict[str, Any]:
        """Execute focuser movement command."""
        increment = parameters.get("increment", 0)
        
        try:
            # Get current focus position from status (like in main.py)
            current_position = client.status.focus_position
            if current_position is None:
                logger.warning("Current focus position unknown, using increment as absolute position")
                new_position = abs(increment)  # Fallback to using increment as absolute
            else:
                new_position = current_position + increment
            
            from smarttel.seestar.commands.parameterized import MoveFocuser, MoveFocuserParameters
            command = MoveFocuser(
                params=MoveFocuserParameters(
                    step=new_position,  # Use absolute position, not increment
                    ret_step=True
                )
            )
            
            response = await client.send_and_recv(command)
            
            # Update status with new position (like in main.py)
            if response is not None and hasattr(response, 'result') and response.result is not None:
                if isinstance(response.result, dict) and 'step' in response.result:
                    client.status.focus_position = response.result['step']
            
            if response:
                return {
                    "status": "success", 
                    "action": "focus_increment", 
                    "increment": increment,
                    "new_position": new_position,
                    "previous_position": current_position,
                    "response": response.model_dump() if hasattr(response, 'model_dump') else str(response)
                }
            else:
                return {
                    "status": "success", 
                    "action": "focus_increment", 
                    "increment": increment,
                    "new_position": new_position,
                    "previous_position": current_position,
                    "response": "No response"
                }
                
        except Exception as e:
            logger.error(f"Error executing focus command: {e}")
            return {"status": "error", "message": str(e)}
    
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