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
from fastapi.responses import StreamingResponse
from loguru import logger as logging
from pydantic import BaseModel, Field
from starlette.background import BackgroundTask

from smarttel.imaging.graxpert_stretch import GraxpertStretch
from smarttel.seestar.client import SeestarClient
from smarttel.seestar.commands.common import CommandResponse
from smarttel.seestar.commands.discovery import discover_seestars
from smarttel.seestar.commands.parameterized import GotoTargetParameters, GotoTarget, \
    ScopeSpeedMoveParameters, ScopeSpeedMove, MoveFocuserParameters, MoveFocuser
from smarttel.seestar.commands.simple import GetViewState, GetDeviceState, GetDeviceStateResponse, ScopePark, \
    GetFocuserPosition
from smarttel.seestar.imaging_client import SeestarImagingClient
from smarttel.util.eventbus import EventBus
from database import TelescopeDatabase


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

        logging.opt(depth=depth, exception=record.exc_info).log(level, record.getMessage())


orig_logging.basicConfig(handlers=[InterceptHandler()], level=0, force=True)


class AddTelescopeRequest(BaseModel):
    """Request model for adding a telescope."""
    host: str = Field(..., description="IP address or hostname of the telescope")
    port: int = Field(default=4700, description="Port for telescope control")
    serial_number: Optional[str] = Field(None, description="Serial number of the telescope")
    product_model: Optional[str] = Field(None, description="Product model of the telescope")
    ssid: Optional[str] = Field(None, description="SSID of the telescope's WiFi network")
    location: Optional[str] = Field(None, description="Physical location of the telescope")


class SaveConfigurationRequest(BaseModel):
    """Request model for saving a configuration."""
    name: str = Field(..., description="Name of the configuration", min_length=1, max_length=100)
    description: Optional[str] = Field(None, description="Description of the configuration", max_length=500)
    config_data: dict = Field(..., description="Configuration data as a JSON object")


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
                        location_parts = [part for part in [city, region, country] if part]
                        resolved_location = ", ".join(location_parts) if location_parts else None
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
                    "https://ipinfo.io/ip"
                ]

                for service in services:
                    try:
                        response = await client.get(service)
                        if response.status_code == 200:
                            ip = response.text.strip()
                            # Basic validation that it looks like an IP
                            if ip and '.' in ip and len(ip.split('.')) == 4:
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
        self.imaging = SeestarImagingClient(self.host, self.imaging_port, self.event_bus)

        async def startup():
            """Connect to the Seestar on startup."""
            try:
                logging.info(f"Connecting to Seestar at {self.host}:{self.port}")
                await self.client.connect()
                await self.imaging.connect()
                logging.info(f"Connected to Seestar at {self.host}:{self.port}")
            except Exception as e:
                logging.error(f"Failed to connect to Seestar: {e}")

        @router.get("/")
        async def root():
            """Root endpoint with basic info."""
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
                        "last_check": self.client.status.pattern_match_last_check
                    }
                }
            }

        @router.post("/goto")
        async def goto(goto_params: GotoTargetParameters):
            """Goto a target."""
            if not self.client.is_connected:
                raise HTTPException(status_code=503, detail="Not connected to Seestar")
            try:
                response = await self.client.send_and_recv(GotoTarget(params=goto_params.model_dump()))
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

                response = await self.client.send_and_recv(ScopeSpeedMove(params=move_params.model_dump()))
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
                response = await self.client.send_and_recv(MoveFocuser(params=focus_params.model_dump()))
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
                raise HTTPException(status_code=400, detail="Current focus position unknown")
            
            try:
                new_position = current_position + increment
                focus_params = MoveFocuserParameters(step=new_position)
                response = await self.client.send_and_recv(MoveFocuser(params=focus_params.model_dump()))

                if response is not None and response.result is not None:
                    logging.trace(f"New focus position: {response.result.get('step')} {type(response.result)}")
                    self.client.status.focus_position = response.result.get('step')
                return {"move_focuser": response, "increment": increment, "new_position": new_position, "previous_position": current_position}
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
                        "status": self.client.status.model_dump()
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

            dt = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-5]

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
                status_stream_generator(),
                media_type="text/event-stream"
            )

        async def get_next_image():
            """Get the next image from the Seestar imaging server."""
            if not self.imaging.is_connected:
                raise HTTPException(status_code=503, detail="Not connected to Seestar")

            star_processors = [GraxpertStretch()]
            # await self.client.send(IscopeStartView(params={"mode": "star"}))
            # await self.imaging.start_streaming()
            yield b"\r\n--frame\r\n"

            is_streaming = False
            if self.client.status.stage == "ContinuousExposure":
                await self.imaging.start_streaming()
                is_streaming = True

            async for image in self.imaging.get_next_image():
                if is_streaming and self.client.status.stage != "ContinuousExposure":
                    await self.imaging.stop_streaming()
                    is_streaming = False
                if not is_streaming and self.client.status.stage == "ContinuousExposure":
                    await self.imaging.start_streaming()
                    is_streaming = True

                if image is not None and image.image is not None:
                    img = image.image
                    for processor in star_processors:
                        img = processor.process(img)
                    frame = build_frame_bytes(img, image.width, image.height)
                    yield frame
                    yield frame
                else:
                    # yield b"\r\ndata: empty!\r\n"
                    await asyncio.sleep(0.1)
            # await self.imaging.stop_streaming()
            # while True:
            #     image = await self.imaging.get_next_image()
            #     if image and image.image:
            #         frame = build_frame_bytes(image.image, image.width, image.height)
            #         yield frame
            #         yield frame

        @router.get("/stream")
        async def stream_image():
            """Stream images from the Seestar imaging server."""
            return StreamingResponse(
                get_next_image(),
                # media_type="text/event-stream"
                media_type="multipart/x-mixed-replace; boundary=frame"
            )

        self.router = router

        asyncio.create_task(startup())

        return router


class Controller:
    """Controller for all of the telescopes."""

    def __init__(self, app: FastAPI, service_port: int = 8000, *, discover: bool = True):
        """Initialize the controller."""
        self.app = app
        self.telescopes: dict[str, Telescope] = {}
        self.remote_telescopes: dict[str, dict] = {}  # Track remote telescope metadata
        self.service_port = service_port
        self.discover = discover
        self.db = TelescopeDatabase()

    async def add_telescope(self, host: str, port: int, *,
                            serial_number: Optional[str] = None,
                            product_model: Optional[str] = None,
                            ssid: Optional[str] = None,
                            location: Optional[str] = None,
                            discover: bool = False):
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
                    logging.info(f"Fetched device info - SN: {serial_number}, Model: {product_model}, SSID: {ssid}")

                await client.disconnect()
            except Exception as e:
                logging.warning(f"Failed to fetch device information from {host}:{port}: {e}")

        telescope = Telescope(host=host, port=port,
                              serial_number=serial_number,
                              product_model=product_model,
                              ssid=ssid,
                              discovery_method="auto_discovery" if discover else "manual",
                              _location=location)
        logging.info(f"Added telescope {telescope.name} at {host}:{port} {serial_number=} {product_model=} {ssid=} {location=}")

        self.telescopes[telescope.name] = telescope

        # Save manually added telescopes to database
        if telescope.discovery_method == "manual":
            telescope_data = {
                'host': telescope.host,
                'port': telescope.port,
                'serial_number': telescope.serial_number,
                'product_model': telescope.product_model,
                'ssid': telescope.ssid,
                'location': telescope._location,
                'discovery_method': telescope.discovery_method
            }
            asyncio.create_task(self.db.save_telescope(telescope_data))

        self.app.include_router(telescope.create_telescope_api(),
                                prefix=f"/api/telescopes/{telescope.name}", )

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

    async def add_remote_controller(self, host: str, port: int):
        """Add proxy routes for telescopes from a remote controller by calling its /api/telescopes endpoint."""
        try:
            async with httpx.AsyncClient(timeout=5.0, http2=True) as client:
                response = await client.get(f"http://{host}:{port}/api/telescopes")
                if response.status_code == 200:
                    telescopes = response.json()
                    for telescope_data in telescopes:
                        telescope_name = telescope_data.get("name")
                        if telescope_name not in self.telescopes and telescope_name not in self.remote_telescopes:
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
                                "remote_controller": f"{host}:{port}",
                                "is_remote": True
                            }
                            logging.info(
                                f"Created proxy route for remote telescope {telescope_name} from {host}:{port}")
                        else:
                            logging.debug(f"Telescope {telescope_name} already exists, skipping")
                    logging.info(
                        f"Successfully created proxy routes for {len(telescopes)} telescopes from remote controller {host}:{port}")
                else:
                    logging.error(f"Failed to fetch telescopes from {host}:{port}, status code: {response.status_code}")
        except Exception as e:
            logging.error(f"Failed to connect to remote controller at {host}:{port}: {e}")

    def _create_proxy_router(self, telescope_name: str, remote_host: str, remote_port: int):
        """Create a proxy router that forwards requests to the remote controller."""
        router = APIRouter()
        client = httpx.AsyncClient(base_url=f"http://{remote_host}:{remote_port}/",
                                   timeout=None,
                                   http2=True)

        @router.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
        async def proxy_request(request: Request, path: str):
            """Proxy all requests to the remote controller."""
            try:
                url = httpx.URL(path=request.url.path,
                                query=request.url.query.encode("utf-8"))
                rp_req = client.build_request(request.method, url,
                                              headers=request.headers.raw,
                                              content=request.stream())
                rp_resp = await client.send(rp_req, stream=True)
                return StreamingResponse(
                    rp_resp.aiter_raw(),
                    status_code=rp_resp.status_code,
                    headers=rp_resp.headers,
                    background=BackgroundTask(rp_resp.aclose),
                )
            except Exception as e:
                logging.error(f"Proxy request failed for {telescope_name}: {e}")
                raise HTTPException(status_code=502, detail=f"Failed to proxy request to remote telescope: {e}")

        # Include the proxy router
        self.app.include_router(router, prefix=f"/api/telescopes/{telescope_name}")

    async def auto_discover(self):
        """Automatically discover and add telescopes."""
        while True:
            devices = await discover_seestars(timeout=3)
            for device in devices:
                logging.trace(f"Auto discovery: {device}")
                name = pydash.get(device, 'data.result.sn') or device['address']
                if name not in self.telescopes:
                    await self.add_telescope(device['address'], 4700,
                                             serial_number=pydash.get(device, 'data.result.sn'),
                                             product_model=pydash.get(device, 'data.result.product_model'),
                                             ssid=pydash.get(device, 'data.result.ssid'),
                                             discover=True)

            await asyncio.sleep(60)

    async def load_saved_telescopes(self):
        """Load manually added telescopes from the database."""
        try:
            saved_telescopes = await self.db.load_telescopes()
            for telescope_data in saved_telescopes:
                # Check if telescope is already loaded (avoid duplicates)
                telescope_name = telescope_data.get('serial_number') or telescope_data['host']
                if telescope_name not in self.telescopes:
                    await self.add_telescope(
                        host=telescope_data['host'],
                        port=telescope_data['port'],
                        serial_number=telescope_data.get('serial_number'),
                        product_model=telescope_data.get('product_model'),
                        ssid=telescope_data.get('ssid'),
                        location=telescope_data.get('location'),
                        discover=False  # These are manually added telescopes
                    )
                    logging.info(f"Restored telescope {telescope_name} from database")
        except Exception as e:
            logging.error(f"Failed to load saved telescopes: {e}")

    async def runner(self):
        """Create and run the Uvicorn server."""

        # Load saved telescopes first
        await self.load_saved_telescopes()

        if self.discover:
            asyncio.create_task(self.auto_discover())

        # Add our own endpoints
        @self.app.get("/")
        async def root():
            """Root endpoint providing API information and navigation."""
            return {
                "message": "ALP Experimental Telescope Control API",
                "version": "1.0.0",
                "description": "API for controlling Seestar telescopes with real-time event streaming",
                "frontend_url": f"http://localhost:3000",
                "api_docs": f"http://localhost:{self.service_port}/docs",
                "redoc_docs": f"http://localhost:{self.service_port}/redoc",
                "endpoints": {
                    "telescopes": {
                        "list": "/api/telescopes",
                        "add": "POST /api/telescopes",
                        "remove": "DELETE /api/telescopes/{telescope_name}"
                    },
                    "configurations": {
                        "list": "/api/configurations",
                        "save": "POST /api/configurations", 
                        "get": "/api/configurations/{config_name}",
                        "delete": "DELETE /api/configurations/{config_name}"
                    },
                    "health": "/health"
                },
                "telescope_count": len(self.telescopes) + len(self.remote_telescopes),
                "documentation": "Visit /docs for interactive API documentation or /redoc for alternative docs"
            }

        @self.app.get("/api/telescopes")
        async def get_telescopes():
            """Get a list of all telescopes."""
            result = []

            # Add local telescopes
            for telescope in self.telescopes.values():
                result.append({
                    "name": telescope.name,
                    "host": telescope.host,
                    "port": telescope.port,
                    "location": await telescope.location,
                    "connected": telescope.client.is_connected,
                    "serial_number": telescope.serial_number,
                    "product_model": telescope.product_model,
                    "ssid": telescope.ssid,
                    "discovery_method": telescope.discovery_method,
                    "is_remote": False
                })

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
                        raise HTTPException(status_code=409, 
                                          detail=f"Telescope with serial number {telescope_request.serial_number} already exists")
                
                # Check by host if no serial number or not found by serial number
                for telescope in self.telescopes.values():
                    if telescope.host == telescope_request.host and telescope.port == telescope_request.port:
                        raise HTTPException(status_code=409, 
                                          detail=f"Telescope at {telescope_request.host}:{telescope_request.port} already exists")
                
                # Add the telescope
                await self.add_telescope(
                    host=telescope_request.host,
                    port=telescope_request.port,
                    serial_number=telescope_request.serial_number,
                    product_model=telescope_request.product_model,
                    ssid=telescope_request.ssid,
                    location=telescope_request.location,
                    discover=False  # Manual addition, not from discovery
                )
                
                # Get the newly added telescope
                telescope_name = telescope_request.serial_number or telescope_request.host
                telescope = self.telescopes.get(telescope_name)
                
                if telescope:
                    return {
                        "status": "success",
                        "message": f"Telescope {telescope.name} added successfully",
                        "telescope": {
                            "name": telescope.name,
                            "host": telescope.host,
                            "port": telescope.port,
                            "location": await telescope.location,
                            "connected": telescope.client.is_connected if telescope.client else False,
                            "serial_number": telescope.serial_number,
                            "product_model": telescope.product_model,
                            "ssid": telescope.ssid,
                            "discovery_method": telescope.discovery_method,
                            "is_remote": False
                        }
                    }
                else:
                    raise HTTPException(status_code=500, detail="Failed to add telescope")
                    
            except HTTPException:
                raise
            except Exception as e:
                logging.error(f"Error adding telescope: {e}")
                raise HTTPException(status_code=500, detail=f"Failed to add telescope: {str(e)}")

        @self.app.delete("/api/telescopes/{telescope_name}")
        async def remove_telescope_endpoint(telescope_name: str):
            """Remove a telescope."""
            if telescope_name not in self.telescopes and telescope_name not in self.remote_telescopes:
                raise HTTPException(status_code=404, detail=f"Telescope {telescope_name} not found")
            
            self.remove_telescope(telescope_name)
            return {"status": "success", "message": f"Telescope {telescope_name} removed"}

        @self.app.post("/api/configurations")
        async def save_configuration(config_request: SaveConfigurationRequest):
            """Save a configuration to the database."""
            try:
                success = await self.db.save_configuration(
                    name=config_request.name,
                    description=config_request.description,
                    config_data=json.dumps(config_request.config_data)
                )
                
                if success:
                    return {
                        "status": "success",
                        "message": f"Configuration '{config_request.name}' saved successfully"
                    }
                else:
                    raise HTTPException(status_code=500, detail="Failed to save configuration")
                    
            except Exception as e:
                logging.error(f"Error saving configuration: {e}")
                raise HTTPException(status_code=500, detail=f"Failed to save configuration: {str(e)}")

        @self.app.get("/api/configurations")
        async def list_configurations():
            """List all saved configurations."""
            try:
                configurations = await self.db.list_configurations()
                return [ConfigurationListItem(**config) for config in configurations]
            except Exception as e:
                logging.error(f"Error listing configurations: {e}")
                raise HTTPException(status_code=500, detail=f"Failed to list configurations: {str(e)}")

        @self.app.get("/api/configurations/{config_name}")
        async def get_configuration(config_name: str):
            """Get a specific configuration by name."""
            try:
                config = await self.db.load_configuration(config_name)
                if config is None:
                    raise HTTPException(status_code=404, detail=f"Configuration '{config_name}' not found")
                
                # Parse the JSON config_data back to a dict
                config_data = json.loads(config['config_data'])
                
                return ConfigurationResponse(
                    name=config['name'],
                    description=config['description'],
                    config_data=config_data,
                    created_at=config['created_at'],
                    updated_at=config['updated_at']
                )
            except HTTPException:
                raise
            except Exception as e:
                logging.error(f"Error getting configuration: {e}")
                raise HTTPException(status_code=500, detail=f"Failed to get configuration: {str(e)}")

        @self.app.delete("/api/configurations/{config_name}")
        async def delete_configuration(config_name: str):
            """Delete a configuration by name."""
            try:
                success = await self.db.delete_configuration(config_name)
                if success:
                    return {
                        "status": "success",
                        "message": f"Configuration '{config_name}' deleted successfully"
                    }
                else:
                    raise HTTPException(status_code=404, detail=f"Configuration '{config_name}' not found")
                    
            except HTTPException:
                raise
            except Exception as e:
                logging.error(f"Error deleting configuration: {e}")
                raise HTTPException(status_code=500, detail=f"Failed to delete configuration: {str(e)}")

        @self.app.get("/health")
        async def health_check():
            """Health check endpoint for Docker containers."""
            return {
                "status": "ok",
                "timestamp": datetime.datetime.now().isoformat(),
                "telescopes_count": len(self.telescopes) + len(self.remote_telescopes)
            }

        config = uvicorn.Config(self.app, host="0.0.0.0", port=self.service_port,
                                log_level="trace", log_config=None)
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
@click.option("--input", "-i", required=True, help="Input video file or directory of images")
@click.option("--output", "-o", help="Output panorama image path (default: panorama.jpg)")
@click.option("--detector", default="SIFT", type=click.Choice(['SIFT', 'ORB', 'AKAZE']),
              help="Feature detector (default: SIFT)")
@click.option("--max-features", default=1000, type=int, help="Maximum features to detect (default: 1000)")
@click.option("--frame-skip", default=5, type=int, help="Skip frames for faster processing (default: 5)")
@click.option("--max-frames", type=int, help="Maximum frames to process from video")
@click.option("--match-percent", default=0.15, type=float, help="Percentage of good matches to keep (default: 0.15)")
def panorama(input, output, detector, max_features, frame_skip, max_frames, match_percent):
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
            frame_skip=frame_skip
        )

        if input_path.is_file():
            # Check if it's a video file
            video_extensions = {'.mp4', '.avi', '.mov', '.mkv', '.wmv', '.flv', '.webm'}
            image_extensions = {'.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.tif'}

            if input_path.suffix.lower() in video_extensions:
                click.echo(f"Processing video: {input}")
                if frame_skip > 1:
                    click.echo(f"Skipping {frame_skip - 1} out of every {frame_skip} frames")
                panorama = generator.create_panorama(str(input_path), output, max_frames)
            elif input_path.suffix.lower() in image_extensions:
                click.echo("Single image provided, need multiple images for panorama")
                return
            else:
                click.echo(f"Unsupported file format: {input_path.suffix}")
                return

        elif input_path.is_dir():
            # Process all images in directory
            image_extensions = {'.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.tif'}
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
@click.option("--server-port", type=int, default=8000, help="Port for the API server (default: 8000)")
@click.option("--seestar-host", help="Seestar device host address")
@click.option("--seestar-port", type=int, default=4700, help="Seestar device port (default: 4700)")
@click.option("--remote-controller", help="Remote controller address (format: host:port)")
@click.option("--no-discovery", is_flag=True, help="Disable automatic telescope discovery")
def server(server_port, seestar_host, seestar_port, remote_controller, no_discovery):
    """Start a FastAPI server for controlling a Seestar device."""

    click.echo(f"Starting Seestar API server on port {server_port}")
    if no_discovery:
        click.echo("Auto-discovery is disabled")

    app = FastAPI(title="Seestar API", description="API for controlling Seestar devices")

    controller = Controller(app, service_port=server_port, discover=not no_discovery)

    async def run_server():
        if seestar_host and seestar_port:
            click.echo(f"Connecting to Seestar at {seestar_host}:{seestar_port}")
            await controller.add_telescope(seestar_host, seestar_port)

        # Add remote controller if specified
        if remote_controller:
            try:
                host, port = remote_controller.split(":", 1)
                port = int(port)
                click.echo(f"Adding remote controller at {host}:{port}")
                await controller.add_remote_controller(host, port)
            except ValueError:
                click.echo(f"Error: Invalid remote controller format '{remote_controller}'. Use host:port format.")
                return
            except Exception as e:
                click.echo(f"Error connecting to remote controller: {e}")
                return

        # Run the controller
        await controller.runner()

    asyncio.run(run_server())

    # router = create_telescope_api(seestar_host, seestar_port)
    # app.include_router(router)

    # uvicorn.run(app, host="0.0.0.0", port=server_port)


if __name__ == "__main__":
    main()
