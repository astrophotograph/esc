import asyncio
import collections
import itertools
import json
import os
import re
from datetime import datetime
from pathlib import Path

import pydash
from loguru import logger as logging
from typing import TypeVar, Literal

from pydantic import BaseModel

from smarttel.seestar.commands.common import CommandResponse
from smarttel.seestar.commands.imaging import GetStackedImage
from smarttel.seestar.commands.simple import GetTime, GetDeviceState, GetViewState, GetFocuserPosition
from smarttel.seestar.connection import SeestarConnection
from smarttel.seestar.events import EventTypes, PiStatusEvent, AnnotateResult
from smarttel.seestar.protocol_handlers import TextProtocol

U = TypeVar("U")


class SeestarStatus(BaseModel):
    """Seestar status."""
    temp: float | None = None
    charger_status: Literal['Discharging', 'Charging', 'Full'] | None = None
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


class ParsedEvent(BaseModel):
    """Parsed event."""
    event: EventTypes


class SeestarClient(BaseModel, arbitrary_types_allowed=True):
    """Seestar client."""
    host: str
    port: int
    connection: SeestarConnection | None = None
    counter: itertools.count = itertools.count()
    is_connected: bool = False
    status: SeestarStatus = SeestarStatus()
    background_task: asyncio.Task | None = None
    reader_task: asyncio.Task | None = None
    pattern_monitor_task: asyncio.Task | None = None
    responses: dict[int, dict] = {}
    recent_events: collections.deque = collections.deque(maxlen=5)
    text_protocol: TextProtocol = TextProtocol()
    
    # Pattern monitoring configuration
    pattern_file_path: str = "/mnt/sfro/roof/building-6/RoofStatusFile.txt"
    pattern_regex: str = r"OPEN"
    pattern_check_interval: float = 5.0

    def __init__(self, host: str, port: int):
        super().__init__(host=host, port=port)

        self.connection = SeestarConnection(host=host, port=port)

    async def _reader(self):
        """Background task that continuously reads messages and handles them."""
        logging.debug(f"Starting reader task for {self}")
        while self.is_connected:
            try:
                response_str = await self.connection.read()
                if response_str is not None:
                    # Parse and handle the response
                    if 'Event' in response_str:
                        # Handle events
                        self._handle_event(response_str)
                    elif 'jsonrpc' in response_str:
                        # Parse as command response and let protocol handler process it
                        try:
                            parsed_response = CommandResponse[dict](**json.loads(response_str))
                            self.text_protocol.handle_incoming_message(parsed_response)
                        except Exception as parse_error:
                            logging.error(f"Error parsing response from {self}: {response_str} {parse_error}")
            except Exception as e:
                logging.error(f"Error in reader task for {self}: {e}")
                if self.is_connected:
                    await asyncio.sleep(0.1)  # Brief pause before retrying
                    continue
                else:
                    break
        logging.debug(f"Reader task stopped for {self}")

    async def _pattern_monitor(self):
        """Background task that monitors a file for specific patterns."""
        logging.debug(f"Starting pattern monitor task for {self} - monitoring {self.pattern_file_path}")
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
                if (last_modified_time is None or 
                    current_modified_time > last_modified_time or 
                    current_size > last_file_size):
                    
                    # Read the file content
                    try:
                        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                            content = f.read()
                        
                        # Search for pattern
                        pattern_found = bool(re.search(self.pattern_regex, content, re.IGNORECASE))
                        
                        # Update status
                        self.status.pattern_match_found = pattern_found
                        self.status.pattern_match_file = str(file_path)
                        self.status.pattern_match_last_check = current_time
                        
                        if pattern_found:
                            logging.info(f"Pattern '{self.pattern_regex}' found in {file_path}")
                        else:
                            logging.trace(f"Pattern '{self.pattern_regex}' not found in {file_path}")
                        
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

    def _process_view_state(self, response: CommandResponse[dict]):
        """Process view state."""
        logging.trace(f"Processing view state from {self}: {response}")
        if response.result is not None:
            self.status.target_name = pydash.get(response.result, 'View.target_name', 'unknown')
        else:
            logging.error(f"Error while processing view state from {self}: {response}")

    def _process_device_state(self, response: CommandResponse[dict]):
        """Process device state."""
        logging.trace(f"Processing device state from {self}: {response}")
        if response.result is not None:
            pi_status = PiStatusEvent(**response.result['pi_status'], Timestamp=response.Timestamp)
            self.status.temp = pi_status.temp
            self.status.charger_status = pi_status.charger_status
            self.status.charge_online = pi_status.charge_online
            self.status.battery_capacity = pi_status.battery_capacity
        else:
            logging.error(f"Error while processing device state from {self}: {response}")

    def _process_focuser_position(self, response: CommandResponse[dict]):
        """Process focuser position."""
        logging.debug(f"Processing focuser position from {self}: {response}")
        if response.result is not None:
            self.status.focus_position = response.result
        else:
            logging.error(f"Error while processing focuser position from {self}: {response}")

    async def connect(self):
        await self.connection.open()
        self.is_connected = True
        self.status.reset()

        # Start background tasks
        self.background_task = asyncio.create_task(self._heartbeat())
        self.reader_task = asyncio.create_task(self._reader())
        self.pattern_monitor_task = asyncio.create_task(self._pattern_monitor())

        # Upon connect, grab current status

        response: CommandResponse[dict] = await self.send_and_recv(GetDeviceState())

        self._process_device_state(response)

        response = await self.send_and_recv(GetViewState())
        logging.trace(f"Received GetViewState: {response}")

        self._process_view_state(response)

        # Get initial focus position
        response = await self.send_and_recv(GetFocuserPosition())
        logging.trace(f"Received GetFocuserPosition: {response}")
        
        self._process_focuser_position(response)

        logging.debug(f"Connected to {self}")

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
        logging.debug(f"Disconnected from {self}")

    async def send(self, data: str | BaseModel):
        # todo : do connected check...
        # todo : set "next heartbeat" time, and then in the heartbeat task, check the value
        if isinstance(data, BaseModel):
            if data.id is None:
                data.id = next(self.counter)
            data = data.model_dump_json()
        await self.connection.write(data)

    def _handle_event(self, event_str: str):
        """Parse an event."""
        logging.trace(f"Handling event from {self}: {event_str}")
        try:
            parsed = json.loads(event_str)
            parser: ParsedEvent = ParsedEvent(event=parsed)
            # print(f"Received event from {self}: {type(parser.event)} {parser}")
            logging.trace(f'Received event from {self}: {parser.event.Event} {type(parser.event)}')
            self.recent_events.append(parser.event)
            match parser.event.Event:
                case 'PiStatus':
                    pi_status = parser.event
                    if pi_status.temp is not None:
                        self.status.temp = pi_status.temp
                    if pi_status.charger_status is not None:
                        self.status.charger_status = pi_status.charger_status
                    if pi_status.charge_online is not None:
                        self.status.charge_online = pi_status.charge_online
                    if pi_status.battery_capacity is not None:
                        self.status.battery_capacity = pi_status.battery_capacity
                case 'Stack':
                    logging.debug(f"Updating stacked frame and dropped frame: {parsed}")
                    if self.status.stacked_frame is not None:
                        self.status.stacked_frame = parser.event.stacked_frame
                    if self.status.dropped_frame is not None:
                        self.status.dropped_frame = parser.event.dropped_frame
                    if parser.event.state == 'frame_complete':
                        # todo: only grab the frame if we're streaming in client!
                        print("Grabbing frame")
                        self.send(GetStackedImage(id=23))
                case 'Annotate':
                    self.status.annotate = AnnotateResult(**parser.event.result)
                case 'FocuserMove':
                    focuser_event = parser.event
                    if focuser_event.position is not None:
                        self.status.focus_position = focuser_event.position
                    print(f"Focuser event: {focuser_event}")
                # Todo: include Exposure, Stacked
                #case _:
                #    logging.debug(f"Unhandled event: {parser}")
        except Exception as e:
            logging.error(f"Error while parsing event from {self}: {event_str} {type(e)} {e}")

    async def send_and_recv(self, data: str | BaseModel) -> CommandResponse[U] | None:
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

    def __str__(self):
        return f"{self.host}:{self.port}"
