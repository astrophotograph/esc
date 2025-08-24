"""
Remote WebSocket Client for proxying connections to remote controllers.

This module handles WebSocket connections to remote telescope controllers,
allowing the server to proxy WebSocket communications transparently.
"""

import asyncio
import json
import logging
from dataclasses import dataclass
from enum import Enum
from typing import Dict, Any, Optional, Callable

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
    max_reconnect_attempts: int = -1  # Unlimited retries (-1 = infinite)
    reconnect_delay: float = 1.0
    heartbeat_interval: float = 30.0
    health_check_interval: float = 60.0  # Check connection health every 60 seconds
    message_timeout: float = 120.0  # Force reconnect if no messages for 2 minutes


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
        message_handler: Optional[Callable[[str, Dict[str, Any]], None]] = None,
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
        self.last_message_time = 0
        self.heartbeat_task: Optional[asyncio.Task] = None
        self.health_check_task: Optional[asyncio.Task] = None

        # Message handling
        self.pending_messages: Dict[str, asyncio.Future] = {}

        # Subscription tracking for restoration after reconnect
        self.active_subscriptions: Dict[str, list] = {}

        logger.info(
            f"Initialized remote WebSocket client for {controller.host}:{controller.port}"
        )

    @property
    def is_connected(self) -> bool:
        """Check if WebSocket is connected and healthy."""
        if (
            self.connection_state != RemoteConnectionState.CONNECTED
            or self.websocket is None
        ):
            return False

        # Check WebSocket state - import here to avoid circular imports
        try:
            from websockets.protocol import State

            return self.websocket.state == State.OPEN
        except ImportError:
            # Fallback: assume connected if we have a websocket object
            return True

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
                close_timeout=10,
            )

            self.connection_state = RemoteConnectionState.CONNECTED
            self.reconnect_attempts = 0
            self.last_heartbeat = asyncio.get_event_loop().time()
            self.last_message_time = asyncio.get_event_loop().time()

            # Start message listener, heartbeat, and health check
            asyncio.create_task(self._message_listener())
            await self._start_heartbeat()
            await self._start_health_check()

            # Restore subscriptions if any
            await self._restore_subscriptions()

            logger.info(
                f"Successfully connected to remote controller {self.controller.host}:{self.controller.port}"
            )
            return True

        except (ConnectionRefusedError, InvalidURI, OSError) as e:
            logger.warning(
                f"Failed to connect to remote controller {self.controller.host}:{self.controller.port}: {e}"
            )
            self.connection_state = RemoteConnectionState.ERROR
            await self._schedule_reconnect()
            return False
        except Exception as e:
            logger.error(f"Unexpected error connecting to remote controller: {e}")
            self.connection_state = RemoteConnectionState.ERROR
            await self._schedule_reconnect()  # Always try to reconnect on any failure
            return False

    async def disconnect(self):
        """Disconnect from remote controller."""
        logger.info(
            f"Disconnecting from remote controller {self.controller.host}:{self.controller.port}"
        )

        # Cancel reconnection attempts
        if self.reconnect_task:
            self.reconnect_task.cancel()
            self.reconnect_task = None

        # Cancel heartbeat and health check
        if self.heartbeat_task:
            self.heartbeat_task.cancel()
            self.heartbeat_task = None

        if self.health_check_task:
            self.health_check_task.cancel()
            self.health_check_task = None

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
            if message.get("type") == "control_command" and message.get(
                "payload", {}
            ).get("response_expected"):
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
                        logger.warning(
                            f"Timeout waiting for response to message {message_id}"
                        )
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

    async def send_subscription(
        self, subscription_types: list, telescope_id: str = None
    ):
        """Send subscription message to remote controller."""
        target_telescope_id = telescope_id or self.controller.telescope_id

        subscription_message = {
            "id": f"sub-{asyncio.get_event_loop().time()}",
            "type": "subscribe",
            "telescope_id": target_telescope_id,
            "timestamp": int(asyncio.get_event_loop().time() * 1000),
            "payload": {
                "subscription_types": subscription_types,
                "all_telescopes": False,
            },
        }

        await self.send_message(subscription_message)

        # Track subscription for restoration after reconnect
        self.active_subscriptions[target_telescope_id] = subscription_types
        logger.debug(f"Sent subscription to remote controller: {subscription_types}")

    def force_reconnect(self, reason: str = "Manual reconnection requested"):
        """Force reconnection (public method for external use)."""
        logger.info(
            f"Forcing reconnection for {self.controller.host}:{self.controller.port}: {reason}"
        )

        # Create task to handle disconnection asynchronously
        asyncio.create_task(self._handle_disconnection())

    def get_health_status(self) -> dict:
        """Get current health status information."""
        current_time = asyncio.get_event_loop().time()
        return {
            "is_connected": self.is_connected,
            "connection_state": self.connection_state.value,
            "reconnect_attempts": self.reconnect_attempts,
            "last_message_time": self.last_message_time,
            "last_heartbeat": self.last_heartbeat,
            "time_since_last_message": current_time - self.last_message_time,
            "time_since_last_heartbeat": current_time - self.last_heartbeat,
            "active_subscriptions": dict(self.active_subscriptions),
        }

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
        # Update message timestamp for health monitoring
        self.last_message_time = asyncio.get_event_loop().time()

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
                if (
                    current_time - self.last_heartbeat
                    > self.controller.heartbeat_interval * 2
                ):
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

        logger.warning(
            f"Remote controller connection lost: {self.controller.host}:{self.controller.port}"
        )
        self.connection_state = RemoteConnectionState.ERROR

        # Clean up
        if self.heartbeat_task:
            self.heartbeat_task.cancel()
            self.heartbeat_task = None

        if self.health_check_task:
            self.health_check_task.cancel()
            self.health_check_task = None

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
        # Check if we've hit max reconnect attempts (unless unlimited retries)
        if (
            self.controller.max_reconnect_attempts > 0
            and self.reconnect_attempts >= self.controller.max_reconnect_attempts
        ):
            logger.error(
                f"Max reconnection attempts reached for {self.controller.host}:{self.controller.port}"
            )
            self.connection_state = RemoteConnectionState.ERROR
            return

        self.reconnect_attempts += 1
        # Cap exponential backoff at 60 seconds max
        delay = min(
            self.controller.reconnect_delay
            * (2 ** min(self.reconnect_attempts - 1, 5)),
            60.0,
        )

        if self.controller.max_reconnect_attempts < 0:
            logger.info(
                f"Scheduling reconnection attempt {self.reconnect_attempts} (unlimited) in {delay}s"
            )
        else:
            logger.info(
                f"Scheduling reconnection attempt {self.reconnect_attempts}/{self.controller.max_reconnect_attempts} in {delay}s"
            )

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

    async def _start_health_check(self):
        """Start health check monitoring."""
        if self.health_check_task:
            self.health_check_task.cancel()

        self.health_check_task = asyncio.create_task(self._health_check_loop())

    async def _health_check_loop(self):
        """Health check monitoring loop."""
        try:
            while self.is_connected:
                await asyncio.sleep(self.controller.health_check_interval)

                if not self.is_connected:
                    break

                current_time = asyncio.get_event_loop().time()
                time_since_last_message = current_time - self.last_message_time

                # Check if we haven't received any messages within the timeout period
                if time_since_last_message > self.controller.message_timeout:
                    logger.warning(
                        f"Health check failed: No messages received for {time_since_last_message:.1f}s (limit: {self.controller.message_timeout}s)"
                    )
                    await self._handle_disconnection()
                    break
                else:
                    logger.debug(
                        f"Health check passed for {self.controller.host}:{self.controller.port} - last message {time_since_last_message:.1f}s ago"
                    )

        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"Error in health check loop: {e}")

    async def _restore_subscriptions(self):
        """Restore subscriptions after reconnection."""
        if not self.active_subscriptions:
            return

        logger.info(
            f"Restoring {len(self.active_subscriptions)} subscriptions after reconnection"
        )

        for telescope_id, subscription_types in self.active_subscriptions.items():
            try:
                await self.send_subscription(subscription_types, telescope_id)
                logger.debug(
                    f"Restored subscription for telescope {telescope_id}: {subscription_types}"
                )
            except Exception as e:
                logger.error(
                    f"Failed to restore subscription for telescope {telescope_id}: {e}"
                )


class RemoteWebSocketManager:
    """Manager for multiple remote WebSocket connections."""

    def __init__(
        self, message_handler: Optional[Callable[[str, Dict[str, Any]], None]] = None
    ):
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

    async def send_to_telescope(
        self, telescope_id: str, message: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """Send message to telescope via appropriate remote controller."""
        for client in self.clients.values():
            if client.controller.telescope_id == telescope_id and client.is_connected:
                return await client.send_message(message)

        raise ConnectionError(
            f"No connected remote controller for telescope {telescope_id}"
        )

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

    def force_reconnect_telescope(
        self, telescope_id: str, reason: str = "Manual reconnection requested"
    ):
        """Force reconnection for a specific telescope."""
        for client in self.clients.values():
            if client.controller.telescope_id == telescope_id:
                client.force_reconnect(reason)
                return True
        return False

    def get_all_health_status(self) -> Dict[str, dict]:
        """Get health status for all remote controllers."""
        return {
            client.controller.telescope_id: client.get_health_status()
            for client in self.clients.values()
        }
