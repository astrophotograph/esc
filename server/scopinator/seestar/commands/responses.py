"""Enhanced response models for parsing telescope message data."""

from typing import Any, Dict, List, Literal, Optional, Union
from pydantic import BaseModel, Field, validator
from datetime import datetime

from .common import CommandResponse
from .simple import (
    GetTimeResponse,
    GetCameraInfoResponse,
    GetCameraStateResponse,
    GetDiskVolumeResponse,
    GetDeviceStateResponse,
)


class MessageParsingError(BaseModel):
    """Error information when message parsing fails."""

    error_type: str
    message: str
    raw_data: str
    timestamp: str


class ParsedMessage(BaseModel):
    """Base class for parsed telescope messages."""

    raw_message: str
    timestamp: str
    message_type: Literal["command", "response", "event", "unknown"]
    parse_success: bool = True
    parse_error: Optional[MessageParsingError] = None


class ParsedCommand(ParsedMessage):
    """Parsed command message sent to telescope."""

    message_type: Literal["command"] = "command"
    command_id: Optional[int] = None
    method: str
    params: Optional[Dict[str, Any]] = None


class ParsedResponse(ParsedMessage):
    """Parsed response message received from telescope."""

    message_type: Literal["response"] = "response"
    response_id: int
    method: str
    jsonrpc: str = "2.0"
    code: int
    result: Optional[Union[Dict[str, Any], List[Any], int, float, str]] = None
    error: Optional[Dict[str, Any]] = None
    timestamp_telescope: Optional[str] = None  # Telescope's timestamp

    @validator("timestamp_telescope", pre=True)
    def parse_telescope_timestamp(cls, v):
        """Parse telescope timestamp if present."""
        if isinstance(v, str):
            try:
                # Validate it's a proper ISO format
                datetime.fromisoformat(v.replace("Z", "+00:00"))
                return v
            except ValueError:
                return None
        return v


class ParsedEvent(ParsedMessage):
    """Parsed event message received from telescope."""

    message_type: Literal["event"] = "event"
    event_type: str
    event_data: Dict[str, Any]
    timestamp_telescope: Optional[str] = None


class UnknownMessage(ParsedMessage):
    """Message that couldn't be categorized."""

    message_type: Literal["unknown"] = "unknown"
    attempted_parse_as: List[str] = []


# Specific enhanced response models with better typing


class EnhancedCommandResponse(CommandResponse):
    """Enhanced command response with better result typing."""

    parsed_result: Optional[BaseModel] = None
    result_type: Optional[str] = None

    def parse_result_as(self, model_class: type[BaseModel]) -> Optional[BaseModel]:
        """Parse the result field as a specific model type."""
        if self.result is None:
            return None

        try:
            if isinstance(self.result, dict):
                parsed = model_class(**self.result)
                self.parsed_result = parsed
                self.result_type = model_class.__name__
                return parsed
            elif isinstance(self.result, (list, tuple)) and hasattr(
                model_class, "__annotations__"
            ):
                # Handle tuple results by converting to dict with field names
                field_names = list(model_class.__annotations__.keys())
                if len(self.result) <= len(field_names):
                    result_dict = {
                        field_names[i]: self.result[i] for i in range(len(self.result))
                    }
                    parsed = model_class(**result_dict)
                    self.parsed_result = parsed
                    self.result_type = model_class.__name__
                    return parsed
            return None
        except Exception:
            return None


class TimeResponse(EnhancedCommandResponse):
    """Response from pi_get_time command."""

    def get_parsed_time(self) -> Optional[GetTimeResponse]:
        """Get parsed time response."""
        return self.parse_result_as(GetTimeResponse)


class DeviceStateResponse(EnhancedCommandResponse):
    """Response from get_device_state command."""

    def get_parsed_device_state(self) -> Optional[GetDeviceStateResponse]:
        """Get parsed device state response."""
        return self.parse_result_as(GetDeviceStateResponse)


class DiskVolumeResponse(EnhancedCommandResponse):
    """Response from get_disk_volume command."""

    def get_parsed_disk_volume(self) -> Optional[GetDiskVolumeResponse]:
        """Get parsed disk volume response."""
        return self.parse_result_as(GetDiskVolumeResponse)


class CameraInfoResponse(EnhancedCommandResponse):
    """Response from get_camera_info command."""

    def get_parsed_camera_info(self) -> Optional[GetCameraInfoResponse]:
        """Get parsed camera info response."""
        return self.parse_result_as(GetCameraInfoResponse)


class CoordinateResponse(EnhancedCommandResponse):
    """Response from coordinate commands (RA/Dec, etc)."""

    def get_coordinates(self) -> Optional[Dict[str, float]]:
        """Get coordinates as a dictionary."""
        if isinstance(self.result, dict):
            return self.result
        elif isinstance(self.result, (list, tuple)) and len(self.result) == 2:
            return {"ra": self.result[0], "dec": self.result[1]}
        return None


class FocuserPositionResponse(EnhancedCommandResponse):
    """Response from get_focuser_position command."""

    def get_position(self) -> Optional[int]:
        """Get focuser position as integer."""
        if isinstance(self.result, (int, float)):
            return int(self.result)
        elif isinstance(self.result, dict) and "position" in self.result:
            return self.result["position"]
        return None


class ViewStateResponse(EnhancedCommandResponse):
    """Response from get_view_state command."""

    def get_view_data(self) -> Optional[Dict[str, Any]]:
        """Get view state data."""
        if isinstance(self.result, dict) and "View" in self.result:
            return self.result["View"]
        return self.result if isinstance(self.result, dict) else None


# Message parsing utilities


class TelescopeMessageParser:
    """Utility class for parsing telescope messages."""

    @staticmethod
    def parse_message(raw_message: str, timestamp: str) -> ParsedMessage:
        """Parse a raw telescope message into a structured format."""
        import json

        try:
            data = json.loads(raw_message)
        except json.JSONDecodeError as e:
            return UnknownMessage(
                raw_message=raw_message,
                timestamp=timestamp,
                parse_success=False,
                parse_error=MessageParsingError(
                    error_type="JSON_DECODE_ERROR",
                    message=str(e),
                    raw_data=raw_message,
                    timestamp=timestamp,
                ),
            )

        # Determine message type and parse accordingly
        if "Event" in data:
            return TelescopeMessageParser._parse_event(data, raw_message, timestamp)
        elif "jsonrpc" in data:
            return TelescopeMessageParser._parse_response(data, raw_message, timestamp)
        elif "method" in data:
            return TelescopeMessageParser._parse_command(data, raw_message, timestamp)
        else:
            return UnknownMessage(
                raw_message=raw_message,
                timestamp=timestamp,
                attempted_parse_as=["event", "response", "command"],
            )

    @staticmethod
    def _parse_command(
        data: Dict[str, Any], raw_message: str, timestamp: str
    ) -> ParsedCommand:
        """Parse a command message."""
        return ParsedCommand(
            raw_message=raw_message,
            timestamp=timestamp,
            command_id=data.get("id"),
            method=data.get("method", "unknown"),
            params=data.get("params"),
        )

    @staticmethod
    def _parse_response(
        data: Dict[str, Any], raw_message: str, timestamp: str
    ) -> ParsedResponse:
        """Parse a response message."""
        return ParsedResponse(
            raw_message=raw_message,
            timestamp=timestamp,
            response_id=data.get("id", -1),
            method=data.get("method", "unknown"),
            jsonrpc=data.get("jsonrpc", "2.0"),
            code=data.get("code", 0),
            result=data.get("result"),
            error=data.get("error"),
            timestamp_telescope=data.get("Timestamp"),
        )

    @staticmethod
    def _parse_event(
        data: Dict[str, Any], raw_message: str, timestamp: str
    ) -> ParsedEvent:
        """Parse an event message."""
        return ParsedEvent(
            raw_message=raw_message,
            timestamp=timestamp,
            event_type=data.get("Event", "unknown"),
            event_data=data,
            timestamp_telescope=data.get("Timestamp"),
        )

    @staticmethod
    def create_enhanced_response(
        response_data: Dict[str, Any],
    ) -> EnhancedCommandResponse:
        """Create an enhanced command response from raw data."""
        base_response = EnhancedCommandResponse(**response_data)

        # Try to create specialized response based on method
        method = response_data.get("method", "")
        if method == "pi_get_time":
            return TimeResponse(**response_data)
        elif method == "get_device_state":
            return DeviceStateResponse(**response_data)
        elif method == "get_disk_volume":
            return DiskVolumeResponse(**response_data)
        elif method == "get_camera_info":
            return CameraInfoResponse(**response_data)
        elif method in [
            "scope_get_equ_coord",
            "scope_get_ra_dec",
            "scope_get_horiz_coord",
        ]:
            return CoordinateResponse(**response_data)
        elif method == "get_focuser_position":
            return FocuserPositionResponse(**response_data)
        elif method == "get_view_state":
            return ViewStateResponse(**response_data)
        else:
            return base_response


# Message analysis utilities


class MessageAnalytics:
    """Utilities for analyzing telescope message patterns."""

    @staticmethod
    def analyze_message_history(messages: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Analyze a list of telescope messages for patterns and statistics."""
        if not messages:
            return {"error": "No messages to analyze"}

        stats = {
            "total_messages": len(messages),
            "sent_count": 0,
            "received_count": 0,
            "commands": {},
            "events": {},
            "responses": {},
            "parse_errors": 0,
            "time_range": {},
            "most_common_commands": [],
            "most_common_events": [],
            "response_times": [],
        }

        command_counts = {}
        event_counts = {}
        response_counts = {}
        timestamps = []

        for msg in messages:
            direction = msg.get("direction", "unknown")
            if direction == "sent":
                stats["sent_count"] += 1
            elif direction == "received":
                stats["received_count"] += 1

            # Parse timestamp
            timestamp_str = msg.get("timestamp", "")
            if timestamp_str:
                timestamps.append(timestamp_str)

            # Parse message content
            parsed = TelescopeMessageParser.parse_message(
                msg.get("message", ""), timestamp_str
            )

            if not parsed.parse_success:
                stats["parse_errors"] += 1
                continue

            # Count message types
            if isinstance(parsed, ParsedCommand):
                method = parsed.method
                command_counts[method] = command_counts.get(method, 0) + 1
            elif isinstance(parsed, ParsedEvent):
                event_type = parsed.event_type
                event_counts[event_type] = event_counts.get(event_type, 0) + 1
            elif isinstance(parsed, ParsedResponse):
                method = parsed.method
                response_counts[method] = response_counts.get(method, 0) + 1

        # Calculate most common
        stats["commands"] = command_counts
        stats["events"] = event_counts
        stats["responses"] = response_counts

        stats["most_common_commands"] = sorted(
            command_counts.items(), key=lambda x: x[1], reverse=True
        )[:10]

        stats["most_common_events"] = sorted(
            event_counts.items(), key=lambda x: x[1], reverse=True
        )[:10]

        # Time range analysis
        if timestamps:
            timestamps.sort()
            stats["time_range"] = {
                "earliest": timestamps[0],
                "latest": timestamps[-1],
                "duration_messages": len(timestamps),
            }

        return stats
