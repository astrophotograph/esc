import asyncio
import collections
from typing import TypeVar, Literal

from loguru import logger as logging
from pydantic import BaseModel

from smarttel.seestar.commands.imaging import BeginStreaming, StopStreaming, GetStackedImage
from smarttel.seestar.commands.simple import TestConnection
from smarttel.seestar.connection import SeestarConnection
from smarttel.seestar.events import EventTypes, AnnotateResult, BaseEvent, StackEvent
from smarttel.seestar.protocol_handlers import BinaryProtocol, ScopeImage
from smarttel.util.eventbus import EventBus

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
    is_fetching_images: bool = False

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
    id: int = 100
    is_connected: bool = False
    status: SeestarImagingStatus = SeestarImagingStatus()
    background_task: asyncio.Task | None = None
    reader_task: asyncio.Task | None = None
    recent_events: collections.deque = collections.deque(maxlen=5)
    event_bus: EventBus | None = None
    binary_protocol: BinaryProtocol = BinaryProtocol()
    image: ScopeImage | None = None

    def __init__(self, host: str, port: int, event_bus: EventBus | None = None):
        super().__init__(host=host, port=port, event_bus=event_bus)

        self.event_bus.add_listener('Stack', self._handle_stack_event)
        self.connection = SeestarConnection(host=host, port=port)

    async def _reader(self):
        """Background task that continuously reads messages and handles them."""
        logging.debug(f"Starting reader task for {self}")
        while self.is_connected:
            try:
                header = await self.connection.read_exactly(80)
                size, id, width, height = self.binary_protocol.parse_header(header)
                logging.debug(f"imaging receive header: {size=} {width=} {height=} {id=}")
                data = None
                if size is not None:
                    data = await self.connection.read_exactly(size)
                if data is not None:
                    self.image = await self.binary_protocol.handle_incoming_message(width, height, data, id)

            except Exception as e:
                logging.error(f"Failed to read from {self}: {e}")
                if self.is_connected:
                    await asyncio.sleep(1)  # Brief pause before retrying
                    continue
                else:
                    break
        logging.debug(f"Reader task stopped for {self}")

    async def _heartbeat(self):
        await asyncio.sleep(5)
        while True:
            if self.is_connected:
                logging.trace(f"Pinging {self}")
                await self.send(TestConnection())
            await asyncio.sleep(5)

    async def connect(self):
        await self.connection.open()
        self.is_connected = True
        self.status.reset()

        self.background_task = asyncio.create_task(self._heartbeat())
        self.reader_task = asyncio.create_task(self._reader())

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

    async def get_next_image(self):
        last_image: ScopeImage | None = None

        self.status.is_fetching_images = True
        while self.is_connected:
            if self.image is not None and self.image != last_image:
                last_image = self.image
                yield self.image
            await asyncio.sleep(0.01)
        self.status.is_fetching_images = False

    async def _handle_stack_event(self, event: BaseEvent):
        if event.state == 'frame_complete' and self.status.is_fetching_images:
            # Only grab the frame if we're streaming in client!
            print("Grabbing frame")
            await self.send(GetStackedImage(id=23))

    # async def send_and_recv(self, data: str | BaseModel) -> CommandResponse[U] | None:
    #     await self.send(data)
    #     while self.is_connected:
    #         response = await self.recv()
    #         if response is not None:
    #             return response
    #     return None
    #
    # async def recv(self) -> CommandResponse[U] | None:
    #     """Receive data from Seestar."""
    #     response = ""
    #     try:
    #         while 'jsonrpc' not in response:
    #             response = await self.connection.read()
    #             if response is None:
    #                 await self.disconnect()
    #                 return None
    #             if 'Event' in response:
    #                 self._handle_event(response)
    #                 return None
    #         return CommandResponse[U](**json.loads(response))
    #     except Exception as e:
    #         logging.error(f"Error while receiving data from {self}: {response} {e}")
    #         raise e

    async def start_streaming(self):
        """Start streaming from the Seestar."""
        if self.status.is_streaming:
            logging.warning(f"Already streaming from {self}")
            return

        _ = await self.send(BeginStreaming(id=21))
        self.status.is_streaming = True
        # if response and response.result is not None:
        #     self.status.is_streaming = True
        #     logging.info(f"Started streaming from {self}")
        # else:
        #     logging.error(f"Failed to start streaming from {self}: {response}")

    async def stop_streaming(self):
        """Stop streaming from the Seestar."""
        if not self.status.is_streaming:
            logging.warning(f"Not streaming from {self}")
            return

        response = await self.send(StopStreaming())
        # if response and response.result is not None:
        self.status.is_streaming = False
        #     logging.info(f"Stopped streaming from {self}")
        # else:
        #     logging.error(f"Failed to stop streaming from {self}: {response}")

    def __str__(self):
        return f"{self.host}:{self.port}"
