"""
Unified Telescope Bridge - uses scopinator V2 API to support multiple protocols.

Supports:
- Seestar: ZWO Seestar smart telescopes (native protocol)
- Alpaca: ASCOM Alpaca devices via HTTP REST API

Uses the V2 Backend abstraction for unified device access. Each backend
represents one telescope system that may contain multiple devices
(mount, camera, focuser, filterwheel).
"""
import logging
import asyncio
import io
import threading
import concurrent.futures
from datetime import datetime
from typing import Any, Optional
from enum import Enum

from scopinator.v2 import Coordinates
from scopinator.v2.backends.seestar import SeestarBackend
from scopinator.v2.backends.alpaca import AlpacaBackend
from scopinator.seestar.imaging_client import SeestarImagingClient
from scopinator.seestar.client import EventBus
from PIL import Image


class Protocol(str, Enum):
    """Supported telescope protocols."""
    SEESTAR = "seestar"
    ALPACA = "alpaca"


class UnifiedTelescopeBridge:
    """Unified bridge for communicating with telescopes via multiple protocols.

    Uses scopinator V2 API Backend abstraction for protocol-agnostic control.
    Each bridge instance represents one telescope system with its devices.
    """

    def __init__(self, host: str, port: int, protocol: str = "seestar"):
        """Initialize telescope bridge.

        Args:
            host: Telescope/server IP address
            port: Telescope/server port number
            protocol: Protocol type ("seestar" or "alpaca")
        """
        self.host = host
        self.port = port
        self.protocol = Protocol(protocol) if protocol else Protocol.SEESTAR
        self._backend: Any = None
        self._mount: Any = None
        self._camera: Any = None
        self._focuser: Any = None
        self._imaging_client: Any = None  # For Seestar streaming
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._thread: Optional[threading.Thread] = None
        self._lock = threading.Lock()

    def _start_event_loop_thread(self):
        """Start a background thread with a running event loop."""
        if self._thread is not None and self._thread.is_alive():
            return

        def run_loop():
            self._loop = asyncio.new_event_loop()
            asyncio.set_event_loop(self._loop)
            logging.info(f"Started event loop thread for telescope {self.host}:{self.port}")
            try:
                self._loop.run_forever()
            finally:
                self._loop.close()
                logging.info(f"Event loop thread stopped for telescope {self.host}:{self.port}")

        self._thread = threading.Thread(target=run_loop, daemon=True)
        self._thread.start()

        # Wait for the loop to be ready
        for _ in range(100):
            if self._loop is not None:
                break
            import time
            time.sleep(0.01)

    def _run_async(self, coro, timeout: float = 30.0):
        """Run an async coroutine in the background event loop thread."""
        if self._loop is None:
            raise RuntimeError("Event loop not started")

        future = asyncio.run_coroutine_threadsafe(coro, self._loop)
        try:
            return future.result(timeout=timeout)
        except concurrent.futures.TimeoutError:
            future.cancel()
            raise TimeoutError(f"Async operation timed out after {timeout}s")

    def connect(self) -> dict[str, Any]:
        """Connect to the telescope using the configured protocol."""
        try:
            self._start_event_loop_thread()

            async def do_connect():
                if self.protocol == Protocol.SEESTAR:
                    # Create Seestar backend
                    self._backend = SeestarBackend(
                        host=self.host,
                        port=self.port,
                        imaging_port=4800,
                    )
                    await self._backend.connect()

                    # Get mount and camera
                    self._mount = await self._backend.get_mount("seestar_mount")
                    self._camera = await self._backend.get_camera("seestar_camera")

                    # Start view mode so frames will be sent
                    # The Seestar must be in view mode (ContinuousExposure) to stream frames
                    client = self._backend.client
                    if client:
                        try:
                            await client.scope_view(mode='star')
                            logging.info(f"Started view mode for Seestar at {self.host}")
                        except Exception as e:
                            logging.warning(f"Failed to start view mode: {e}")

                    # For Seestar, the imaging client is managed by the backend
                    # Get the backend's imaging client which shares the event bus
                    self._imaging_client = self._backend.imaging_client
                    if self._imaging_client:
                        await self._imaging_client.start_streaming()

                elif self.protocol == Protocol.ALPACA:
                    # Create Alpaca backend
                    self._backend = AlpacaBackend(
                        host=self.host,
                        port=self.port,
                    )
                    await self._backend.connect()

                    # Discover devices on this server
                    devices = await self._backend.discover_devices()

                    # Get first available mount and camera
                    if devices.get("mount"):
                        self._mount = await self._backend.get_mount(devices["mount"][0])
                        await self._mount.connect()
                    if devices.get("camera"):
                        self._camera = await self._backend.get_camera(devices["camera"][0])
                        await self._camera.connect()

            self._run_async(do_connect())

            return {
                "success": True,
                "message": f"Connected to {self.protocol.value} telescope at {self.host}:{self.port}"
            }

        except Exception as e:
            logging.error(f"Failed to connect to telescope: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    def disconnect(self) -> dict[str, Any]:
        """Disconnect from the telescope."""
        try:
            async def do_disconnect():
                if self._imaging_client:
                    try:
                        await self._imaging_client.stop_streaming()
                        await self._imaging_client.disconnect()
                    except Exception as e:
                        logging.warning(f"Error disconnecting imaging client: {e}")

                if self._backend:
                    await self._backend.disconnect()

            if self._loop:
                try:
                    self._run_async(do_disconnect(), timeout=5.0)
                except Exception as e:
                    logging.warning(f"Error during disconnect: {e}")

            self._backend = None
            self._mount = None
            self._camera = None
            self._focuser = None
            self._imaging_client = None

            if self._loop is not None:
                self._loop.call_soon_threadsafe(self._loop.stop)
                self._loop = None

            if self._thread is not None:
                self._thread.join(timeout=2.0)
                self._thread = None

            return {
                "success": True,
                "message": f"Disconnected from telescope at {self.host}:{self.port}"
            }
        except Exception as e:
            logging.error(f"Failed to disconnect from telescope: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    def goto_target(self, target_name: str, ra: float, dec: float) -> dict[str, Any]:
        """Slew telescope to target coordinates.

        Args:
            target_name: Name of the target
            ra: Right ascension in hours (0-24)
            dec: Declination in degrees (-90 to +90)
        """
        try:
            if not self._mount:
                return {"success": False, "error": "No mount available"}

            async def do_goto():
                # Convert RA from hours to degrees
                coords = Coordinates.from_hours(ra_hours=ra, dec=dec)
                await self._mount.slew_to_coordinates(coords)

            self._run_async(do_goto())

            return {
                "success": True,
                "message": f"Slewing to {target_name}"
            }

        except Exception as e:
            logging.error(f"GOTO command failed: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    def park(self) -> dict[str, Any]:
        """Park the telescope."""
        try:
            if not self._mount:
                return {"success": False, "error": "No mount available"}

            async def do_park():
                await self._mount.park()

            self._run_async(do_park())

            return {"success": True, "message": "Telescope parked"}

        except Exception as e:
            logging.error(f"Park command failed: {e}")
            return {"success": False, "error": str(e)}

    def get_status(self) -> dict[str, Any]:
        """Get current telescope status."""
        try:
            if not self._backend:
                return {
                    "success": True,
                    "state": {
                        "battery": None,
                        "cur_temp": None,
                        "ra": None,
                        "dec": None,
                        "is_goto": False,
                        "is_tracking": False,
                        "view": "Idle",
                        "gain": None,
                        "focus_position": None,
                        "stacked_frame": None,
                        "target_name": None,
                    }
                }

            async def do_get_status():
                status_data = {
                    "ra": None,
                    "dec": None,
                    "is_goto": False,
                    "is_tracking": False,
                    "view": "Idle",
                }

                if self._mount:
                    try:
                        mount_status = await self._mount.get_status()
                        if mount_status:
                            if hasattr(mount_status, 'coordinates') and mount_status.coordinates:
                                status_data["ra"] = mount_status.coordinates.ra_hours
                                status_data["dec"] = mount_status.coordinates.dec
                            if hasattr(mount_status, 'is_slewing'):
                                status_data["is_goto"] = mount_status.is_slewing
                            if hasattr(mount_status, 'is_tracking'):
                                status_data["is_tracking"] = mount_status.is_tracking
                    except Exception as e:
                        logging.debug(f"Failed to get mount status: {e}")

                # For Seestar, get additional status from the underlying client
                if self.protocol == Protocol.SEESTAR and self._backend:
                    client = self._backend.client
                    if client and hasattr(client, 'status') and client.status:
                        status = client.status
                        status_data.update({
                            "battery": getattr(status, 'battery_capacity', None),
                            "cur_temp": getattr(status, 'temp', None),
                            "gain": getattr(status, 'gain', None),
                            "focus_position": getattr(status, 'focus_position', None),
                            "stacked_frame": getattr(status, 'stacked_frame', None),
                            "target_name": getattr(status, 'target_name', None),
                            "view": getattr(status, 'stage', 'Idle'),
                        })

                return status_data

            status = self._run_async(do_get_status())

            return {"success": True, "state": status}

        except Exception as e:
            logging.error(f"Failed to get telescope status: {e}")
            return {"success": False, "error": str(e)}

    def move(self, direction: str = "n", speed: float = 1.0, duration_sec: float = 5.0) -> dict[str, Any]:
        """Move the telescope in a direction.

        For Seestar, uses the native ScopeSpeedMove command.
        For Alpaca, uses MoveAxis or PulseGuide commands.
        """
        try:
            if not self._backend:
                return {"success": False, "error": "Not connected"}

            if self.protocol == Protocol.SEESTAR:
                # Use Seestar-specific move command via the underlying client
                from scopinator.seestar.commands.parameterized import (
                    ScopeSpeedMove,
                    ScopeSpeedMoveParameters,
                )

                direction_angles = {
                    "n": 90, "north": 90,
                    "s": 270, "south": 270,
                    "e": 0, "east": 0,
                    "w": 180, "west": 180,
                    "ne": 45, "nw": 135,
                    "se": 315, "sw": 225,
                    "stop": 0,
                }

                dir_lower = direction.lower()
                is_stop = dir_lower == "stop"
                angle = direction_angles.get(dir_lower, 0)

                move_params = ScopeSpeedMoveParameters(
                    angle=angle,
                    level=2,
                    dur_sec=int(duration_sec) if not is_stop else 1,
                    percent=int(speed * 100) if not is_stop else 0,
                )

                async def do_move():
                    client = self._backend.client
                    return await client.send_and_recv(ScopeSpeedMove(params=move_params))

                response = self._run_async(do_move())
                return {
                    "success": True,
                    "response": response.model_dump() if hasattr(response, 'model_dump') else str(response)
                }

            else:
                # For Alpaca, use move_axis (more universally supported than pulse_guide)
                async def do_move():
                    if not self._mount:
                        return

                    # Map direction to axis and rate
                    # Axis 0 = RA, Axis 1 = Dec
                    # Positive rate = one direction, negative = opposite
                    dir_lower = direction.lower()

                    # Default move rate in degrees/second (adjustable via speed param)
                    # Use 4 deg/sec as base for visible movement (max is typically 6)
                    base_rate = 4.0 * speed

                    if dir_lower in ("n", "north"):
                        axis, rate = 1, base_rate   # Dec positive
                    elif dir_lower in ("s", "south"):
                        axis, rate = 1, -base_rate  # Dec negative
                    elif dir_lower in ("e", "east"):
                        axis, rate = 0, base_rate   # RA positive
                    elif dir_lower in ("w", "west"):
                        axis, rate = 0, -base_rate  # RA negative
                    elif dir_lower == "stop":
                        # Stop both axes
                        if hasattr(self._mount, 'move_axis'):
                            await self._mount.move_axis(0, 0)
                            await self._mount.move_axis(1, 0)
                        return
                    else:
                        axis, rate = 1, base_rate  # Default to north

                    if hasattr(self._mount, 'move_axis'):
                        await self._mount.move_axis(axis, rate)
                        # Wait for duration then stop
                        await asyncio.sleep(duration_sec)
                        await self._mount.move_axis(axis, 0)

                self._run_async(do_move())
                return {"success": True, "message": f"Moving {direction}"}

        except Exception as e:
            logging.error(f"Move command failed: {e}")
            return {"success": False, "error": str(e)}

    def stop_move(self) -> dict[str, Any]:
        """Stop any ongoing telescope movement."""
        return self.move(direction="stop", speed=0, duration_sec=1)

    def focus(self, position: int) -> dict[str, Any]:
        """Set focus to an absolute position."""
        try:
            if not self._backend:
                return {"success": False, "error": "Not connected"}

            if self.protocol == Protocol.SEESTAR:
                from scopinator.seestar.commands.parameterized import (
                    MoveFocuser,
                    MoveFocuserParameters,
                )

                async def do_focus():
                    client = self._backend.client
                    command = MoveFocuser(
                        params=MoveFocuserParameters(step=position, ret_step=True)
                    )
                    return await client.send_and_recv(command)

                response = self._run_async(do_focus())
                return {
                    "success": True,
                    "message": f"Focus set to {position}",
                    "position": position,
                }
            else:
                # Alpaca focuser
                if self._focuser:
                    async def do_focus():
                        await self._focuser.move(position)
                    self._run_async(do_focus())
                    return {"success": True, "message": f"Focus set to {position}"}
                return {"success": False, "error": "No focuser available"}

        except Exception as e:
            logging.error(f"Focus command failed: {e}")
            return {"success": False, "error": str(e)}

    def focus_increment(self, increment: int) -> dict[str, Any]:
        """Adjust focus by an increment from current position."""
        try:
            if not self._backend:
                return {"success": False, "error": "Not connected"}

            if self.protocol == Protocol.SEESTAR:
                # Get current position from status
                client = self._backend.client
                current_position = None
                if hasattr(client, 'status') and client.status:
                    current_position = client.status.focus_position

                if current_position is None:
                    new_position = abs(increment)
                else:
                    new_position = current_position + increment

                return self.focus(new_position)
            else:
                # For Alpaca, try to get current position and increment
                return {"success": False, "error": "Focus increment not implemented for Alpaca"}

        except Exception as e:
            logging.error(f"Focus increment command failed: {e}")
            return {"success": False, "error": str(e)}

    def auto_focus(self) -> dict[str, Any]:
        """Start auto-focus routine."""
        try:
            if not self._backend:
                return {"success": False, "error": "Not connected"}

            if self.protocol == Protocol.SEESTAR:
                from scopinator.seestar.commands.simple import StartAutoFocus

                async def do_auto_focus():
                    client = self._backend.client
                    return await client.send_and_recv(StartAutoFocus())

                response = self._run_async(do_auto_focus())
                return {
                    "success": True,
                    "message": "Auto focus started",
                }
            else:
                return {"success": False, "error": "Auto-focus not available for Alpaca"}

        except Exception as e:
            logging.error(f"Auto focus command failed: {e}")
            return {"success": False, "error": str(e)}

    def start_recording(self) -> dict[str, Any]:
        """Start video recording (Seestar only)."""
        try:
            if self.protocol != Protocol.SEESTAR:
                return {"success": False, "error": "Recording only supported on Seestar"}

            from scopinator.seestar.commands.simple import StartRecording

            async def do_start_recording():
                client = self._backend.client
                return await client.send_and_recv(StartRecording())

            self._run_async(do_start_recording())
            return {"success": True, "message": "Recording started"}

        except Exception as e:
            logging.error(f"Start recording failed: {e}")
            return {"success": False, "error": str(e)}

    def stop_recording(self) -> dict[str, Any]:
        """Stop video recording (Seestar only)."""
        try:
            if self.protocol != Protocol.SEESTAR:
                return {"success": False, "error": "Recording only supported on Seestar"}

            from scopinator.seestar.commands.simple import StopRecording

            async def do_stop_recording():
                client = self._backend.client
                return await client.send_and_recv(StopRecording())

            self._run_async(do_stop_recording())
            return {"success": True, "message": "Recording stopped"}

        except Exception as e:
            logging.error(f"Stop recording failed: {e}")
            return {"success": False, "error": str(e)}

    def plate_solve(self) -> dict[str, Any]:
        """Run plate solving (Seestar only)."""
        try:
            if self.protocol != Protocol.SEESTAR:
                return {"success": False, "error": "Plate solving only supported on Seestar"}

            from scopinator.seestar.commands.simple import StartPlateSolve

            async def do_plate_solve():
                client = self._backend.client
                return await client.send_and_recv(StartPlateSolve())

            self._run_async(do_plate_solve())
            return {"success": True, "message": "Plate solve started"}

        except Exception as e:
            logging.error(f"Plate solve failed: {e}")
            return {"success": False, "error": str(e)}

    def reboot(self) -> dict[str, Any]:
        """Reboot telescope (Seestar only)."""
        try:
            if self.protocol != Protocol.SEESTAR:
                return {"success": False, "error": "Reboot only supported on Seestar"}

            from scopinator.seestar.commands.simple import Reboot

            async def do_reboot():
                client = self._backend.client
                return await client.send_and_recv(Reboot())

            self._run_async(do_reboot())
            return {"success": True, "message": "Telescope rebooting"}

        except Exception as e:
            logging.error(f"Reboot failed: {e}")
            return {"success": False, "error": str(e)}

    def start_stack(self, restart: bool = False) -> dict[str, Any]:
        """Start stacking on the telescope (Seestar only).

        Args:
            restart: If True, restart stacking from scratch
        """
        try:
            if self.protocol != Protocol.SEESTAR:
                return {"success": False, "error": "Stacking only supported on Seestar"}

            from scopinator.seestar.commands.parameterized import (
                IscopeStartStack,
                StartStackParams,
            )

            async def do_start_stack():
                client = self._backend.client
                params = StartStackParams(restart=restart) if restart else None
                command = IscopeStartStack(params=params)
                return await client.send_and_recv(command)

            response = self._run_async(do_start_stack())
            return {
                "success": True,
                "message": "Stacking started",
                "response": response.model_dump() if hasattr(response, 'model_dump') else str(response)
            }

        except Exception as e:
            logging.error(f"Start stack failed: {e}")
            return {"success": False, "error": str(e)}

    def stop_stack(self) -> dict[str, Any]:
        """Stop stacking on the telescope (Seestar only)."""
        try:
            if self.protocol != Protocol.SEESTAR:
                return {"success": False, "error": "Stacking only supported on Seestar"}

            from scopinator.seestar.commands.parameterized import (
                IscopeStopView,
                StopStage,
            )

            async def do_stop_stack():
                client = self._backend.client
                command = IscopeStopView(params={"stage": StopStage.STACK})
                return await client.send_and_recv(command)

            response = self._run_async(do_stop_stack())
            return {
                "success": True,
                "message": "Stacking stopped",
                "response": response.model_dump() if hasattr(response, 'model_dump') else str(response)
            }

        except Exception as e:
            logging.error(f"Stop stack failed: {e}")
            return {"success": False, "error": str(e)}

    def stop_goto(self) -> dict[str, Any]:
        """Stop GOTO operation on the telescope (Seestar only)."""
        try:
            if self.protocol != Protocol.SEESTAR:
                # For Alpaca, use abort_slew if available
                if self._mount and hasattr(self._mount, 'abort_slew'):
                    async def do_abort():
                        await self._mount.abort_slew()
                    self._run_async(do_abort())
                    return {"success": True, "message": "Slew aborted"}
                return {"success": False, "error": "Stop GOTO not supported for this protocol"}

            from scopinator.seestar.commands.parameterized import (
                IscopeStopView,
                StopStage,
            )

            async def do_stop_goto():
                client = self._backend.client
                command = IscopeStopView(params={"stage": StopStage.AUTO_GOTO})
                return await client.send_and_recv(command)

            response = self._run_async(do_stop_goto())
            return {
                "success": True,
                "message": "GOTO stopped",
                "response": response.model_dump() if hasattr(response, 'model_dump') else str(response)
            }

        except Exception as e:
            logging.error(f"Stop GOTO failed: {e}")
            return {"success": False, "error": str(e)}

    def get_stacking_status(self) -> dict[str, Any]:
        """Get current stacking status from the telescope."""
        try:
            if not self._backend:
                return {
                    "success": True,
                    "is_stacking": False,
                    "stacked_frames": 0,
                    "total_exposure_ms": 0,
                    "target_name": None,
                }

            if self.protocol == Protocol.SEESTAR:
                client = self._backend.client
                if client and hasattr(client, 'status') and client.status:
                    status = client.status
                    is_stacking = getattr(status, 'stage', 'Idle') == 'Stack'
                    stacked_frame = getattr(status, 'stacked_frame', 0) or 0
                    # Seestar uses 10-second exposures by default when stacking
                    total_exposure = stacked_frame * 10000
                    return {
                        "success": True,
                        "is_stacking": is_stacking,
                        "stacked_frames": stacked_frame,
                        "total_exposure_ms": total_exposure,
                        "target_name": getattr(status, 'target_name', None),
                        "stage": getattr(status, 'stage', 'Idle'),
                    }

            return {
                "success": True,
                "is_stacking": False,
                "stacked_frames": 0,
                "total_exposure_ms": 0,
                "target_name": None,
            }

        except Exception as e:
            logging.error(f"Get stacking status failed: {e}")
            return {"success": False, "error": str(e)}

    def save_current_image(self, file_path: str, format: str = "png") -> dict[str, Any]:
        """Save the current frame to a file.

        Args:
            file_path: Path to save the image to
            format: Image format (png, jpg, fits)
        """
        try:
            frame_bytes = self.get_next_frame()
            if frame_bytes is None:
                return {"success": False, "error": "No frame available"}

            # If the requested format is the same as what we have (JPEG), just save
            if format.lower() in ('jpg', 'jpeg'):
                with open(file_path, 'wb') as f:
                    f.write(frame_bytes)
                return {
                    "success": True,
                    "message": f"Image saved to {file_path}",
                    "path": file_path,
                }

            # Otherwise, convert using PIL
            img = Image.open(io.BytesIO(frame_bytes))

            if format.lower() == 'png':
                img.save(file_path, format='PNG')
            elif format.lower() == 'fits':
                # For FITS, need to use astropy or similar
                try:
                    import numpy as np
                    from astropy.io import fits as pyfits

                    # Convert to numpy array
                    img_array = np.array(img)

                    # Create FITS HDU
                    hdu = pyfits.PrimaryHDU(img_array)
                    hdu.header['DATE'] = datetime.now().isoformat()
                    hdu.header['INSTRUME'] = 'Seestar' if self.protocol == Protocol.SEESTAR else 'Alpaca'

                    # Write to file
                    hdu.writeto(file_path, overwrite=True)
                except ImportError:
                    # If astropy not available, save as PNG instead
                    file_path = file_path.replace('.fits', '.png')
                    img.save(file_path, format='PNG')
                    return {
                        "success": True,
                        "message": f"FITS not available, saved as PNG to {file_path}",
                        "path": file_path,
                    }
            else:
                img.save(file_path)

            return {
                "success": True,
                "message": f"Image saved to {file_path}",
                "path": file_path,
            }

        except Exception as e:
            logging.error(f"Save image failed: {e}")
            return {"success": False, "error": str(e)}

    def get_next_frame(self) -> Optional[bytes]:
        """Get the next video frame from the telescope.

        For Seestar: Uses the streaming imaging client.
        For Alpaca: Takes a short exposure from the camera.
        """
        try:
            import numpy as np

            if self.protocol == Protocol.SEESTAR:
                # Use Seestar imaging client for streaming
                if not self._imaging_client:
                    return None

                async def fetch_one_frame():
                    async for image in self._imaging_client.get_next_image(camera_id=0):
                        if image is not None and image.image is not None:
                            return image
                    return None

                scope_image = self._run_async(fetch_one_frame(), timeout=10.0)

                if scope_image is None or scope_image.image is None:
                    return None

                frame = scope_image.image
                if frame.dtype == np.uint16:
                    frame = (frame / 256).astype(np.uint8)

                img = Image.fromarray(frame)
                buffer = io.BytesIO()
                img.save(buffer, format='JPEG', quality=85)
                return buffer.getvalue()

            elif self.protocol == Protocol.ALPACA:
                # Use Alpaca camera for exposures
                if not self._camera:
                    logging.debug("No Alpaca camera available for frame capture")
                    return None

                async def capture_alpaca_frame():
                    from scopinator.v2.core.types import ExposureSettings

                    # Check if an image is already ready (from a previous exposure)
                    try:
                        if await self._camera.is_image_ready():
                            image_data = await self._camera.get_image()
                            return image_data
                    except Exception:
                        pass

                    # Start a short exposure (0.5 seconds for live view)
                    settings = ExposureSettings(
                        duration_seconds=0.5,
                        light=True,
                        bin_x=1,
                        bin_y=1,
                    )

                    try:
                        await self._camera.start_exposure(settings)
                    except Exception as e:
                        logging.debug(f"Failed to start Alpaca exposure: {e}")
                        return None

                    # Wait for exposure to complete
                    for _ in range(60):  # Max 6 seconds wait
                        await asyncio.sleep(0.1)
                        try:
                            if await self._camera.is_image_ready():
                                image_data = await self._camera.get_image()
                                return image_data
                        except Exception:
                            continue

                    logging.warning("Alpaca exposure timed out")
                    return None

                image_data = self._run_async(capture_alpaca_frame(), timeout=10.0)

                if image_data is None or not image_data.data:
                    return None

                # Convert image data to JPEG
                # The image data is typically 16-bit pixel values
                width = image_data.width
                height = image_data.height
                data = image_data.data

                if len(data) > 0:
                    # Unpack the 16-bit data
                    import struct
                    try:
                        num_pixels = width * height
                        pixels = struct.unpack(f">{num_pixels}H", data)
                        frame = np.array(pixels, dtype=np.uint16).reshape((height, width))
                        # Convert to 8-bit for JPEG
                        frame = (frame / 256).astype(np.uint8)
                        img = Image.fromarray(frame, mode='L')  # Grayscale
                        buffer = io.BytesIO()
                        img.save(buffer, format='JPEG', quality=85)
                        return buffer.getvalue()
                    except Exception as e:
                        logging.error(f"Failed to process Alpaca image: {e}")
                        return None

                return None

            return None

        except Exception as e:
            logging.error(f"Failed to get frame: {e}")
            return None


def create_bridge(host: str, port: int, protocol: str = "seestar") -> UnifiedTelescopeBridge:
    """Factory function to create a telescope bridge instance.

    Called by Rust code via PyO3.
    """
    return UnifiedTelescopeBridge(host, port, protocol)


def run_bridge_method(
    bridge: UnifiedTelescopeBridge,
    method_name: str,
    args: Optional[dict[str, Any]] = None
) -> dict[str, Any]:
    """Call a method on the telescope bridge.

    Called by Rust code via PyO3.
    """
    try:
        if args is None:
            args = {}

        method = getattr(bridge, method_name, None)
        if method is None:
            return {
                "success": False,
                "error": f"Unknown method: {method_name}"
            }

        return method(**args)

    except Exception as e:
        logging.error(f"Error calling bridge method {method_name}: {e}")
        return {
            "success": False,
            "error": str(e)
        }


def _run_async(
    bridge: UnifiedTelescopeBridge,
    method_name: str,
    args: Optional[dict[str, Any]] = None
) -> Any:
    """Helper function to run methods on the telescope bridge.

    Called by Rust code via PyO3.
    """
    try:
        if args is None:
            args = {}

        method = getattr(bridge, method_name, None)
        if method is None:
            raise AttributeError(f"Bridge has no method '{method_name}'")

        return method(**args)

    except Exception as e:
        logging.error(f"Error running method {method_name}: {e}")
        raise
