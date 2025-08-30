import asyncio
import datetime
import json
import logging as orig_logging
import os
import signal
import time
from typing import Optional

import click
import httpx
import pydash
import uvicorn
from fastapi import FastAPI, HTTPException, APIRouter, Request
from fastapi.responses import StreamingResponse, HTMLResponse
from loguru import logger as logging
from pydantic import BaseModel, Field
from starlette.background import BackgroundTask

from scopinator.seestar.client import SeestarClient
from scopinator.seestar.commands.common import CommandResponse
from scopinator.seestar.commands.discovery import discover_seestars, remove_telescope_from_known
from scopinator.seestar.commands.simple import GetDeviceState, GetDeviceStateResponse
from scopinator.util.eventbus import EventBus
from database import TelescopeDatabase
from webrtc_router import router as webrtc_router
from websocket_router import router as websocket_router
from remote_websocket_client import RemoteController
from utils.memory_monitor import MemoryMonitor
from utils.task_manager import task_manager


# Request/Response models
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


# Mock classes for testing
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
        from scopinator.seestar.commands.common import CommandResponse

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
        from scopinator.seestar.client import EventBus

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
        self, app: FastAPI, service_port: int = 8000, *, discover: bool = True, reload: bool = False
    ):
        """Initialize the controller."""
        self.app = app
        self.telescopes: dict[str, "Telescope"] = {}
        self.remote_telescopes: dict[str, dict] = {}  # Track remote telescope metadata
        self.remote_controllers: dict[
            str, dict
        ] = {}  # Track remote controller metadata
        self.service_port = service_port
        self.discover = discover
        self.reload = reload
        self.db = TelescopeDatabase()
        
        # Initialize memory monitoring
        self.memory_monitor = MemoryMonitor(
            interval_seconds=60,  # Log every minute
            enable_tracemalloc=os.environ.get("ENABLE_TRACEMALLOC", "false").lower() == "true"
        )

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
                response: CommandResponse = await client.send_and_recv(GetDeviceState(params={
                    "keys": ["device", "ap"]
                }))
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

        # Import here to avoid circular imports
        from models.telescope import Telescope
        
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
            # Track the database operation
            task = asyncio.create_task(self.db.save_telescope(telescope_data))
            self.db._pending_operations.append(task)

        self.app.include_router(
            telescope.create_telescope_api(),
            prefix=f"/api/telescopes/{telescope.name}",
        )
        
        # Broadcast updated telescope list
        asyncio.create_task(self.broadcast_telescope_list())

    async def get_telescope_list(self) -> list:
        """Get the current list of all telescopes."""
        result = []
        
        # Add local telescopes (exclude test telescopes)
        for telescope in self.telescopes.values():
            # Skip test telescopes
            if isinstance(telescope, TestTelescope) or telescope.port == 9999:
                continue
            
            result.append({
                "name": telescope.name,
                "host": telescope.host,
                "port": telescope.port,
                "location": telescope._location if hasattr(telescope, '_location') else None,
                "connected": telescope.client.is_connected if hasattr(telescope, 'client') and telescope.client else False,
                "serial_number": telescope.serial_number,
                "product_model": telescope.product_model,
                "ssid": telescope.ssid,
                "discovery_method": telescope.discovery_method,
                "is_remote": False,
            })
        
        # Add remote telescopes
        for remote_telescope in self.remote_telescopes.values():
            result.append(remote_telescope)
        
        return result
    
    async def broadcast_telescope_list(self):
        """Broadcast the current telescope list via WebSocket."""
        try:
            from websocket_manager import get_websocket_manager
            websocket_manager = get_websocket_manager()
            
            telescope_list = await self.get_telescope_list()
            await websocket_manager.broadcast_telescope_list(telescope_list)
            
            logging.debug(f"Broadcast telescope list with {len(telescope_list)} telescopes")
        except Exception as e:
            logging.error(f"Failed to broadcast telescope list: {e}")
    
    def remove_telescope(self, name: str):
        """Remove a telescope from the controller."""
        # Try to remove local telescope first
        telescope = self.telescopes.pop(name, None)
        if telescope:
            logging.info(f"Removed local telescope {telescope.name}")

            # Remove from discovery tracking to allow re-discovery logging
            remove_telescope_from_known(telescope.host)

            # Remove from database if it was manually added
            if telescope.discovery_method == "manual":
                task = asyncio.create_task(self.db.delete_telescope_by_name(name))
                self.db._pending_operations.append(task)
            
            # Broadcast updated telescope list
            asyncio.create_task(self.broadcast_telescope_list())

            # todo : need to remove from router and shut down connection...
            return

        # Try to remove remote telescope
        remote_telescope = self.remote_telescopes.pop(name, None)
        if remote_telescope:
            logging.info(f"Removed remote telescope {name}")
            # Broadcast updated telescope list
            asyncio.create_task(self.broadcast_telescope_list())
            
            # Remove from discovery tracking if it has a host
            if "host" in remote_telescope:
                remove_telescope_from_known(remote_telescope["host"])
            
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
                    from websocket_manager import get_websocket_manager

                    websocket_manager = get_websocket_manager()

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
        from websocket_manager import get_websocket_manager

        websocket_manager = get_websocket_manager()

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
            try:
                devices = await discover_seestars(timeout=3)
            except Exception as e:
                logging.error(f"Error during telescope discovery: {e}", exc_info=True)
                await asyncio.sleep(10)  # Wait before retrying
                continue

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
                            from websocket_manager import get_websocket_manager

                            websocket_manager = get_websocket_manager()

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

                            # Define handler for Alert events
                            async def forward_alert_event(alert_event):
                                try:
                                    await websocket_manager.broadcast_alert_event(
                                        telescope_id,
                                        state=alert_event.state,
                                        error=alert_event.error,
                                        code=alert_event.code,
                                    )
                                    logging.info(
                                        f"Forwarded alert event for {telescope_id}: state={alert_event.state}, error='{alert_event.error}', code={alert_event.code}"
                                    )
                                except Exception as e:
                                    logging.error(
                                        f"Error forwarding alert event for {telescope_id}: {e}"
                                    )

                            # Subscribe to alert events
                            tel.event_bus.subscribe("Alert", forward_alert_event)

                            # Subscribe to all events that might update status
                            # Note: EventBus doesn't support wildcard, we need to subscribe to specific events
                            # For now, let's set up a periodic status update instead
                            async def periodic_status_update():
                                while tel.client.is_connected:
                                    try:
                                        # Update coordinates and balance sensor data
                                        if hasattr(tel.client, 'update_current_coords'):
                                            await tel.client.update_current_coords()
                                        
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
                                        
                                        # Add imaging status if available
                                        if hasattr(tel, "imaging") and tel.imaging and tel.imaging.status:
                                            if hasattr(tel.imaging.status, "model_dump"):
                                                imaging_status = tel.imaging.status.model_dump()
                                            elif hasattr(tel.imaging.status, "__dict__"):
                                                imaging_status = vars(tel.imaging.status)
                                            else:
                                                imaging_status = {}
                                            
                                            # Add current image request timing info (check if attributes exist)
                                            if (hasattr(tel.imaging.status, 'last_image_start_time') and 
                                                hasattr(tel.imaging.status, 'is_fetching_images') and
                                                tel.imaging.status.last_image_start_time and 
                                                tel.imaging.status.is_fetching_images):
                                                # Image request is in flight - include start time
                                                imaging_status["current_image_request_start_time"] = tel.imaging.status.last_image_start_time
                                            else:
                                                # No image request in flight or attributes not available
                                                imaging_status["current_image_request_start_time"] = None
                                            
                                            # Add imaging status to the main status dict
                                            status_dict["imaging_status"] = imaging_status
                                        
                                        # Add RTT data from WebSocket manager
                                        rtt_data = websocket_manager.get_telescope_rtt(telescope_id)
                                        status_dict.update(rtt_data)
                                        
                                        # Debug: Log if RTT data is present
                                        if rtt_data.get('server_browser_rtt_ms') is not None:
                                            logging.trace(f"Including RTT data in status: {rtt_data}")
                                        
                                        await websocket_manager.broadcast_status_update(
                                            telescope_id, status_dict
                                        )
                                    except (ConnectionResetError, BrokenPipeError, OSError) as e:
                                        # Handle connection reset gracefully (likely telescope reboot)
                                        if "[Errno 54]" in str(e) or "Connection reset by peer" in str(e):
                                            logging.info(
                                                f"Telescope {telescope_id} connection lost (likely rebooting). "
                                                f"Will continue retrying in background."
                                            )
                                            # Wait longer during reboot
                                            await asyncio.sleep(10)
                                        else:
                                            logging.warning(
                                                f"Connection issue with {telescope_id}: {e}"
                                            )
                                            await asyncio.sleep(5)
                                    except Exception as e:
                                        # Log other errors less verbosely
                                        logging.debug(
                                            f"Status update error for {telescope_id}: {e}"
                                        )
                                        await asyncio.sleep(2)
                                    else:
                                        # Normal operation - send updates every second
                                        await asyncio.sleep(1)

                            # Use task manager for better exception handling
                            task_manager.create_task(
                                periodic_status_update(),
                                name=f"status_update_{telescope_id}",
                                restart_on_failure=True,
                                max_retries=5
                            )
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
                            from websocket_manager import get_websocket_manager

                            websocket_manager = get_websocket_manager()

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

                            # Define handler for Alert events
                            async def forward_alert_event(alert_event):
                                try:
                                    await websocket_manager.broadcast_alert_event(
                                        telescope_id,
                                        state=alert_event.state,
                                        error=alert_event.error,
                                        code=alert_event.code,
                                    )
                                    logging.info(
                                        f"Forwarded alert event for {telescope_id}: state={alert_event.state}, error='{alert_event.error}', code={alert_event.code}"
                                    )
                                except Exception as e:
                                    logging.error(
                                        f"Error forwarding alert event for {telescope_id}: {e}"
                                    )

                            # Subscribe to alert events
                            tel.event_bus.subscribe("Alert", forward_alert_event)

                            # Subscribe to all events that might update status
                            # Note: EventBus doesn't support wildcard, we need to subscribe to specific events
                            # For now, let's set up a periodic status update instead
                            async def periodic_status_update():
                                while tel.client.is_connected:
                                    try:
                                        # Update coordinates and balance sensor data
                                        if hasattr(tel.client, 'update_current_coords'):
                                            await tel.client.update_current_coords()
                                        
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
                                        
                                        # Add imaging status if available
                                        if hasattr(tel, "imaging") and tel.imaging and tel.imaging.status:
                                            if hasattr(tel.imaging.status, "model_dump"):
                                                imaging_status = tel.imaging.status.model_dump()
                                            elif hasattr(tel.imaging.status, "__dict__"):
                                                imaging_status = vars(tel.imaging.status)
                                            else:
                                                imaging_status = {}
                                            
                                            # Add current image request timing info (check if attributes exist)
                                            if (hasattr(tel.imaging.status, 'last_image_start_time') and 
                                                hasattr(tel.imaging.status, 'is_fetching_images') and
                                                tel.imaging.status.last_image_start_time and 
                                                tel.imaging.status.is_fetching_images):
                                                # Image request is in flight - include start time
                                                imaging_status["current_image_request_start_time"] = tel.imaging.status.last_image_start_time
                                            else:
                                                # No image request in flight or attributes not available
                                                imaging_status["current_image_request_start_time"] = None
                                            
                                            # Add imaging status to the main status dict
                                            status_dict["imaging_status"] = imaging_status
                                        
                                        # Add RTT data from WebSocket manager
                                        rtt_data = websocket_manager.get_telescope_rtt(telescope_id)
                                        status_dict.update(rtt_data)
                                        
                                        # Debug: Log if RTT data is present
                                        if rtt_data.get('server_browser_rtt_ms') is not None:
                                            logging.trace(f"Including RTT data in status: {rtt_data}")
                                        
                                        await websocket_manager.broadcast_status_update(
                                            telescope_id, status_dict
                                        )
                                    except (ConnectionResetError, BrokenPipeError, OSError) as e:
                                        # Handle connection reset gracefully (likely telescope reboot)
                                        if "[Errno 54]" in str(e) or "Connection reset by peer" in str(e):
                                            logging.info(
                                                f"Telescope {telescope_id} connection lost (likely rebooting). "
                                                f"Will continue retrying in background."
                                            )
                                            # Wait longer during reboot
                                            await asyncio.sleep(10)
                                        else:
                                            logging.warning(
                                                f"Connection issue with {telescope_id}: {e}"
                                            )
                                            await asyncio.sleep(5)
                                    except Exception as e:
                                        # Log other errors less verbosely
                                        logging.debug(
                                            f"Status update error for {telescope_id}: {e}"
                                        )
                                        await asyncio.sleep(2)
                                    else:
                                        # Normal operation - send updates every second
                                        await asyncio.sleep(1)

                            # Use task manager for better exception handling
                            task_manager.create_task(
                                periodic_status_update(),
                                name=f"status_update_{telescope_id}",
                                restart_on_failure=True,
                                max_retries=5
                            )
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

    async def disconnect_all_telescopes(self):
        """Disconnect from all telescopes gracefully."""
        if not self.telescopes:
            logging.info("No telescopes to disconnect from")
            return

        logging.info(f"Disconnecting from {len(self.telescopes)} telescopes...")

        # Create disconnection tasks for all telescopes
        disconnection_tasks = []
        telescope_names = []

        for telescope in self.telescopes.values():
            # Skip test telescopes that don't have real connections
            if isinstance(telescope, TestTelescope) or telescope.port == 9999:
                continue

            if (
                hasattr(telescope, "client")
                and hasattr(telescope, "imaging")
                and telescope.client
                and telescope.imaging
            ):
                telescope_names.append(telescope.name)

                async def disconnect_telescope_clients(tel=telescope):
                    try:
                        logging.info(f"Disconnecting telescope {tel.name}")

                        # Disconnect both clients in parallel
                        tasks = []
                        if tel.client.is_connected:
                            tasks.append(tel.client.disconnect())
                        if tel.imaging.is_connected:
                            tasks.append(tel.imaging.disconnect())

                        if tasks:
                            await asyncio.gather(*tasks, return_exceptions=True)

                        return tel.name, True
                    except Exception as e:
                        logging.error(f"Failed to disconnect telescope {tel.name}: {e}")
                        return tel.name, False

                disconnection_tasks.append(disconnect_telescope_clients())

        if disconnection_tasks:
            # Execute all disconnections in parallel with a timeout
            try:
                results = await asyncio.wait_for(
                    asyncio.gather(*disconnection_tasks, return_exceptions=True),
                    timeout=10.0  # 10 second timeout for all disconnections
                )

                # Log results
                disconnected_count = 0
                for result in results:
                    if isinstance(result, Exception):
                        logging.error(f"Disconnection task failed: {result}")
                    else:
                        telescope_name, success = result
                        if success:
                            disconnected_count += 1
                            logging.info(f"Successfully disconnected telescope: {telescope_name}")
                        else:
                            logging.error(f"Failed to disconnect telescope: {telescope_name}")

                logging.info(f"Telescope disconnection complete: {disconnected_count}/{len(disconnection_tasks)} telescopes disconnected")

            except asyncio.TimeoutError:
                logging.warning("Telescope disconnection timed out after 10 seconds")
                # Cancel any remaining tasks
                for task in disconnection_tasks:
                    if not task.done():
                        task.cancel()

    async def cleanup_background_tasks(self):
        """Clean up any remaining background tasks."""
        try:
            logging.info("Cleaning up remaining background tasks...")
            
            # Get all running tasks
            tasks = [task for task in asyncio.all_tasks() if not task.done()]
            
            if not tasks:
                logging.info("No background tasks to clean up")
                return
                
            logging.info(f"Found {len(tasks)} running tasks to clean up")
            
            # Cancel all tasks except the current one and critical system tasks
            current_task = asyncio.current_task()
            tasks_to_cancel = []
            
            for task in tasks:
                if task != current_task and not task.cancelled():
                    # Skip tasks that are already being cancelled or are critical
                    task_name = getattr(task, '_name', str(task))
                    if 'lifespan' not in task_name and 'shutdown' not in task_name:
                        tasks_to_cancel.append(task)
                        task.cancel()
                        
            # Wait for tasks to finish with a timeout, but handle cancellation gracefully
            if tasks_to_cancel:
                try:
                    await asyncio.wait_for(
                        asyncio.gather(*tasks_to_cancel, return_exceptions=True),
                        timeout=3.0
                    )
                    logging.info("All background tasks cleaned up successfully")
                except (asyncio.TimeoutError, asyncio.CancelledError):
                    logging.info("Background task cleanup completed (some tasks were cancelled)")
                    
        except Exception as e:
            # Don't let cleanup errors break the shutdown process
            logging.warning(f"Error during background task cleanup: {e}")
            logging.info("Continuing with shutdown despite cleanup error")

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
        """Create and run the Uvicorn server with optimized background initialization."""
        
        # Check if we should use optimized startup
        # Default to false for now due to event loop timing issues
        use_optimized = os.environ.get("OPTIMIZED_STARTUP", "false").lower() == "true"
        
        if use_optimized:
            # Use the new optimized startup manager
            from async_startup import OptimizedController
            optimized = OptimizedController(self)
            await optimized.run_optimized()
        else:
            # Fall back to original sequential startup
            await self._sequential_runner()
    
    async def _sequential_runner(self):
        """Original sequential runner for compatibility."""

        # Load saved telescopes first
        await self.load_saved_telescopes()

        # Load saved remote controllers
        await self.load_saved_remote_controllers()

        # Add a dummy test telescope for WebRTC testing
        await self.add_test_telescope()

        print(f"Discover {self.discover}")
        if self.discover:
            click.secho("Starting auto-discovery...", fg="green")
            task_manager.create_task(
                self.auto_discover(),
                name="auto_discovery",
                restart_on_failure=True,
                max_retries=10
            )

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

        # Initialize WebSocket manager with telescope getter
        def get_telescope_by_id(telescope_id: str):
            """Get telescope by ID for WebSocket manager."""
            # First try to find by serial number
            for telescope in self.telescopes.values():
                if telescope.serial_number == telescope_id:
                    return telescope

            # Then try to find by host name
            telescope = self.telescopes.get(telescope_id)
            if telescope:
                return telescope

            # Finally try to find by name
            for telescope in self.telescopes.values():
                if telescope.name == telescope_id:
                    return telescope

            logging.error(f"WebSocket telescope lookup for '{telescope_id}': not found")
            logging.info(f"Available telescopes: {list(self.telescopes.keys())}")
            # Debug: show telescope details
            for key, telescope in self.telescopes.items():
                logging.info(
                    f"  Available telescope: key='{key}', name='{telescope.name}', serial='{telescope.serial_number}', host='{telescope.host}'"
                )
            return None

        from websocket_manager import initialize_websocket_manager

        initialize_websocket_manager(get_telescope_by_id)

        # Add WebRTC router
        self.app.include_router(webrtc_router)

        # Add WebSocket router
        self.app.include_router(websocket_router, prefix="/api")

        # Add network simulation middleware
        from middleware.network_simulation import NetworkSimulationMiddleware
        self.app.add_middleware(NetworkSimulationMiddleware)

        # Add static file serving for processed images and uploads
        from fastapi.staticfiles import StaticFiles
        import os
        
        # Mount static directories if they exist
        if os.path.exists("processed"):
            self.app.mount("/processed", StaticFiles(directory="processed"), name="processed")
        if os.path.exists("uploads"):
            self.app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

        # Add image processing router
        from api.routers.processing import router as processing_router

        self.app.include_router(processing_router)

        # Add network simulation router
        from api.routers.network_simulation import router as network_simulation_router

        self.app.include_router(network_simulation_router)

        # Add system administration router
        from api.routers.system import router as system_router

        self.app.include_router(system_router)

        # Add sky map router
        from api.routers.skymap import router as skymap_router

        self.app.include_router(skymap_router)

        # Add catalog router
        from api.routers.catalog import router as catalog_router

        self.app.include_router(catalog_router)

        # Add startup handler to connect telescopes after server is ready
        @self.app.on_event("startup")
        async def startup_event():
            from websocket_manager import get_websocket_manager
            websocket_manager = get_websocket_manager()
            
            # Start WebSocket manager first to enable broadcasting
            await websocket_manager.start()
            logging.info("WebSocket manager started")
            
            # Broadcast initialization progress
            await websocket_manager.broadcast_server_init(
                "startup",
                "Starting server components...",
                25
            )
            
            # Start memory monitoring
            await self.memory_monitor.start()
            logging.info("Memory monitoring started")
            await websocket_manager.broadcast_server_init(
                "memory",
                "Memory monitoring initialized",
                35
            )
            
            # Initialize database
            await websocket_manager.broadcast_server_init(
                "database",
                "Loading telescope database...",
                45
            )
            
            # Check for discovery
            if self.discover:
                await websocket_manager.broadcast_server_init(
                    "discovery",
                    "Scanning network for telescopes...",
                    55
                )
            
            # Connect to all loaded telescopes after server is fully started
            if self.telescopes:

                async def delayed_connect():
                    await asyncio.sleep(2)  # Wait for server to be fully ready
                    
                    await websocket_manager.broadcast_server_init(
                        "telescope_connection",
                        f"Connecting to {len(self.telescopes)} telescope(s)...",
                        70
                    )
                    
                    click.secho(
                        f"Connecting to {len(self.telescopes)} telescopes after startup...",
                        fg="blue",
                    )
                    
                    await self.connect_all_telescopes()
                    
                    await websocket_manager.broadcast_server_init(
                        "complete",
                        "Server initialization complete",
                        100
                    )

                asyncio.create_task(delayed_connect())
            else:
                # No telescopes to connect
                await websocket_manager.broadcast_server_init(
                    "complete",
                    "Server ready - no telescopes configured",
                    100
                )

        # Add shutdown handler for graceful cleanup
        @self.app.on_event("shutdown")
        async def shutdown_event():
            nonlocal shutdown_initiated
            try:
                logging.info("Starting graceful shutdown...")
                
                # First, disconnect all telescopes to stop their background tasks
                await self.disconnect_all_telescopes()
                
                # Stop WebSocket manager
                try:
                    from websocket_manager import get_websocket_manager
                    websocket_manager = get_websocket_manager()
                    await websocket_manager.stop()
                    logging.info("WebSocket manager stopped")
                except Exception as e:
                    logging.warning(f"Error stopping WebSocket manager: {e}")

                # Cleanup WebRTC
                try:
                    from webrtc_router import cleanup_webrtc_service
                    await cleanup_webrtc_service()
                    logging.info("WebRTC service cleaned up")
                except Exception as e:
                    logging.warning(f"Error cleaning up WebRTC: {e}")

                # Shutdown image processing thread pool
                try:
                    from services.async_image_processing import shutdown_cpu_executor
                    shutdown_cpu_executor()
                    logging.info("Image processing thread pool shutdown")
                except Exception as e:
                    logging.warning(f"Error shutting down thread pool: {e}")
                
                # Close database connections
                try:
                    await self.db.close()
                    logging.info("Database connections closed")
                except Exception as e:
                    logging.warning(f"Error closing database: {e}")
                
                # Cancel any remaining background tasks
                await self.cleanup_background_tasks()
                
                # Cancel task manager tasks
                await task_manager.cancel_all()
                
                # Stop memory monitoring
                await self.memory_monitor.stop()
                
                logging.info("Graceful shutdown completed")
                shutdown_initiated = False  # Mark shutdown as completed successfully
                
            except Exception as e:
                logging.error(f"Error during shutdown: {e}")
                logging.info("Shutdown completed with errors")
                shutdown_initiated = False  # Mark shutdown as completed (even with errors)

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
            from scopinator.seestar.commands.discovery import get_all_network_interfaces

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
            return await self.get_telescope_list()

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
            from scopinator.seestar.commands.discovery import get_all_network_interfaces

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

        @self.app.get("/metrics")
        async def prometheus_metrics():
            """Expose Prometheus metrics endpoint."""
            from fastapi.responses import PlainTextResponse
            
            # Collect all metrics
            metrics = []
            
            # Add memory metrics
            metrics.append(self.memory_monitor.get_prometheus_metrics())
            
            # Add task manager metrics
            metrics.append(task_manager.get_prometheus_metrics())
            
            # Add telescope metrics
            metrics.append(f'# HELP python_telescopes_total Total number of telescopes')
            metrics.append(f'# TYPE python_telescopes_total gauge')
            metrics.append(f'python_telescopes_total {len(self.telescopes)}')
            
            # Count connected telescopes
            connected_count = sum(
                1 for t in self.telescopes.values()
                if hasattr(t, 'client') and t.client and t.client.is_connected
            )
            metrics.append(f'# HELP python_telescopes_connected Number of connected telescopes')
            metrics.append(f'# TYPE python_telescopes_connected gauge')
            metrics.append(f'python_telescopes_connected {connected_count}')
            
            # Add remote controller metrics
            metrics.append(f'# HELP python_remote_controllers_total Total number of remote controllers')
            metrics.append(f'# TYPE python_remote_controllers_total gauge')
            metrics.append(f'python_remote_controllers_total {len(self.remote_controllers)}')
            
            # Add WebSocket metrics if available
            try:
                from websocket_manager import get_websocket_manager
                ws_manager = get_websocket_manager()
                if hasattr(ws_manager, 'get_prometheus_metrics'):
                    metrics.append(ws_manager.get_prometheus_metrics())
            except Exception as e:
                logging.debug(f"Could not get WebSocket metrics: {e}")
            
            return PlainTextResponse('\n'.join(filter(None, metrics)), media_type="text/plain")
        
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
            
            # Include network simulation status
            from middleware.network_simulation import get_simulation_status
            network_simulation = get_simulation_status()
            
            return {
                "status": "ok",
                "timestamp": datetime.datetime.now().isoformat(),
                "telescopes_count": local_telescope_count + len(self.remote_telescopes),
                "remote_controllers_count": len(self.remote_controllers),
                "network_simulation": {
                    "enabled": network_simulation["config"]["enabled"],
                    "requests_processed": network_simulation["stats"]["requests_processed"],
                    "requests_delayed": network_simulation["stats"]["requests_delayed"],
                    "requests_dropped": network_simulation["stats"]["requests_dropped"],
                }
            }

        # Set up signal handlers for graceful shutdown with forced exit backup
        shutdown_initiated = False
        
        def handle_signal(signum, frame):
            nonlocal shutdown_initiated
            if shutdown_initiated:
                logging.warning(f"Received second signal {signum}, forcing immediate exit!")
                os._exit(1)
            
            shutdown_initiated = True
            logging.info(f"Received signal {signum}, initiating graceful shutdown...")
            
            # Set up a backup timer to force exit after 5 seconds
            def force_exit_timer():
                time.sleep(5)
                if shutdown_initiated:  # Check if we're still shutting down
                    logging.error("Graceful shutdown timeout exceeded (5s), forcing exit!")
                    os._exit(1)
            
            # Start the force exit timer in a separate thread
            import threading
            timer_thread = threading.Thread(target=force_exit_timer, daemon=True)
            timer_thread.start()
            
        signal.signal(signal.SIGINT, handle_signal)
        signal.signal(signal.SIGTERM, handle_signal)
        
        config = uvicorn.Config(
            self.app,
            host="0.0.0.0",
            port=self.service_port,
            log_level="trace",
            log_config=None,
            reload=self.reload,
            # Enable graceful shutdown with 5-second timeout
            timeout_graceful_shutdown=5,
        )
        server = uvicorn.Server(config)
        
        try:
            await server.serve()
        except KeyboardInterrupt:
            logging.info("KeyboardInterrupt received, shutting down gracefully...")
        finally:
            logging.info("Server shutdown complete")