"""
WebSocket message protocol definitions for telescope communication.

This module defines the message types and data structures used for bidirectional
communication between the web frontend and the telescope control backend.
"""

import time
import uuid
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional, Union

from pydantic import BaseModel, Field


class MessageType(str, Enum):
    """WebSocket message types."""

    # Status and updates  
    STATUS_UPDATE = "status_update"
    TELESCOPE_DISCOVERED = "telescope_discovered"
    TELESCOPE_LOST = "telescope_lost"
    TELESCOPE_LIST = "telescope_list"  # Full telescope list update
    ANNOTATION_EVENT = "annotation_event"
    ALERT = "alert"
    PLATE_SOLVE_RESULT = "plate_solve_result"
    CLIENT_MODE_CHANGED = "client_mode_changed"
    SERVER_INIT = "server_init"  # Server initialization status

    # Control commands
    CONTROL_COMMAND = "control_command"
    COMMAND_RESPONSE = "command_response"
    REQUEST_TELESCOPE_LIST = "request_telescope_list"  # Request for telescope list

    # Connection management
    HEARTBEAT = "heartbeat"
    ERROR = "error"
    SUBSCRIBE = "subscribe"
    UNSUBSCRIBE = "unsubscribe"
    ECHO_REQUEST = "echo_request"
    ECHO_RESPONSE = "echo_response"


class CommandAction(str, Enum):
    """Available telescope control actions."""

    GOTO = "goto"
    MOVE = "move"
    PARK = "park"
    FOCUS = "focus"
    FOCUS_INCREMENT = "focus_increment"
    START_IMAGING = "start_imaging"
    STOP_IMAGING = "stop_imaging"
    SET_GAIN = "set_gain"
    SET_EXPOSURE = "set_exposure"
    SCENERY = "scenery"
    SET_IMAGE_ENHANCEMENT = "set_image_enhancement"
    GET_IMAGE_ENHANCEMENT = "get_image_enhancement"


class SubscriptionType(str, Enum):
    """Available subscription types for status updates."""

    ALL = "all"
    STATUS = "status"
    IMAGING = "imaging"
    POSITION = "position"
    FOCUS = "focus"
    SYSTEM = "system"


class WebSocketMessage(BaseModel):
    """Base WebSocket message structure."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: MessageType
    telescope_id: Optional[str] = None
    timestamp: float = Field(default_factory=time.time)
    payload: Dict[str, Any] = Field(default_factory=dict)


class StatusUpdateMessage(WebSocketMessage):
    """Status update message from telescope."""

    type: MessageType = MessageType.STATUS_UPDATE
    payload: Dict[str, Any] = Field(
        description="Telescope status data with changed properties highlighted"
    )

    def __init__(
        self,
        telescope_id: str,
        status: Dict[str, Any],
        changes: Optional[List[str]] = None,
        **data,
    ):
        super().__init__(
            telescope_id=telescope_id,
            payload={
                "status": status,
                "changes": changes or [],
                "full_update": changes is None,
            },
            **data,
        )


class ControlCommandMessage(WebSocketMessage):
    """Control command message to telescope."""

    type: MessageType = MessageType.CONTROL_COMMAND

    def __init__(
        self,
        telescope_id: str,
        action: CommandAction,
        parameters: Optional[Dict[str, Any]] = None,
        response_expected: bool = True,
        **data,
    ):
        super().__init__(
            telescope_id=telescope_id,
            payload={
                "action": action,
                "parameters": parameters or {},
                "response_expected": response_expected,
            },
            **data,
        )


class CommandResponseMessage(WebSocketMessage):
    """Response to a control command."""

    type: MessageType = MessageType.COMMAND_RESPONSE

    def __init__(
        self,
        telescope_id: str,
        command_id: str,
        success: bool,
        result: Optional[Dict[str, Any]] = None,
        error: Optional[str] = None,
        **data,
    ):
        super().__init__(
            telescope_id=telescope_id,
            payload={
                "command_id": command_id,
                "success": success,
                "result": result,
                "error": error,
            },
            **data,
        )


class TelescopeDiscoveredMessage(WebSocketMessage):
    """Notification when a new telescope is discovered."""

    type: MessageType = MessageType.TELESCOPE_DISCOVERED

    def __init__(self, telescope_info: Dict[str, Any], **data):
        super().__init__(
            telescope_id=telescope_info.get("id"),
            payload={"telescope": telescope_info},
            **data,
        )


class TelescopeLostMessage(WebSocketMessage):
    """Notification when a telescope connection is lost."""

    type: MessageType = MessageType.TELESCOPE_LOST

    def __init__(self, telescope_id: str, reason: str = "Connection lost", **data):
        super().__init__(telescope_id=telescope_id, payload={"reason": reason}, **data)


class AnnotationEventMessage(WebSocketMessage):
    """Notification when annotation events are received from telescope."""

    type: MessageType = MessageType.ANNOTATION_EVENT

    def __init__(
        self,
        telescope_id: str,
        annotations: List[Dict[str, Any]],
        image_size: List[int],
        image_id: int,
        **data,
    ):
        super().__init__(
            telescope_id=telescope_id,
            payload={
                "annotations": annotations,
                "image_size": image_size,
                "image_id": image_id,
            },
            **data,
        )


class AlertMessage(WebSocketMessage):
    """Alert message from telescope (e.g., warnings, errors, notifications)."""

    type: MessageType = MessageType.ALERT

    def __init__(
        self,
        telescope_id: str,
        state: Optional[str] = None,
        error: str = "",
        code: int = 0,
        **data,
    ):
        super().__init__(
            telescope_id=telescope_id,
            payload={
                "state": state,
                "error": error,
                "code": code,
            },
            **data,
        )


class ClientModeChangedMessage(WebSocketMessage):
    """Client mode change notification."""

    type: MessageType = MessageType.CLIENT_MODE_CHANGED

    def __init__(
        self,
        telescope_id: str,
        old_mode: Optional[str] = None,
        new_mode: Optional[str] = None,
        **data,
    ):
        super().__init__(
            telescope_id=telescope_id,
            payload={
                "old_mode": old_mode,
                "new_mode": new_mode,
            },
            **data,
        )


class PlateSolveResultMessage(WebSocketMessage):
    """Plate solve result message containing astrometry solution."""

    type: MessageType = MessageType.PLATE_SOLVE_RESULT

    def __init__(
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
        **data,
    ):
        super().__init__(
            telescope_id=telescope_id,
            payload={
                "job_id": job_id,
                "success": success,
                "ra": ra,
                "dec": dec,
                "orientation": orientation,
                "pixscale": pixscale,
                "field_width": field_width,
                "field_height": field_height,
                "error": error,
                "submission_id": submission_id,
                "astrometry_job_id": astrometry_job_id,
            },
            **data,
        )


class SubscribeMessage(WebSocketMessage):
    """Client subscription to specific update types."""

    type: MessageType = MessageType.SUBSCRIBE

    def __init__(
        self,
        telescope_id: Optional[str] = None,
        subscription_types: Optional[List[SubscriptionType]] = None,
        **data,
    ):
        super().__init__(
            telescope_id=telescope_id,
            payload={
                "subscription_types": subscription_types or [SubscriptionType.ALL],
                "all_telescopes": telescope_id is None,
            },
            **data,
        )


class UnsubscribeMessage(WebSocketMessage):
    """Client unsubscription from update types."""

    type: MessageType = MessageType.UNSUBSCRIBE

    def __init__(
        self,
        telescope_id: Optional[str] = None,
        subscription_types: Optional[List[SubscriptionType]] = None,
        **data,
    ):
        super().__init__(
            telescope_id=telescope_id,
            payload={
                "subscription_types": subscription_types or [SubscriptionType.ALL],
                "all_telescopes": telescope_id is None,
            },
            **data,
        )


class HeartbeatMessage(WebSocketMessage):
    """Heartbeat message for connection keepalive."""

    type: MessageType = MessageType.HEARTBEAT

    def __init__(self, **data):
        super().__init__(payload={"server_time": datetime.utcnow().isoformat()}, **data)


class ErrorMessage(WebSocketMessage):
    """Error message."""

    type: MessageType = MessageType.ERROR

    def __init__(
        self,
        error_code: str,
        error_message: str,
        telescope_id: Optional[str] = None,
        **data,
    ):
        super().__init__(
            telescope_id=telescope_id,
            payload={"error_code": error_code, "message": error_message},
            **data,
        )


class EchoRequestMessage(WebSocketMessage):
    """Echo request message for measuring round-trip time."""
    
    type: MessageType = MessageType.ECHO_REQUEST
    
    def __init__(self, telescope_id: str, **data):
        super().__init__(
            telescope_id=telescope_id,
            payload={
                "timestamp": time.time(),
                "sequence": data.get("sequence", 0),
            },
            **data,
        )


class EchoResponseMessage(WebSocketMessage):
    """Echo response message from client."""
    
    type: MessageType = MessageType.ECHO_RESPONSE
    
    def __init__(self, telescope_id: str, request_timestamp: float, sequence: int = 0, **data):
        super().__init__(
            telescope_id=telescope_id,
            payload={
                "request_timestamp": request_timestamp,
                "response_timestamp": time.time(),
                "sequence": sequence,
            },
            **data,
        )


class ServerInitMessage(WebSocketMessage):
    """Server initialization status message."""
    
    type: MessageType = MessageType.SERVER_INIT
    
    def __init__(self, stage: str, message: str, progress: Optional[float] = None, **data):
        """Create a server initialization message.
        
        Args:
            stage: Current initialization stage (e.g., 'websocket', 'database', 'discovery', 'telescope_connection')
            message: Human-readable message about the current step
            progress: Optional progress percentage (0-100)
        """
        super().__init__(
            payload={
                "stage": stage,
                "message": message,
                "progress": progress,
                "timestamp": time.time()
            },
            **data
        )


class TelescopeListMessage(WebSocketMessage):
    """Message containing the full list of available telescopes."""
    
    type: MessageType = MessageType.TELESCOPE_LIST
    
    def __init__(self, telescopes: List[Dict[str, Any]], **data):
        """Create a telescope list message.
        
        Args:
            telescopes: List of telescope information dictionaries
        """
        super().__init__(
            payload={
                "telescopes": telescopes,
                "count": len(telescopes),
                "timestamp": time.time()
            },
            **data
        )


# Type aliases for convenience
WebSocketMessageUnion = Union[
    StatusUpdateMessage,
    ControlCommandMessage,
    CommandResponseMessage,
    TelescopeDiscoveredMessage,
    TelescopeLostMessage,
    AnnotationEventMessage,
    AlertMessage,
    ClientModeChangedMessage,
    SubscribeMessage,
    UnsubscribeMessage,
    HeartbeatMessage,
    ErrorMessage,
    EchoRequestMessage,
    EchoResponseMessage,
    ServerInitMessage,
    TelescopeListMessage,
]


class MessageFactory:
    """Factory for creating WebSocket messages."""

    @staticmethod
    def parse_message(data: Dict[str, Any]) -> WebSocketMessage:
        """Parse incoming WebSocket message data into appropriate message type."""
        message_type = data.get("type")
        payload = data.get("payload", {})

        if message_type == MessageType.CONTROL_COMMAND:
            # Extract parameters from payload for control commands
            action = payload.get("action")
            parameters = payload.get("parameters", {})
            response_expected = payload.get("response_expected", True)

            return ControlCommandMessage(
                telescope_id=data.get("telescope_id"),
                action=action,
                parameters=parameters,
                response_expected=response_expected,
                id=data.get("id"),
                timestamp=data.get("timestamp"),
            )
        elif message_type == MessageType.SUBSCRIBE:
            # Extract subscription parameters from payload
            subscription_types = payload.get(
                "subscription_types", [SubscriptionType.ALL]
            )

            return SubscribeMessage(
                telescope_id=data.get("telescope_id"),
                subscription_types=subscription_types,
                id=data.get("id"),
                timestamp=data.get("timestamp"),
            )
        elif message_type == MessageType.UNSUBSCRIBE:
            # Extract unsubscription parameters from payload
            subscription_types = payload.get(
                "subscription_types", [SubscriptionType.ALL]
            )

            return UnsubscribeMessage(
                telescope_id=data.get("telescope_id"),
                subscription_types=subscription_types,
                id=data.get("id"),
                timestamp=data.get("timestamp"),
            )
        elif message_type == MessageType.HEARTBEAT:
            return HeartbeatMessage(id=data.get("id"), timestamp=data.get("timestamp"))
        elif message_type == MessageType.ECHO_REQUEST:
            return EchoRequestMessage(
                telescope_id=data.get("telescope_id"),
                id=data.get("id"),
                timestamp=data.get("timestamp"),
                sequence=payload.get("sequence", 0)
            )
        elif message_type == MessageType.ECHO_RESPONSE:
            return EchoResponseMessage(
                telescope_id=data.get("telescope_id"),
                request_timestamp=payload.get("request_timestamp"),
                sequence=payload.get("sequence", 0),
                id=data.get("id"),
                timestamp=data.get("timestamp")
            )
        else:
            # Default to base WebSocket message
            return WebSocketMessage.model_validate(data)

    @staticmethod
    def create_status_update(
        telescope_id: str, status: Dict[str, Any], changes: Optional[List[str]] = None
    ) -> StatusUpdateMessage:
        """Create a status update message."""
        return StatusUpdateMessage(
            telescope_id=telescope_id, status=status, changes=changes
        )

    @staticmethod
    def create_command_response(
        telescope_id: str,
        command_id: str,
        success: bool,
        result: Optional[Dict[str, Any]] = None,
        error: Optional[str] = None,
    ) -> CommandResponseMessage:
        """Create a command response message."""
        return CommandResponseMessage(
            telescope_id=telescope_id,
            command_id=command_id,
            success=success,
            result=result,
            error=error,
        )

    @staticmethod
    def create_error(
        error_code: str, error_message: str, telescope_id: Optional[str] = None
    ) -> ErrorMessage:
        """Create an error message."""
        return ErrorMessage(
            error_code=error_code,
            error_message=error_message,
            telescope_id=telescope_id,
        )

    @staticmethod
    def create_telescope_discovered(
        telescope_info: Dict[str, Any],
    ) -> TelescopeDiscoveredMessage:
        """Create a telescope discovered message."""
        return TelescopeDiscoveredMessage(telescope_info=telescope_info)

    @staticmethod
    def create_telescope_lost(
        telescope_id: str, reason: str = "Connection lost"
    ) -> TelescopeLostMessage:
        """Create a telescope lost message."""
        return TelescopeLostMessage(telescope_id=telescope_id, reason=reason)

    @staticmethod
    def create_alert(
        telescope_id: str,
        state: Optional[str] = None,
        error: str = "",
        code: int = 0,
    ) -> AlertMessage:
        """Create an alert message."""
        return AlertMessage(
            telescope_id=telescope_id,
            state=state,
            error=error,
            code=code,
        )

    @staticmethod
    def create_plate_solve_result(
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
    ) -> PlateSolveResultMessage:
        """Create a plate solve result message."""
        return PlateSolveResultMessage(
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

    @staticmethod
    def create_client_mode_changed(
        telescope_id: str,
        old_mode: Optional[str] = None,
        new_mode: Optional[str] = None,
    ) -> ClientModeChangedMessage:
        """Create a client mode changed message."""
        return ClientModeChangedMessage(
            telescope_id=telescope_id,
            old_mode=old_mode,
            new_mode=new_mode,
        )

    @staticmethod
    def create_server_init(
        stage: str, message: str, progress: Optional[float] = None
    ) -> ServerInitMessage:
        """Create a server initialization message."""
        return ServerInitMessage(stage=stage, message=message, progress=progress)
    
    @staticmethod
    def create_telescope_list(
        telescopes: List[Dict[str, Any]]
    ) -> TelescopeListMessage:
        """Create a telescope list message."""
        return TelescopeListMessage(telescopes=telescopes)
