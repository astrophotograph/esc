"""
WebSocket connection manager for telescope control.

This module manages WebSocket connections, handles message routing,
and coordinates between telescope clients and web clients.
"""

import asyncio
import json
from typing import Dict, List, Set, Optional, Any

from fastapi import WebSocket
from loguru import logger

from remote_websocket_client import RemoteWebSocketManager, RemoteController
from smarttel.seestar.client import SeestarClient
from smarttel.seestar.commands.parameterized import (
    IscopeStartView,
    IscopeStartViewParams, IscopeStartStack, StartStackParams, )
from smarttel.seestar.commands.settings import SetSetting, SettingParameters, SetSequenceSetting, \
    SequenceSettingParameters, SetControlValue
from websocket_protocol import (
    WebSocketMessage,
    MessageFactory,
    SubscriptionType,
    StatusUpdateMessage,
    ControlCommandMessage,
    HeartbeatMessage,
    SubscribeMessage,
    UnsubscribeMessage,
    AnnotationEventMessage,
    ClientModeChangedMessage,
)


class WebSocketConnection:
    """Represents a single WebSocket connection from a client."""

    def __init__(self, websocket: WebSocket, connection_id: str):
        self.websocket = websocket
        self.connection_id = connection_id
        self.subscriptions: Dict[
            str, Set[SubscriptionType]
        ] = {}  # telescope_id -> subscription_types
        self.is_alive = True
        self.last_heartbeat = asyncio.get_event_loop().time()

    async def send_message(self, message: WebSocketMessage) -> bool:
        """Send a message to the client. Returns True if successful."""
        if not self.is_alive:
            return False

        try:
            # Check if WebSocket is still connected
            try:
                if (
                        hasattr(self.websocket, "client_state")
                        and self.websocket.client_state.name != "CONNECTED"
                ):
                    logger.warning(
                        f"WebSocket not connected for {self.connection_id}, state: {self.websocket.client_state.name}"
                    )
                    self.is_alive = False
                    return False
            except Exception as state_check_error:
                logger.debug(
                    f"Could not check WebSocket state for {self.connection_id}: {state_check_error}"
                )

            await self.websocket.send_text(message.model_dump_json())
            return True
        except Exception as e:
            logger.error(f"Failed to send message to {self.connection_id}: {e}")
            self.is_alive = False
            return False

    def is_subscribed_to(
            self, telescope_id: str, subscription_type: SubscriptionType
    ) -> bool:
        """Check if this connection is subscribed to updates for a telescope."""
        if telescope_id not in self.subscriptions:
            return False

        telescope_subs = self.subscriptions[telescope_id]
        return (
                SubscriptionType.ALL in telescope_subs
                or subscription_type in telescope_subs
        )

    def add_subscription(
            self, telescope_id: str, subscription_types: List[SubscriptionType]
    ):
        """Add subscriptions for a telescope."""
        if telescope_id not in self.subscriptions:
            self.subscriptions[telescope_id] = set()

        self.subscriptions[telescope_id].update(subscription_types)
        logger.debug(
            f"Connection {self.connection_id} subscribed to {subscription_types} for telescope {telescope_id}"
        )

    def remove_subscription(
            self, telescope_id: str, subscription_types: List[SubscriptionType]
    ):
        """Remove subscriptions for a telescope."""
        if telescope_id not in self.subscriptions:
            return

        self.subscriptions[telescope_id].difference_update(subscription_types)

        # Remove telescope entry if no subscriptions remain
        if not self.subscriptions[telescope_id]:
            del self.subscriptions[telescope_id]

        logger.debug(
            f"Connection {self.connection_id} unsubscribed from {subscription_types} for telescope {telescope_id}"
        )


class WebSocketManager:
    """Manages all WebSocket connections and message routing."""

    def __init__(self, telescope_getter=None):
        self.connections: Dict[str, WebSocketConnection] = {}
        self.telescope_clients: Dict[str, Any] = {}  # telescope_id -> SeestarClient
        self.remote_clients: Dict[
            str, str
        ] = {}  # telescope_id -> controller_id mapping
        self.heartbeat_interval = 30  # seconds
        self.heartbeat_task: Optional[asyncio.Task] = None
        self._running = False
        self.telescope_getter = telescope_getter  # Function to get telescope by ID

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

    async def connect(
            self, websocket: WebSocket, connection_id: str, skip_accept: bool = False
    ) -> WebSocketConnection:
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

    async def broadcast_status_update(
            self,
            telescope_id: str,
            status: Dict[str, Any],
            changes: Optional[List[str]] = None,
    ):
        """Broadcast status update to all subscribed clients."""
        message = StatusUpdateMessage(
            telescope_id=telescope_id, status=status, changes=changes
        )

        # Send to all subscribed connections
        for connection in self.connections.values():
            if connection.is_subscribed_to(telescope_id, SubscriptionType.STATUS):
                await connection.send_message(message)

    async def broadcast_telescope_discovered(self, telescope_info: Dict[str, Any]):
        """Broadcast telescope discovery to all connections."""
        message = MessageFactory.create_telescope_discovered(telescope_info)

        for connection in self.connections.values():
            await connection.send_message(message)

    async def broadcast_telescope_lost(
            self, telescope_id: str, reason: str = "Connection lost"
    ):
        """Broadcast telescope loss to all connections."""
        message = MessageFactory.create_telescope_lost(telescope_id, reason)

        for connection in self.connections.values():
            await connection.send_message(message)

    async def broadcast_annotation_event(
            self,
            telescope_id: str,
            annotations: List[Dict[str, Any]],
            image_size: List[int],
            image_id: int,
    ):
        """Broadcast annotation events to all subscribed clients."""
        message = AnnotationEventMessage(
            telescope_id=telescope_id,
            annotations=annotations,
            image_size=image_size,
            image_id=image_id,
        )

        # Send to all subscribed connections
        for connection in self.connections.values():
            if connection.is_subscribed_to(telescope_id, SubscriptionType.STATUS):
                await connection.send_message(message)

    async def broadcast_alert_event(
            self,
            telescope_id: str,
            state: Optional[str] = None,
            error: str = "",
            code: int = 0,
    ):
        """Broadcast alert events to all subscribed clients."""
        message = MessageFactory.create_alert(
            telescope_id=telescope_id,
            state=state,
            error=error,
            code=code,
        )

        # Send to all subscribed connections
        for connection in self.connections.values():
            if connection.is_subscribed_to(telescope_id, SubscriptionType.STATUS):
                await connection.send_message(message)

    async def broadcast_plate_solve_result(
            self,
            telescope_id: str,
            job_id: str,
            success: bool,
            ra: Optional[float] = None,
            dec: Optional[float] = None,
            orientation: Optional[float] = None,
            pixscale: Optional[float] = None,
            field_width: Optional[float] = None,
            field_height: Optional[float] = None,
            error: Optional[str] = None,
            submission_id: Optional[int] = None,
            astrometry_job_id: Optional[int] = None,
    ):
        """Broadcast plate solve result to all subscribed clients."""
        message = MessageFactory.create_plate_solve_result(
            telescope_id=telescope_id,
            job_id=job_id,
            success=success,
            ra=ra,
            dec=dec,
            orientation=orientation,
            pixscale=pixscale,
            field_width=field_width,
            field_height=field_height,
            error=error,
            submission_id=submission_id,
            astrometry_job_id=astrometry_job_id,
        )

        # Send to all subscribed connections
        for connection in self.connections.values():
            if connection.is_subscribed_to(telescope_id, SubscriptionType.STATUS):
                await connection.send_message(message)

    async def broadcast_client_mode_changed(
            self,
            telescope_id: str,
            old_mode: Optional[str] = None,
            new_mode: Optional[str] = None,
    ):
        """Broadcast client mode change to all subscribed clients."""
        message = MessageFactory.create_client_mode_changed(
            telescope_id=telescope_id,
            old_mode=old_mode,
            new_mode=new_mode,
        )

        # Send to all subscribed connections
        for connection in self.connections.values():
            if connection.is_subscribed_to(telescope_id, SubscriptionType.STATUS):
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
                logger.info(
                    f"Registered remote controller {controller.controller_id} for telescope {controller.telescope_id}"
                )
            return success
        except Exception as e:
            logger.error(
                f"Failed to register remote controller {controller.controller_id}: {e}"
            )
            return False

    async def unregister_remote_controller(
            self, controller_id: str, telescope_id: str = None
    ):
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
                await self._broadcast_to_subscribers(
                    ws_message, telescope_id, SubscriptionType.ALL
                )

        except Exception as e:
            logger.error(f"Error handling remote message from {telescope_id}: {e}")

    async def _broadcast_to_subscribers(
            self,
            message: WebSocketMessage,
            telescope_id: str,
            subscription_type: SubscriptionType,
    ):
        """Broadcast a message to all connections subscribed to the given telescope and type."""
        for connection in self.connections.values():
            if connection.is_subscribed_to(telescope_id, subscription_type):
                await connection.send_message(message)

    async def _handle_control_command(
            self, connection: WebSocketConnection, message: ControlCommandMessage
    ):
        """Handle control command from client."""
        telescope_id = message.telescope_id
        command_payload = message.payload

        if not telescope_id:
            await connection.send_message(
                MessageFactory.create_error(
                    "MISSING_TELESCOPE_ID",
                    "Telescope ID is required for control commands",
                )
            )
            return

        # Check if telescope is available (either local or remote)
        if not (
                self.is_telescope_local(telescope_id)
                or self.is_telescope_remote(telescope_id)
        ):
            await connection.send_message(
                MessageFactory.create_command_response(
                    telescope_id=telescope_id,
                    command_id=message.id,
                    success=False,
                    error=f"Telescope {telescope_id} not available",
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
                result = await self._execute_telescope_command(
                    client, action, parameters
                )
                logger.info(f"Command {action} executed on local telescope.  Result: {result}")
            else:
                # Forward to remote controller
                result = await self._execute_remote_command(telescope_id, message)

            # Send response back to client
            # Check if the result indicates an error and convert to failed response
            if isinstance(result, dict) and result.get("status") == "error":
                # Convert error result to failed command response
                await connection.send_message(
                    MessageFactory.create_command_response(
                        telescope_id=telescope_id,
                        command_id=message.id,
                        success=False,
                        error=result.get("message", "Command failed"),
                    )
                )
            else:
                # Send successful response
                await connection.send_message(
                    MessageFactory.create_command_response(
                        telescope_id=telescope_id,
                        command_id=message.id,
                        success=True,
                        result=result,
                    )
                )

        except Exception as e:
            logger.error(
                f"Error executing command {command_payload['action']} on {telescope_id}: {e}"
            )
            await connection.send_message(
                MessageFactory.create_command_response(
                    telescope_id=telescope_id,
                    command_id=message.id,
                    success=False,
                    error=str(e),
                )
            )

    async def _execute_telescope_command(
            self, client: SeestarClient, action: str, parameters: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Execute a command on the telescope client."""
        logger.info(f"Executing command: {action} with parameters: {parameters}")

        try:
            if action == "move":
                return await self._execute_move_command(client, parameters)
            elif action == "park":
                return await self._execute_park_command(client, parameters)
            elif action == "focus_increment":
                return await self._execute_focus_command(client, parameters)
            elif action == "goto":
                return await self._execute_goto_command(client, parameters)
            elif action == "scenery":
                return await self._execute_scenery_command(client, parameters)
            elif action == "set_image_enhancement":
                return await self._execute_set_image_enhancement_command(client, parameters)
            elif action == "get_image_enhancement":
                return await self._execute_get_image_enhancement_command(client, parameters)
            elif action == "reboot":
                return await self._execute_reboot_command(client, parameters)
            else:
                logger.warning(f"Unknown command action: {action}")
                return {"status": "error", "message": f"Unknown action: {action}"}

        except Exception as e:
            logger.error(f"Error executing telescope command {action}: {e}")
            return {"status": "error", "message": str(e)}

    async def _execute_remote_command(
            self, telescope_id: str, message: ControlCommandMessage
    ) -> Dict[str, Any]:
        """Execute a command on a remote telescope via its controller."""
        try:
            # Convert WebSocket message to dict for remote transmission
            remote_message = {
                "id": message.id,
                "type": message.type.value,
                "telescope_id": telescope_id,
                "timestamp": message.timestamp,
                "payload": message.payload,
            }

            # Send to remote controller and wait for response
            response = await self.remote_manager.send_to_telescope(
                telescope_id, remote_message
            )

            if response and response.get("type") == "command_response":
                payload = response.get("payload", {})
                if payload.get("success"):
                    return payload.get("result", {"status": "success"})
                else:
                    raise Exception(payload.get("error", "Remote command failed"))
            else:
                return {
                    "status": "success",
                    "response": "Command sent to remote controller",
                }

        except Exception as e:
            logger.error(f"Error executing remote command on {telescope_id}: {e}")
            raise

    async def _execute_move_command(
            self, client: Any, parameters: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Execute telescope movement command."""
        direction = parameters.get("direction", "").lower()

        # Map WebSocket directions to telescope angles (degrees)
        # Adjusted for 90-degree rotation based on actual telescope behavior
        direction_angles = {
            "north": 90,  # Swapped with south
            "east": 0,  # Correct
            "south": 270,  # Swapped with north
            "west": 180,  # Correct
            "stop": None,
        }

        if direction not in direction_angles:
            return {"status": "error", "message": f"Invalid direction: {direction}"}

        try:
            if direction == "stop":
                # Stop movement by sending 0 percent
                from smarttel.seestar.commands.parameterized import (
                    ScopeSpeedMove,
                    ScopeSpeedMoveParameters,
                )

                command = ScopeSpeedMove(
                    params=ScopeSpeedMoveParameters(
                        angle=0,  # Direction doesn't matter for stop
                        level=1,  # Speed level
                        dur_sec=1,  # Duration
                        percent=0,  # 0 percent means stop
                    )
                )
            else:
                # Move in specified direction
                from smarttel.seestar.commands.parameterized import (
                    ScopeSpeedMove,
                    ScopeSpeedMoveParameters,
                )

                command = ScopeSpeedMove(
                    params=ScopeSpeedMoveParameters(
                        angle=direction_angles[direction],
                        level=2,  # Medium speed level
                        dur_sec=5,  # Move for 5 seconds
                        percent=100,  # 100% speed
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
                return {
                    "status": "success",
                    "action": "move",
                    "direction": direction,
                    "response": response.model_dump()
                    if hasattr(response, "model_dump")
                    else str(response),
                }
            else:
                return {
                    "status": "success",
                    "action": "move",
                    "direction": direction,
                    "response": "No response",
                }

        except Exception as e:
            logger.error(f"Error executing move command: {e}")
            return {"status": "error", "message": str(e)}

    async def _execute_park_command(
            self, client: Any, parameters: Dict[str, Any]
    ) -> Dict[str, Any]:
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
                return {
                    "status": "success",
                    "action": "park",
                    "response": response.model_dump()
                    if hasattr(response, "model_dump")
                    else str(response),
                }
            else:
                return {
                    "status": "success",
                    "action": "park",
                    "response": "No response",
                }

        except Exception as e:
            logger.error(f"Error executing park command: {e}")
            return {"status": "error", "message": str(e)}

    async def _execute_focus_command(
            self, client: Any, parameters: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Execute focuser movement command."""
        increment = parameters.get("increment", 0)

        try:
            # Get current focus position from status (like in main.py)
            current_position = client.status.focus_position
            if current_position is None:
                logger.warning(
                    "Current focus position unknown, using increment as absolute position"
                )
                new_position = abs(increment)  # Fallback to using increment as absolute
            else:
                new_position = current_position + increment

            from smarttel.seestar.commands.parameterized import (
                MoveFocuser,
                MoveFocuserParameters,
            )

            command = MoveFocuser(
                params=MoveFocuserParameters(
                    step=new_position,  # Use absolute position, not increment
                    ret_step=True,
                )
            )

            response = await client.send_and_recv(command)

            # Update status with new position (like in main.py)
            if (
                    response is not None
                    and hasattr(response, "result")
                    and response.result is not None
            ):
                if isinstance(response.result, dict) and "step" in response.result:
                    client.status.focus_position = response.result["step"]

            if response:
                return {
                    "status": "success",
                    "action": "focus_increment",
                    "increment": increment,
                    "new_position": new_position,
                    "previous_position": current_position,
                    "response": response.model_dump()
                    if hasattr(response, "model_dump")
                    else str(response),
                }
            else:
                return {
                    "status": "success",
                    "action": "focus_increment",
                    "increment": increment,
                    "new_position": new_position,
                    "previous_position": current_position,
                    "response": "No response",
                }

        except Exception as e:
            logger.error(f"Error executing focus command: {e}")
            return {"status": "error", "message": str(e)}

    def _parse_ra_coordinate(self, ra_value: Any) -> float:
        """Parse RA coordinate in various formats to decimal degrees.
        
        Supported formats:
        - Decimal degrees: 123.456 or "123.456"
        - Hours/minutes/seconds: "12h34m56.7s" or "12:34:56.7"
        - Hours with decimal: "12.5h" or "12.5"
        - Space separated: "12 34 56.7"
        """
        import re

        if isinstance(ra_value, (int, float)):
            # Already numeric, assume degrees
            return float(ra_value)

        if not isinstance(ra_value, str):
            raise ValueError(f"Invalid RA format: {ra_value}")

        ra_str = ra_value.strip()

        # Try decimal degrees first
        try:
            return float(ra_str)
        except ValueError:
            pass

        # HMS format with h/m/s markers
        hms_pattern = r'(\d+(?:\.\d+)?)[hH]\s*(\d+(?:\.\d+)?)[mM]\s*(\d+(?:\.\d+)?)[sS]?'
        match = re.match(hms_pattern, ra_str)
        if match:
            hours = float(match.group(1))
            minutes = float(match.group(2))
            seconds = float(match.group(3))
            # Convert to degrees (1h = 15°)
            return (hours + minutes / 60 + seconds / 3600) * 15

        # Colon separated format HH:MM:SS or HH:MM:SS.S
        colon_pattern = r'(\d+):(\d+):(\d+(?:\.\d+)?)'
        match = re.match(colon_pattern, ra_str)
        if match:
            hours = float(match.group(1))
            minutes = float(match.group(2))
            seconds = float(match.group(3))
            return (hours + minutes / 60 + seconds / 3600) * 15

        # Space separated format
        space_pattern = r'(\d+)\s+(\d+)\s+(\d+(?:\.\d+)?)'
        match = re.match(space_pattern, ra_str)
        if match:
            hours = float(match.group(1))
            minutes = float(match.group(2))
            seconds = float(match.group(3))
            return (hours + minutes / 60 + seconds / 3600) * 15

        # Hours only with h marker
        hours_pattern = r'(\d+(?:\.\d+)?)[hH]'
        match = re.match(hours_pattern, ra_str)
        if match:
            hours = float(match.group(1))
            return hours * 15

        raise ValueError(f"Unable to parse RA format: {ra_str}")

    def _parse_dec_coordinate(self, dec_value: Any) -> float:
        """Parse Dec coordinate in various formats to decimal degrees.
        
        Supported formats:
        - Decimal degrees: 45.678 or "-45.678"
        - Degrees/minutes/seconds: "+45d12m34.5s" or "45:12:34.5"
        - Degrees with decimal: "45.5d" or "-45.5"
        - Space separated: "45 12 34.5" or "-45 12 34.5"
        """
        import re

        if isinstance(dec_value, (int, float)):
            # Already numeric
            return float(dec_value)

        if not isinstance(dec_value, str):
            raise ValueError(f"Invalid Dec format: {dec_value}")

        dec_str = dec_value.strip()

        # Try decimal degrees first
        try:
            return float(dec_str)
        except ValueError:
            pass

        # Check for sign
        negative = False
        if dec_str.startswith('-'):
            negative = True
            dec_str = dec_str[1:].strip()
        elif dec_str.startswith('+'):
            dec_str = dec_str[1:].strip()

        # DMS format with d/m/s markers
        dms_pattern = r'(\d+(?:\.\d+)?)[dD°]\s*(\d+(?:\.\d+)?)[mM\']\s*(\d+(?:\.\d+)?)[sS"]?'
        match = re.match(dms_pattern, dec_str)
        if match:
            degrees = float(match.group(1))
            minutes = float(match.group(2))
            seconds = float(match.group(3))
            result = degrees + minutes / 60 + seconds / 3600
            return -result if negative else result

        # Colon separated format DD:MM:SS or DD:MM:SS.S
        colon_pattern = r'(\d+):(\d+):(\d+(?:\.\d+)?)'
        match = re.match(colon_pattern, dec_str)
        if match:
            degrees = float(match.group(1))
            minutes = float(match.group(2))
            seconds = float(match.group(3))
            result = degrees + minutes / 60 + seconds / 3600
            return -result if negative else result

        # Space separated format
        space_pattern = r'(\d+)\s+(\d+)\s+(\d+(?:\.\d+)?)'
        match = re.match(space_pattern, dec_str)
        if match:
            degrees = float(match.group(1))
            minutes = float(match.group(2))
            seconds = float(match.group(3))
            result = degrees + minutes / 60 + seconds / 3600
            return -result if negative else result

        # Degrees only with d marker
        degrees_pattern = r'(\d+(?:\.\d+)?)[dD°]'
        match = re.match(degrees_pattern, dec_str)
        if match:
            degrees = float(match.group(1))
            return -degrees if negative else degrees

        raise ValueError(f"Unable to parse Dec format: {dec_value}")

    async def _execute_goto_command(
            self, client: SeestarClient, parameters: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Execute goto command - stub handler that logs the target information."""
        try:
            target_name = parameters.get("target_name", "unknown")
            coordinates = parameters.get("coordinates", {})

            # Parse RA and Dec with multiple format support
            try:
                ra = self._parse_ra_coordinate(coordinates.get("ra", 0)) / 15.0
            except ValueError as e:
                logger.error(f"Failed to parse RA coordinate: {e}")
                return {"status": "error", "message": f"Invalid RA format: {coordinates.get('ra')}"}

            try:
                dec = self._parse_dec_coordinate(coordinates.get("dec", 0))
            except ValueError as e:
                logger.error(f"Failed to parse Dec coordinate: {e}")
                return {"status": "error", "message": f"Invalid Dec format: {coordinates.get('dec')}"}
            start_imaging = parameters.get("start_imaging", False)
            target_type = parameters.get("target_type", "unknown")
            magnitude = parameters.get("magnitude", "unknown")
            description = parameters.get("description", "")

            stack_gain = parameters.get("gain", 80)  # make this vary based on telescope

            logger.info(f"Goto command received for target: {target_name}")
            logger.info(f"Original coordinates: RA={coordinates.get('ra')}, Dec={coordinates.get('dec')}")
            logger.info(f"Parsed coordinates: RA={ra:.6f}°, Dec={dec:.6f}°")
            logger.info(f"Target type: {target_type}, Magnitude: {magnitude}")
            logger.info(f"Start imaging: {start_imaging}")
            logger.info(f"Description: {description}")
            logger.info(f"Full message parameters: {parameters}")

            await client.goto(target_name, ra, dec)
            success, error = await client.wait_for_event_completion("AutoGoto", timeout=120.0)
            if not success:
                await client.stop_goto()
                error_message = f"Error positioning telescope: {error}" if error else "Error positioning telescope"
                logger.error(error_message)
                return {"status": "error", "message": error_message}

            logger.debug(f"Start imaging: {start_imaging}")
            if start_imaging or True:
                await asyncio.sleep(5.0)

                r = await client.send_and_recv(SetSetting(
                    params=SettingParameters(
                        stack_lenhance=True,
                    )))
                logger.debug(f"Response from SetSetting: {r}")

                r = await client.send_and_recv(SetSequenceSetting(params=[
                    SequenceSettingParameters(group_name=target_name)]))
                logger.debug(f"Response from SetSequenceSetting: {r}")

                r = await client.send_and_recv(IscopeStartStack(params=StartStackParams(restart=False)))
                logger.debug(f"Response from IscopeStartStack: {r}")

                # Change the gain _after_ starting starts.
                r = await client.send_and_recv(SetControlValue(params=("gain", stack_gain)))
                logger.debug(f"Response from SetControlValue: {r}")

            logger.info("Telescope goto command completed successfully")
            # self.logger.info(result)

            # This is just for spectra functions: {"method":"scope_goto","params":[1.2345,75.0]}
            #
            # working, starting mean it's slewing
            # if task is cancelled
            #
            # data: MessageParams = {
            #     "method": "iscope_stop_view",
            #     "params": {"stage": "AutoGoto"},
            # }
            # return self.send_message_param_sync(data)

            imaging_message = " and start imaging" if start_imaging else ""

            return {
                "status": "success",
                "action": "goto",
                "target_name": target_name,
                "coordinates": coordinates,
                "start_imaging": start_imaging,
                "message": f"Goto command for '{target_name}' logged successfully{imaging_message}",
            }

        except Exception as e:
            logger.error(f"Error executing goto command: {e}")
            return {"status": "error", "message": str(e)}

    async def _execute_scenery_command(
            self, client: Any, parameters: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Execute scenery mode command - stub handler that logs the message."""
        mode = parameters.get("mode", "unknown")

        try:
            logger.info(
                f"Scenery mode command received: mode={mode}, parameters={parameters}"
            )
            logger.info(f"Message payload: {{'mode': '{mode}'}}")

            command = IscopeStartView(params=IscopeStartViewParams(mode="scenery"))

            response = await client.send_and_recv(command)

            return {
                "status": "success",
                "action": "scenery",
                "mode": mode,
                "message": f"Scenery mode '{mode}' logged successfully",
            }

        except Exception as e:
            logger.error(f"Error executing scenery command: {e}")
            return {"status": "error", "message": str(e)}

    async def _execute_reboot_command(
            self, client: Any, parameters: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Execute reboot command - stub handler that logs the reboot request."""
        try:
            logger.info(f"Reboot command received with parameters: {parameters}")
            
            # Log the reboot request for now (since this is a stub)
            logger.warning("REBOOT REQUEST: Telescope reboot command received")
            logger.info("This is a stub implementation - actual reboot not performed")
            
            return {
                "status": "success",
                "action": "reboot",
                "message": "Reboot command logged successfully (stub implementation)",
            }

        except Exception as e:
            logger.error(f"Error executing reboot command: {e}")
            return {"status": "error", "message": str(e)}

    async def _handle_subscribe(
            self, connection: WebSocketConnection, message: SubscribeMessage
    ):
        """Handle subscription request from client."""
        payload = message.payload
        telescope_id = message.telescope_id
        subscription_types = [
            SubscriptionType(t)
            for t in payload.get("subscription_types", [SubscriptionType.ALL])
        ]

        if payload.get("all_telescopes", False):
            # Subscribe to all telescopes
            for tid in self.telescope_clients.keys():
                connection.add_subscription(tid, subscription_types)
        elif telescope_id:
            connection.add_subscription(telescope_id, subscription_types)
        else:
            await connection.send_message(
                MessageFactory.create_error(
                    "INVALID_SUBSCRIPTION",
                    "Must specify telescope_id or all_telescopes",
                )
            )

    async def _handle_unsubscribe(
            self, connection: WebSocketConnection, message: UnsubscribeMessage
    ):
        """Handle unsubscription request from client."""
        payload = message.payload
        telescope_id = message.telescope_id
        subscription_types = [
            SubscriptionType(t)
            for t in payload.get("subscription_types", [SubscriptionType.ALL])
        ]

        if payload.get("all_telescopes", False):
            # Unsubscribe from all telescopes
            for tid in list(connection.subscriptions.keys()):
                connection.remove_subscription(tid, subscription_types)
        elif telescope_id:
            connection.remove_subscription(telescope_id, subscription_types)

    async def _execute_set_image_enhancement_command(
            self, client: Any, parameters: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Execute set image enhancement command - configures enhancement settings."""
        try:
            logger.info(f"Setting image enhancement parameters: {parameters}")

            # Store settings on client
            if not hasattr(client, "image_enhancement_settings"):
                client.image_enhancement_settings = {}

            # Update stored settings with new parameters
            client.image_enhancement_settings.update(parameters)

            # Find the telescope object that owns this client
            telescope = None
            if self.telescope_getter:
                # Find telescope by looking up which one has this client
                for telescope_id, stored_client in self.telescope_clients.items():
                    if stored_client == client:
                        telescope = self.telescope_getter(telescope_id)
                        if telescope:
                            logger.info(f"Successfully found telescope object: {telescope.name}")
                        else:
                            logger.error(f"telescope_getter returned None for telescope_id: {telescope_id}")
                        break
                else:
                    logger.error(f"No matching client found in telescope_clients registry")

            if telescope:
                logger.info(f"Found telescope object, configuring processors")

                # Configure stretch parameters if image_processor exists
                if hasattr(telescope, "image_processor") and telescope.image_processor:
                    # Configure GraxpertStretch with stretch parameter
                    stretch_param = parameters.get("stretch_parameter", "15% Bg, 3 sigma")
                    if hasattr(telescope.image_processor, "set_stretch_parameter"):
                        telescope.image_processor.set_stretch_parameter(stretch_param)
                        logger.info(f"Set image processor stretch parameter: {stretch_param}")

                # Configure enhancement processor if it exists
                if hasattr(telescope, "enhancement_processor") and telescope.enhancement_processor:
                    # Update enhancement processor settings
                    if "upscaling_enabled" in parameters:
                        telescope.enhancement_processor.upscaling_enabled = parameters["upscaling_enabled"]
                    if "scale_factor" in parameters:
                        telescope.enhancement_processor.scale_factor = parameters["scale_factor"]
                    if "upscaling_method" in parameters:
                        telescope.enhancement_processor.upscaling_method = parameters["upscaling_method"]
                    if "sharpening_enabled" in parameters:
                        telescope.enhancement_processor.sharpening_enabled = parameters["sharpening_enabled"]
                    if "sharpening_method" in parameters:
                        telescope.enhancement_processor.sharpening_method = parameters["sharpening_method"]
                    if "sharpening_strength" in parameters:
                        telescope.enhancement_processor.sharpening_strength = parameters["sharpening_strength"]
                    if "denoise_enabled" in parameters:
                        telescope.enhancement_processor.denoise_enabled = parameters["denoise_enabled"]
                    if "denoise_method" in parameters:
                        telescope.enhancement_processor.denoise_method = parameters["denoise_method"]
                    if "denoise_strength" in parameters:
                        telescope.enhancement_processor.denoise_strength = parameters["denoise_strength"]
                    if "invert_enabled" in parameters:
                        telescope.enhancement_processor.invert_enabled = parameters["invert_enabled"]

                    logger.info(f"Updated enhancement processor settings")

                    # Trigger instant processing of cached image
                    if hasattr(telescope, "imaging") and telescope.imaging:
                        telescope.imaging.trigger_enhancement_settings_changed()
                else:
                    logger.warning("Could not find enhancement processor on telescope")
            else:
                logger.warning("Could not find telescope object - processors not configured")

            # Return frontend-compatible format with all current settings
            settings = {
                "upscaling_enabled": client.image_enhancement_settings.get("upscaling_enabled", False),
                "scale_factor": client.image_enhancement_settings.get("scale_factor", 2.0),
                "upscaling_method": client.image_enhancement_settings.get("upscaling_method", "bicubic"),
                "available_upscaling_methods": ["bicubic", "lanczos", "edsr", "fsrcnn", "esrgan", "real_esrgan",
                                                "waifu2x"],
                "sharpening_enabled": client.image_enhancement_settings.get("sharpening_enabled", False),
                "sharpening_method": client.image_enhancement_settings.get("sharpening_method", "unsharp_mask"),
                "sharpening_strength": client.image_enhancement_settings.get("sharpening_strength", 1.0),
                "available_sharpening_methods": ["none", "unsharp_mask", "laplacian", "high_pass"],
                "denoise_enabled": client.image_enhancement_settings.get("denoise_enabled", False),
                "denoise_method": client.image_enhancement_settings.get("denoise_method", "tv_chambolle"),
                "denoise_strength": client.image_enhancement_settings.get("denoise_strength", 1.0),
                "available_denoise_methods": ["none", "tv_chambolle", "bilateral", "non_local_means", "wavelet",
                                              "gaussian", "median"],
                "invert_enabled": client.image_enhancement_settings.get("invert_enabled", False),
                "stretch_parameter": client.image_enhancement_settings.get("stretch_parameter", "15% Bg, 3 sigma"),
                "available_stretch_parameters": [
                    "No Stretch",
                    "10% Bg, 3 sigma",
                    "15% Bg, 3 sigma",
                    "20% Bg, 3 sigma",
                    "30% Bg, 2 sigma"
                ]
            }

            return settings

        except Exception as e:
            logger.error(f"Error executing set image enhancement command: {e}")
            return {"status": "error", "message": str(e)}

    async def _execute_get_image_enhancement_command(
            self, client: Any, parameters: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Execute get image enhancement command - retrieves current enhancement settings."""
        try:
            # Try to get settings from client instance first
            stored_settings = getattr(client, "image_enhancement_settings", {})

            # Return frontend-compatible format
            settings = {
                "upscaling_enabled": stored_settings.get("upscaling_enabled", False),
                "scale_factor": stored_settings.get("scale_factor", 2.0),
                "upscaling_method": stored_settings.get("upscaling_method", "bicubic"),
                "available_upscaling_methods": ["bicubic", "lanczos"],
                "sharpening_enabled": stored_settings.get("sharpening_enabled", False),
                "sharpening_method": stored_settings.get("sharpening_method", "unsharp_mask"),
                "sharpening_strength": stored_settings.get("sharpening_strength", 1.0),
                "available_sharpening_methods": ["none", "unsharp_mask", "laplacian", "high_pass"],
                "invert_enabled": stored_settings.get("invert_enabled", False),
                "stretch_parameter": stored_settings.get("stretch_parameter", "15% Bg, 3 sigma"),
                "available_stretch_parameters": [
                    "No Stretch",
                    "10% Bg, 3 sigma",
                    "15% Bg, 3 sigma",
                    "20% Bg, 3 sigma",
                    "30% Bg, 2 sigma"
                ]
            }

            # Try to derive current settings from processors if not stored
            if not stored_settings:
                # Find the telescope object that owns this client
                telescope = None
                if self.telescope_getter:
                    # Find telescope by looking up which one has this client
                    for telescope_id, stored_client in self.telescope_clients.items():
                        if stored_client == client:
                            telescope = self.telescope_getter(telescope_id)
                            break

                if telescope:
                    # Check enhancement processor for upscaling settings
                    if hasattr(telescope, "enhancement_processor") and telescope.enhancement_processor:
                        if hasattr(telescope.enhancement_processor, "upscaling_enabled"):
                            settings["upscaling_enabled"] = telescope.enhancement_processor.upscaling_enabled
                        if hasattr(telescope.enhancement_processor, "scale_factor"):
                            settings["scale_factor"] = telescope.enhancement_processor.scale_factor
                        if hasattr(telescope.enhancement_processor, "upscaling_method"):
                            settings["upscaling_method"] = telescope.enhancement_processor.upscaling_method
                        if hasattr(telescope.enhancement_processor, "sharpening_enabled"):
                            settings["sharpening_enabled"] = telescope.enhancement_processor.sharpening_enabled
                        if hasattr(telescope.enhancement_processor, "sharpening_method"):
                            settings["sharpening_method"] = telescope.enhancement_processor.sharpening_method
                        if hasattr(telescope.enhancement_processor, "sharpening_strength"):
                            settings["sharpening_strength"] = telescope.enhancement_processor.sharpening_strength
                        if hasattr(telescope.enhancement_processor, "invert_enabled"):
                            settings["invert_enabled"] = telescope.enhancement_processor.invert_enabled

            logger.info(f"Retrieved image enhancement settings: {settings}")
            return settings

        except Exception as e:
            logger.error(f"Error executing get image enhancement command: {e}")
            return {"status": "error", "message": str(e)}

    async def _heartbeat_loop(self):
        """Background task to send heartbeats and check connection health."""
        while self._running:
            try:
                current_time = asyncio.get_event_loop().time()
                dead_connections = []

                for connection_id, connection in self.connections.items():
                    # Check if connection is stale
                    if (
                            current_time - connection.last_heartbeat
                            > self.heartbeat_interval * 2
                    ):
                        logger.warning(
                            f"Connection {connection_id} appears dead (no heartbeat)"
                        )
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


# Global WebSocket manager instance (initialized later)
_websocket_manager = None


def get_websocket_manager():
    """Get the global WebSocket manager instance."""
    global _websocket_manager
    if _websocket_manager is None:
        _websocket_manager = WebSocketManager()
    return _websocket_manager


def initialize_websocket_manager(telescope_getter=None):
    """Initialize the WebSocket manager with a telescope getter function."""
    global _websocket_manager
    _websocket_manager = WebSocketManager(telescope_getter=telescope_getter)
    return _websocket_manager
