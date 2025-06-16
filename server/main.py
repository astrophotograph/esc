import asyncio
import inspect
import json
import logging as orig_logging
import socket
from contextlib import suppress
from typing import Optional, AsyncGenerator

import click
import httpx
import pydash
import uvicorn
from fastapi import FastAPI, HTTPException, APIRouter
from fastapi.responses import StreamingResponse
from loguru import logger as logging
from pydantic import BaseModel

from smarttel.seestar.client import SeestarClient
from smarttel.seestar.commands.common import CommandResponse
from smarttel.seestar.commands.discovery import select_device_and_connect, discover_seestars
from smarttel.seestar.commands.simple import GetViewState


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

        logging.opt(depth=depth, exception=record.exc_info).log(level, record.getMessage())


orig_logging.basicConfig(handlers=[InterceptHandler()], level=0, force=True)


class Telescope(BaseModel, arbitrary_types_allowed=True):
    """Telescope."""
    host: str
    port: int
    serial_number: Optional[str] = None
    product_model: Optional[str] = None
    ssid: Optional[str] = None
    router: APIRouter | None = None
    client: SeestarClient | None = None
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
                return "Unknown Location"
            
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
                        return ", ".join(location_parts) if location_parts else None
        except Exception as e:
            logging.debug(f"Failed to get location: {e}")
        
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
    
    def _is_local_ip(self, ip: str) -> bool:
        """Check if an IP address is in a local/private range."""
        try:
            addr = socket.inet_aton(ip)
            addr_int = int.from_bytes(addr, 'big')
            
            # Private IP ranges
            # 10.0.0.0/8 (10.0.0.0 - 10.255.255.255)
            # 172.16.0.0/12 (172.16.0.0 - 172.31.255.255)  
            # 192.168.0.0/16 (192.168.0.0 - 192.168.255.255)
            # 127.0.0.0/8 (loopback)
            private_ranges = [
                (0x0A000000, 0x0AFFFFFF),  # 10.0.0.0/8
                (0xAC100000, 0xAC1FFFFF),  # 172.16.0.0/12
                (0xC0A80000, 0xC0A8FFFF),  # 192.168.0.0/16
                (0x7F000000, 0x7FFFFFFF),  # 127.0.0.0/8
            ]
            
            return any(start <= addr_int <= end for start, end in private_ranges)
        except (socket.error, ValueError):
            # If not a valid IP, assume it's a hostname and not local
            return False

    def create_telescope_api(self):
        """Create a FastAPI app for a specific Seestar."""

        router = APIRouter()

        # Create a shared client instance
        self.client = SeestarClient(self.host, self.port)

        async def startup():
            """Connect to the Seestar on startup."""
            try:
                logging.info(f"Connecting to Seestar at {self.host}:{self.port}")
                await self.client.connect()
                logging.info(f"Connected to Seestar at {self.host}:{self.port}")
            except Exception as e:
                logging.error(f"Failed to connect to Seestar: {e}")

        async def shutdown():
            """Disconnect from the Seestar on shutdown."""
            await self.client.disconnect()
            logging.info("Disconnected from Seestar")

        @router.get("/")
        async def root():
            """Root endpoint with basic info."""
            return {
                "status": "running",
                "seestar": {
                    "host": self.host,
                    "port": self.port,
                    "connected": self.client.is_connected
                }
            }

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
            try:
                while True:
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

                    # Wait for 5 seconds before sending next update
                    await asyncio.sleep(5)
            except asyncio.CancelledError:
                # Handle client disconnection gracefully
                yield f"data: {json.dumps({'status': 'stream_closed'})}\n\n"

        @router.get("/status/stream")
        async def stream_status():
            """Stream client status updates every 5 seconds."""
            return StreamingResponse(
                status_stream_generator(),
                media_type="text/event-stream"
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
        self.service_port = service_port
        self.discover = discover

    def add_telescope(self, host: str, port: int, *,
                      serial_number: Optional[str] = None,
                      product_model: Optional[str] = None,
                      ssid: Optional[str] = None,
                      location: Optional[str] = None,
                      discover: bool = False):
        """Add a telescope to the controller."""
        telescope = Telescope(host=host, port=port,
                              serial_number=serial_number,
                              product_model=product_model,
                              ssid=ssid,
                              _location=location)
        logging.info(f"Added telescope {telescope.name} at {host}:{port}")
        if serial_number: logging.info(f"Serial number: {serial_number}")
        if product_model: logging.info(f"Product model: {product_model}")
        if ssid: logging.info(f"SSID: {ssid}")
        if location: logging.info(f"Location: {location}")

        self.telescopes[telescope.name] = telescope

        self.app.include_router(telescope.create_telescope_api(),
                                prefix=f"/api/telescopes/{telescope.name}",)

    def remove_telescope(self, name: str):
        """Remove a telescope from the controller."""
        telescope = self.telescopes.pop(name, None)
        if telescope:
            logging.info(f"Removed telescope {telescope.name}")
            # todo : need to remove from router and shut down connection...
        else:
            logging.info(f"Telescope {name} not found")

    async def auto_discover(self):
        """Automatically discover and add telescopes."""
        while True:
            devices = await discover_seestars(timeout=3)
            for device in devices:
                logging.trace(f"Auto discovery: {device}")
                name = pydash.get(device, 'data.result.sn') or device['address']
                if name not in self.telescopes:
                    self.add_telescope(device['address'], 4700,
                                       serial_number=pydash.get(device, 'data.result.sn'),
                                       product_model=pydash.get(device, 'data.result.product_model'),
                                       ssid=pydash.get(device, 'data.result.ssid'))

            await asyncio.sleep(60)

    async def runner(self):
        """Create and run the Uvicorn server."""

        if self.discover:
            asyncio.create_task(self.auto_discover())

        # Add our own endpoints
        @self.app.get("/api/telescopes")
        def get_telescopes():
            """Get a list of all telescopes."""
            return [{
                "name": telescope.name,
                "host": telescope.host,
                "port": telescope.port,
                "connected": telescope.client.is_connected,
                "serial_number": telescope.serial_number,
                "product_model": telescope.product_model,
                "ssid": telescope.ssid,
            } for telescope in self.telescopes.values()]

        config = uvicorn.Config(self.app, host="0.0.0.0", port=self.service_port,
                                log_level="trace", log_config=None)
        server = uvicorn.Server(config)
        await server.serve()


async def runner(host: str, port: int):
    client = SeestarClient(host, port)

    await client.connect()

    msg: CommandResponse[dict] = await client.send_and_recv(GetViewState())
    logging.trace(f'Received GetViewState: {msg}')
    # while True:
    #    #msg: CommandResponse[GetTimeResponse] = await client.send_and_recv(GetTime())
    #    #print(f'---> Received: {msg}')
    #    print('')
    #    #await asyncio.sleep(5)

    while client.is_connected:
        msg = await client.recv()
        if msg is not None:
            logging.trace(f'----> Received: {msg}')
        with suppress(IndexError):
            event = client.recent_events.popleft()
            logging.trace(f'----> Event: {event}')
        await asyncio.sleep(0.1)

    # msg: CommandResponse[dict] = await client.send_and_recv(GetWheelPosition())
    # print(f'Received: {msg}')

    await client.disconnect()
    await asyncio.sleep(1)


@click.group()
def main():
    """Seestar commands."""
    pass


@main.command("console")
@click.option("--host", help="Seestar host address")
@click.option("--port", type=int, default=4700, help="Seestar port (default: 4700)")
def console(host, port):
    """Connect to a Seestar device, with optional device discovery."""
    asyncio.run(select_device_and_connect(host, port))


@main.command("server")
@click.option("--server-port", type=int, default=8000, help="Port for the API server (default: 8000)")
@click.option("--seestar-host", help="Seestar device host address")
@click.option("--seestar-port", type=int, default=4700, help="Seestar device port (default: 4700)")
def server(server_port, seestar_host, seestar_port):
    """Start a FastAPI server for controlling a Seestar device."""

    click.echo(f"Starting Seestar API server on port {server_port}")

    app = FastAPI(title="Seestar API", description="API for controlling Seestar devices")

    controller = Controller(app, service_port=server_port)

    if seestar_host and seestar_port:
        click.echo(f"Connecting to Seestar at {seestar_host}:{seestar_port}")
        controller.discover = False
        controller.add_telescope(seestar_host, seestar_port)

    asyncio.run(controller.runner())

    # router = create_telescope_api(seestar_host, seestar_port)
    # app.include_router(router)

    # uvicorn.run(app, host="0.0.0.0", port=server_port)


if __name__ == "__main__":
    main()
