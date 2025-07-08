"""
Remote WebSocket Client for proxying connections to remote controllers.

This module handles WebSocket connections to remote telescope controllers,
allowing the server to proxy WebSocket communications transparently.
"""

import asyncio
import json
import logging
from typing import Dict, Any, Optional, Callable
from dataclasses import dataclass
from enum import Enum

import websockets
from websockets.exceptions import ConnectionClosed, InvalidURI


logger = logging.getLogger(__name__)


class RemoteConnectionState(Enum):
    """Connection states for remote WebSocket client."""
    DISCONNECTED = "disconnected"
    CONNECTING = "connecting" 
    CONNECTED = "connected"
    RECONNECTING = "reconnecting"
    ERROR = "error"


@dataclass
class RemoteController:
    """Remote controller configuration."""
    host: str
    port: int
    telescope_id: str
    controller_id: str
    max_reconnect_attempts: int = 5
    reconnect_delay: float = 1.0
    heartbeat_interval: float = 30.0


class RemoteWebSocketClient:
    """
    WebSocket client for connecting to remote telescope controllers.
    
    This class handles:
    - WebSocket connection to remote controllers
    - Message forwarding between frontend and remote controller
    - Connection health monitoring and reconnection
    - Message translation and routing
    """
    
    def __init__(
        self,
        controller: RemoteController,
        message_handler: Optional[Callable[[str, Dict[str, Any]], None]] = None
    ):
        self.controller = controller
        self.message_handler = message_handler
        
        # Connection state
        self.connection_state = RemoteConnectionState.DISCONNECTED
        self.websocket: Optional[websockets.WebSocketServerProtocol] = None
        
        # Reconnection logic
        self.reconnect_attempts = 0
        self.reconnect_task: Optional[asyncio.Task] = None
        
        # Health monitoring
        self.last_heartbeat = 0
        self.heartbeat_task: Optional[asyncio.Task] = None
        
        # Message handling
        self.pending_messages: Dict[str, asyncio.Future] = {}
        
        logger.info(f"Initialized remote WebSocket client for {controller.host}:{controller.port}")
    
    @property
    def is_connected(self) -> bool:
        """Check if WebSocket is connected and healthy."""
        return (
            self.connection_state == RemoteConnectionState.CONNECTED and
            self.websocket is not None and
            not self.websocket.closed
        )
    
    @property
    def websocket_url(self) -> str:
        """Generate WebSocket URL for the remote controller."""
        protocol = "ws"  # Remote controllers typically use ws, not wss
        return f"{protocol}://{self.controller.host}:{self.controller.port}/api/ws/{self.controller.telescope_id}"
    
    async def connect(self) -> bool:
        """
        Connect to the remote controller WebSocket.
        
        Returns:
            bool: True if connection successful, False otherwise
        """
        if self.is_connected:
            return True
            
        if self.connection_state == RemoteConnectionState.CONNECTING:
            return False
            
        self.connection_state = RemoteConnectionState.CONNECTING
        
        try:
            logger.info(f"Connecting to remote controller: {self.websocket_url}")
            
            # Connect to remote WebSocket
            self.websocket = await websockets.connect(
                self.websocket_url,
                ping_interval=self.controller.heartbeat_interval,
                ping_timeout=10,
                close_timeout=10
            )
            
            self.connection_state = RemoteConnectionState.CONNECTED
            self.reconnect_attempts = 0
            
            # Start message listener and heartbeat
            asyncio.create_task(self._message_listener())
            await self._start_heartbeat()
            
            logger.info(f"Successfully connected to remote controller {self.controller.host}:{self.controller.port}")
            return True
            
        except (ConnectionRefusedError, InvalidURI, OSError) as e:
            logger.warning(f"Failed to connect to remote controller {self.controller.host}:{self.controller.port}: {e}")
            self.connection_state = RemoteConnectionState.ERROR
            await self._schedule_reconnect()
            return False
        except Exception as e:
            logger.error(f"Unexpected error connecting to remote controller: {e}")
            self.connection_state = RemoteConnectionState.ERROR
            return False
    
    async def disconnect(self):
        """Disconnect from remote controller."""
        logger.info(f"Disconnecting from remote controller {self.controller.host}:{self.controller.port}")
        
        # Cancel reconnection attempts
        if self.reconnect_task:
            self.reconnect_task.cancel()
            self.reconnect_task = None
            
        # Cancel heartbeat
        if self.heartbeat_task:
            self.heartbeat_task.cancel()
            self.heartbeat_task = None
            
        # Close WebSocket connection
        if self.websocket:
            try:
                await self.websocket.close()
            except Exception as e:
                logger.warning(f"Error closing WebSocket: {e}")
            finally:
                self.websocket = None
                
        self.connection_state = RemoteConnectionState.DISCONNECTED
        
        # Reject pending messages
        for future in self.pending_messages.values():
            if not future.done():
                future.set_exception(ConnectionError("WebSocket disconnected"))
        self.pending_messages.clear()
    
    async def send_message(self, message: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Send a message to the remote controller.
        
        Args:
            message: Message to send
            
        Returns:
            Response message if expecting a response, None otherwise
        """
        if not self.is_connected:
            raise ConnectionError("Not connected to remote controller")
            
        try:
            message_str = json.dumps(message)
            await self.websocket.send(message_str)
            
            # If this is a command that expects a response, wait for it
            if message.get("type") == "control_command" and message.get("payload", {}).get("response_expected"):
                message_id = message.get("id")
                if message_id:
                    # Create future for response
                    future = asyncio.Future()
                    self.pending_messages[message_id] = future
                    
                    try:
                        # Wait for response with timeout
                        response = await asyncio.wait_for(future, timeout=10.0)
                        return response
                    except asyncio.TimeoutError:
                        logger.warning(f"Timeout waiting for response to message {message_id}")
                        self.pending_messages.pop(message_id, None)
                        raise
                        
            return None
            
        except ConnectionClosed:
            logger.warning("WebSocket connection closed while sending message")
            await self._handle_disconnection()
            raise ConnectionError("WebSocket connection lost")
        except Exception as e:
            logger.error(f"Error sending message to remote controller: {e}")
            raise
    
    async def send_subscription(self, subscription_types: list, telescope_id: str = None):
        """Send subscription message to remote controller."""
        subscription_message = {
            "id": f"sub-{asyncio.get_event_loop().time()}",
            "type": "subscribe",
            "telescope_id": telescope_id or self.controller.telescope_id,
            "timestamp": int(asyncio.get_event_loop().time() * 1000),
            "payload": {
                "subscription_types": subscription_types,
                "all_telescopes": False
            }
        }
        
        await self.send_message(subscription_message)
        logger.debug(f"Sent subscription to remote controller: {subscription_types}")
    
    async def _message_listener(self):
        """Listen for messages from remote controller."""
        try:
            async for message_str in self.websocket:
                try:
                    message = json.loads(message_str)
                    await self._handle_remote_message(message)
                except json.JSONDecodeError as e:
                    logger.warning(f"Invalid JSON from remote controller: {e}")
                except Exception as e:
                    logger.error(f"Error handling remote message: {e}")
                    
        except ConnectionClosed:
            logger.info("Remote controller WebSocket connection closed")
            await self._handle_disconnection()
        except Exception as e:
            logger.error(f"Error in message listener: {e}")
            await self._handle_disconnection()
    
    async def _handle_remote_message(self, message: Dict[str, Any]):
        """Handle message received from remote controller."""
        message_type = message.get("type")
        message_id = message.get("id")
        
        # Handle command responses
        if message_type == "command_response":
            command_id = message.get("payload", {}).get("command_id")
            if command_id and command_id in self.pending_messages:
                future = self.pending_messages.pop(command_id)
                if not future.done():
                    future.set_result(message)
                return
        
        # Handle heartbeat responses
        if message_type == "heartbeat":
            self.last_heartbeat = asyncio.get_event_loop().time()
            return
            
        # Forward other messages to the message handler
        if self.message_handler:
            try:
                await self.message_handler(self.controller.telescope_id, message)
            except Exception as e:
                logger.error(f"Error in message handler: {e}")
    
    async def _start_heartbeat(self):
        """Start heartbeat monitoring."""
        if self.heartbeat_task:
            self.heartbeat_task.cancel()
            
        self.heartbeat_task = asyncio.create_task(self._heartbeat_loop())
    
    async def _heartbeat_loop(self):
        """Heartbeat monitoring loop."""
        try:
            while self.is_connected:
                await asyncio.sleep(self.controller.heartbeat_interval)
                
                if not self.is_connected:
                    break
                    
                # Check if we've received a recent heartbeat
                current_time = asyncio.get_event_loop().time()
                if current_time - self.last_heartbeat > self.controller.heartbeat_interval * 2:
                    logger.warning("Heartbeat timeout from remote controller")
                    await self._handle_disconnection()
                    break
                    
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"Error in heartbeat loop: {e}")
    
    async def _handle_disconnection(self):
        """Handle unexpected disconnection."""
        if self.connection_state == RemoteConnectionState.DISCONNECTED:
            return
            
        logger.warning(f"Remote controller connection lost: {self.controller.host}:{self.controller.port}")
        self.connection_state = RemoteConnectionState.ERROR
        
        # Clean up
        if self.heartbeat_task:
            self.heartbeat_task.cancel()
            self.heartbeat_task = None
            
        if self.websocket:
            try:
                await self.websocket.close()
            except:
                pass
            self.websocket = None
            
        # Schedule reconnection
        await self._schedule_reconnect()
    
    async def _schedule_reconnect(self):
        """Schedule reconnection attempt."""
        if self.reconnect_attempts >= self.controller.max_reconnect_attempts:
            logger.error(f"Max reconnection attempts reached for {self.controller.host}:{self.controller.port}")
            self.connection_state = RemoteConnectionState.ERROR
            return
            
        self.reconnect_attempts += 1
        delay = min(self.controller.reconnect_delay * (2 ** self.reconnect_attempts), 30.0)
        
        logger.info(f"Scheduling reconnection attempt {self.reconnect_attempts} in {delay}s")
        
        self.connection_state = RemoteConnectionState.RECONNECTING
        self.reconnect_task = asyncio.create_task(self._reconnect_after_delay(delay))
    
    async def _reconnect_after_delay(self, delay: float):
        """Reconnect after delay."""
        try:
            await asyncio.sleep(delay)
            await self.connect()
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"Error during reconnection: {e}")
            await self._schedule_reconnect()


class RemoteWebSocketManager:
    """Manager for multiple remote WebSocket connections."""
    
    def __init__(self, message_handler: Optional[Callable[[str, Dict[str, Any]], None]] = None):
        self.clients: Dict[str, RemoteWebSocketClient] = {}
        self.message_handler = message_handler
        
    async def add_remote_controller(self, controller: RemoteController) -> bool:
        """Add and connect to a remote controller."""
        if controller.controller_id in self.clients:
            return self.clients[controller.controller_id].is_connected
            
        client = RemoteWebSocketClient(controller, self.message_handler)
        self.clients[controller.controller_id] = client
        
        success = await client.connect()
        if success:
            # Subscribe to all updates
            await client.send_subscription(["all"])
            
        return success
    
    async def remove_remote_controller(self, controller_id: str):
        """Remove and disconnect from a remote controller."""
        if controller_id in self.clients:
            client = self.clients.pop(controller_id)
            await client.disconnect()
    
    async def send_to_telescope(self, telescope_id: str, message: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Send message to telescope via appropriate remote controller."""
        for client in self.clients.values():
            if client.controller.telescope_id == telescope_id and client.is_connected:
                return await client.send_message(message)
                
        raise ConnectionError(f"No connected remote controller for telescope {telescope_id}")
    
    def get_telescope_connection_status(self, telescope_id: str) -> str:
        """Get connection status for a telescope."""
        for client in self.clients.values():
            if client.controller.telescope_id == telescope_id:
                return client.connection_state.value
                
        return "disconnected"
    
    async def disconnect_all(self):
        """Disconnect from all remote controllers."""
        disconnect_tasks = [client.disconnect() for client in self.clients.values()]
        if disconnect_tasks:
            await asyncio.gather(*disconnect_tasks, return_exceptions=True)
        self.clients.clear()