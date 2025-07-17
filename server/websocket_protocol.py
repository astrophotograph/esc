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
    ANNOTATION_EVENT = "annotation_event"

    # Control commands
    CONTROL_COMMAND = "control_command"
    COMMAND_RESPONSE = "command_response"

    # Connection management
    HEARTBEAT = "heartbeat"
    ERROR = "error"
    SUBSCRIBE = "subscribe"
    UNSUBSCRIBE = "unsubscribe"


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


# Type aliases for convenience
WebSocketMessageUnion = Union[
    StatusUpdateMessage,
    ControlCommandMessage,
    CommandResponseMessage,
    TelescopeDiscoveredMessage,
    TelescopeLostMessage,
    SubscribeMessage,
    UnsubscribeMessage,
    HeartbeatMessage,
    ErrorMessage,
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
