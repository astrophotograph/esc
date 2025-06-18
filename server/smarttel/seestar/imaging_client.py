import asyncio
import collections
import json

import pydash
from loguru import logger as logging
from typing import TypeVar, Literal

from pydantic import BaseModel

from smarttel.seestar.commands.common import CommandResponse
from smarttel.seestar.commands.simple import GetTime, GetDeviceState, GetViewState
from smarttel.seestar.commands.imaging import BeginStreaming, StopStreaming
from smarttel.seestar.connection import SeestarConnection
from smarttel.seestar.events import EventTypes, PiStatusEvent, AnnotateResult

U = TypeVar("U")


class SeestarImagingStatus(BaseModel):
    """Seestar imaging status."""
    temp: float | None = None
    charger_status: Literal['Discharging', 'Charging', 'Full'] | None = None
    charge_online: bool | None = None
    battery_capacity: int | None = None
    stacked_frame: int = 0
    dropped_frame: int = 0
    target_name: str = ""
    annotate: AnnotateResult | None = None
    is_streaming: bool = False

    def reset(self):
        self.temp = None
        self.charger_status = None
        self.charge_online = None
        self.battery_capacity = None
        self.stacked_frame = 0
        self.dropped_frame = 0
        self.target_name = ""
        self.annotate = None
        self.is_streaming = False


class ParsedEvent(BaseModel):
    """Parsed event."""
    event: EventTypes


class SeestarImagingClient(BaseModel, arbitrary_types_allowed=True):
    """Seestar imaging client."""
    host: str
    port: int
    connection: SeestarConnection | None = None
    id: int = 1
    is_connected: bool = False
    status: SeestarImagingStatus = SeestarImagingStatus()
    background_task: asyncio.Task | None = None
    recent_events: collections.deque = collections.deque(maxlen=5)

    def __init__(self, host: str, port: int):
        super().__init__(host=host, port=port)

        self.connection = SeestarConnection(host=host, port=port)

    async def _heartbeat(self):
        await asyncio.sleep(5)
        while True:
            if self.is_connected:
                logging.trace(f"Pinging {self}")
                _ = await self.send_and_recv(GetTime())
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

        self.background_task = asyncio.create_task(self._heartbeat())

        response: CommandResponse[dict] = await self.send_and_recv(GetDeviceState())
        self._process_device_state(response)

        response = await self.send_and_recv(GetViewState())
        logging.trace(f"Received GetViewState: {response}")
        self._process_view_state(response)

        logging.debug(f"Connected to {self}")

    async def disconnect(self):
        """Disconnect from Seestar."""
        if self.status.is_streaming:
            await self.stop_streaming()
        await self.connection.close()
        self.is_connected = False
        logging.debug(f"Disconnected from {self}")

    async def send(self, data: str | BaseModel):
        if isinstance(data, BaseModel):
            if data.id is None:
                data.id = self.id
                self.id += 1
            data = data.model_dump_json()
        await self.connection.write(data)

    def _handle_event(self, event_str: str):
        """Parse an event."""
        logging.trace(f"Handling event from {self}: {event_str}")
        try:
            parsed = json.loads(event_str)
            parser: ParsedEvent = ParsedEvent(event=parsed)
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
        await self.send(data)
        while self.is_connected:
            response = await self.recv()
            if response is not None:
                return response
        return None

    async def recv(self) -> CommandResponse[U] | None:
        """Receive data from Seestar."""
        response = ""
        try:
            while 'jsonrpc' not in response:
                response = await self.connection.read()
                if response is None:
                    await self.disconnect()
                    return None
                if 'Event' in response:
                    self._handle_event(response)
                    return None
            return CommandResponse[U](**json.loads(response))
        except Exception as e:
            logging.error(f"Error while receiving data from {self}: {response} {e}")
            raise e

    async def start_streaming(self):
        """Start streaming from the Seestar."""
        if self.status.is_streaming:
            logging.warning(f"Already streaming from {self}")
            return
        
        response = await self.send_and_recv(BeginStreaming())
        if response and response.result is not None:
            self.status.is_streaming = True
            logging.info(f"Started streaming from {self}")
        else:
            logging.error(f"Failed to start streaming from {self}: {response}")

    async def stop_streaming(self):
        """Stop streaming from the Seestar."""
        if not self.status.is_streaming:
            logging.warning(f"Not streaming from {self}")
            return
            
        response = await self.send_and_recv(StopStreaming())
        if response and response.result is not None:
            self.status.is_streaming = False
            logging.info(f"Stopped streaming from {self}")
        else:
            logging.error(f"Failed to stop streaming from {self}: {response}")

    def __str__(self):
        return f"{self.host}:{self.port}"