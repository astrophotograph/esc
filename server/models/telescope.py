"""Telescope model and API creation."""

import asyncio
import datetime
import json
import logging as orig_logging
import os
import uuid
from typing import Optional, AsyncGenerator

import cv2
import httpx
import numpy as np
from fastapi import HTTPException, APIRouter
from fastapi.responses import StreamingResponse
from loguru import logger as logging
from pydantic import BaseModel

from scopinator.imaging.graxpert_stretch import GraxpertStretch
from scopinator.imaging.upscaler import (
    SharpeningMethod,
    ImageEnhancementProcessor,
)
from scopinator.seestar.client import SeestarClient
from scopinator.seestar.commands.parameterized import (
    GotoTargetParameters,
    ScopeSpeedMoveParameters,
    ScopeSpeedMove,
    MoveFocuserParameters,
    MoveFocuser,
)
from scopinator.seestar.commands.simple import (
    GetViewState,
    ScopePark,
    GetFocuserPosition,
)
from scopinator.seestar.imaging_client import SeestarImagingClient
from scopinator.util.eventbus import EventBus
from services.stream_manager import get_stream_manager


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
    image_processor: GraxpertStretch | None = None
    enhancement_processor: ImageEnhancementProcessor | None = None

    @property
    def name(self):
        return self.serial_number or self.host

    @property
    def location(self) -> Optional[str]:
        """Get the cached location (synchronous)."""
        return self._location
    
    def __repr__(self):
        """Custom repr to avoid issues with properties."""
        return f"Telescope(host={self.host!r}, port={self.port!r}, serial_number={self.serial_number!r})"

    async def get_location(self) -> Optional[str]:
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
        # Import websocket_manager here to avoid circular imports
        try:
            from websocket_manager import get_websocket_manager
            websocket_manager = get_websocket_manager()
            telescope_id = getattr(self, 'serial_number', None) or self.host
        except ImportError:
            websocket_manager = None
            telescope_id = None

        self.client = SeestarClient(
            self.host, 
            self.port, 
            self.event_bus,
            websocket_manager=websocket_manager,
            telescope_id=telescope_id
        )
        # Forces OpenCV to use UDP transport for RTSP streams
        os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;udp"
        self.imaging = SeestarImagingClient(
            self.host, self.imaging_port, self.event_bus
        )

        # Create shared image processor for upscaling
        self.image_processor = GraxpertStretch()

        # Create comprehensive enhancement processor
        self.enhancement_processor = ImageEnhancementProcessor()

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
            from scopinator.seestar.commands.discovery import get_all_network_interfaces

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
            """
            Goto a target with enhanced coordinate conversion and error handling.
            
            This endpoint automatically converts J2000 coordinates to current epoch
            when is_j2000=True, provides detailed error messages, and tracks progress.
            """
            if not self.client.is_connected:
                raise HTTPException(status_code=503, detail="Not connected to Seestar")
            
            # Define solar system objects for special handling
            SOLAR_SYSTEM_OBJECTS = {
                'sun': 'Sun',
                'moon': 'Moon', 
                'mercury': 'Mercury',
                'venus': 'Venus',
                'mars': 'Mars',
                'jupiter': 'Jupiter',
                'saturn': 'Saturn',
                'uranus': 'Uranus',
                'neptune': 'Neptune',
                'pluto': 'Pluto'  # Still included for amateur astronomers
            }
            
            # Check if target is a solar system object
            target_lower = goto_params.target_name.lower().strip()
            is_solar_system = False
            solar_object_name = None
            
            for key, name in SOLAR_SYSTEM_OBJECTS.items():
                if key in target_lower or name.lower() in target_lower:
                    is_solar_system = True
                    solar_object_name = name
                    break
            
            if is_solar_system:
                # Special handling for solar system objects
                logging.info(f"{'='*60}")
                logging.info(f"SOLAR SYSTEM OBJECT DETECTED: {solar_object_name}")
                logging.info(f"{'='*60}")
                logging.info(f"  Original target name: {goto_params.target_name}")
                logging.info(f"  Provided coordinates: RA={goto_params.ra:.6f}°, Dec={goto_params.dec:.6f}°")
                logging.info(f"  Is J2000: {goto_params.is_j2000}")
                logging.info(f"  Timestamp: {datetime.now().isoformat()}")
                
                # Object-specific considerations
                if solar_object_name == 'Sun':
                    logging.warning("⚠️  SUN OBSERVATION - EXTREME CAUTION REQUIRED!")
                    logging.warning("  - Requires proper solar filter")
                    logging.warning("  - Never observe without protection")
                    logging.warning("  - Auto-exposure should be disabled")
                    logging.warning("  - Special tracking rate needed: 15.04 arcsec/sec")
                    
                elif solar_object_name == 'Moon':
                    logging.info("🌙 MOON OBSERVATION")
                    logging.info("  - Fast proper motion: ~13.2°/day")
                    logging.info("  - Requires frequent position updates")
                    logging.info("  - Special tracking rate: 14.50 arcsec/sec")
                    logging.info("  - Consider phase for exposure settings")
                    
                elif solar_object_name in ['Mercury', 'Venus']:
                    logging.info(f"☿ INNER PLANET: {solar_object_name}")
                    logging.info("  - Often close to Sun - observe with caution")
                    logging.info("  - Rapid motion requires frequent updates")
                    logging.info("  - Best observed during twilight")
                    
                elif solar_object_name == 'Mars':
                    logging.info("♂ MARS OBSERVATION")
                    logging.info("  - Motion varies significantly near opposition")
                    logging.info("  - Can exhibit retrograde motion")
                    
                elif solar_object_name == 'Jupiter':
                    logging.info("♃ JUPITER OBSERVATION")
                    logging.info("  - Largest planet - good for tracking tests")
                    logging.info("  - Moons visible - consider separate tracking")
                    logging.info("  - Great Red Spot transit calculations available")
                    
                elif solar_object_name == 'Saturn':
                    logging.info("♄ SATURN OBSERVATION")
                    logging.info("  - Ring orientation affects visibility")
                    logging.info("  - Multiple moons for alignment reference")
                    
                elif solar_object_name in ['Uranus', 'Neptune']:
                    logging.info(f"⛢ OUTER PLANET: {solar_object_name}")
                    logging.info("  - Slow motion - standard sidereal tracking usually sufficient")
                    logging.info("  - Faint - requires longer exposures")
                    
                elif solar_object_name == 'Pluto':
                    logging.info("♇ PLUTO OBSERVATION")
                    logging.info("  - Extremely faint (mag ~14)")
                    logging.info("  - Requires long exposures and dark skies")
                    logging.info("  - Motion detection requires multiple night observations")
                
                logging.info(f"{'='*60}")
                logging.info("  Note: These coordinates will need ephemeris calculation for current position")
                
                # TODO: Future implementation will:
                # 1. Calculate current ephemeris position using astropy/skyfield
                # 2. Apply proper motion and light-time corrections
                # 3. Convert to telescope's local coordinates
                # 4. Set appropriate tracking rates for each object
                # 5. Implement safety checks for Sun observation
                
                # For now, print warning and continue with provided coordinates
                logging.warning(f"Using static coordinates for {solar_object_name} - ephemeris calculation not yet implemented")
                logging.info(f"{'='*60}")
            
            # Check for invalid (0,0) coordinates early
            if goto_params.ra == 0.0 and goto_params.dec == 0.0:
                logging.error(f"ERROR: Invalid goto request with coordinates (0,0) for target '{goto_params.target_name}'. "
                             f"Request rejected - this indicates a problem with the client or target data.")
                raise HTTPException(
                    status_code=400, 
                    detail="Invalid coordinates (0,0) - target coordinates are missing or invalid"
                )
            
            try:
                # Import the enhanced goto service
                from services.goto_service import EnhancedGotoService
                
                # Create goto service instance
                goto_service = EnhancedGotoService(self.client)
                
                # Execute enhanced goto with coordinate conversion
                result = await goto_service.goto_target(goto_params)
                
                return result
                
            except Exception as e:
                # Import exception types for better error handling
                from exceptions.telescope_exceptions import (
                    TelescopeError, InvalidCoordinatesError, TelescopeTimeoutError
                )
                
                # Map specific exceptions to appropriate HTTP status codes
                if isinstance(e, InvalidCoordinatesError):
                    raise HTTPException(status_code=400, detail=str(e))
                elif isinstance(e, TelescopeTimeoutError):
                    raise HTTPException(status_code=504, detail=str(e))
                elif isinstance(e, TelescopeError):
                    raise HTTPException(status_code=500, detail=str(e))
                else:
                    # Log unexpected errors
                    logging.error(f"Unexpected error in goto endpoint: {e}")
                    raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")
        
        @router.get("/goto/progress")
        async def get_goto_progress():
            """Get current goto operation progress."""
            try:
                from services.goto_service import EnhancedGotoService
                
                # Create goto service instance to check current operation
                goto_service = EnhancedGotoService(self.client)
                current_op = goto_service.get_current_operation()
                
                if current_op:
                    return current_op.model_dump()
                else:
                    return {"status": "idle", "message": "No goto operation in progress"}
                    
            except Exception as e:
                logging.error(f"Error getting goto progress: {e}")
                raise HTTPException(status_code=500, detail=f"Error: {str(e)}")
        
        @router.post("/goto/cancel")
        async def cancel_goto():
            """Cancel the current goto operation."""
            try:
                from services.goto_service import EnhancedGotoService
                
                goto_service = EnhancedGotoService(self.client)
                cancelled = await goto_service.cancel_current_operation()
                
                return {
                    "success": cancelled,
                    "message": "Goto operation cancelled" if cancelled else "No goto operation to cancel"
                }
                
            except Exception as e:
                logging.error(f"Error cancelling goto: {e}")
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
                    return {
                        "messages": [],
                        "error": "Parsed message history not available",
                    }
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
                    try:
                        update_count += 1
                        # Create a status object with current client information
                        status = {
                            "timestamp": asyncio.get_event_loop().time(),
                            "connected": self.client.is_connected if self.client else False,
                            "host": self.host,
                            "port": self.port,
                        }
                        
                        # Safely add status if available
                        if self.client and hasattr(self.client, 'status') and self.client.status:
                            try:
                                status["status"] = self.client.status.model_dump()
                            except Exception as e:
                                status["status_error"] = f"Error getting status: {str(e)}"
                        else:
                            status["status"] = None

                        # Send the status as a Server-Sent Event
                        yield f"data: {json.dumps(status)}\n\n"

                        # Send a heartbeat comment every 10 updates to keep connection alive
                        if update_count % 10 == 0:
                            yield f": heartbeat at {datetime.datetime.now().isoformat()}\n\n"

                    except asyncio.CancelledError:
                        # Client disconnected, stop the generator cleanly
                        logging.debug("SSE client disconnected")
                        break
                    except GeneratorExit:
                        # Generator is being closed, this is normal
                        logging.debug("SSE generator closed")
                        raise  # Re-raise GeneratorExit as required by Python
                    except Exception as e:
                        # Log error but continue streaming
                        logging.error(f"Error generating status update: {e}")
                        try:
                            error_status = {
                                "timestamp": asyncio.get_event_loop().time(),
                                "error": f"Failed to generate status: {str(e)}"
                            }
                            yield f"data: {json.dumps(error_status)}\n\n"
                        except Exception:
                            logging.error("Failed to send error message in status stream")

                    # Wait for 1 seconds before sending next update
                    await asyncio.sleep(1)
                    
            except asyncio.CancelledError:
                # Normal termination - client disconnected
                logging.debug("Status stream cancelled")
                pass  # Just exit cleanly
            except GeneratorExit:
                # Normal generator closure
                logging.debug("Status stream generator exiting")
                raise  # Must re-raise GeneratorExit
            except Exception as e:
                # Unexpected error - log but exit cleanly
                logging.error(f"Unexpected error in status stream generator: {e}")
                pass  # Exit cleanly without breaking the stream

        def build_frame_bytes(image: np.ndarray, width: int, height: int):
            # font = cv2.FONT_HERSHEY_COMPLEX
            BOUNDARY = b"\r\n--frame\r\n"

            # dt = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-4]
            #
            # w = width or 1080
            # h = height or 1920
            # image = cv2.putText(
            #     np.copy(image),
            #     dt,  # f'{dt} {self.received_frame}',
            #     (int(w / 2 - 240), h - 70),
            #     font,
            #     1,
            #     (210, 210, 210),
            #     4,
            #     cv2.LINE_8,
            # )

            # Check if we're in streaming mode and need to convert RGB to BGR
            # RTSP streaming delivers BGR, but RtspClient converts to RGB
            # cv2.imencode expects BGR format for JPEG encoding
            if self.imaging.client_mode == "Streaming":
                # Convert RGB back to BGR for proper JPEG encoding
                image = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)

            imgencode = cv2.imencode(".jpeg", image)[1]
            stringData = imgencode.tobytes()
            frame = (b"Content-Type: image/jpeg\r\n"
                     b"Date: " + datetime.datetime.now(datetime.UTC).strftime('%a, %d %b %Y %H:%M:%S GMT').encode() + b"\r\n\r\n"
                     + stringData + BOUNDARY)

            return frame

        @router.get("/status/stream")
        async def stream_status():
            """Stream client status updates every 5 seconds."""
            return StreamingResponse(
                status_stream_generator(), 
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                    "X-Accel-Buffering": "no",  # Disable Nginx buffering
                }
            )

        async def get_next_image_for_manager(camera_id: int = 0):
            """Get images from telescope for the stream manager."""
            # This generator runs once per telescope stream, not per client
            # The stream manager will distribute frames to multiple clients

            # Use the shared image processor instance
            star_processors = [self.image_processor]

            try:
                # Safety check
                if not self.imaging:
                    logging.warning("Image stream requested but imaging not initialized")
                    return

                prev_image = None
                async for image in self.imaging.get_next_image(camera_id):
                    try:
                        is_streaming = self.imaging.client_mode == "Streaming"

                        if image is not None and image.image is not None:
                            img = image.image
                            if not is_streaming:
                                # We don't want to run processors when in streaming mode!
                                for processor in star_processors:
                                    img = processor.process(img)
                                # Apply comprehensive enhancements
                                img = self.enhancement_processor.process(img)

                            changed = not np.array_equal(img, prev_image)
                            prev_image = img.copy()

                            if changed:
                                frame = build_frame_bytes(img, image.width, image.height)
                                yield frame

                                if not is_streaming:
                                    # We send an extra frame if not streaming to deal with some browser's buffering issues!
                                    yield frame
                        else:
                            # No image available, wait a bit
                            delay = 0.001 if is_streaming else 0.1
                            await asyncio.sleep(delay)

                    except asyncio.CancelledError:
                        # Stream manager is stopping this stream
                        logging.info("Telescope image stream cancelled by manager")
                        break
                    except Exception as e:
                        # Log error but continue streaming
                        logging.error(f"Error processing telescope image frame: {e}")
                        await asyncio.sleep(0.1)

            except asyncio.CancelledError:
                logging.info("Telescope stream terminated")
                pass
            except Exception as e:
                logging.error(f"Error in telescope image stream: {e}")
            finally:
                logging.info("Telescope image stream ended")

        async def get_next_image(camera_id: int = 0):
            """Get the next image from the Seestar imaging server."""
            # The connection check and reconnect is handled by the endpoint
            # If we get here, we should have a valid imaging client
            
            # Use the shared image processor instance
            star_processors = [self.image_processor]
            
            try:
                # Send initial boundary - this is required for multipart streams
                yield b"\r\n--frame\r\n"
                
                # Safety check inside the generator
                if not self.imaging:
                    logging.warning("Image stream requested but imaging not initialized")
                    # Still need to yield something for the stream to work
                    yield b"Content-Type: text/plain\r\n\r\nImaging not initialized\r\n--frame\r\n"
                    return

                prev_image = None
                async for image in self.imaging.get_next_image(camera_id):
                    # print(f"imaging loop in telescope {image is not None}")
                    try:
                        is_streaming = self.imaging.client_mode == "Streaming"

                        # print(f"{is_streaming=} {image is not None=} image.image: {image.image is not None if image is not None else None}")
                        if image is not None and image.image is not None:
                            # print("Image available")
                            img = image.image
                            if not is_streaming:
                                # We don't want to run processors when in streaming mode!
                                for processor in star_processors:
                                    img = processor.process(img)
                                # Apply comprehensive enhancements
                                img = self.enhancement_processor.process(img)

                            changed = not np.array_equal(img, prev_image)
                            prev_image = img.copy()
                            # print(f"Image changed: {changed}")
                            if changed:
                                frame = build_frame_bytes(img, image.width, image.height)
                                yield frame

                                if not is_streaming:
                                    # We send an extra frame if not streaming to deal with some browser's buffering issues!
                                    yield frame
                        else:
                            # No image available, wait a bit
                            # print("No image available")
                            delay = 0.001 if is_streaming else 0.1
                            await asyncio.sleep(delay)
                            
                    except asyncio.CancelledError:
                        # Client disconnected, this is normal - just stop
                        logging.debug("Image stream client disconnected")
                        break
                    except GeneratorExit:
                        # Generator is being closed, this is normal
                        logging.debug("Image stream generator closed")
                        raise  # Re-raise GeneratorExit as required by Python
                    except Exception as e:
                        # Log error but continue streaming
                        logging.error(f"Error processing image frame: {e}")
                        await asyncio.sleep(0.1)
                        # Continue to next iteration
                        
            except asyncio.CancelledError:
                # Normal termination - client disconnected
                logging.debug("Image stream cancelled")
                pass  # Just exit cleanly
            except GeneratorExit:
                # Normal generator closure
                logging.debug("Image stream generator exiting")
                raise  # Must re-raise GeneratorExit
            except Exception as e:
                # Unexpected error - log but exit cleanly
                logging.error(f"Unexpected error in image stream generator: {e}")
                pass  # Exit cleanly without breaking the stream

        @router.get("/upscaling")
        async def get_upscaling_settings():
            """Get current upscaling settings."""
            from scopinator.imaging.upscaler import ImageUpscaler
            from models.responses import UpscalingSettingsResponse

            upscaler = ImageUpscaler()
            available_methods = [
                method.value for method in upscaler.get_available_methods()
            ]

            return UpscalingSettingsResponse(
                enabled=self.image_processor.upscaling_processor.enabled,
                scale_factor=self.image_processor.upscaling_processor.scale_factor,
                method=self.image_processor.upscaling_processor.method.value,
                available_methods=available_methods,
            )

        @router.post("/upscaling")
        async def update_upscaling_settings(settings):
            """Update upscaling settings."""
            from scopinator.imaging.upscaler import ImageUpscaler
            from models.responses import UpscalingSettingsResponse

            # Update the image processor's upscaling settings
            self.image_processor.set_upscaling_params(
                enabled=settings.enabled,
                scale_factor=settings.scale_factor,
                method=settings.method,
            )

            upscaler = ImageUpscaler()
            available_methods = [
                method.value for method in upscaler.get_available_methods()
            ]

            logging.info(
                f"Updated upscaling settings: enabled={settings.enabled}, scale_factor={settings.scale_factor}, method={settings.method}"
            )

            return UpscalingSettingsResponse(
                enabled=settings.enabled,
                scale_factor=settings.scale_factor,
                method=settings.method.value,
                available_methods=available_methods,
            )

        @router.get("/enhancement")
        async def get_enhancement_settings():
            """Get current comprehensive image enhancement settings."""
            from scopinator.imaging.upscaler import ImageUpscaler
            from models.responses import ImageEnhancementSettingsResponse

            upscaler = ImageUpscaler()
            available_upscaling_methods = [
                method.value for method in upscaler.get_available_methods()
            ]
            available_sharpening_methods = [method.value for method in SharpeningMethod]
            available_stretch_parameters = [
                "No Stretch",
                "10% Bg, 3 sigma",
                "15% Bg, 3 sigma",
                "20% Bg, 3 sigma",
                "30% Bg, 2 sigma",
            ]

            settings = self.enhancement_processor.get_enhancement_settings()

            return ImageEnhancementSettingsResponse(
                upscaling_enabled=settings["upscaling_enabled"],
                scale_factor=settings["scale_factor"],
                upscaling_method=settings["upscaling_method"],
                available_upscaling_methods=available_upscaling_methods,
                sharpening_enabled=settings["sharpening_enabled"],
                sharpening_method=settings["sharpening_method"],
                sharpening_strength=settings["sharpening_strength"],
                available_sharpening_methods=available_sharpening_methods,
                invert_enabled=settings["invert_enabled"],
                stretch_parameter="15% Bg, 3 sigma",  # Get from image processor
                available_stretch_parameters=available_stretch_parameters,
            )

        @router.post("/enhancement")
        async def update_enhancement_settings(settings):
            """Update comprehensive image enhancement settings."""
            from scopinator.imaging.upscaler import ImageUpscaler
            from models.responses import ImageEnhancementSettingsResponse

            logging.info(f"Received enhancement settings update: {settings}")

            # Update enhancement processor settings
            self.enhancement_processor.set_upscaling_params(
                enabled=settings.upscaling_enabled,
                scale_factor=settings.scale_factor,
                method=settings.upscaling_method,
            )

            self.enhancement_processor.set_sharpening_params(
                enabled=settings.sharpening_enabled,
                method=settings.sharpening_method,
                strength=settings.sharpening_strength,
            )

            self.enhancement_processor.set_invert_enabled(settings.invert_enabled)

            logging.info(
                f"Updated enhancement processor settings: {self.enhancement_processor.get_enhancement_settings()}"
            )

            # Update stretch parameter on the original image processor
            # Note: This would require modifying the GraxpertStretch class to support dynamic stretch parameters

            upscaler = ImageUpscaler()
            available_upscaling_methods = [
                method.value for method in upscaler.get_available_methods()
            ]
            available_sharpening_methods = [method.value for method in SharpeningMethod]
            available_stretch_parameters = [
                "No Stretch",
                "10% Bg, 3 sigma",
                "15% Bg, 3 sigma",
                "20% Bg, 3 sigma",
                "30% Bg, 2 sigma",
            ]

            logging.info(f"Updated enhancement settings: {settings}")

            return ImageEnhancementSettingsResponse(
                upscaling_enabled=settings.upscaling_enabled,
                scale_factor=settings.scale_factor,
                upscaling_method=settings.upscaling_method.value,
                available_upscaling_methods=available_upscaling_methods,
                sharpening_enabled=settings.sharpening_enabled,
                sharpening_method=settings.sharpening_method.value,
                sharpening_strength=settings.sharpening_strength,
                available_sharpening_methods=available_sharpening_methods,
                invert_enabled=settings.invert_enabled,
                stretch_parameter=settings.stretch_parameter,
                available_stretch_parameters=available_stretch_parameters,
            )

        @router.get("/stream/{camera_id:int}")
        async def stream_image(camera_id: int = 0):
            """Stream images from the Seestar imaging server."""
            # Pre-check connection to avoid starting a broken stream
            # Check both the is_connected flag and the underlying connection state
            if not self.imaging:
                raise HTTPException(
                    status_code=503,
                    detail="Imaging service not initialized"
                )

            # Check the actual connection state, not just the flag
            if not self.imaging.is_connected or (
                self.imaging.connection and not self.imaging.connection.is_connected()
            ):
                # Try to reconnect if not connected
                try:
                    logging.info(f"Imaging not connected, attempting to reconnect to {self.host}:{self.imaging_port}")
                    await self.imaging.connect()
                    logging.info(f"Successfully reconnected imaging client")
                except Exception as e:
                    logging.error(f"Failed to reconnect imaging client: {e}")
                    raise HTTPException(
                        status_code=503,
                        detail=f"Imaging service not connected to telescope at {self.host}:{self.imaging_port}"
                    )

            # Get stream manager and generate a unique client ID
            stream_manager = get_stream_manager()
            telescope_id = getattr(self, 'serial_number', None) or self.host
            client_id = str(uuid.uuid4())

            # Register this client
            stream_info = await stream_manager.register_client(telescope_id, camera_id, client_id)

            async def client_stream_generator():
                """Generator that yields frames to this client."""
                try:
                    # Ensure the telescope stream is active (for keepalive)
                    await stream_manager.get_or_create_stream(
                        telescope_id, camera_id,
                        lambda: get_next_image_for_manager(camera_id)
                    )

                    # Each client gets its own stream from the telescope
                    # The get_next_image_for_manager function already handles all processing
                    # and color conversion properly, so we just use it directly
                    async for frame in get_next_image_for_manager(camera_id):
                        try:
                            # Frame is already properly encoded with correct colors
                            yield frame
                        except Exception as e:
                            logging.error(f"Error streaming frame to client {client_id}: {e}")
                            # Continue streaming even if one frame fails
                            continue

                except asyncio.CancelledError:
                    logging.debug(f"Client {client_id} stream cancelled")
                    raise
                except Exception as e:
                    logging.error(f"Error in client stream: {e}")
                    raise
                finally:
                    # Unregister client when done
                    await stream_manager.unregister_client(telescope_id, camera_id, client_id)
                    logging.debug(f"Client {client_id} unregistered from stream")

            return StreamingResponse(
                client_stream_generator(),
                media_type="multipart/x-mixed-replace; boundary=frame",
                headers={
                    "Cache-Control": "no-cache, no-store, must-revalidate",
                    "Pragma": "no-cache",
                    "Expires": "0",
                    "Connection": "keep-alive",
                    "X-Accel-Buffering": "no",  # Disable Nginx buffering
                }
            )

        @router.post("/plate-solve")
        async def plate_solve(request_body: dict = {}):
            """Start plate solving and return immediately with job ID."""
            # Check if imaging client is connected
            if not self.imaging or not self.imaging.is_connected:
                raise HTTPException(
                    status_code=503, detail="Imaging client not connected"
                )

            # Get the current image
            current_image = self.imaging.get_cached_raw_image()
            if current_image is None:
                raise HTTPException(
                    status_code=404, detail="No current image available"
                )

            # Get API key from request body or settings
            api_key = request_body.get("api_key")
            if not api_key:
                # Try to get from settings first, then environment variable
                from services.settings_manager import get_settings_manager
                settings_manager = get_settings_manager()
                api_key = settings_manager.get_astrometry_api_key()
                if not api_key:
                    raise HTTPException(
                        status_code=400,
                        detail="Astrometry.net API key required. Configure in Settings > API Keys or set ASTROMETRY_API_KEY environment variable",
                    )

            # Generate a unique job ID
            job_id = str(uuid.uuid4())
            telescope_id = getattr(self, 'serial_number', None) or getattr(self, 'host', 'unknown')
            logging.info(f"Starting plate solve job {job_id} for telescope {telescope_id}")

            # Get WebSocket manager
            from websocket_manager import get_websocket_manager
            websocket_manager = get_websocket_manager()

            # Create background task for plate solving
            async def plate_solve_task():
                """Background task to perform plate solving."""
                try:
                    # Import here to avoid circular dependencies
                    from services.astrometry_client import AstrometryClient
                    from services.settings_manager import get_settings_manager
                    from services.async_image_processing import process_graxpert_async
                    from scopinator.imaging.stretch import StretchParameter
                    from scopinator.seestar.protocol_handlers import ScopeImage
                    import numpy as np

                    # Get custom API URL if configured
                    settings_manager = get_settings_manager()
                    api_url = settings_manager.get_astrometry_api_url()
                    
                    # Create astrometry client
                    if api_url:
                        astrometry_client = AstrometryClient(api_key, api_url)
                    else:
                        astrometry_client = AstrometryClient(api_key)

                    try:
                        # Temporarily disable image stretching due to CPU compatibility issues
                        # TODO: Re-enable once we fix the illegal instruction error
                        ENABLE_IMAGE_STRETCHING = False
                        
                        if ENABLE_IMAGE_STRETCHING and current_image.image is not None:
                            # Stretch the image before plate solving to enhance star visibility
                            logging.info("Applying stretch to image before plate solving")
                            
                            # Apply GraXpert stretch for better star detection
                            # Use a moderate stretch that enhances stars without over-stretching
                            stretched_image_data = await process_graxpert_async(
                                current_image.image,
                                stretch_parameter=StretchParameter["15% Bg, 3 sigma"],
                                enhancement_settings=None  # No additional enhancements
                            )
                            
                            # Create a new ScopeImage with the stretched data
                            stretched_image = ScopeImage(
                                width=current_image.width,
                                height=current_image.height,
                                image=stretched_image_data
                            )
                            
                            logging.info("Image stretch applied successfully")
                        else:
                            # Use original image without stretching
                            stretched_image = current_image
                            if not ENABLE_IMAGE_STRETCHING:
                                logging.info("Image stretching disabled, using original image")
                            else:
                                logging.warning("No image data to stretch, using original")
                        
                        # Get telescope's current position if available for better solving
                        solve_params = {}
                        if hasattr(self.client, "status") and self.client.status:
                            if (
                                self.client.status.ra is not None
                                and self.client.status.dec is not None
                            ):
                                solve_params["center_ra"] = self.client.status.ra
                                solve_params["center_dec"] = self.client.status.dec
                                solve_params["radius"] = 10.0  # 10 degree search radius

                        # Perform plate solving with stretched image
                        logging.info(f"Starting background plate solve with params: {solve_params}")
                        result = await astrometry_client.solve_image(
                            stretched_image, **solve_params
                        )

                        if result.success:
                            logging.info(
                                f"Plate solve successful: RA={result.ra}, Dec={result.dec}"
                            )
                            # Send success result via WebSocket
                            await websocket_manager.broadcast_plate_solve_result(
                                telescope_id=telescope_id,
                                job_id=job_id,
                                success=True,
                                ra=result.ra,
                                dec=result.dec,
                                orientation=result.orientation,
                                pixscale=result.pixscale,
                                field_width=result.field_width,
                                field_height=result.field_height,
                                submission_id=result.submission_id,
                                astrometry_job_id=result.job_id,
                            )
                        else:
                            logging.error(f"Plate solve failed: {result.error}")
                            # Send failure result via WebSocket
                            await websocket_manager.broadcast_plate_solve_result(
                                telescope_id=telescope_id,
                                job_id=job_id,
                                success=False,
                                error=result.error,
                                submission_id=result.submission_id,
                                astrometry_job_id=result.job_id,
                            )

                    except Exception as e:
                        logging.error(f"Error during plate solving: {e}")
                        # Send error result via WebSocket
                        await websocket_manager.broadcast_plate_solve_result(
                            telescope_id=telescope_id,
                            job_id=job_id,
                            success=False,
                            error=str(e),
                        )
                    finally:
                        await astrometry_client.close()

                except Exception as e:
                    logging.error(f"Critical error in plate solve task: {e}")
                    # Send critical error result via WebSocket
                    await websocket_manager.broadcast_plate_solve_result(
                        telescope_id=telescope_id,
                        job_id=job_id,
                        success=False,
                        error=f"Critical error: {str(e)}",
                    )

            # Start the background task
            asyncio.create_task(plate_solve_task())

            # Return immediately with job ID
            return {
                "job_id": job_id,
                "status": "started",
                "message": "Plate solving started in background. Results will be sent via WebSocket.",
            }

        @router.post("/sync")
        async def sync_telescope(sync_data: dict):
            """Sync the telescope to specific RA/Dec coordinates."""
            # Check if client is connected
            if not self.client or not self.client.is_connected:
                raise HTTPException(
                    status_code=503, detail="Telescope client not connected"
                )

            # Validate input data
            if "ra" not in sync_data or "dec" not in sync_data:
                raise HTTPException(
                    status_code=400,
                    detail="Both 'ra' and 'dec' coordinates are required",
                )

            try:
                ra = float(sync_data["ra"])
                dec = float(sync_data["dec"])

                # Validate coordinate ranges
                if not (0 <= ra <= 360):
                    raise HTTPException(
                        status_code=400, detail="RA must be between 0 and 360 degrees"
                    )
                if not (-90 <= dec <= 90):
                    raise HTTPException(
                        status_code=400, detail="Dec must be between -90 and 90 degrees"
                    )

                # Perform sync
                logging.info(f"Syncing telescope to RA={ra}, Dec={dec}")
                await self.client.scope_sync(ra, dec)

                return {
                    "success": True,
                    "message": f"Telescope synced to RA={ra:.6f}°, Dec={dec:.6f}°",
                    "ra": ra,
                    "dec": dec,
                }

            except ValueError as e:
                raise HTTPException(
                    status_code=400, detail=f"Invalid coordinates: {str(e)}"
                )
            except Exception as e:
                logging.error(f"Error during telescope sync: {e}")
                raise HTTPException(
                    status_code=500, detail=f"Error during sync: {str(e)}"
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
            # Import websocket_manager here to avoid circular imports
            try:
                from websocket_manager import get_websocket_manager
                websocket_manager = get_websocket_manager()
                telescope_id = getattr(self, 'serial_number', None) or self.host
            except ImportError:
                websocket_manager = None
                telescope_id = None
            
            self.client = SeestarClient(
                self.host, 
                self.port, 
                self.event_bus,
                websocket_manager=websocket_manager,
                telescope_id=telescope_id
            )
        if not hasattr(self, "imaging") or not self.imaging:
            self.imaging = SeestarImagingClient(
                self.host, self.imaging_port, self.event_bus
            )
        if not hasattr(self, "image_processor") or not self.image_processor:
            self.image_processor = GraxpertStretch()
        if not hasattr(self, "enhancement_processor") or not self.enhancement_processor:
            self.enhancement_processor = ImageEnhancementProcessor()