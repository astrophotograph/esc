import asyncio
import collections
import json

import pydash
from loguru import logger as logging
from typing import TypeVar, Literal

from pydantic import BaseModel

from smarttel.seestar.commands.common import CommandResponse
from smarttel.seestar.commands.simple import GetTime, GetDeviceState, GetViewState
from smarttel.seestar.connection import SeestarConnection
from smarttel.seestar.events import EventTypes, PiStatusEvent, AnnotateResult

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
    id: int = 1
    is_connected: bool = False
    status: SeestarStatus = SeestarStatus()
    background_task: asyncio.Task | None = None
    recent_events: collections.deque = collections.deque(maxlen=5)

    def __init__(self, host: str, port: int):
        super().__init__(host=host, port=port)

        self.connection = SeestarConnection(host=host, port=port)

    async def _heartbeat(self):
        # todo : properly check if is_connected!!
        await asyncio.sleep(5)
        while True:
            if self.is_connected:
                logging.trace(f"Pinging {self}")
                _ = await self.send_and_recv(GetTime())
            # todo : decrease sleep time to 1 second and, instead, check next heartbeat time
            await asyncio.sleep(5)

    def process_view_state(self, response: CommandResponse[dict]):
        """Process view state."""
        logging.trace(f"Processing view state from {self}: {response}")
        if response.result is not None:
            self.status.target_name = pydash.get(response.result, 'View.target_name', 'unknown')
        else:
            logging.error(f"Error while processing view state from {self}: {response}")

    def process_device_state(self, response: CommandResponse[dict]):
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

        # Upon connect, grab current status

        response: CommandResponse[dict] = await self.send_and_recv(GetDeviceState())

        self.process_device_state(response)

        response = await self.send_and_recv(GetViewState())
        logging.debug(f"Received GetViewState: {response}")

        self.process_view_state(response)

        logging.debug(f"Connected to {self}")

    async def disconnect(self):
        """Disconnect from Seestar."""
        await self.connection.close()
        self.is_connected = False
        logging.debug(f"Disconnected from {self}")

    async def send(self, data: str | BaseModel):
        # todo : do connected check...
        # todo : set "next heartbeat" time, and then in the heartbeat task, check the value
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
        await self.send(data)
        # below is naive...  should change it to wait for the specific command...
        # xxx ugh!
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
                # if self.debug:
                #    print(f"Received data from {self}: {response}")
                if response is None:
                    await self.disconnect()
                    return None
                if 'Event' in response:
                    # it's an event, so parse it and stash!
                    self._handle_event(response)
                    return None
            return CommandResponse[U](**json.loads(response))
        except Exception as e:
            logging.error(f"Error while receiving data from {self}: {response} {e}")
            raise e

    def __str__(self):
        return f"{self.host}:{self.port}"
