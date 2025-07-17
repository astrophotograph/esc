import asyncio
import collections
import itertools
import json
import re
from datetime import datetime
from pathlib import Path
from typing import TypeVar, Literal, Any, Dict

import pydash
from loguru import logger as logging
from pydantic import BaseModel

from smarttel.seestar.commands.common import CommandResponse
from smarttel.seestar.commands.responses import (
    TelescopeMessageParser, 
    MessageAnalytics,
    EnhancedCommandResponse
)
from smarttel.seestar.commands.simple import (
    GetTime,
    GetDeviceState,
    GetViewState,
    GetFocuserPosition,
    GetDiskVolume,
    ScopeGetEquCoord,
)
from smarttel.seestar.connection import SeestarConnection
from smarttel.seestar.events import (
    EventTypes,
    PiStatusEvent,
    AnnotateResult,
    AnnotateEvent,
    InternalEvent,
)
from smarttel.seestar.protocol_handlers import TextProtocol
from smarttel.util.eventbus import EventBus

U = TypeVar("U")


class TelescopeMessage(BaseModel):
    """A message sent or received by the telescope."""

    timestamp: str
    direction: Literal["sent", "received"]
    message: str


class SeestarStatus(BaseModel):
    """Seestar status."""

    temp: float | None = None
    charger_status: Literal["Discharging", "Charging", "Full"] | None = None
    stage: str | None = None
    charge_online: bool | None = None
    battery_capacity: int | None = None
    stacked_frame: int = 0
    dropped_frame: int = 0
    target_name: str = ""
    annotate: AnnotateResult | None = None
    pattern_match_found: bool = False
    pattern_match_file: str | None = None
    pattern_match_last_check: str | None = None
    focus_position: int | None = None
    lp_filter: bool = False
    gain: int | None = None
    freeMB: int | None = None
    totalMB: int | None = None
    ra: float | None = None
    dec: float | None = None

    def reset(self):
        self.temp = None
        self.charger_status = None
        self.charge_online = None
        self.battery_capacity = None
        self.stacked_frame = 0
        self.dropped_frame = 0
        self.target_name = ""
        self.annotate = None
        self.pattern_match_found = False
        self.pattern_match_file = None
        self.pattern_match_last_check = None
        self.focus_position = None
        self.lp_filter = False
        self.gain = None
        self.freeMB = None
        self.totalMB = None
        self.ra = None
        self.dec = None
        self.stage = None


class ParsedEvent(BaseModel):
    """Parsed event."""

    event: EventTypes


class SeestarClient(BaseModel, arbitrary_types_allowed=True):
    """Seestar client."""

    host: str
    port: int
    event_bus: EventBus | None = None
    connection: SeestarConnection | None = None
    # Start counter at 100 to not conflict with some lower, hardcoded IDs
    counter: itertools.count = itertools.count(100)
    is_connected: bool = False
    status: SeestarStatus = SeestarStatus()
    view_refresh_task: asyncio.Task | None = None
    background_task: asyncio.Task | None = None
    reader_task: asyncio.Task | None = None
    pattern_monitor_task: asyncio.Task | None = None
    responses: dict[int, dict] = {}
    recent_events: collections.deque = collections.deque(maxlen=5)
    text_protocol: TextProtocol = TextProtocol()
    client_mode: Literal["ContinuousExposure", "Stack", "Streaming"] | None = None
    message_history: collections.deque = collections.deque(maxlen=5000)

    # Pattern monitoring configuration
    pattern_file_path: str = "/mnt/sfro/roof/building-6/RoofStatusFile.txt"
    pattern_regex: str = r"OPEN"
    pattern_check_interval: float = 5.0

    # Timeout configuration
    connection_timeout: float = 10.0
    read_timeout: float = 30.0
    write_timeout: float = 10.0

    def __init__(
        self,
        host: str,
        port: int,
        event_bus: EventBus,
        connection_timeout: float = 10.0,
        read_timeout: float = 30.0,
        write_timeout: float = 10.0,
    ):
        super().__init__(
            host=host,
            port=port,
            event_bus=event_bus,
            connection_timeout=connection_timeout,
            read_timeout=read_timeout,
            write_timeout=write_timeout,
        )

        self.connection = SeestarConnection(
            host=host,
            port=port,
            connection_timeout=connection_timeout,
            read_timeout=read_timeout,
            write_timeout=write_timeout,
        )

    async def _reader(self):
        """Background task that continuously reads messages and handles them."""
        logging.info(f"Starting reader task for {self}")
        while self.is_connected:
            try:
                # Check if connection is still valid
                if not self.connection.is_connected():
                    logging.warning(
                        f"Connection lost for {self}, attempting to reconnect..."
                    )
                    await asyncio.sleep(1.0)  # Wait before next iteration
                    continue

                response_str = await self.connection.read()
                if response_str is not None:
                    # Log received message
                    self.message_history.append(
                        TelescopeMessage(
                            timestamp=datetime.now().isoformat(),
                            direction="received",
                            message=response_str,
                        )
                    )

                    # Parse and handle the response
                    if "Event" in response_str:
                        # Handle events
                        await self._handle_event(response_str)
                    elif "jsonrpc" in response_str:
                        # Parse as command response and let protocol handler process it
                        try:
                            parsed_response = CommandResponse(
                                **json.loads(response_str)
                            )
                            self.text_protocol.handle_incoming_message(parsed_response)
                        except Exception as parse_error:
                            logging.error(
                                f"Error parsing response from {self}: {response_str} {parse_error}"
                            )
                else:
                    # response_str is None, which could mean connection issues handled by connection layer
                    # Check if we're still connected and continue
                    if not self.connection.is_connected():
                        logging.debug(
                            f"Connection not available for {self}, will retry"
                        )
                        await asyncio.sleep(0.5)
                    continue
            except Exception as e:
                logging.error(f"Unexpected error in reader task for {self}: {e}")
                if self.is_connected:
                    await asyncio.sleep(1.0)  # Brief pause before retrying
                    continue
                else:
                    break
        logging.debug(f"Reader task stopped for {self}")

    async def _pattern_monitor(self):
        """Background task that monitors a file for specific patterns."""
        logging.info(
            f"Starting pattern monitor task for {self} - monitoring {self.pattern_file_path}"
        )
        last_modified_time = None
        last_file_size = 0

        while self.is_connected:
            try:
                file_path = Path(self.pattern_file_path)
                current_time = datetime.now().isoformat()

                # Check if file exists
                if not file_path.exists():
                    self.status.pattern_match_last_check = current_time
                    await asyncio.sleep(self.pattern_check_interval)
                    continue

                # Get file stats
                stat = file_path.stat()
                current_modified_time = stat.st_mtime
                current_size = stat.st_size

                # Check if file has been modified or grown
                if (
                    last_modified_time is None
                    or current_modified_time > last_modified_time
                    or current_size > last_file_size
                ):
                    # Read the file content
                    try:
                        with open(
                            file_path, "r", encoding="utf-8", errors="ignore"
                        ) as f:
                            content = f.read()

                        # Search for pattern
                        pattern_found = bool(
                            re.search(self.pattern_regex, content, re.IGNORECASE)
                        )

                        # Update status
                        self.status.pattern_match_found = pattern_found
                        self.status.pattern_match_file = str(file_path)
                        self.status.pattern_match_last_check = current_time

                        if pattern_found:
                            logging.info(
                                f"Pattern '{self.pattern_regex}' found in {file_path}"
                            )
                        else:
                            logging.trace(
                                f"Pattern '{self.pattern_regex}' not found in {file_path}"
                            )

                        # Update tracking variables
                        last_modified_time = current_modified_time
                        last_file_size = current_size

                    except Exception as e:
                        logging.error(f"Error reading pattern file {file_path}: {e}")
                        self.status.pattern_match_last_check = current_time
                else:
                    # File hasn't changed, just update the check time
                    self.status.pattern_match_last_check = current_time

            except Exception as e:
                logging.error(f"Error in pattern monitor task for {self}: {e}")
                self.status.pattern_match_last_check = datetime.now().isoformat()

            await asyncio.sleep(self.pattern_check_interval)

        logging.debug(f"Pattern monitor task stopped for {self}")

    async def _heartbeat(self):
        # todo : properly check if is_connected!!
        await asyncio.sleep(5)
        while True:
            if self.is_connected:
                logging.trace(f"Pinging {self}")
                _ = await self.send_and_recv(GetTime())
            # todo : add reschedulable heartbeat
            # todo : decrease sleep time to 1 second and, instead, check next heartbeat time
            # todo : add different protocol handler.  specifies heartbeat message and read message.
            await asyncio.sleep(5)

    async def _view_refresher(self):
        """Background task that refreshes the view state periodically."""
        logging.info(f"Starting view refresher task for {self}")
        while True:
            if self.is_connected:
                response = await self.send_and_recv(GetViewState())
                self._process_view_state(response)
                response = await self.send_and_recv(GetDiskVolume())
                self.status.freeMB = response.result.get("freeMB")
                self.status.totalMB = response.result.get("totalMB")
            await asyncio.sleep(30)

    def _process_view(self, data: dict[str, Any] | None):
        if not data:
            return

        self.status.target_name = pydash.get(data, "target_name", "unknown")
        self.status.gain = pydash.get(data, "gain", 0)

        stage = pydash.get(data, "stage", "unknown")
        mode = pydash.get(data, "mode", "unknown")
        state = pydash.get(data, "state", "unknown")

        annotate_result = pydash.get(data, "Stack.Annotate.result", None)

        if annotate_result is not None:
            annotation = AnnotateEvent(
                Timestamp=datetime.now().isoformat(),
                result=annotate_result,
            )
            self.status.annotate = annotate_result
            self.event_bus.emit("Annotate", annotation)

        # Update client mode
        new_client_mode = None
        if state != "cancel":
            if stage == "ContinuousExposure":
                new_client_mode = "ContinuousExposure"
            elif stage == "RTSP":
                new_client_mode = "Streaming"
            elif stage == "Stack":
                new_client_mode = "Stacking"

        if self.client_mode != new_client_mode:
            # client mode is changing, so let's make appropriate changes
            logging.warning(
                f"Client mode changing from {self.client_mode} to {new_client_mode}"
            )
            self.event_bus.emit(
                "ClientModeChanged",
                InternalEvent(
                    Timestamp=datetime.now().isoformat(),
                    params={"existing": self.client_mode, "new_mode": new_client_mode},
                ),
            )
            pass

        self.client_mode = new_client_mode
        self.status.stage = stage

    def _process_view_state(self, response: CommandResponse):
        """Process view state."""
        logging.trace(f"Processing view state from {self}: {response}")
        if response.result is not None:
            # print(f"view state: {response.result}")
            view = response.result["View"]
            self._process_view(view)
        else:
            logging.error(f"Error while processing view state from {self}: {response}")

    def _process_device_state(self, response: CommandResponse):
        """Process device state."""
        logging.trace(f"Processing device state from {self}: {response}")
        if response.result is not None:
            pi_status = PiStatusEvent(
                **response.result["pi_status"], Timestamp=response.Timestamp
            )
            self.status.temp = pi_status.temp
            self.status.charger_status = pi_status.charger_status
            self.status.charge_online = pi_status.charge_online
            self.status.battery_capacity = pi_status.battery_capacity
        else:
            logging.error(
                f"Error while processing device state from {self}: {response}"
            )

    def _process_focuser_position(self, response: CommandResponse):
        """Process focuser position."""
        logging.trace(f"Processing focuser position from {self}: {response}")
        if response.result is not None:
            self.status.focus_position = response.result
        else:
            logging.error(
                f"Error while processing focuser position from {self}: {response}"
            )

    def _process_current_coords(self, response: CommandResponse):
        """Process current coordinates."""
        logging.trace(f"Processing current coordinates from {self}: {response}")
        if response.result is not None:
            equ_coord = response.result
            self.status.ra = 15.0 * float(equ_coord.get("ra"))
            self.status.dec = float(equ_coord.get("dec"))

    async def connect(self):
        await self.connection.open()
        self.is_connected = True
        self.status.reset()

        # Start background tasks
        self.background_task = asyncio.create_task(self._heartbeat())
        self.reader_task = asyncio.create_task(self._reader())
        self.pattern_monitor_task = asyncio.create_task(self._pattern_monitor())
        self.view_refresh_task = asyncio.create_task(self._view_refresher())

        # Upon connect, grab current status

        response: CommandResponse = await self.send_and_recv(GetDeviceState())

        self._process_device_state(response)

        response = await self.send_and_recv(GetViewState())
        logging.trace(f"Received GetViewState: {response}")

        self._process_view_state(response)

        # Get initial focus position
        response = await self.send_and_recv(GetFocuserPosition())
        logging.trace(f"Received GetFocuserPosition: {response}")

        self._process_focuser_position(response)

        # Get initial coordinates
        response = await self.send_and_recv(ScopeGetEquCoord())
        logging.trace(f"Received ScopeGetEquCoord: {response}")
        self._process_current_coords(response)

        logging.info(f"Connected to {self}")

    async def disconnect(self):
        """Disconnect from Seestar."""
        self.is_connected = False

        # Cancel background tasks
        if self.background_task:
            self.background_task.cancel()
            try:
                await self.background_task
            except asyncio.CancelledError:
                pass
            self.background_task = None

        if self.reader_task:
            self.reader_task.cancel()
            try:
                await self.reader_task
            except asyncio.CancelledError:
                pass
            self.reader_task = None

        if self.pattern_monitor_task:
            self.pattern_monitor_task.cancel()
            try:
                await self.pattern_monitor_task
            except asyncio.CancelledError:
                pass
            self.pattern_monitor_task = None

        await self.connection.close()
        logging.info(f"Disconnected from {self}")

    async def send(self, data: str | BaseModel):
        # todo : do connected check...
        # todo : set "next heartbeat" time, and then in the heartbeat task, check the value
        if isinstance(data, BaseModel):
            if data.id is None:
                data.id = next(self.counter)
            data = data.model_dump_json()

        # Log sent message
        self.message_history.append(
            TelescopeMessage(
                timestamp=datetime.now().isoformat(), direction="sent", message=data
            )
        )

        await self.connection.write(data)

    async def _handle_event(self, event_str: str):
        """Parse an event."""
        logging.trace(f"Handling event from {self}: {event_str}")
        try:
            parsed = json.loads(event_str)
            parser: ParsedEvent = ParsedEvent(event=parsed)
            # print(f"Received event from {self}: {type(parser.event)} {parser}")
            logging.trace(
                f"Received event from {self}: {parser.event.Event} {type(parser.event)}"
            )
            self.recent_events.append(parser.event)
            match parser.event.Event:
                case "PiStatus":
                    pi_status = parser.event
                    if pi_status.temp is not None:
                        self.status.temp = pi_status.temp
                    if pi_status.charger_status is not None:
                        self.status.charger_status = pi_status.charger_status
                    if pi_status.charge_online is not None:
                        self.status.charge_online = pi_status.charge_online
                    if pi_status.battery_capacity is not None:
                        self.status.battery_capacity = pi_status.battery_capacity
                case "Stack":
                    logging.debug(f"Updating stacked frame and dropped frame: {parsed}")
                    if self.status.stacked_frame is not None:
                        self.status.stacked_frame = parser.event.stacked_frame
                    if self.status.dropped_frame is not None:
                        self.status.dropped_frame = parser.event.dropped_frame
                    self.event_bus.emit("Stack", parser.event)
                case "Annotate":
                    annotate_event = AnnotateEvent(**parser.event)
                    self.status.annotate = annotate_event.result
                    self.event_bus.emit("Annotate", annotate_event)
                case "FocuserMove":
                    focuser_event = parser.event
                    if focuser_event.position is not None:
                        self.status.focus_position = focuser_event.position
                    logging.trace(f"Focuser event: {focuser_event}")
                case "WheelMove":
                    wheel_event = parser.event
                    if wheel_event.state == "complete":
                        self.status.lp_filter = wheel_event.position == 2
                case "View":
                    self._process_view(parser.event.dict())
                # Todo: include Exposure, Stacked
                # case _:
                #    logging.debug(f"Unhandled event: {parser}")
        except Exception as e:
            logging.error(
                f"Error while parsing event from {self}: {event_str} {type(e)} {e}"
            )

    async def send_and_recv(self, data: str | BaseModel) -> CommandResponse | None:
        # Get or assign message ID
        if isinstance(data, BaseModel):
            if data.id is None:
                data.id = next(self.counter)
            message_id = data.id
        else:
            # For string data, we can't easily assign an ID, so fall back to simple send
            await self.send(data)
            return None

        await self.send(data)

        # The reader task handles all incoming messages and resolves futures
        # We just need to wait for our specific message ID
        return await self.text_protocol.recv_message(self, message_id)

    async def update_current_coords(self) -> bool:
        """Update telescope position.

        Returns True if the position changed, False otherwise."""
        response = await self.send_and_recv(ScopeGetEquCoord())
        logging.trace(f"Received ScopeGetEquCoord: {response}")
        if response is not None:
            # Normalize to degrees...
            new_ra = response.result.get("ra") * 15.0
            new_dec = response.result.get("dec")

            if new_ra != self.status.ra or new_dec != self.status.dec:
                self.status.ra = new_ra
                self.status.dec = new_dec
                return True
        return False

    # async def recv(self) -> CommandResponse[U] | None:
    #     """Receive data from Seestar."""
    #     response = ""
    #     try:
    #         while 'jsonrpc' not in response:
    #             response = await self.connection.read()
    #             # if self.debug:
    #             #    print(f"Received data from {self}: {response}")
    #             if response is None:
    #                 await self.disconnect()
    #                 return None
    #             if 'Event' in response:
    #                 # it's an event, so parse it and stash!
    #                 self._handle_event(response)
    #                 return None
    #
    #         parsed_response = CommandResponse[U](**json.loads(response))
    #
    #         # Try to resolve any pending futures for this message
    #         if self.text_protocol.handle_incoming_message(parsed_response):
    #             # Message was handled by a pending future, don't return it here
    #             return None
    #
    #         # No pending future for this message, return it normally
    #         return parsed_response
    #     except Exception as e:
    #         logging.error(f"Error while receiving data from {self}: {response} {e}")
    #         raise e

    def get_message_history(self) -> list[Dict[str, Any]]:
        """Get message history as a list of dictionaries."""
        return [msg.model_dump() for msg in self.message_history]
    
    def get_parsed_message_history(self) -> list[Dict[str, Any]]:
        """Get message history with parsed message analysis."""
        parsed_messages = []
        for msg in self.message_history:
            msg_dict = msg.model_dump()
            # Add parsed analysis
            parsed = TelescopeMessageParser.parse_message(
                msg.message, 
                msg.timestamp
            )
            msg_dict['parsed'] = parsed.model_dump()
            parsed_messages.append(msg_dict)
        return parsed_messages
    
    def get_message_analytics(self) -> Dict[str, Any]:
        """Get analytics for the message history."""
        messages = self.get_message_history()
        return MessageAnalytics.analyze_message_history(messages)
    
    def get_recent_commands(self, limit: int = 10) -> list[Dict[str, Any]]:
        """Get recent command messages with parsing."""
        commands = []
        for msg in reversed(self.message_history):
            if msg.direction == "sent":
                parsed = TelescopeMessageParser.parse_message(msg.message, msg.timestamp)
                if hasattr(parsed, 'method'):
                    cmd_dict = msg.model_dump()
                    cmd_dict['parsed'] = parsed.model_dump()
                    commands.append(cmd_dict)
                    if len(commands) >= limit:
                        break
        return list(reversed(commands))
    
    def get_recent_events(self, limit: int = 10) -> list[Dict[str, Any]]:
        """Get recent event messages with parsing."""
        events = []
        for msg in reversed(self.message_history):
            if msg.direction == "received":
                parsed = TelescopeMessageParser.parse_message(msg.message, msg.timestamp)
                if hasattr(parsed, 'event_type'):
                    event_dict = msg.model_dump()
                    event_dict['parsed'] = parsed.model_dump()
                    events.append(event_dict)
                    if len(events) >= limit:
                        break
        return list(reversed(events))

    def __str__(self):
        return f"{self.host}:{self.port}"
