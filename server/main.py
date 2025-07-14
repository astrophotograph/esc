import asyncio
import datetime
import inspect
import json
import logging as orig_logging
from typing import Optional, AsyncGenerator

import click
import cv2
import httpx
import numpy as np
import pydash
import uvicorn
from fastapi import FastAPI, HTTPException, APIRouter, Request
from fastapi.responses import StreamingResponse, HTMLResponse
from loguru import logger as logging
from pydantic import BaseModel, Field
from starlette.background import BackgroundTask

from smarttel.imaging.graxpert_stretch import GraxpertStretch
from smarttel.seestar.client import SeestarClient
from smarttel.seestar.commands.common import CommandResponse
from smarttel.seestar.commands.discovery import discover_seestars
from smarttel.seestar.commands.parameterized import (
    GotoTargetParameters,
    GotoTarget,
    ScopeSpeedMoveParameters,
    ScopeSpeedMove,
    MoveFocuserParameters,
    MoveFocuser,
)
from smarttel.seestar.commands.simple import (
    GetViewState,
    GetDeviceState,
    GetDeviceStateResponse,
    ScopePark,
    GetFocuserPosition,
)
from smarttel.seestar.imaging_client import SeestarImagingClient
from smarttel.util.eventbus import EventBus
from database import TelescopeDatabase
from webrtc_router import router as webrtc_router
from websocket_router import router as websocket_router
from remote_websocket_client import RemoteController


class InterceptHandler(orig_logging.Handler):
    """Intercept handler for logging."""

    # Remap default logging to use loguru for 3rd party libraries
    def emit(self, record: orig_logging.LogRecord) -> None:
        # Get corresponding Loguru level if it exists.
        try:
            level: str | int = logging.level(record.levelname).name
        except ValueError:
            level = record.levelno

        # Find caller from where originated the logged message.
        frame, depth = inspect.currentframe(), 0
        while frame:
            filename = frame.f_code.co_filename
            is_logging = filename == orig_logging.__file__
            is_frozen = "importlib" in filename and "_bootstrap" in filename
            if depth > 0 and not (is_logging or is_frozen):
                break
            frame = frame.f_back
            depth += 1

        if level == "DEBUG":
            # Taking a big hammer to things, remap DEBUG to TRACE logging (outside of loguru)
            level = "TRACE"

        logging.opt(depth=depth, exception=record.exc_info).log(
            level, record.getMessage()
        )


orig_logging.basicConfig(handlers=[InterceptHandler()], level=0, force=True)


class AddTelescopeRequest(BaseModel):
    """Request model for adding a telescope."""

    host: str = Field(..., description="IP address or hostname of the telescope")
    port: int = Field(default=4700, description="Port for telescope control")
    serial_number: Optional[str] = Field(
        None, description="Serial number of the telescope"
    )
    product_model: Optional[str] = Field(
        None, description="Product model of the telescope"
    )
    ssid: Optional[str] = Field(
        None, description="SSID of the telescope's WiFi network"
    )
    location: Optional[str] = Field(
        None, description="Physical location of the telescope"
    )


class SaveConfigurationRequest(BaseModel):
    """Request model for saving a configuration."""

    name: str = Field(
        ..., description="Name of the configuration", min_length=1, max_length=100
    )
    description: Optional[str] = Field(
        None, description="Description of the configuration", max_length=500
    )
    config_data: dict = Field(..., description="Configuration data as a JSON object")


class AddRemoteControllerRequest(BaseModel):
    """Request model for adding a remote controller."""

    host: str = Field(
        ..., description="IP address or hostname of the remote controller"
    )
    port: int = Field(..., description="Port for the remote controller API")
    name: Optional[str] = Field(
        None, description="Optional name for the remote controller"
    )
    description: Optional[str] = Field(
        None, description="Optional description of the remote controller"
    )


class ConfigurationResponse(BaseModel):
    """Response model for configuration data."""

    name: str
    description: Optional[str]
    config_data: dict
    created_at: str
    updated_at: str


class ConfigurationListItem(BaseModel):
    """Response model for configuration list items."""

    name: str
    description: Optional[str]
    created_at: str
    updated_at: str


class RemoteControllerResponse(BaseModel):
    """Response model for remote controller data."""

    host: str
    port: int
    name: Optional[str]
    description: Optional[str]
    status: str
    last_connected: Optional[str]
    telescopes_count: int = 0


class Telescope(BaseModel, arbitrary_types_allowed=True):
    """Telescope."""

    host: str
    port: int = 4700
    imaging_port: int = 4800
    serial_number: Optional[str] = None
    product_model: Optional[str] = None
    ssid: Optional[str] = None
    discovery_method: str = "manual"  # "manual" or "auto_discovery"
    router: APIRouter | None = None
    event_bus: EventBus | None = None
    client: SeestarClient | None = None
    imaging: SeestarImagingClient | None = None
    _location: Optional[str] = None

    @property
    def name(self):
        return self.serial_number or self.host

    @property
    async def location(self) -> Optional[str]:
        """Get the user's location. Returns _location if set, otherwise tries to determine from user's public IP."""
        if self._location:
            return self._location

        try:
            # Get user's public IP address
            public_ip = await self._get_public_ip()
            if not public_ip:
                self._location = "Unknown Location"
                return self._location

            # Try to get location from IP geolocation service
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(f"http://ip-api.com/json/{public_ip}")
                if response.status_code == 200:
                    data = response.json()
                    if data.get("status") == "success":
                        city = data.get("city", "")
                        region = data.get("regionName", "")
                        country = data.get("country", "")

                        # Build location string
                        location_parts = [
                            part for part in [city, region, country] if part
                        ]
                        resolved_location = (
                            ", ".join(location_parts) if location_parts else None
                        )
                        if resolved_location:
                            # Cache the resolved location
                            self._location = resolved_location
                            return self._location
        except Exception as e:
            logging.debug(f"Failed to get location: {e}")

        # Cache the failure result to avoid repeated API calls
        self._location = None
        return None

    async def _get_public_ip(self) -> Optional[str]:
        """Get the user's public IP address."""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                # Try multiple services in case one is down
                services = [
                    "https://api.ipify.org",
                    "https://ifconfig.me/ip",
                    "https://ipinfo.io/ip",
                ]

                for service in services:
                    try:
                        response = await client.get(service)
                        if response.status_code == 200:
                            ip = response.text.strip()
                            # Basic validation that it looks like an IP
                            if ip and "." in ip and len(ip.split(".")) == 4:
                                return ip
                    except Exception:
                        continue

        except Exception as e:
            logging.debug(f"Failed to get public IP: {e}")

        return None

    def create_telescope_api(self):
        """Create a FastAPI app for a specific Seestar."""

        router = APIRouter()

        # Create a shared client instance
        self.event_bus = EventBus()
        self.client = SeestarClient(self.host, self.port, self.event_bus)
        self.imaging = SeestarImagingClient(
            self.host, self.imaging_port, self.event_bus
        )

        async def startup():
            """Connect to the Seestar on startup."""
            try:
                logging.info(f"Connecting to Seestar at {self.host}:{self.port}")

                # Connect main client and imaging client in parallel
                connection_tasks = [self.client.connect(), self.imaging.connect()]

                results = await asyncio.gather(
                    *connection_tasks, return_exceptions=True
                )

                # Check results
                client_result, imaging_result = results

                if isinstance(client_result, Exception):
                    logging.error(
                        f"Failed to connect main client to {self.host}:{self.port}: {client_result}"
                    )
                else:
                    logging.info(
                        f"Main client connected to Seestar at {self.host}:{self.port}"
                    )

                if isinstance(imaging_result, Exception):
                    logging.error(
                        f"Failed to connect imaging client to {self.host}:{self.imaging_port}: {imaging_result}"
                    )
                else:
                    logging.info(
                        f"Imaging client connected to Seestar at {self.host}:{self.imaging_port}"
                    )

                # If both succeeded, log overall success
                if not isinstance(client_result, Exception) and not isinstance(
                    imaging_result, Exception
                ):
                    logging.info(
                        f"Successfully connected both clients to Seestar at {self.host}:{self.port}"
                    )

            except Exception as e:
                logging.error(f"Failed to connect to Seestar: {e}")

        @router.get("/")
        async def root():
            """Root endpoint with basic info."""
            # Get network scanning information
            from smarttel.seestar.commands.discovery import get_all_network_interfaces

            network_interfaces = get_all_network_interfaces()

            return {
                "status": "running",
                "seestar": {
                    "host": self.host,
                    "port": self.port,
                    "connected": self.client.is_connected,
                    "imaging_port": self.imaging_port,
                    "imaging_connected": self.imaging.is_connected,
                    "pattern_match_status": {
                        "found": self.client.status.pattern_match_found,
                        "file": self.client.status.pattern_match_file,
                        "last_check": self.client.status.pattern_match_last_check,
                    },
                },
                "network_discovery": {
                    "scanned_networks": [
                        {
                            "local_ip": local_ip,
                            "broadcast_ip": broadcast_ip,
                            "network_range": f"{local_ip.rsplit('.', 1)[0]}.0/24",
                        }
                        for local_ip, broadcast_ip in network_interfaces
                    ],
                    "interfaces_count": len(network_interfaces),
                    "discovery_method": "UDP broadcast on port 4720",
                },
            }

        @router.post("/goto")
        async def goto(goto_params: GotoTargetParameters):
            """Goto a target."""
            if not self.client.is_connected:
                raise HTTPException(status_code=503, detail="Not connected to Seestar")
            try:
                response = await self.client.send_and_recv(
                    GotoTarget(params=goto_params.model_dump())
                )
                return {"goto_target": response}
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

        @router.post("/move")
        async def move(move_params: ScopeSpeedMoveParameters):
            """Move the scope."""
            if not self.client.is_connected:
                raise HTTPException(status_code=503, detail="Not connected to Seestar")
            try:

                async def _fetch_position():
                    """Fetch the current position from the scope."""
                    try:
                        # Fetch the position after movement has stopped...
                        await asyncio.sleep(0.25)
                        await self.client.update_current_coords()
                    except Exception as e:
                        logging.error(f"Error fetching position: {e}")

                asyncio.create_task(_fetch_position())

                response = await self.client.send_and_recv(
                    ScopeSpeedMove(params=move_params.model_dump())
                )
                return {"move_scope": response}
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

        @router.post("/park")
        async def park():
            """Park the scope."""
            if not self.client.is_connected:
                raise HTTPException(status_code=503, detail="Not connected to Seestar")
            try:

                async def _position_updater():
                    """Fetch the current position from the scope until it stops moving."""
                    await asyncio.sleep(0.5)
                    while await self.client.update_current_coords():
                        await asyncio.sleep(0.5)

                asyncio.create_task(_position_updater())

                response = await self.client.send_and_recv(ScopePark())
                return {"park_scope": response}
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

        @router.get("/focus")
        async def get_focus_position():
            """Get the current focuser position."""
            if not self.client.is_connected:
                raise HTTPException(status_code=503, detail="Not connected to Seestar")
            try:
                response = await self.client.send_and_recv(GetFocuserPosition())
                return {"focuser_position": response}
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

        @router.post("/focus")
        async def focus(focus_params: MoveFocuserParameters):
            """Move the focuser."""
            if not self.client.is_connected:
                raise HTTPException(status_code=503, detail="Not connected to Seestar")
            try:
                response = await self.client.send_and_recv(
                    MoveFocuser(params=focus_params.model_dump())
                )
                return {"move_focuser": response}
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

        @router.post("/focus_inc")
        async def focus_inc(increment: int):
            """Move the focuser by increment from current position."""
            logging.trace(f"Focus increment: {increment}")
            if not self.client.is_connected:
                raise HTTPException(status_code=503, detail="Not connected to Seestar")

            # Get current focus position from status
            current_position = self.client.status.focus_position
            if current_position is None:
                raise HTTPException(
                    status_code=400, detail="Current focus position unknown"
                )

            try:
                new_position = current_position + increment
                focus_params = MoveFocuserParameters(step=new_position)
                response = await self.client.send_and_recv(
                    MoveFocuser(params=focus_params.model_dump())
                )

                if response is not None and response.result is not None:
                    logging.trace(
                        f"New focus position: {response.result.get('step')} {type(response.result)}"
                    )
                    self.client.status.focus_position = response.result.get("step")
                return {
                    "move_focuser": response,
                    "increment": increment,
                    "new_position": new_position,
                    "previous_position": current_position,
                }
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

        @router.get("/viewstate")
        async def get_view_state():
            """Get the current view state."""
            if not self.client.is_connected:
                raise HTTPException(status_code=503, detail="Not connected to Seestar")

            try:
                response = await self.client.send_and_recv(GetViewState())
                return {"view_state": response}
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

        @router.get("/messages")
        async def get_message_history():
            """Get the message history for this telescope."""
            try:
                if hasattr(self.client, "get_message_history"):
                    return {"messages": self.client.get_message_history()}
                else:
                    return {"messages": [], "error": "Message history not available"}
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

        @router.get("/messages/parsed")
        async def get_parsed_message_history():
            """Get the message history with parsed analysis for this telescope."""
            try:
                if hasattr(self.client, "get_parsed_message_history"):
                    return {"messages": self.client.get_parsed_message_history()}
                else:
                    return {"messages": [], "error": "Parsed message history not available"}
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

        @router.get("/messages/analytics")
        async def get_message_analytics():
            """Get analytics for the message history of this telescope."""
            try:
                if hasattr(self.client, "get_message_analytics"):
                    return self.client.get_message_analytics()
                else:
                    return {"error": "Message analytics not available"}
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

        @router.get("/messages/commands")
        async def get_recent_commands(limit: int = 10):
            """Get recent command messages with parsing."""
            try:
                if hasattr(self.client, "get_recent_commands"):
                    return {"commands": self.client.get_recent_commands(limit=limit)}
                else:
                    return {"commands": [], "error": "Recent commands not available"}
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

        @router.get("/messages/events")
        async def get_recent_events(limit: int = 10):
            """Get recent event messages with parsing."""
            try:
                if hasattr(self.client, "get_recent_events"):
                    return {"events": self.client.get_recent_events(limit=limit)}
                else:
                    return {"events": [], "error": "Recent events not available"}
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

        async def status_stream_generator() -> AsyncGenerator[str, None]:
            """Generate a stream of client status updates."""
            update_count = 0
            try:
                while True:
                    update_count += 1
                    # Create a status object with current client information
                    status = {
                        "timestamp": asyncio.get_event_loop().time(),
                        "connected": self.client.is_connected,
                        "host": self.host,
                        "port": self.port,
                        "status": self.client.status.model_dump(),
                    }

                    # If connected, add recent events and messages
                    # if client.is_connected:
                    #     status["recent_events"] = [str(event) for event in list(client.recent_events)]
                    #
                    #     # Try to get current view state
                    #     try:
                    #         view_state = await client.send_and_recv(GetViewState())
                    #         status["view_state"] = str(view_state)
                    #     except Exception as e:
                    #         status["view_state_error"] = str(e)

                    # Send the status as a Server-Sent Event
                    yield f"data: {json.dumps(status)}\n\n"

                    # Send a heartbeat comment every 10 updates to keep connection alive
                    if update_count % 10 == 0:
                        yield f": heartbeat at {datetime.datetime.now().isoformat()}\n\n"

                    # Wait for 1 seconds before sending next update
                    await asyncio.sleep(1)
            except asyncio.CancelledError:
                # Handle client disconnection gracefully
                yield f"data: {json.dumps({'status': 'stream_closed'})}\n\n"

        def build_frame_bytes(image: np.ndarray, width: int, height: int):
            font = cv2.FONT_HERSHEY_COMPLEX
            BOUNDARY = b"\r\n--frame\r\n"

            dt = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-4]

            w = width or 1080
            h = height or 1920
            image = cv2.putText(
                np.copy(image),
                dt,  # f'{dt} {self.received_frame}',
                (int(w / 2 - 240), h - 70),
                font,
                1,
                (210, 210, 210),
                4,
                cv2.LINE_8,
            )
            imgencode = cv2.imencode(".jpeg", image)[1]
            stringData = imgencode.tobytes()
            frame = b"Content-Type: image/jpeg\r\n\r\n" + stringData + BOUNDARY

            return frame

        @router.get("/status/stream")
        async def stream_status():
            """Stream client status updates every 5 seconds."""
            return StreamingResponse(
                status_stream_generator(), media_type="text/event-stream"
            )

        async def get_next_image(camera_id: int = 0):
            """Get the next image from the Seestar imaging server."""
            if not self.imaging.is_connected:
                raise HTTPException(status_code=503, detail="Not connected to Seestar")

            star_processors = [GraxpertStretch()]
            yield b"\r\n--frame\r\n"

            async for image in self.imaging.get_next_image(camera_id):
                is_streaming = self.imaging.client_mode == "Streaming"

                if image is not None and image.image is not None:
                    img = image.image
                    if not is_streaming:
                        # We don't want to run processors when in streaming mode!
                        for processor in star_processors:
                            img = processor.process(img)
                    frame = build_frame_bytes(img, image.width, image.height)
                    yield frame

                    if not is_streaming:
                        # We send an extra frame if not streaming to deal with some browser's buffering issues!
                        yield frame
                else:
                    # yield b"\r\ndata: empty!\r\n"
                    delay = 0.001 if is_streaming else 0.1
                    await asyncio.sleep(delay)

        @router.get("/stream/{camera_id:int}")
        async def stream_image(camera_id: int = 0):
            """Stream images from the Seestar imaging server."""
            return StreamingResponse(
                get_next_image(camera_id),
                media_type="multipart/x-mixed-replace; boundary=frame",
            )

        self.router = router

        # Don't auto-connect during API creation - let the controller handle connections
        # asyncio.create_task(startup())

        return router

    def initialize_clients(self):
        """Initialize clients without connecting."""
        if not hasattr(self, "event_bus") or not self.event_bus:
            self.event_bus = EventBus()
        if not hasattr(self, "client") or not self.client:
            self.client = SeestarClient(self.host, self.port, self.event_bus)
        if not hasattr(self, "imaging") or not self.imaging:
            self.imaging = SeestarImagingClient(
                self.host, self.imaging_port, self.event_bus
            )


class MockImagingClient:
    """Mock imaging client for test telescope."""

    def __init__(self):
        self.is_connected = False
        self._is_streaming = False

    @property
    def status(self):
        """Mock status object."""
        return type("Status", (), {"is_streaming": self._is_streaming})()

    async def connect(self):
        """Mock connect method."""
        self.is_connected = True

    async def start_streaming(self):
        """Mock start streaming method."""
        self._is_streaming = True

    async def stop_streaming(self):
        """Mock stop streaming method."""
        self._is_streaming = False


class MockSeestarClient:
    """Mock Seestar client for test telescope."""

    def __init__(self):
        self.is_connected = False
        self._status = None
        self.event_bus = EventBus()

    async def connect(self):
        """Mock connect method."""
        self.is_connected = True

    async def disconnect(self):
        """Mock disconnect method."""
        self.is_connected = False

    async def send_and_recv(self, command):
        """Mock send_and_recv method."""
        # Return empty response
        from smarttel.seestar.commands.common import CommandResponse

        return CommandResponse(id=1, result={})

    @property
    def status(self):
        """Mock status property."""
        if self._status is None:
            self._status = type(
                "Status",
                (),
                {
                    "is_connected": self.is_connected,
                    "is_slewing": False,
                    "is_tracking": False,
                    "is_calibrating": False,
                    "target_name": "Test Target",
                    "target_ra": 0.0,
                    "target_dec": 0.0,
                },
            )()
        return self._status


class TestTelescope(BaseModel, arbitrary_types_allowed=True):
    """Test telescope for WebRTC dummy video testing."""

    host: str
    port: int = 9999  # Non-existent port
    imaging_port: int = 9998  # Non-existent port
    serial_number: Optional[str] = None
    product_model: Optional[str] = None
    ssid: Optional[str] = None
    discovery_method: str = "manual"
    _location: Optional[str] = None

    # Mock properties for compatibility
    router: APIRouter | None = None
    event_bus: EventBus | None = None
    client: MockSeestarClient | None = None
    imaging: MockImagingClient | None = None

    def __init__(self, **data):
        super().__init__(**data)
        # Initialize mock clients
        self.client = MockSeestarClient()
        self.imaging = MockImagingClient()
        # Initialize event bus if needed
        from smarttel.seestar.client import EventBus

        self.event_bus = EventBus()

    @property
    def name(self):
        return self.serial_number or self.host

    @property
    async def location(self) -> Optional[str]:
        """Return the location for the test telescope."""
        return self._location or "Test Lab"

    async def _get_public_ip(self) -> Optional[str]:
        """Mock method - test telescope doesn't need real IP."""
        return "127.0.0.1"

    def create_test_api(self) -> APIRouter:
        """Create a test API router for the dummy telescope."""
        router = APIRouter()

        @router.get("/")
        async def root():
            """Root endpoint for test telescope."""
            return {
                "status": "test_mode",
                "telescope": {
                    "name": self.name,
                    "host": self.host,
                    "port": self.port,
                    "serial_number": self.serial_number,
                    "product_model": self.product_model,
                    "connected": False,  # Always false for test telescope
                    "type": "dummy",
                },
            }

        @router.get("/status")
        async def get_status():
            """Get test telescope status."""
            return {
                "status": "test_mode",
                "connected": False,
                "message": "This is a test telescope for WebRTC dummy video testing",
            }

        # Add basic MJPEG endpoint that serves dummy video
        @router.get("/video", response_class=StreamingResponse)
        async def get_video():
            """Serve dummy video as MJPEG stream."""
            from dummy_video_track import DummyVideoTrack
            import cv2

            async def generate_mjpeg():
                """Generate MJPEG stream from dummy video track."""
                track = DummyVideoTrack(target_fps=10)
                await track.start()

                try:
                    frame_count = 0
                    while frame_count < 300:  # Stream for ~30 seconds
                        try:
                            # Get frame from dummy track
                            video_frame = await track.recv()

                            # Convert to numpy array
                            frame_array = video_frame.to_ndarray(format="rgb24")

                            # Convert RGB to BGR for OpenCV
                            frame_bgr = cv2.cvtColor(frame_array, cv2.COLOR_RGB2BGR)

                            # Encode as JPEG
                            _, buffer = cv2.imencode(
                                ".jpg", frame_bgr, [cv2.IMWRITE_JPEG_QUALITY, 80]
                            )
                            frame_bytes = buffer.tobytes()

                            # Yield as MJPEG frame
                            yield (
                                b"--frame\r\n"
                                b"Content-Type: image/jpeg\r\n\r\n"
                                + frame_bytes
                                + b"\r\n"
                            )

                            frame_count += 1

                        except Exception as e:
                            logging.error(f"Error generating test frame: {e}")
                            break

                finally:
                    await track.stop()

            return StreamingResponse(
                generate_mjpeg(), media_type="multipart/x-mixed-replace; boundary=frame"
            )

        return router


class Controller:
    """Controller for all of the telescopes."""

    def __init__(
        self, app: FastAPI, service_port: int = 8000, *, discover: bool = True
    ):
        """Initialize the controller."""
        self.app = app
        self.telescopes: dict[str, Telescope] = {}
        self.remote_telescopes: dict[str, dict] = {}  # Track remote telescope metadata
        self.remote_controllers: dict[
            str, dict
        ] = {}  # Track remote controller metadata
        self.service_port = service_port
        self.discover = discover
        self.db = TelescopeDatabase()

    async def add_telescope(
        self,
        host: str,
        port: int,
        *,
        serial_number: Optional[str] = None,
        product_model: Optional[str] = None,
        ssid: Optional[str] = None,
        location: Optional[str] = None,
        discover: bool = False,
    ):
        """Add a telescope to the controller."""

        # If serial_number is not provided, try to fetch device information
        if not serial_number:
            try:
                client = SeestarClient(host, port, EventBus())
                await client.connect()

                # Get device state to retrieve serial number, product model, and ssid
                response: CommandResponse = await client.send_and_recv(GetDeviceState())
                if response.result:
                    device_state = GetDeviceStateResponse(**response.result)
                    serial_number = device_state.device.sn
                    product_model = device_state.device.product_model
                    ssid = device_state.ap.ssid
                    logging.info(
                        f"Fetched device info - SN: {serial_number}, Model: {product_model}, SSID: {ssid}"
                    )

                await client.disconnect()
            except Exception as e:
                logging.warning(
                    f"Failed to fetch device information from {host}:{port}: {e}"
                )

        telescope = Telescope(
            host=host,
            port=port,
            serial_number=serial_number,
            product_model=product_model,
            ssid=ssid,
            discovery_method="auto_discovery" if discover else "manual",
            _location=location,
        )
        logging.info(
            f"Added telescope {telescope.name} at {host}:{port} {serial_number=} {product_model=} {ssid=} {location=}"
        )

        self.telescopes[telescope.name] = telescope

        # Save manually added telescopes to database
        if telescope.discovery_method == "manual":
            telescope_data = {
                "host": telescope.host,
                "port": telescope.port,
                "serial_number": telescope.serial_number,
                "product_model": telescope.product_model,
                "ssid": telescope.ssid,
                "location": telescope._location,
                "discovery_method": telescope.discovery_method,
            }
            asyncio.create_task(self.db.save_telescope(telescope_data))

        self.app.include_router(
            telescope.create_telescope_api(),
            prefix=f"/api/telescopes/{telescope.name}",
        )

    def remove_telescope(self, name: str):
        """Remove a telescope from the controller."""
        # Try to remove local telescope first
        telescope = self.telescopes.pop(name, None)
        if telescope:
            logging.info(f"Removed local telescope {telescope.name}")

            # Remove from database if it was manually added
            if telescope.discovery_method == "manual":
                asyncio.create_task(self.db.delete_telescope_by_name(name))

            # todo : need to remove from router and shut down connection...
            return

        # Try to remove remote telescope
        remote_telescope = self.remote_telescopes.pop(name, None)
        if remote_telescope:
            logging.info(f"Removed remote telescope {name}")
            # todo : need to remove proxy router
            return

        logging.info(f"Telescope {name} not found")

    async def add_remote_controller(
        self,
        host: str,
        port: int,
        name: Optional[str] = None,
        description: Optional[str] = None,
        persist: bool = True,
    ):
        """Add proxy routes for telescopes from a remote controller by calling its /api/telescopes endpoint."""
        controller_key = f"{host}:{port}"

        try:
            async with httpx.AsyncClient(timeout=5.0, http2=True) as client:
                response = await client.get(f"http://{host}:{port}/api/telescopes")
                if response.status_code == 200:
                    telescopes = response.json()
                    telescope_count = 0

                    for telescope_data in telescopes:
                        telescope_name = telescope_data.get("name")
                        if (
                            telescope_name not in self.telescopes
                            and telescope_name not in self.remote_telescopes
                        ):
                            # Create proxy router for this remote telescope
                            self._create_proxy_router(telescope_name, host, port)
                            # Store remote telescope metadata
                            self.remote_telescopes[telescope_name] = {
                                "name": telescope_name,
                                "host": telescope_data.get("host"),
                                "port": telescope_data.get("port"),
                                "location": telescope_data.get("location"),
                                "connected": telescope_data.get("connected", False),
                                "serial_number": telescope_data.get("serial_number"),
                                "product_model": telescope_data.get("product_model"),
                                "ssid": telescope_data.get("ssid"),
                                "remote_controller": controller_key,
                                "is_remote": True,
                            }
                            telescope_count += 1
                            logging.info(
                                f"Created proxy route for remote telescope {telescope_name} from {host}:{port}"
                            )
                        else:
                            logging.debug(
                                f"Telescope {telescope_name} already exists, skipping"
                            )

                    # Store remote controller metadata
                    self.remote_controllers[controller_key] = {
                        "host": host,
                        "port": port,
                        "name": name or f"Remote Controller {host}:{port}",
                        "description": description,
                        "status": "connected",
                        "last_connected": datetime.datetime.now().isoformat(),
                        "telescopes_count": telescope_count,
                    }

                    # Register remote controllers with WebSocket manager for each telescope
                    from websocket_router import websocket_manager

                    for (
                        telescope_data
                    ) in telescopes:  # telescopes is already the parsed JSON list
                        telescope_name = telescope_data.get("name")
                        telescope_id = (
                            telescope_data.get("serial_number") or telescope_name
                        )

                        # Create RemoteController object for WebSocket management
                        remote_controller = RemoteController(
                            host=host,
                            port=port,
                            telescope_id=telescope_id,
                            controller_id=controller_key,
                        )

                        # Register with WebSocket manager
                        success = await websocket_manager.register_remote_controller(
                            remote_controller
                        )
                        if success:
                            logging.info(
                                f"Registered remote controller WebSocket for telescope {telescope_id}"
                            )
                        else:
                            logging.warning(
                                f"Failed to register remote controller WebSocket for telescope {telescope_id}"
                            )

                    # Persist to database if requested
                    if persist:
                        await self.db.save_remote_controller(
                            self.remote_controllers[controller_key]
                        )

                    logging.info(
                        f"Successfully connected to remote controller {host}:{port} with {telescope_count} telescopes"
                    )
                    return True
                else:
                    logging.error(
                        f"Failed to fetch telescopes from {host}:{port}, status code: {response.status_code}"
                    )
                    return False
        except Exception as e:
            logging.error(
                f"Failed to connect to remote controller at {host}:{port}: {e}"
            )

            # Update status to disconnected if controller was previously added
            if controller_key in self.remote_controllers:
                self.remote_controllers[controller_key]["status"] = "disconnected"
                if persist:
                    await self.db.update_remote_controller_status(
                        host, port, "disconnected"
                    )
            return False

    async def remove_remote_controller(self, host: str, port: int):
        """Remove a remote controller and all its telescopes."""
        controller_key = f"{host}:{port}"

        if controller_key not in self.remote_controllers:
            logging.warning(f"Remote controller {controller_key} not found")
            return False

        # Remove all telescopes from this remote controller
        telescopes_to_remove = []
        for telescope_name, telescope_data in self.remote_telescopes.items():
            if telescope_data.get("remote_controller") == controller_key:
                telescopes_to_remove.append(telescope_name)

        # Unregister from WebSocket manager
        from websocket_router import websocket_manager

        for telescope_name in telescopes_to_remove:
            telescope_data = self.remote_telescopes[telescope_name]
            telescope_id = telescope_data.get("serial_number") or telescope_name
            await websocket_manager.unregister_remote_controller(
                controller_key, telescope_id
            )
            del self.remote_telescopes[telescope_name]
            logging.info(f"Removed remote telescope {telescope_name}")

        # Remove the controller
        del self.remote_controllers[controller_key]

        # Remove from database
        await self.db.delete_remote_controller(host, port)

        logging.info(
            f"Removed remote controller {controller_key} and {len(telescopes_to_remove)} telescopes"
        )
        return True

    async def load_saved_remote_controllers(self):
        """Load saved remote controllers from the database and try to connect to them."""
        try:
            saved_controllers = await self.db.load_remote_controllers()

            for controller_data in saved_controllers:
                host = controller_data["host"]
                port = controller_data["port"]
                name = controller_data.get("name")
                description = controller_data.get("description")

                logging.info(
                    f"Attempting to reconnect to saved remote controller {host}:{port}"
                )

                # Try to reconnect (with persist=False since it's already in DB)
                success = await self.add_remote_controller(
                    host, port, name, description, persist=False
                )
                if not success:
                    # Update status to disconnected if connection failed
                    await self.db.update_remote_controller_status(
                        host, port, "disconnected"
                    )
                    logging.warning(
                        f"Failed to reconnect to remote controller {host}:{port}"
                    )

        except Exception as e:
            logging.error(f"Failed to load saved remote controllers: {e}")

    def _create_proxy_router(
        self, telescope_name: str, remote_host: str, remote_port: int
    ):
        """Create a proxy router that forwards requests to the remote controller."""
        router = APIRouter()
        client = httpx.AsyncClient(
            base_url=f"http://{remote_host}:{remote_port}/", timeout=None, http2=True
        )

        @router.api_route(
            "/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"]
        )
        async def proxy_request(request: Request, path: str):
            """Proxy all requests to the remote controller."""
            try:
                url = httpx.URL(
                    path=request.url.path, query=request.url.query.encode("utf-8")
                )
                rp_req = client.build_request(
                    request.method,
                    url,
                    headers=request.headers.raw,
                    content=request.stream(),
                )
                rp_resp = await client.send(rp_req, stream=True)
                return StreamingResponse(
                    rp_resp.aiter_raw(),
                    status_code=rp_resp.status_code,
                    headers=rp_resp.headers,
                    background=BackgroundTask(rp_resp.aclose),
                )
            except Exception as e:
                logging.error(f"Proxy request failed for {telescope_name}: {e}")
                raise HTTPException(
                    status_code=502,
                    detail=f"Failed to proxy request to remote telescope: {e}",
                )

        # Include the proxy router
        self.app.include_router(router, prefix=f"/api/telescopes/{telescope_name}")

    async def auto_discover(self):
        """Automatically discover and add telescopes."""
        while True:
            devices = await discover_seestars(timeout=3)

            # Collect new devices to add in parallel
            new_devices = []
            for device in devices:
                logging.trace(f"Auto discovery: {device}")
                name = pydash.get(device, "data.result.sn") or device["address"]
                if name not in self.telescopes:
                    new_devices.append(device)

            # Add new telescopes in parallel
            if new_devices:
                tasks = []
                for device in new_devices:
                    task = self.add_telescope(
                        device["address"],
                        4700,
                        serial_number=pydash.get(device, "data.result.sn"),
                        product_model=pydash.get(device, "data.result.product_model"),
                        ssid=pydash.get(device, "data.result.ssid"),
                        discover=True,
                    )
                    tasks.append(task)

                # Execute all telescope additions in parallel
                results = await asyncio.gather(*tasks, return_exceptions=True)

                # Log any errors and collect successfully added telescopes
                newly_added_telescopes = []
                for i, result in enumerate(results):
                    if isinstance(result, Exception):
                        device = new_devices[i]
                        logging.error(
                            f"Failed to add telescope {device['address']}: {result}"
                        )
                    else:
                        device = new_devices[i]
                        telescope_name = (
                            pydash.get(device, "data.result.sn") or device["address"]
                        )
                        newly_added_telescopes.append(telescope_name)

                # Connect newly discovered telescopes
                if newly_added_telescopes:
                    logging.info(
                        f"Connecting {len(newly_added_telescopes)} newly discovered telescopes: {newly_added_telescopes}"
                    )
                    await self.connect_telescopes(newly_added_telescopes)

            await asyncio.sleep(60)

    async def load_saved_telescopes(self):
        """Load manually added telescopes from the database."""
        try:
            saved_telescopes = await self.db.load_telescopes()

            # Collect telescopes to load in parallel
            telescopes_to_load = []
            for telescope_data in saved_telescopes:
                telescope_name = (
                    telescope_data.get("serial_number") or telescope_data["host"]
                )
                print(f"telescope_name : {telescope_name}: {telescope_data}")
                if telescope_name not in self.telescopes:
                    telescopes_to_load.append(telescope_data)

            # Load telescopes in parallel
            if telescopes_to_load:
                tasks = []
                for telescope_data in telescopes_to_load:
                    task = self.add_telescope(
                        host=telescope_data["host"],
                        port=telescope_data["port"],
                        serial_number=telescope_data.get("serial_number"),
                        product_model=telescope_data.get("product_model"),
                        ssid=telescope_data.get("ssid"),
                        location=telescope_data.get("location"),
                        discover=False,  # These are manually added telescopes
                    )
                    tasks.append(task)

                # Execute all telescope loads in parallel
                results = await asyncio.gather(*tasks, return_exceptions=True)

                # Log results
                for i, result in enumerate(results):
                    telescope_data = telescopes_to_load[i]
                    telescope_name = (
                        telescope_data.get("serial_number") or telescope_data["host"]
                    )
                    if isinstance(result, Exception):
                        logging.error(
                            f"Failed to restore telescope {telescope_name}: {result}"
                        )
                    else:
                        logging.info(
                            f"Restored telescope {telescope_name} from database"
                        )

        except Exception as e:
            logging.error(f"Failed to load saved telescopes: {e}")

    async def connect_all_telescopes(self):
        """Connect to all telescopes in parallel with throttling."""
        if not self.telescopes:
            logging.info("No telescopes to connect to")
            return

        logging.info(f"Connecting to {len(self.telescopes)} telescopes in parallel...")

        # Create connection tasks for all telescopes
        connection_tasks = []
        telescope_names = []

        # Add a small delay counter to stagger connections slightly
        delay_offset = 0

        for telescope in self.telescopes.values():
            # Ensure clients are initialized before connecting
            if hasattr(telescope, "initialize_clients"):
                telescope.initialize_clients()

            if (
                hasattr(telescope, "client")
                and hasattr(telescope, "imaging")
                and telescope.client
                and telescope.imaging
            ):
                # Create a task to connect both clients for this telescope with staggered timing
                async def connect_telescope_clients(tel=telescope, delay=delay_offset):
                    try:
                        # Add a small staggered delay to prevent overwhelming the network
                        if delay > 0:
                            await asyncio.sleep(
                                delay * 0.1
                            )  # 100ms delay per telescope

                        # Check if already connected to avoid duplicate connections
                        if tel.client.is_connected and tel.imaging.is_connected:
                            logging.info(
                                f"Telescope {tel.name} already connected, skipping"
                            )
                            return tel.name, True

                        logging.info(
                            f"Connecting to telescope {tel.name} at {tel.host}:{tel.port}"
                        )

                        # Connect main client and imaging client in parallel
                        tasks = []
                        if not tel.client.is_connected:
                            tasks.append(tel.client.connect())
                        if not tel.imaging.is_connected:
                            tasks.append(tel.imaging.connect())

                        if tasks:
                            results = await asyncio.gather(
                                *tasks, return_exceptions=True
                            )

                            # Check for connection errors
                            for i, result in enumerate(results):
                                if isinstance(result, Exception):
                                    logging.error(
                                        f"Connection error for {tel.name}: {result}"
                                    )

                        # Register telescope with WebSocket manager and set up status updates
                        if tel.client.is_connected:
                            from websocket_router import websocket_manager

                            telescope_id = tel.serial_number or tel.host
                            websocket_manager.register_telescope_client(
                                telescope_id, tel.client
                            )

                            # Set up event listener to forward status updates through WebSocket
                            async def forward_status_update(event):
                                try:
                                    status_dict = tel.client.status.model_dump()
                                    await websocket_manager.broadcast_status_update(
                                        telescope_id, status_dict
                                    )
                                except Exception as e:
                                    logging.error(
                                        f"Error forwarding status update for {telescope_id}: {e}"
                                    )

                            # Set up annotation event listener to forward annotation events
                            async def forward_annotation_event(annotation_event):
                                try:
                                    if (
                                        annotation_event.result
                                        and annotation_event.result.annotations
                                    ):
                                        # Transform telescope annotation format to frontend format
                                        annotations = []
                                        for (
                                            annotation
                                        ) in annotation_event.result.annotations:
                                            annotations.append(
                                                {
                                                    "type": annotation.type,
                                                    "pixelx": annotation.pixelx,
                                                    "pixely": annotation.pixely,
                                                    "radius": annotation.radius,
                                                    "name": annotation.name,
                                                    "names": annotation.names,
                                                }
                                            )

                                        await websocket_manager.broadcast_annotation_event(
                                            telescope_id,
                                            annotations,
                                            annotation_event.result.image_size,
                                            annotation_event.result.image_id,
                                        )
                                        logging.info(
                                            f"Forwarded annotation event for {telescope_id}: {len(annotations)} annotations"
                                        )
                                except Exception as e:
                                    logging.error(
                                        f"Error forwarding annotation event for {telescope_id}: {e}"
                                    )

                            # Subscribe to annotation events
                            tel.event_bus.subscribe(
                                "Annotate", forward_annotation_event
                            )

                            # Subscribe to all events that might update status
                            # Note: EventBus doesn't support wildcard, we need to subscribe to specific events
                            # For now, let's set up a periodic status update instead
                            async def periodic_status_update():
                                while tel.client.is_connected:
                                    try:
                                        # Get status as dict - handle both Pydantic models and plain objects
                                        if hasattr(tel.client.status, "model_dump"):
                                            status_dict = tel.client.status.model_dump()
                                        elif hasattr(tel.client.status, "__dict__"):
                                            status_dict = vars(tel.client.status)
                                        else:
                                            # For mock status objects, extract attributes manually
                                            status_dict = {
                                                attr: getattr(
                                                    tel.client.status, attr, None
                                                )
                                                for attr in dir(tel.client.status)
                                                if not attr.startswith("_")
                                            }
                                        await websocket_manager.broadcast_status_update(
                                            telescope_id, status_dict
                                        )
                                    except Exception as e:
                                        logging.error(
                                            f"Error sending periodic status update for {telescope_id}: {e}"
                                        )
                                    await asyncio.sleep(1)  # Send updates every second

                            asyncio.create_task(periodic_status_update())
                            logging.info(
                                f"Registered telescope {telescope_id} with WebSocket manager"
                            )

                            # Notify WebSocket clients about telescope discovery
                            telescope_info = {
                                "id": telescope_id,
                                "name": tel.name,
                                "host": tel.host,
                                "port": tel.port,
                                "serial_number": tel.serial_number,
                                "product_model": tel.product_model,
                                "ssid": tel.ssid,
                                "connected": True,
                            }
                            await websocket_manager.broadcast_telescope_discovered(
                                telescope_info
                            )

                        return tel.name, True
                    except Exception as e:
                        logging.error(f"Failed to connect telescope {tel.name}: {e}")
                        return tel.name, False

                connection_tasks.append(connect_telescope_clients())
                telescope_names.append(telescope.name)
                delay_offset += 1

        if connection_tasks:
            # Execute all connections in parallel
            results = await asyncio.gather(*connection_tasks, return_exceptions=True)

            # Log results
            connected_count = 0
            for result in results:
                if isinstance(result, Exception):
                    logging.error(f"Connection task failed: {result}")
                else:
                    telescope_name, success = result
                    if success:
                        connected_count += 1
                        logging.info(
                            f"Successfully connected to telescope: {telescope_name}"
                        )
                    else:
                        logging.error(
                            f"Failed to connect to telescope: {telescope_name}"
                        )

            logging.info(
                f"Parallel connection complete: {connected_count}/{len(connection_tasks)} telescopes connected"
            )

    async def connect_telescopes(self, telescope_names: list[str]):
        """Connect specific telescopes by name."""
        if not telescope_names:
            return

        logging.info(f"Connecting {len(telescope_names)} specific telescopes...")

        # Create connection tasks for specified telescopes
        connection_tasks = []
        delay_offset = 0

        for telescope_name in telescope_names:
            telescope = self.telescopes.get(telescope_name)
            if not telescope:
                logging.warning(f"Telescope {telescope_name} not found for connection")
                continue

            # Ensure clients are initialized before connecting
            if hasattr(telescope, "initialize_clients"):
                telescope.initialize_clients()

            if (
                hasattr(telescope, "client")
                and hasattr(telescope, "imaging")
                and telescope.client
                and telescope.imaging
            ):
                # Create a task to connect both clients for this telescope
                async def connect_telescope_clients(tel=telescope, delay=delay_offset):
                    try:
                        # Add a small staggered delay to prevent overwhelming the network
                        if delay > 0:
                            await asyncio.sleep(
                                delay * 0.1
                            )  # 100ms delay per telescope

                        # Check if already connected to avoid duplicate connections
                        if tel.client.is_connected and tel.imaging.is_connected:
                            logging.info(
                                f"Telescope {tel.name} already connected, skipping"
                            )
                            return tel.name, True

                        logging.info(
                            f"Connecting to newly discovered telescope {tel.name} at {tel.host}:{tel.port}"
                        )

                        # Connect main client and imaging client in parallel
                        tasks = []
                        if not tel.client.is_connected:
                            tasks.append(tel.client.connect())
                        if not tel.imaging.is_connected:
                            tasks.append(tel.imaging.connect())

                        if tasks:
                            results = await asyncio.gather(
                                *tasks, return_exceptions=True
                            )

                            # Check for connection errors
                            for i, result in enumerate(results):
                                if isinstance(result, Exception):
                                    logging.error(
                                        f"Connection error for {tel.name}: {result}"
                                    )

                        # Register telescope with WebSocket manager and set up status updates
                        if tel.client.is_connected:
                            from websocket_router import websocket_manager

                            telescope_id = tel.serial_number or tel.host
                            websocket_manager.register_telescope_client(
                                telescope_id, tel.client
                            )

                            # Set up event listener to forward status updates through WebSocket
                            async def forward_status_update(event):
                                try:
                                    status_dict = tel.client.status.model_dump()
                                    await websocket_manager.broadcast_status_update(
                                        telescope_id, status_dict
                                    )
                                except Exception as e:
                                    logging.error(
                                        f"Error forwarding status update for {telescope_id}: {e}"
                                    )

                            # Set up annotation event listener to forward annotation events
                            async def forward_annotation_event(annotation_event):
                                try:
                                    if (
                                        annotation_event.result
                                        and annotation_event.result.annotations
                                    ):
                                        # Transform telescope annotation format to frontend format
                                        annotations = []
                                        for (
                                            annotation
                                        ) in annotation_event.result.annotations:
                                            annotations.append(
                                                {
                                                    "type": annotation.type,
                                                    "pixelx": annotation.pixelx,
                                                    "pixely": annotation.pixely,
                                                    "name": annotation.name,
                                                    "names": annotation.names,
                                                }
                                            )

                                        await websocket_manager.broadcast_annotation_event(
                                            telescope_id,
                                            annotations,
                                            annotation_event.result.image_size,
                                            annotation_event.result.image_id,
                                        )
                                        logging.info(
                                            f"Forwarded annotation event for {telescope_id}: {len(annotations)} annotations"
                                        )
                                except Exception as e:
                                    logging.error(
                                        f"Error forwarding annotation event for {telescope_id}: {e}"
                                    )

                            # Subscribe to annotation events
                            tel.event_bus.subscribe(
                                "Annotate", forward_annotation_event
                            )

                            # Subscribe to all events that might update status
                            # Note: EventBus doesn't support wildcard, we need to subscribe to specific events
                            # For now, let's set up a periodic status update instead
                            async def periodic_status_update():
                                while tel.client.is_connected:
                                    try:
                                        # Get status as dict - handle both Pydantic models and plain objects
                                        if hasattr(tel.client.status, "model_dump"):
                                            status_dict = tel.client.status.model_dump()
                                        elif hasattr(tel.client.status, "__dict__"):
                                            status_dict = vars(tel.client.status)
                                        else:
                                            # For mock status objects, extract attributes manually
                                            status_dict = {
                                                attr: getattr(
                                                    tel.client.status, attr, None
                                                )
                                                for attr in dir(tel.client.status)
                                                if not attr.startswith("_")
                                            }
                                        await websocket_manager.broadcast_status_update(
                                            telescope_id, status_dict
                                        )
                                    except Exception as e:
                                        logging.error(
                                            f"Error sending periodic status update for {telescope_id}: {e}"
                                        )
                                    await asyncio.sleep(1)  # Send updates every second

                            asyncio.create_task(periodic_status_update())
                            logging.info(
                                f"Registered telescope {telescope_id} with WebSocket manager"
                            )

                            # Notify WebSocket clients about telescope discovery
                            telescope_info = {
                                "id": telescope_id,
                                "name": tel.name,
                                "host": tel.host,
                                "port": tel.port,
                                "serial_number": tel.serial_number,
                                "product_model": tel.product_model,
                                "ssid": tel.ssid,
                                "connected": True,
                            }
                            await websocket_manager.broadcast_telescope_discovered(
                                telescope_info
                            )

                        return tel.name, True
                    except Exception as e:
                        logging.error(f"Failed to connect telescope {tel.name}: {e}")
                        return tel.name, False

                connection_tasks.append(connect_telescope_clients())
                delay_offset += 1

        if connection_tasks:
            # Execute all connections in parallel
            results = await asyncio.gather(*connection_tasks, return_exceptions=True)

            # Log results
            connected_count = 0
            for result in results:
                if isinstance(result, Exception):
                    logging.error(f"Connection task failed: {result}")
                else:
                    telescope_name, success = result
                    if success:
                        connected_count += 1
                        logging.info(
                            f"Successfully connected to newly discovered telescope: {telescope_name}"
                        )
                    else:
                        logging.error(
                            f"Failed to connect to telescope: {telescope_name}"
                        )

            logging.info(
                f"New telescope connection complete: {connected_count}/{len(connection_tasks)} telescopes connected"
            )

    async def add_test_telescope(self):
        """Add a dummy test telescope for WebRTC testing."""
        try:
            # Create a mock telescope for testing WebRTC with dummy video
            test_telescope = TestTelescope(
                host="127.0.0.1",
                port=9999,  # Non-existent port, won't connect
                serial_number="test-dummy-01",
                product_model="Test Telescope",
                ssid="TEST_SCOPE",
                discovery_method="manual",
                _location="Test Lab",
            )

            logging.info(
                f"Added test telescope {test_telescope.name} for WebRTC dummy video testing"
            )
            self.telescopes[test_telescope.name] = test_telescope

            # Create router for test telescope (but don't try to connect)
            self.app.include_router(
                test_telescope.create_test_api(),
                prefix=f"/api/telescopes/{test_telescope.name}",
            )

        except Exception as e:
            logging.error(f"Failed to add test telescope: {e}")

    async def runner(self):
        """Create and run the Uvicorn server."""

        # Load saved telescopes first
        await self.load_saved_telescopes()

        # Load saved remote controllers
        await self.load_saved_remote_controllers()

        # Add a dummy test telescope for WebRTC testing
        await self.add_test_telescope()

        print(f"Discover {self.discover}")
        if self.discover:
            click.secho("Starting auto-discovery...", fg="green")
            asyncio.create_task(self.auto_discover())

        # Initialize WebRTC service with telescope getter
        from webrtc_router import initialize_webrtc_service

        def get_telescope(telescope_name: str):
            """Get telescope by name for WebRTC service."""
            telescope = self.telescopes.get(telescope_name)
            logging.info(
                f"WebRTC telescope lookup for '{telescope_name}': {'found' if telescope else 'not found'}"
            )
            if not telescope:
                logging.info(f"Available telescopes: {list(self.telescopes.keys())}")
            return telescope

        initialize_webrtc_service(get_telescope)

        # Add WebRTC router
        self.app.include_router(webrtc_router)

        # Add WebSocket router
        self.app.include_router(websocket_router, prefix="/api")

        # Add startup handler to connect telescopes after server is ready
        @self.app.on_event("startup")
        async def startup_event():
            # Start WebSocket manager first
            from websocket_router import websocket_manager

            await websocket_manager.start()
            logging.info("WebSocket manager started")

            # Connect to all loaded telescopes after server is fully started
            if self.telescopes:

                async def delayed_connect():
                    await asyncio.sleep(2)  # Wait for server to be fully ready
                    click.secho(
                        f"Connecting to {len(self.telescopes)} telescopes after startup...",
                        fg="blue",
                    )
                    await self.connect_all_telescopes()

                asyncio.create_task(delayed_connect())

        # Add shutdown handler for WebRTC cleanup
        @self.app.on_event("shutdown")
        async def shutdown_event():
            # Stop WebSocket manager
            from websocket_router import websocket_manager

            await websocket_manager.stop()
            logging.info("WebSocket manager stopped")

            from webrtc_router import cleanup_webrtc_service

            await cleanup_webrtc_service()

        # Add our own endpoints
        @self.app.get("/", response_class=HTMLResponse)
        async def root():
            """Root endpoint providing API information and navigation as HTML."""
            # Count telescopes excluding test telescopes
            local_telescope_count = sum(
                1
                for t in self.telescopes.values()
                if not (isinstance(t, TestTelescope) or t.port == 9999)
            )
            telescope_count = local_telescope_count + len(self.remote_telescopes)

            # Get network scanning information
            from smarttel.seestar.commands.discovery import get_all_network_interfaces

            network_interfaces = get_all_network_interfaces()

            # Get discovery statistics (exclude test telescopes)
            auto_discovered_count = sum(
                1
                for t in self.telescopes.values()
                if t.discovery_method == "auto_discovery"
                and not (isinstance(t, TestTelescope) or t.port == 9999)
            )
            manual_count = sum(
                1
                for t in self.telescopes.values()
                if t.discovery_method == "manual"
                and not (isinstance(t, TestTelescope) or t.port == 9999)
            )
            remote_count = len(self.remote_telescopes)
            controller_count = len(self.remote_controllers)

            html_content = f"""
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>ALP Experimental Telescope Control API</title>
                <style>
                    body {{
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                        max-width: 800px;
                        margin: 0 auto;
                        padding: 20px;
                        line-height: 1.6;
                        color: #333;
                        background-color: #f5f5f5;
                    }}
                    .container {{
                        background: white;
                        padding: 30px;
                        border-radius: 10px;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                    }}
                    h1 {{
                        color: #2c3e50;
                        border-bottom: 3px solid #3498db;
                        padding-bottom: 10px;
                    }}
                    h2 {{
                        color: #34495e;
                        margin-top: 30px;
                    }}
                    .badge {{
                        background: #3498db;
                        color: white;
                        padding: 4px 8px;
                        border-radius: 4px;
                        font-size: 0.8em;
                    }}
                    .endpoint-grid {{
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                        gap: 20px;
                        margin: 20px 0;
                    }}
                    .endpoint-card {{
                        border: 1px solid #e1e8ed;
                        border-radius: 8px;
                        padding: 15px;
                        background: #f8f9fa;
                    }}
                    .endpoint-title {{
                        font-weight: bold;
                        color: #2c3e50;
                        margin-bottom: 10px;
                    }}
                    .endpoint-item {{
                        margin: 5px 0;
                        font-family: monospace;
                        font-size: 0.9em;
                    }}
                    .method-get {{ color: #28a745; }}
                    .method-post {{ color: #007bff; }}
                    .method-delete {{ color: #dc3545; }}
                    .quick-links {{
                        display: flex;
                        gap: 15px;
                        margin: 20px 0;
                        flex-wrap: wrap;
                    }}
                    .btn {{
                        display: inline-block;
                        padding: 10px 20px;
                        border-radius: 5px;
                        text-decoration: none;
                        font-weight: bold;
                        transition: background-color 0.2s;
                    }}
                    .btn-primary {{
                        background: #3498db;
                        color: white;
                    }}
                    .btn-primary:hover {{
                        background: #2980b9;
                    }}
                    .btn-secondary {{
                        background: #95a5a6;
                        color: white;
                    }}
                    .btn-secondary:hover {{
                        background: #7f8c8d;
                    }}
                    .status {{
                        background: #e8f5e8;
                        border: 1px solid #c3e6c3;
                        border-radius: 5px;
                        padding: 10px;
                        margin: 15px 0;
                    }}
                    .telescope-table {{
                        width: 100%;
                        border-collapse: collapse;
                        margin: 20px 0;
                        box-shadow: 0 2px 5px rgba(0,0,0,0.1);
                    }}
                    .telescope-table th,
                    .telescope-table td {{
                        padding: 12px;
                        text-align: left;
                        border-bottom: 1px solid #ddd;
                    }}
                    .telescope-table th {{
                        background-color: #f8f9fa;
                        font-weight: bold;
                        color: #2c3e50;
                    }}
                    .telescope-table tr:hover {{
                        background-color: #f5f5f5;
                    }}
                    .status-connected {{
                        color: #28a745;
                        font-weight: bold;
                    }}
                    .status-disconnected {{
                        color: #dc3545;
                        font-weight: bold;
                    }}
                    .discovery-badge {{
                        padding: 2px 6px;
                        border-radius: 3px;
                        font-size: 0.75em;
                        font-weight: bold;
                    }}
                    .discovery-manual {{
                        background: #17a2b8;
                        color: white;
                    }}
                    .discovery-auto {{
                        background: #28a745;
                        color: white;
                    }}
                    .discovery-remote {{
                        background: #6f42c1;
                        color: white;
                    }}
                    .no-telescopes {{
                        text-align: center;
                        padding: 20px;
                        color: #666;
                        font-style: italic;
                    }}
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>🔭 ALP Experimental Telescope Control API</h1>
                    <p><span class="badge">v1.0.0</span> API for controlling Seestar telescopes with real-time event streaming</p>
                    
                    <div class="status">
                        <strong>📊 Status:</strong> Running | 
                        <strong>🔭 Telescopes:</strong> {telescope_count} connected
                    </div>

                    <h2>🔍 Network Discovery Status</h2>
                    <div class="endpoint-grid">
                        <div class="endpoint-card">
                            <div class="endpoint-title">📡 Scanned Networks</div>
                            <div style="font-size: 0.9em; margin: 10px 0;">
                                <strong>Interfaces Scanned:</strong> {len(network_interfaces)}<br>
                                <strong>Discovery Method:</strong> UDP broadcast on port 4720
                            </div>
                            {"".join([f'<div class="endpoint-item">🌐 {local_ip} → {broadcast_ip.rsplit(".", 1)[0]}.0/24</div>' for local_ip, broadcast_ip in network_interfaces]) if network_interfaces else '<div class="endpoint-item" style="color: #666;">No network interfaces detected</div>'}
                        </div>
                        
                        <div class="endpoint-card">
                            <div class="endpoint-title">🔭 Discovery Results</div>
                            <div class="endpoint-item">
                                <span style="color: #28a745;">●</span> Auto-discovered: {auto_discovered_count}
                            </div>
                            <div class="endpoint-item">
                                <span style="color: #17a2b8;">●</span> Manually added: {manual_count}
                            </div>
                            <div class="endpoint-item">
                                <span style="color: #6f42c1;">●</span> Remote telescopes: {remote_count}
                            </div>
                            <div class="endpoint-item" style="margin-top: 10px; font-size: 0.8em; color: #666;">
                                {"Auto-discovery enabled" if self.discover else "Auto-discovery disabled"}
                            </div>
                        </div>
                        
                        <div class="endpoint-card">
                            <div class="endpoint-title">🌐 Remote Controllers</div>
                            <div class="endpoint-item">
                                <span style="color: #e74c3c;">●</span> Connected controllers: {controller_count}
                            </div>
                            <div class="endpoint-item">
                                <span style="color: #6f42c1;">●</span> Proxied telescopes: {remote_count}
                            </div>
                            <div class="endpoint-item" style="margin-top: 10px; font-size: 0.8em; color: #666;">
                                {f"{controller_count} active connections" if controller_count > 0 else "No remote controllers connected"}
                            </div>
                        </div>
                    </div>

                    <h2>🚀 Quick Start</h2>
                    <div class="quick-links">
                        <a href="http://localhost:3000" class="btn btn-primary" target="_blank">
                            🖥️ Frontend Application
                        </a>
                        <a href="/docs" class="btn btn-secondary" target="_blank">
                            📚 API Documentation
                        </a>
                        <a href="/redoc" class="btn btn-secondary" target="_blank">
                            📖 ReDoc Documentation
                        </a>
                        <button onclick="connectAllTelescopes()" class="btn btn-primary" style="border: none; cursor: pointer;">
                            🔗 Connect All Telescopes
                        </button>
                    </div>

                    <script>
                    async function connectAllTelescopes() {{
                        const button = event.target;
                        button.disabled = true;
                        button.textContent = '🔄 Connecting...';
                        
                        try {{
                            const response = await fetch('/api/telescopes/connect-all', {{
                                method: 'POST',
                                headers: {{'Content-Type': 'application/json'}}
                            }});
                            
                            const result = await response.json();
                            
                            if (response.ok) {{
                                button.textContent = `✅ Connected ${{result.connected_telescopes}}/${{result.total_telescopes}}`;
                                setTimeout(() => {{
                                    button.textContent = '🔗 Connect All Telescopes';
                                    button.disabled = false;
                                }}, 3000);
                            }} else {{
                                button.textContent = '❌ Connection Failed';
                                setTimeout(() => {{
                                    button.textContent = '🔗 Connect All Telescopes';
                                    button.disabled = false;
                                }}, 3000);
                            }}
                        }} catch (error) {{
                            button.textContent = '❌ Connection Error';
                            setTimeout(() => {{
                                button.textContent = '🔗 Connect All Telescopes';
                                button.disabled = false;
                            }}, 3000);
                        }}
                    }}
                    </script>

                    <h2>🛠️ API Endpoints</h2>
                    <div class="endpoint-grid">
                        <div class="endpoint-card">
                            <div class="endpoint-title">🔭 Telescope Management</div>
                            <div class="endpoint-item">
                                <span class="method-get">GET</span> /api/telescopes
                            </div>
                            <div class="endpoint-item">
                                <span class="method-post">POST</span> /api/telescopes
                            </div>
                            <div class="endpoint-item">
                                <span class="method-post">POST</span> /api/telescopes/connect-all
                            </div>
                            <div class="endpoint-item">
                                <span class="method-delete">DELETE</span> /api/telescopes/{{name}}
                            </div>
                        </div>
                        
                        <div class="endpoint-card">
                            <div class="endpoint-title">⚙️ Configuration Management</div>
                            <div class="endpoint-item">
                                <span class="method-get">GET</span> /api/configurations
                            </div>
                            <div class="endpoint-item">
                                <span class="method-post">POST</span> /api/configurations
                            </div>
                            <div class="endpoint-item">
                                <span class="method-get">GET</span> /api/configurations/{{name}}
                            </div>
                            <div class="endpoint-item">
                                <span class="method-delete">DELETE</span> /api/configurations/{{name}}
                            </div>
                        </div>
                        
                        <div class="endpoint-card">
                            <div class="endpoint-title">🌐 Remote Controllers</div>
                            <div class="endpoint-item">
                                <span class="method-get">GET</span> /api/remote-controllers
                            </div>
                            <div class="endpoint-item">
                                <span class="method-post">POST</span> /api/remote-controllers
                            </div>
                            <div class="endpoint-item">
                                <span class="method-delete">DELETE</span> /api/remote-controllers/{{host}}/{{port}}
                            </div>
                            <div class="endpoint-item">
                                <span class="method-post">POST</span> /api/remote-controllers/{{host}}/{{port}}/reconnect
                            </div>
                        </div>
                        
                        <div class="endpoint-card">
                            <div class="endpoint-title">🏥 System Health</div>
                            <div class="endpoint-item">
                                <span class="method-get">GET</span> /health
                            </div>
                        </div>
                    </div>

                    <h2>🔭 Connected Telescopes</h2>
            """

            # Generate telescope table
            if telescope_count > 0:
                html_content += """
                    <table class="telescope-table">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Host:Port</th>
                                <th>Model</th>
                                <th>Serial Number</th>
                                <th>Connection</th>
                                <th>Discovery</th>
                                <th>Location</th>
                            </tr>
                        </thead>
                        <tbody>"""

                # Add local telescopes (exclude test telescopes)
                for telescope in self.telescopes.values():
                    # Skip test telescopes
                    if isinstance(telescope, TestTelescope) or telescope.port == 9999:
                        continue

                    location_text = telescope._location or "Unknown"

                    connection_status = (
                        "Connected"
                        if (telescope.client and telescope.client.is_connected)
                        else "Disconnected"
                    )
                    connection_class = (
                        "status-connected"
                        if (telescope.client and telescope.client.is_connected)
                        else "status-disconnected"
                    )

                    discovery_method = (
                        telescope.discovery_method
                        if telescope.discovery_method
                        else "manual"
                    )
                    discovery_class = f"discovery-{discovery_method.replace('_', '-')}"
                    discovery_text = discovery_method.replace("_", " ").title()

                    html_content += f"""
                            <tr>
                                <td><strong>{telescope.name}</strong></td>
                                <td><code>{telescope.host}:{telescope.port}</code></td>
                                <td>{telescope.product_model or "Unknown"}</td>
                                <td>{telescope.serial_number or "N/A"}</td>
                                <td><span class="{connection_class}">{connection_status}</span></td>
                                <td><span class="discovery-badge {discovery_class}">{discovery_text}</span></td>
                                <td>{location_text}</td>
                            </tr>"""

                # Add remote telescopes
                for remote_telescope in self.remote_telescopes.values():
                    connection_status = (
                        "Connected"
                        if remote_telescope.get("connected", False)
                        else "Disconnected"
                    )
                    connection_class = (
                        "status-connected"
                        if remote_telescope.get("connected", False)
                        else "status-disconnected"
                    )

                    html_content += f"""
                            <tr>
                                <td><strong>{remote_telescope.get("name", "Unknown")}</strong></td>
                                <td><code>{remote_telescope.get("host", "Unknown")}:{remote_telescope.get("port", "Unknown")}</code></td>
                                <td>{remote_telescope.get("product_model", "Unknown")}</td>
                                <td>{remote_telescope.get("serial_number", "N/A")}</td>
                                <td><span class="{connection_class}">{connection_status}</span></td>
                                <td><span class="discovery-badge discovery-remote">Remote</span></td>
                                <td>{remote_telescope.get("location", "Unknown")}</td>
                            </tr>"""

                html_content += """
                        </tbody>
                    </table>"""
            else:
                html_content += """
                    <div class="no-telescopes">
                        <p>🔍 No telescopes currently connected</p>
                        <p>Add telescopes manually via the API or enable auto-discovery to see them here.</p>
                    </div>"""

            html_content += """
                    <h2>📋 Individual Telescope Controls</h2>
                    <p>Each connected telescope provides additional endpoints at:</p>
                    <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; font-family: monospace;">
                        /api/telescopes/{{telescope_name}}/{{endpoint}}
                    </div>
                    <p><em>Available after connecting telescopes. Visit the API documentation for complete endpoint details.</em></p>

                    <h2>🔗 Getting Started</h2>
                    <ol>
                        <li><strong>Frontend Users:</strong> Click the "Frontend Application" button above to access the web interface</li>
                        <li><strong>API Developers:</strong> Visit the "API Documentation" for interactive endpoint testing</li>
                        <li><strong>Integration:</strong> Use the endpoints documented above for programmatic access</li>
                    </ol>

                    <footer style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #666;">
                        <p>ALP Experimental - Telescope Control System</p>
                    </footer>
                </div>
            </body>
            </html>
            """
            return html_content

        @self.app.get("/api/telescopes")
        async def get_telescopes():
            """Get a list of all telescopes."""
            result = []

            # Add local telescopes (exclude test telescopes)
            for telescope in self.telescopes.values():
                # Skip test telescopes (identified by TestTelescope class or port 9999)
                if isinstance(telescope, TestTelescope) or telescope.port == 9999:
                    continue

                result.append(
                    {
                        "name": telescope.name,
                        "host": telescope.host,
                        "port": telescope.port,
                        "location": await telescope.location,
                        "connected": telescope.client.is_connected,
                        "serial_number": telescope.serial_number,
                        "product_model": telescope.product_model,
                        "ssid": telescope.ssid,
                        "discovery_method": telescope.discovery_method,
                        "is_remote": False,
                    }
                )

            # Add remote telescopes
            for remote_telescope in self.remote_telescopes.values():
                result.append(remote_telescope)

            return result

        @self.app.post("/api/telescopes")
        async def add_telescope_endpoint(telescope_request: AddTelescopeRequest):
            """Manually add a telescope."""
            try:
                # Check if telescope already exists
                # First try by serial number if provided
                if telescope_request.serial_number:
                    if telescope_request.serial_number in self.telescopes:
                        raise HTTPException(
                            status_code=409,
                            detail=f"Telescope with serial number {telescope_request.serial_number} already exists",
                        )

                # Check by host if no serial number or not found by serial number
                for telescope in self.telescopes.values():
                    if (
                        telescope.host == telescope_request.host
                        and telescope.port == telescope_request.port
                    ):
                        raise HTTPException(
                            status_code=409,
                            detail=f"Telescope at {telescope_request.host}:{telescope_request.port} already exists",
                        )

                # Add the telescope
                await self.add_telescope(
                    host=telescope_request.host,
                    port=telescope_request.port,
                    serial_number=telescope_request.serial_number,
                    product_model=telescope_request.product_model,
                    ssid=telescope_request.ssid,
                    location=telescope_request.location,
                    discover=False,  # Manual addition, not from discovery
                )

                # Get the newly added telescope
                telescope_name = (
                    telescope_request.serial_number or telescope_request.host
                )
                telescope = self.telescopes.get(telescope_name)

                # Connect the newly added telescope
                if telescope:
                    logging.info(f"Connecting newly added telescope: {telescope_name}")
                    await self.connect_telescopes([telescope_name])

                if telescope:
                    return {
                        "status": "success",
                        "message": f"Telescope {telescope.name} added successfully",
                        "telescope": {
                            "name": telescope.name,
                            "host": telescope.host,
                            "port": telescope.port,
                            "location": await telescope.location,
                            "connected": telescope.client.is_connected
                            if telescope.client
                            else False,
                            "serial_number": telescope.serial_number,
                            "product_model": telescope.product_model,
                            "ssid": telescope.ssid,
                            "discovery_method": telescope.discovery_method,
                            "is_remote": False,
                        },
                    }
                else:
                    raise HTTPException(
                        status_code=500, detail="Failed to add telescope"
                    )

            except HTTPException:
                raise
            except Exception as e:
                logging.error(f"Error adding telescope: {e}")
                raise HTTPException(
                    status_code=500, detail=f"Failed to add telescope: {str(e)}"
                )

        @self.app.delete("/api/telescopes/{telescope_name}")
        async def remove_telescope_endpoint(telescope_name: str):
            """Remove a telescope."""
            if (
                telescope_name not in self.telescopes
                and telescope_name not in self.remote_telescopes
            ):
                raise HTTPException(
                    status_code=404, detail=f"Telescope {telescope_name} not found"
                )

            self.remove_telescope(telescope_name)
            return {
                "status": "success",
                "message": f"Telescope {telescope_name} removed",
            }

        @self.app.post("/api/configurations")
        async def save_configuration(config_request: SaveConfigurationRequest):
            """Save a configuration to the database."""
            try:
                success = await self.db.save_configuration(
                    name=config_request.name,
                    description=config_request.description,
                    config_data=json.dumps(config_request.config_data),
                )

                if success:
                    return {
                        "status": "success",
                        "message": f"Configuration '{config_request.name}' saved successfully",
                    }
                else:
                    raise HTTPException(
                        status_code=500, detail="Failed to save configuration"
                    )

            except Exception as e:
                logging.error(f"Error saving configuration: {e}")
                raise HTTPException(
                    status_code=500, detail=f"Failed to save configuration: {str(e)}"
                )

        @self.app.get("/api/configurations")
        async def list_configurations():
            """List all saved configurations."""
            try:
                configurations = await self.db.list_configurations()
                return [ConfigurationListItem(**config) for config in configurations]
            except Exception as e:
                logging.error(f"Error listing configurations: {e}")
                raise HTTPException(
                    status_code=500, detail=f"Failed to list configurations: {str(e)}"
                )

        @self.app.get("/api/configurations/{config_name}")
        async def get_configuration(config_name: str):
            """Get a specific configuration by name."""
            try:
                config = await self.db.load_configuration(config_name)
                if config is None:
                    raise HTTPException(
                        status_code=404,
                        detail=f"Configuration '{config_name}' not found",
                    )

                # Parse the JSON config_data back to a dict
                config_data = json.loads(config["config_data"])

                return ConfigurationResponse(
                    name=config["name"],
                    description=config["description"],
                    config_data=config_data,
                    created_at=config["created_at"],
                    updated_at=config["updated_at"],
                )
            except HTTPException:
                raise
            except Exception as e:
                logging.error(f"Error getting configuration: {e}")
                raise HTTPException(
                    status_code=500, detail=f"Failed to get configuration: {str(e)}"
                )

        @self.app.delete("/api/configurations/{config_name}")
        async def delete_configuration(config_name: str):
            """Delete a configuration by name."""
            try:
                success = await self.db.delete_configuration(config_name)
                if success:
                    return {
                        "status": "success",
                        "message": f"Configuration '{config_name}' deleted successfully",
                    }
                else:
                    raise HTTPException(
                        status_code=404,
                        detail=f"Configuration '{config_name}' not found",
                    )

            except HTTPException:
                raise
            except Exception as e:
                logging.error(f"Error deleting configuration: {e}")
                raise HTTPException(
                    status_code=500, detail=f"Failed to delete configuration: {str(e)}"
                )

        @self.app.get("/api/network-discovery")
        async def get_network_discovery():
            """Get network discovery information."""
            from smarttel.seestar.commands.discovery import get_all_network_interfaces

            network_interfaces = get_all_network_interfaces()

            # Get discovery statistics (exclude test telescopes)
            auto_discovered_count = sum(
                1
                for t in self.telescopes.values()
                if t.discovery_method == "auto_discovery"
                and not (isinstance(t, TestTelescope) or t.port == 9999)
            )
            manual_count = sum(
                1
                for t in self.telescopes.values()
                if t.discovery_method == "manual"
                and not (isinstance(t, TestTelescope) or t.port == 9999)
            )
            remote_count = len(self.remote_telescopes)
            local_telescope_count = sum(
                1
                for t in self.telescopes.values()
                if not (isinstance(t, TestTelescope) or t.port == 9999)
            )

            return {
                "network_scanning": {
                    "scanned_networks": [
                        {
                            "local_ip": local_ip,
                            "broadcast_ip": broadcast_ip,
                            "network_range": f"{local_ip.rsplit('.', 1)[0]}.0/24",
                            "interface_name": f"Network interface {i + 1}",
                        }
                        for i, (local_ip, broadcast_ip) in enumerate(network_interfaces)
                    ],
                    "interfaces_count": len(network_interfaces),
                    "discovery_method": "UDP broadcast on port 4720",
                    "discovery_enabled": self.discover,
                },
                "telescope_discovery": {
                    "total_telescopes": local_telescope_count
                    + len(self.remote_telescopes),
                    "auto_discovered": auto_discovered_count,
                    "manually_added": manual_count,
                    "remote_telescopes": remote_count,
                    "discovery_methods": {
                        "auto_discovery": "UDP broadcast discovery on all network interfaces",
                        "manual": "User-configured telescope connections",
                        "remote": "Telescopes proxied from remote controllers",
                    },
                },
                "last_scan": "Continuous scanning"
                if self.discover
                else "Discovery disabled",
            }

        @self.app.post("/api/telescopes/connect-all")
        async def connect_all_telescopes_endpoint():
            """Connect to all telescopes in parallel."""
            try:
                await self.connect_all_telescopes()

                # Count successful connections (exclude test telescopes)
                connected_count = sum(
                    1
                    for t in self.telescopes.values()
                    if hasattr(t, "client")
                    and t.client
                    and t.client.is_connected
                    and not (isinstance(t, TestTelescope) or t.port == 9999)
                )

                # Count total telescopes excluding test telescopes
                total_telescopes = sum(
                    1
                    for t in self.telescopes.values()
                    if not (isinstance(t, TestTelescope) or t.port == 9999)
                )

                return {
                    "status": "success",
                    "message": "Parallel connection attempt completed",
                    "total_telescopes": total_telescopes,
                    "connected_telescopes": connected_count,
                    "connection_details": [
                        {
                            "name": telescope.name,
                            "host": telescope.host,
                            "port": telescope.port,
                            "connected": telescope.client.is_connected
                            if telescope.client
                            else False,
                            "imaging_connected": telescope.imaging.is_connected
                            if telescope.imaging
                            else False,
                        }
                        for telescope in self.telescopes.values()
                        if not (
                            isinstance(telescope, TestTelescope)
                            or telescope.port == 9999
                        )
                    ],
                }
            except Exception as e:
                logging.error(f"Failed to connect telescopes: {e}")
                raise HTTPException(
                    status_code=500, detail=f"Failed to connect telescopes: {str(e)}"
                )

        @self.app.get("/api/remote-controllers")
        async def get_remote_controllers():
            """Get a list of all remote controllers."""
            result = []
            for controller_data in self.remote_controllers.values():
                result.append(RemoteControllerResponse(**controller_data))
            return result

        @self.app.post("/api/remote-controllers")
        async def add_remote_controller_endpoint(
            controller_request: AddRemoteControllerRequest,
        ):
            """Add a remote controller."""
            try:
                # Check if controller already exists
                controller_key = f"{controller_request.host}:{controller_request.port}"
                if controller_key in self.remote_controllers:
                    raise HTTPException(
                        status_code=409,
                        detail=f"Remote controller at {controller_request.host}:{controller_request.port} already exists",
                    )

                # Try to connect to the remote controller
                success = await self.add_remote_controller(
                    host=controller_request.host,
                    port=controller_request.port,
                    name=controller_request.name,
                    description=controller_request.description,
                    persist=True,
                )

                if success:
                    controller_data = self.remote_controllers[controller_key]
                    return {
                        "status": "success",
                        "message": f"Remote controller {controller_request.host}:{controller_request.port} added successfully",
                        "controller": RemoteControllerResponse(**controller_data),
                    }
                else:
                    raise HTTPException(
                        status_code=502,
                        detail=f"Failed to connect to remote controller at {controller_request.host}:{controller_request.port}",
                    )

            except HTTPException:
                raise
            except Exception as e:
                logging.error(f"Error adding remote controller: {e}")
                raise HTTPException(
                    status_code=500, detail=f"Failed to add remote controller: {str(e)}"
                )

        @self.app.delete("/api/remote-controllers/{host}/{port}")
        async def remove_remote_controller_endpoint(host: str, port: int):
            """Remove a remote controller."""
            try:
                success = await self.remove_remote_controller(host, port)
                if success:
                    return {
                        "status": "success",
                        "message": f"Remote controller {host}:{port} removed",
                    }
                else:
                    raise HTTPException(
                        status_code=404,
                        detail=f"Remote controller {host}:{port} not found",
                    )
            except HTTPException:
                raise
            except Exception as e:
                logging.error(f"Error removing remote controller: {e}")
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to remove remote controller: {str(e)}",
                )

        @self.app.post("/api/remote-controllers/{host}/{port}/reconnect")
        async def reconnect_remote_controller_endpoint(host: str, port: int):
            """Try to reconnect to a remote controller."""
            try:
                controller_key = f"{host}:{port}"

                # Get existing controller data if it exists
                existing_controller = self.remote_controllers.get(controller_key)
                name = existing_controller.get("name") if existing_controller else None
                description = (
                    existing_controller.get("description")
                    if existing_controller
                    else None
                )

                # Remove existing controller and telescopes first
                if controller_key in self.remote_controllers:
                    await self.remove_remote_controller(host, port)

                # Try to reconnect
                success = await self.add_remote_controller(
                    host, port, name, description, persist=True
                )

                if success:
                    controller_data = self.remote_controllers[controller_key]
                    return {
                        "status": "success",
                        "message": f"Remote controller {host}:{port} reconnected successfully",
                        "controller": RemoteControllerResponse(**controller_data),
                    }
                else:
                    raise HTTPException(
                        status_code=502,
                        detail=f"Failed to reconnect to remote controller at {host}:{port}",
                    )

            except HTTPException:
                raise
            except Exception as e:
                logging.error(f"Error reconnecting to remote controller: {e}")
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to reconnect to remote controller: {str(e)}",
                )

        @self.app.get("/health")
        async def health_check():
            """Health check endpoint for Docker containers."""
            # Count telescopes excluding test telescopes
            local_telescope_count = sum(
                1
                for t in self.telescopes.values()
                if not (isinstance(t, TestTelescope) or t.port == 9999)
            )
            return {
                "status": "ok",
                "timestamp": datetime.datetime.now().isoformat(),
                "telescopes_count": local_telescope_count + len(self.remote_telescopes),
                "remote_controllers_count": len(self.remote_controllers),
            }

        config = uvicorn.Config(
            self.app,
            host="0.0.0.0",
            port=self.service_port,
            log_level="trace",
            log_config=None,
        )
        server = uvicorn.Server(config)
        await server.serve()


@click.group()
def main():
    """Seestar commands."""
    pass


# @main.command("console")
# @click.option("--host", help="Seestar host address")
# @click.option("--port", type=int, default=4700, help="Seestar port (default: 4700)")
# def console(host, port):
#     """Connect to a Seestar device, with optional device discovery."""
#     asyncio.run(select_device_and_connect(host, port))


@main.command("panorama")
@click.option(
    "--input", "-i", required=True, help="Input video file or directory of images"
)
@click.option(
    "--output", "-o", help="Output panorama image path (default: panorama.jpg)"
)
@click.option(
    "--detector",
    default="SIFT",
    type=click.Choice(["SIFT", "ORB", "AKAZE"]),
    help="Feature detector (default: SIFT)",
)
@click.option(
    "--max-features",
    default=1000,
    type=int,
    help="Maximum features to detect (default: 1000)",
)
@click.option(
    "--frame-skip",
    default=5,
    type=int,
    help="Skip frames for faster processing (default: 5)",
)
@click.option("--max-frames", type=int, help="Maximum frames to process from video")
@click.option(
    "--match-percent",
    default=0.15,
    type=float,
    help="Percentage of good matches to keep (default: 0.15)",
)
def panorama(
    input, output, detector, max_features, frame_skip, max_frames, match_percent
):
    """Create a panorama from video or images."""
    from panorama_generator import VideoPanoramaGenerator
    from pathlib import Path

    input_path = Path(input)

    if not input_path.exists():
        click.echo(f"Error: Input path does not exist: {input}")
        return

    # Set default output path
    if not output:
        output = "panorama.jpg"

    click.echo(f"Creating panorama with {detector} detector...")
    click.echo(f"Max features: {max_features}")
    click.echo(f"Good match percent: {match_percent}")

    try:
        generator = VideoPanoramaGenerator(
            feature_detector=detector,
            max_features=max_features,
            good_match_percent=match_percent,
            frame_skip=frame_skip,
        )

        if input_path.is_file():
            # Check if it's a video file
            video_extensions = {".mp4", ".avi", ".mov", ".mkv", ".wmv", ".flv", ".webm"}
            image_extensions = {".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".tif"}

            if input_path.suffix.lower() in video_extensions:
                click.echo(f"Processing video: {input}")
                if frame_skip > 1:
                    click.echo(
                        f"Skipping {frame_skip - 1} out of every {frame_skip} frames"
                    )
                panorama = generator.create_panorama(
                    str(input_path), output, max_frames
                )
            elif input_path.suffix.lower() in image_extensions:
                click.echo("Single image provided, need multiple images for panorama")
                return
            else:
                click.echo(f"Unsupported file format: {input_path.suffix}")
                return

        elif input_path.is_dir():
            # Process all images in directory
            image_extensions = {".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".tif"}
            image_files = []

            for ext in image_extensions:
                image_files.extend(input_path.glob(f"*{ext}"))
                image_files.extend(input_path.glob(f"*{ext.upper()}"))

            if not image_files:
                click.echo(f"No image files found in directory: {input}")
                return

            # Sort files by name
            image_files.sort()
            image_paths = [str(f) for f in image_files]

            click.echo(f"Processing {len(image_paths)} images from directory")
            panorama = generator.create_panorama_from_images(image_paths, output)
        else:
            click.echo(f"Error: Input must be a file or directory: {input}")
            return

        click.echo(f"Panorama created successfully!")
        click.echo(f"Output: {output}")
        click.echo(f"Dimensions: {panorama.shape[1]} x {panorama.shape[0]} pixels")

    except Exception as e:
        click.echo(f"Error creating panorama: {e}")
        import traceback

        traceback.print_exc()


@main.command("server")
@click.option(
    "--server-port",
    type=int,
    default=8000,
    help="Port for the API server (default: 8000)",
)
@click.option("--seestar-host", help="Seestar device host address")
@click.option(
    "--seestar-port", type=int, default=4700, help="Seestar device port (default: 4700)"
)
@click.option(
    "--remote-controller",
    multiple=True,
    help="Remote controller address (format: host:port). Can be specified multiple times",
)
@click.option(
    "--no-discovery", is_flag=True, help="Disable automatic telescope discovery"
)
def server(server_port, seestar_host, seestar_port, remote_controller, no_discovery):
    """Start a FastAPI server for controlling a Seestar device."""

    click.echo(f"Starting Seestar API server on port {server_port}")
    if no_discovery:
        click.echo("Auto-discovery is disabled")

    app = FastAPI(
        title="Seestar API", description="API for controlling Seestar devices"
    )

    controller = Controller(app, service_port=server_port, discover=not no_discovery)

    async def run_server():
        if seestar_host and seestar_port:
            click.echo(f"Connecting to Seestar at {seestar_host}:{seestar_port}")
            await controller.add_telescope(seestar_host, seestar_port)

        # Add remote controllers if specified
        if remote_controller:
            for remote_addr in remote_controller:
                try:
                    host, port = remote_addr.split(":", 1)
                    port = int(port)
                    click.echo(f"Adding remote controller at {host}:{port}")
                    await controller.add_remote_controller(host, port)
                except ValueError:
                    click.echo(
                        f"Error: Invalid remote controller format '{remote_addr}'. Use host:port format."
                    )
                    continue
                except Exception as e:
                    click.echo(
                        f"Error connecting to remote controller {remote_addr}: {e}"
                    )
                    continue

        # Run the controller
        await controller.runner()

    asyncio.run(run_server())

    # router = create_telescope_api(seestar_host, seestar_port)
    # app.include_router(router)

    # uvicorn.run(app, host="0.0.0.0", port=server_port)


if __name__ == "__main__":
    main()
