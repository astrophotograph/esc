import asyncio
import collections
from typing import TypeVar, Literal, Any, Optional
import threading
import time

import numpy as np
from loguru import logger as logging
from pydantic import BaseModel

from smarttel.seestar.commands.imaging import (
    BeginStreaming,
    StopStreaming,
    GetStackedImage,
)
from smarttel.seestar.commands.simple import TestConnection
from smarttel.seestar.connection import SeestarConnection
from smarttel.seestar.events import (
    EventTypes,
    AnnotateResult,
    BaseEvent,
    StackEvent,
    InternalEvent,
)
from smarttel.seestar.protocol_handlers import BinaryProtocol, ScopeImage
from smarttel.seestar.rtspclient import RtspClient
from smarttel.util.eventbus import EventBus

U = TypeVar("U")


class SeestarImagingStatus(BaseModel):
    """Seestar imaging status."""

    temp: float | None = None
    charger_status: Literal["Discharging", "Charging", "Full", "Not charging"] | None = None
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
    client_mode: Literal["ContinuousExposure", "Stack", "Streaming"] | None = None
    
    # Raw image caching for instant processing
    cached_raw_image: Optional[ScopeImage] = None
    cached_raw_image_lock: threading.Lock = threading.Lock()
    cached_raw_image_timestamp: float = 0.0
    enhancement_settings_changed_event: Optional[asyncio.Event] = None

    # Timeout configuration
    connection_timeout: float = 10.0
    read_timeout: float = 30.0
    write_timeout: float = 10.0

    def __init__(
        self,
        host: str,
        port: int,
        event_bus: EventBus | None = None,
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

        self.event_bus.add_listener("Stack", self._handle_stack_event)
        self.event_bus.add_listener("ClientModeChanged", self._handle_client_mode)
        
        # Initialize enhancement settings changed event
        self.enhancement_settings_changed_event = asyncio.Event()
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

                header = await self.connection.read_exactly(80)
                if header is None:
                    # Connection issue handled by connection layer, check status and continue
                    if not self.connection.is_connected():
                        logging.debug(
                            f"Connection not available for {self}, will retry"
                        )
                        await asyncio.sleep(0.5)
                    continue

                size, id, width, height = self.binary_protocol.parse_header(header)
                logging.trace(
                    f"imaging receive header: {size=} {width=} {height=} {id=}"
                )

                data = None
                if size is not None:
                    data = await self.connection.read_exactly(size)
                    if data is None:
                        # Connection issue during data read, check status and continue
                        if not self.connection.is_connected():
                            logging.debug(
                                f"Connection lost during data read for {self}"
                            )
                            await asyncio.sleep(0.5)
                        continue

                if data is not None:
                    self.image = await self.binary_protocol.handle_incoming_message(
                        width, height, data, id
                    )
                    
                    # Cache the raw image for instant processing
                    if self.image is not None:
                        with self.cached_raw_image_lock:
                            self.cached_raw_image = self.image.copy() if hasattr(self.image, 'copy') else self.image
                            self.cached_raw_image_timestamp = time.time()

            except Exception as e:
                logging.error(
                    f"Unexpected error in imaging reader task for {self}: {e}"
                )
                if self.is_connected:
                    await asyncio.sleep(1.0)  # Brief pause before retrying
                    continue
                else:
                    break
        logging.info(f"Reader task stopped for {self}")

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

        logging.info(f"Connected to {self}")

    async def disconnect(self):
        """Disconnect from Seestar."""
        if self.status.is_streaming:
            await self.stop_streaming()
        await self.connection.close()
        self.is_connected = False
        logging.info(f"Disconnected from {self}")

    async def send(self, data: str | BaseModel):
        if isinstance(data, BaseModel):
            if data.id is None:
                data.id = self.id
                self.id += 1
            data = data.model_dump_json()
        await self.connection.write(data)

    async def get_next_image(self, camera_id: int):
        last_image: ScopeImage = ScopeImage(width=1080, height=1920, image=None)

        self.status.is_fetching_images = True
        try:
            while self.is_connected:
                # Check if enhancement settings changed and we have a cached image
                if self.enhancement_settings_changed_event.is_set():
                    self.enhancement_settings_changed_event.clear()
                    with self.cached_raw_image_lock:
                        if self.cached_raw_image is not None:
                            logging.info("Enhancement settings changed, yielding cached image for instant processing")
                            yield self.cached_raw_image
                            continue
                if self.client_mode == "Streaming":
                    # If we're streaming, just run RTSP client, which runs as a background thread...
                    rtsp_port = 4554 + camera_id
                    with RtspClient(
                        rtsp_server_uri=f"rtsp://{self.host}:{rtsp_port}/stream"
                    ) as rtsp_client:
                        # Run RTSP client until it's closed
                        await rtsp_client.finish_opening()
                        while rtsp_client.is_opened():
                            image = ScopeImage(
                                width=1080, height=1920, image=rtsp_client.read()
                            )

                            if image is not None:
                                changed = not np.array_equal(
                                    self.image.image, last_image.image
                                )
                                last_image = image

                                if changed:
                                    yield image
                            await asyncio.sleep(0)
                    continue

                if self.image is not None:
                    # Optional[npt.NDArray]
                    changed = not np.array_equal(self.image.image, last_image.image)
                    last_image = self.image

                    if changed:
                        yield self.image
                await asyncio.sleep(0.01)
        except Exception as e:
            logging.error(f"Unexpected error in imaging reader task for {self}: {e}")
            import traceback

            traceback.print_exc()

        self.status.is_fetching_images = False

    async def _handle_stack_event(self, event: BaseEvent):
        if event.state == "frame_complete" and self.status.is_fetching_images:
            # Only grab the frame if we're streaming in client!
            logging.trace("Grabbing frame")
            await self.send(GetStackedImage(id=23))

    async def _handle_client_mode(self, event: BaseEvent):
        if isinstance(event, InternalEvent):
            params = event.params
            existing = params.get("existing")
            new_mode = params.get("new_mode")

            if existing == "ContinuousExposure":
                await self.stop_streaming()
            if existing == "Streaming":
                await self.stop_rtsp()

            match new_mode:
                case "ContinuousExposure":
                    await self.start_streaming()
                case "Streaming":
                    await self.start_rtsp()
                # For Stacking and None we don't need to do anything

            self.client_mode = new_mode

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
        self.status.is_streaming = False

    async def start_rtsp(self):
        """Start RTSP streams from Seestar."""
        pass

    async def stop_rtsp(self):
        """Stop RTSP streams from Seestar."""
        pass

    def trigger_enhancement_settings_changed(self):
        """Trigger instant processing of cached image when enhancement settings change."""
        if self.enhancement_settings_changed_event is not None:
            self.enhancement_settings_changed_event.set()
            logging.info("Enhancement settings changed event triggered")
    
    def get_cached_raw_image(self) -> Optional[ScopeImage]:
        """Get the cached raw image."""
        with self.cached_raw_image_lock:
            return self.cached_raw_image.copy() if self.cached_raw_image and hasattr(self.cached_raw_image, 'copy') else self.cached_raw_image

    def __str__(self):
        return f"{self.host}:{self.port}"
