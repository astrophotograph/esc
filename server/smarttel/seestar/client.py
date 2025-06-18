import asyncio
import collections
import itertools
import json

import pydash
from loguru import logger as logging
from typing import TypeVar, Literal

from pydantic import BaseModel

from smarttel.seestar.commands.common import CommandResponse
from smarttel.seestar.commands.simple import GetTime, GetDeviceState, GetViewState
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

    def reset(self):
        self.temp = None
        self.charger_status = None
        self.charge_online = None
        self.battery_capacity = None
        self.stacked_frame = 0
        self.dropped_frame = 0
        self.target_name = ""
        self.annotate = None


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
    responses: dict[int, dict] = {}
    recent_events: collections.deque = collections.deque(maxlen=5)
    text_protocol: TextProtocol = TextProtocol()

    def __init__(self, host: str, port: int):
        super().__init__(host=host, port=port)

        self.connection = SeestarConnection(host=host, port=port)

    async def _reader(self):
        """Background task that continuously reads messages and handles them."""
        logging.debug(f"Starting reader task for {self}")
        while self.is_connected:
            try:
                response = await self.recv()
                if response is not None:
                    # The recv() method already calls handle_incoming_message for responses
                    # with pending futures, so we only get here for responses without futures
                    logging.trace(f"Reader received unhandled response: {response}")
            except Exception as e:
                logging.error(f"Error in reader task for {self}: {e}")
                if self.is_connected:
                    await asyncio.sleep(0.1)  # Brief pause before retrying
                    continue
                else:
                    break
        logging.debug(f"Reader task stopped for {self}")

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

    async def connect(self):
        await self.connection.open()
        self.is_connected = True
        self.status.reset()

        # Start background tasks
        self.background_task = asyncio.create_task(self._heartbeat())
        self.reader_task = asyncio.create_task(self._reader())

        # Upon connect, grab current status

        response: CommandResponse[dict] = await self.send_and_recv(GetDeviceState())

        self._process_device_state(response)

        response = await self.send_and_recv(GetViewState())
        logging.trace(f"Received GetViewState: {response}")

        self._process_view_state(response)

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
                    logging.trace("Updating stacked frame and dropped frame")
                    if self.status.stacked_frame is not None:
                        self.status.stacked_frame = parser.event.stacked_frame
                    if self.status.dropped_frame is not None:
                        self.status.dropped_frame = parser.event.dropped_frame
                case 'Annotate':
                    self.status.annotate = AnnotateResult(**parser.event.result)
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

    async def recv(self) -> CommandResponse[U] | None:
        """Receive data from Seestar."""
        response = ""
        try:
            while 'jsonrpc' not in response:
                response = await self.connection.read()
                # if self.debug:
                #    print(f"Received data from {self}: {response}")
                if response is None:
                    await self.disconnect()
                    return None
                if 'Event' in response:
                    # it's an event, so parse it and stash!
                    self._handle_event(response)
                    return None
            
            parsed_response = CommandResponse[U](**json.loads(response))
            
            # Try to resolve any pending futures for this message
            if self.text_protocol.handle_incoming_message(parsed_response):
                # Message was handled by a pending future, don't return it here
                return None
            
            # No pending future for this message, return it normally
            return parsed_response
        except Exception as e:
            logging.error(f"Error while receiving data from {self}: {response} {e}")
            raise e

    def __str__(self):
        return f"{self.host}:{self.port}"
