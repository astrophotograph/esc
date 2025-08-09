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

from smarttel.imaging.graxpert_stretch import GraxpertStretch
from smarttel.imaging.upscaler import (
    SharpeningMethod,
    ImageEnhancementProcessor,
)
from smarttel.seestar.client import SeestarClient
from smarttel.seestar.commands.parameterized import (
    GotoTargetParameters,
    ScopeSpeedMoveParameters,
    ScopeSpeedMove,
    MoveFocuserParameters,
    MoveFocuser,
)
from smarttel.seestar.commands.simple import (
    GetViewState,
    ScopePark,
    GetFocuserPosition,
)
from smarttel.seestar.imaging_client import SeestarImagingClient
from smarttel.util.eventbus import EventBus


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
            """
            Goto a target with enhanced coordinate conversion and error handling.
            
            This endpoint automatically converts J2000 coordinates to current epoch
            when is_j2000=True, provides detailed error messages, and tracks progress.
            """
            if not self.client.is_connected:
                raise HTTPException(status_code=503, detail="Not connected to Seestar")
            
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
            imgencode = cv2.imencode(".jpeg", image)[1]
            stringData = imgencode.tobytes()
            frame = b"Content-Type: image/jpeg\r\n\r\n" + stringData + BOUNDARY

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
            from smarttel.imaging.upscaler import ImageUpscaler
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
            from smarttel.imaging.upscaler import ImageUpscaler
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
            from smarttel.imaging.upscaler import ImageUpscaler
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
            from smarttel.imaging.upscaler import ImageUpscaler
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
            
            return StreamingResponse(
                get_next_image(camera_id),
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
        async def plate_solve(api_key: str = None):
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

            # Check if we have an API key
            if not api_key:
                # Try to get from environment variable
                api_key = os.getenv("ASTROMETRY_API_KEY")
                if not api_key:
                    raise HTTPException(
                        status_code=400,
                        detail="Astrometry.net API key required. Pass as parameter or set ASTROMETRY_API_KEY environment variable",
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

                    # Create astrometry client
                    astrometry_client = AstrometryClient(api_key)

                    try:
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

                        # Perform plate solving
                        logging.info(f"Starting background plate solve with params: {solve_params}")
                        result = await astrometry_client.solve_image(
                            current_image, **solve_params
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