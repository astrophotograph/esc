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
import sys
import asyncio

# Configure logging to output to stderr so it's visible in Tauri
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    datefmt="%H:%M:%S",
    stream=sys.stderr,
    force=True,  # Override any existing config
)
logger = logging.getLogger(__name__)
import io
import threading
import concurrent.futures
from datetime import datetime
from typing import Any, Optional
from enum import Enum

import time

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

        # Status caching to reduce Alpaca API calls
        self._status_cache: Optional[dict[str, Any]] = None
        self._status_cache_time: float = 0.0
        self._status_cache_ttl: float = 1.0  # Cache status for 1 second

        # Track pending auto-stop task to cancel on new move/stop
        self._auto_stop_task: Optional[asyncio.Task] = None
        self._auto_stop_cancelled = False

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

            # Clear status cache
            self._status_cache = None
            self._status_cache_time = 0.0

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
        """Get current telescope status.

        Uses caching to reduce Alpaca API calls when multiple components
        poll status simultaneously.
        """
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

            # Check if we have a valid cached status (for Alpaca protocol)
            if self.protocol == Protocol.ALPACA:
                current_time = time.time()
                if (
                    self._status_cache is not None
                    and (current_time - self._status_cache_time) < self._status_cache_ttl
                ):
                    return self._status_cache

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
            result = {"success": True, "state": status}

            # Cache the result for Alpaca
            if self.protocol == Protocol.ALPACA:
                self._status_cache = result
                self._status_cache_time = time.time()

            return result

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
                # This follows the pattern from seestar-alpaca-demo: start movement immediately,
                # optionally schedule auto-stop in background task

                logging.info(f"Alpaca move: direction={direction}, speed={speed}, duration={duration_sec}")

                # Cancel any pending auto-stop task
                if self._auto_stop_task is not None:
                    self._auto_stop_task.cancel()
                    self._auto_stop_task = None
                    logging.debug("Alpaca move: cancelled pending auto-stop task")

                # Map direction to axis and rate
                # Axis 0 = RA, Axis 1 = Dec
                # Positive rate = one direction, negative = opposite
                dir_lower = direction.lower()

                # Move rate in degrees/second (adjustable via speed param)
                # Speed is expected on a 1-10 scale from the frontend
                # Map to rates: 2.5 deg/sec (slow) to 20.0 deg/sec (fast)
                min_rate = 2.5
                max_rate = 20.0
                # Clamp speed to 1-10 range and interpolate
                clamped_speed = max(1.0, min(10.0, speed))
                base_rate = min_rate + (clamped_speed - 1.0) * (max_rate - min_rate) / 9.0

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
                    logging.info("Alpaca move: stopping both axes")
                    async def do_stop():
                        if hasattr(self._mount, 'move_axis'):
                            await self._mount.move_axis(0, 0)
                            await self._mount.move_axis(1, 0)
                    self._run_async(do_stop())
                    return {"success": True, "message": "Movement stopped"}
                else:
                    axis, rate = 1, base_rate  # Default to north

                logging.info(f"Alpaca move: axis={axis}, rate={base_rate:.2f} deg/sec")

                if hasattr(self._mount, 'move_axis'):
                    # Start movement immediately (non-blocking)
                    async def start_move():
                        try:
                            await self._mount.move_axis(axis, rate)
                        except Exception as e:
                            logging.error(f"Alpaca move: move_axis failed: {e}")
                            raise
                    self._run_async(start_move())

                    # Schedule auto-stop in background if duration specified
                    if duration_sec > 0 and self._loop:
                        async def auto_stop(stop_axis: int, stop_duration: float):
                            try:
                                await asyncio.sleep(stop_duration)
                                # Only stop if mount still exists and is connected
                                if self._mount and hasattr(self._mount, 'move_axis'):
                                    await self._mount.move_axis(stop_axis, 0)
                                    logging.info(f"Auto-stopped axis {stop_axis} after {stop_duration}s")
                            except asyncio.CancelledError:
                                logging.debug(f"Auto-stop cancelled for axis {stop_axis}")
                            except Exception as e:
                                logging.warning(f"Failed to auto-stop: {e}")

                        # Create task and store reference for cancellation
                        future = asyncio.run_coroutine_threadsafe(
                            auto_stop(axis, duration_sec), self._loop
                        )
                        # Wrap in a task-like object we can cancel
                        self._auto_stop_task = future
                else:
                    logging.warning(f"Alpaca move: mount has no move_axis method")

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

    def _add_timestamp(self, img: Image.Image) -> Image.Image:
        """Add a timestamp overlay to the image.

        Args:
            img: PIL Image (can be grayscale or RGB)

        Returns:
            Image with timestamp overlay (RGB format)
        """
        from PIL import ImageDraw, ImageFont

        # Convert to RGB for consistent drawing
        if img.mode != 'RGB':
            img = img.convert('RGB')

        # Get current timestamp
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        # Try to use a monospace font, fall back to alternatives
        # Use a reasonable fixed font size that works for most image sizes
        font_size = max(14, min(24, img.width // 50))
        font = None
        font_loaded_from = None

        # List of font paths to try (covers Debian, Ubuntu, Arch, Fedora, etc.)
        font_paths = [
            "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "/usr/share/fonts/TTF/DejaVuSansMono.ttf",
            "/usr/share/fonts/TTF/DejaVuSans.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
            "/usr/share/fonts/truetype/freefont/FreeMono.ttf",
            "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
            "/usr/share/fonts/dejavu-sans-mono-fonts/DejaVuSansMono.ttf",
            "/usr/share/fonts/dejavu-sans-fonts/DejaVuSans.ttf",
            "/usr/share/fonts/gnu-free/FreeSans.ttf",
            "/usr/share/fonts/liberation-mono/LiberationMono-Regular.ttf",
        ]

        for font_path in font_paths:
            try:
                font = ImageFont.truetype(font_path, font_size)
                font_loaded_from = font_path
                break
            except (OSError, IOError):
                continue

        if font is None:
            # Use default font
            try:
                font = ImageFont.load_default(size=font_size)
                font_loaded_from = "default (sized)"
            except TypeError:
                font = ImageFont.load_default()
                font_loaded_from = "default (basic)"

        logging.info(f"_add_timestamp: font loaded from: {font_loaded_from}")

        # Create a drawing context
        draw = ImageDraw.Draw(img)

        # Log image info for debugging
        logging.info(f"_add_timestamp: img size={img.size}, mode={img.mode}, font_size={font_size}")

        # Calculate text dimensions using getbbox on the font directly
        try:
            text_bbox = draw.textbbox((0, 0), timestamp, font=font)
            text_width = text_bbox[2] - text_bbox[0]
            text_height = text_bbox[3] - text_bbox[1]
            logging.info(f"_add_timestamp: textbbox={text_bbox}, width={text_width}, height={text_height}")
        except Exception as e:
            logging.warning(f"_add_timestamp: textbbox failed: {e}")
            # Fallback: estimate based on font size and character count
            text_width = len(timestamp) * (font_size * 0.6)
            text_height = font_size

        # Ensure minimum dimensions for the timestamp (19 chars: "2024-12-22 12:34:56")
        min_text_width = len(timestamp) * (font_size * 0.6)
        text_width = max(text_width, min_text_width)
        text_height = max(text_height, font_size + 4)

        # Position: bottom-left with padding
        padding = 8
        x = padding
        y = img.height - int(text_height) - padding - 4

        # Ensure y is not negative
        y = max(padding, y)

        logging.info(f"_add_timestamp: drawing at x={x}, y={y}, text='{timestamp}'")

        # Draw semi-transparent black background
        bg_padding = 4
        bg_bbox = (
            x - bg_padding,
            y - bg_padding,
            x + int(text_width) + bg_padding,
            y + int(text_height) + bg_padding
        )

        # Clamp background to image bounds
        bg_bbox = (
            max(0, bg_bbox[0]),
            max(0, bg_bbox[1]),
            min(img.width, bg_bbox[2]),
            min(img.height, bg_bbox[3])
        )

        # Draw dark background rectangle (solid, no alpha on RGB)
        draw.rectangle(bg_bbox, fill=(0, 0, 0))

        # Draw timestamp text in bright green
        draw.text((x, y), timestamp, fill=(0, 255, 0), font=font)

        return img

    def get_next_frame(self) -> Optional[bytes]:
        """Get the next video frame from the telescope.

        For Seestar: Uses the streaming imaging client.
        For Alpaca: Takes a short exposure from the camera.
        """
        import sys
        print(f"[Python] get_next_frame: CALLED, protocol={self.protocol}", file=sys.stderr, flush=True)
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

                # Add timestamp overlay
                img = self._add_timestamp(img)

                buffer = io.BytesIO()
                img.save(buffer, format='JPEG', quality=85)
                return buffer.getvalue()

            elif self.protocol == Protocol.ALPACA:
                # Use Alpaca camera for exposures
                import sys
                print("[Python] get_next_frame: Alpaca protocol, checking camera...", file=sys.stderr, flush=True)
                logging.info("get_next_frame: Alpaca protocol, checking camera...")
                if not self._camera:
                    print("[Python] get_next_frame: No Alpaca camera available!", file=sys.stderr, flush=True)
                    logging.warning("get_next_frame: No Alpaca camera available")
                    return None

                print("[Python] get_next_frame: Camera available, will capture frame", file=sys.stderr, flush=True)
                logging.info("get_next_frame: Camera available, defining capture function...")

                async def capture_alpaca_frame():
                    import time
                    from scopinator.v2.core.types import ExposureSettings

                    # Check if an image is already ready (from a previous exposure)
                    try:
                        print("[Python] capture_alpaca_frame: checking if image ready...", file=sys.stderr, flush=True)
                        if await self._camera.is_image_ready():
                            print("[Python] capture_alpaca_frame: image ready, starting download...", file=sys.stderr, flush=True)
                            logging.info("Alpaca: Image already ready, downloading...")
                            start_time = time.time()
                            image_data = await self._camera.get_image()
                            elapsed = time.time() - start_time
                            print(f"[Python] capture_alpaca_frame: download complete in {elapsed:.1f}s", file=sys.stderr, flush=True)
                            logging.info(f"Alpaca: Downloaded image {image_data.width}x{image_data.height}")
                            return image_data
                    except Exception as e:
                        print(f"[Python] capture_alpaca_frame: no existing image ready: {e}", file=sys.stderr, flush=True)
                        logging.debug(f"No existing image ready: {e}")

                    # Start a short exposure (0.5 seconds for live view)
                    # Note: Many cameras (including Seestar) don't support binning
                    settings = ExposureSettings(
                        duration_seconds=0.5,
                        light=True,
                        bin_x=1,
                        bin_y=1,
                    )

                    try:
                        logging.info("Alpaca: Starting 0.5s exposure...")
                        await self._camera.start_exposure(settings)
                    except Exception as e:
                        logging.warning(f"Failed to start Alpaca exposure: {e}")
                        return None

                    # Wait for exposure to complete (up to 15 seconds)
                    logging.info("Alpaca: Waiting for exposure to complete...")
                    for i in range(150):  # Max 15 seconds wait
                        await asyncio.sleep(0.1)
                        try:
                            if await self._camera.is_image_ready():
                                logging.info(f"Alpaca: Exposure complete after {i * 0.1:.1f}s, downloading image...")
                                image_data = await self._camera.get_image()
                                logging.info(f"Alpaca: Downloaded image {image_data.width}x{image_data.height}")
                                return image_data
                        except Exception as e:
                            if i % 50 == 49:  # Log every 5 seconds
                                logging.debug(f"Still waiting for image: {e}")
                            continue

                    logging.warning("Alpaca exposure timed out waiting for image ready")
                    return None

                # Timeout: 0.5s exposure + 15s wait + up to 60s download = ~75s max
                logging.info("get_next_frame: calling _run_async for capture_alpaca_frame...")
                image_data = self._run_async(capture_alpaca_frame(), timeout=90.0)
                logging.info(f"get_next_frame: _run_async returned, image_data={image_data is not None}")

                if image_data is None or not image_data.data:
                    logging.warning("Alpaca: No image data received")
                    return None

                # Convert image data to JPEG
                # The image data is typically 16-bit pixel values
                width = image_data.width
                height = image_data.height
                data = image_data.data

                logging.info(f"Alpaca: Processing {width}x{height} image ({len(data)} bytes)")

                if len(data) > 0:
                    # Unpack the 16-bit data
                    import struct
                    try:
                        num_pixels = width * height
                        expected_bytes = num_pixels * 2
                        if len(data) != expected_bytes:
                            logging.warning(f"Alpaca: Data size mismatch: got {len(data)}, expected {expected_bytes}")

                        pixels = struct.unpack(f">{num_pixels}H", data)
                        # Alpaca returns imagearray with width as first dimension
                        # So reshape as (width, height) then transpose to (height, width)
                        frame = np.array(pixels, dtype=np.uint16).reshape((width, height)).T

                        logging.info(f"Alpaca: Frame shape after transpose: {frame.shape} (height, width)")

                        # Auto-stretch for better display
                        min_val = np.percentile(frame, 1)
                        max_val = np.percentile(frame, 99)
                        if max_val > min_val:
                            frame = ((frame - min_val) / (max_val - min_val) * 255).clip(0, 255).astype(np.uint8)
                        else:
                            frame = (frame / 256).astype(np.uint8)

                        img = Image.fromarray(frame, mode='L')  # Grayscale
                        logging.info(f"Alpaca: PIL image created: size={img.size} (width, height), mode={img.mode}")

                        # Add timestamp overlay
                        img = self._add_timestamp(img)

                        buffer = io.BytesIO()
                        img.save(buffer, format='JPEG', quality=85)
                        logging.info(f"Alpaca: Final JPEG image {img.size[0]}x{img.size[1]}, {len(buffer.getvalue())} bytes")
                        return buffer.getvalue()
                    except Exception as e:
                        logging.error(f"Failed to process Alpaca image: {e}", exc_info=True)
                        return None

                return None

            return None

        except Exception as e:
            logging.error(f"Failed to get frame: {e}")
            return None


def generate_placeholder_image(width: int = 640, height: int = 480, message: str = "Stream Starting...") -> bytes:
    """Generate a placeholder image with a message.

    Called by Rust code via PyO3 for the initial stream frame.
    """
    from PIL import Image, ImageDraw, ImageFont

    # Create a dark blue background
    img = Image.new('RGB', (width, height), (10, 20, 40))
    draw = ImageDraw.Draw(img)

    # Draw a subtle grid pattern
    grid_color = (20, 35, 60)
    for gx in range(0, width, 40):
        draw.line([(gx, 0), (gx, height)], fill=grid_color, width=1)
    for gy in range(0, height, 40):
        draw.line([(0, gy), (width, gy)], fill=grid_color, width=1)

    # Draw crosshairs in center
    cx, cy = width // 2, height // 2
    crosshair_color = (60, 80, 120)
    draw.line([(cx - 30, cy), (cx + 30, cy)], fill=crosshair_color, width=2)
    draw.line([(cx, cy - 30), (cx, cy + 30)], fill=crosshair_color, width=2)
    draw.ellipse([(cx - 20, cy - 20), (cx + 20, cy + 20)], outline=crosshair_color, width=2)

    # Try to load a font - use larger size for placeholder
    font_size = max(24, width // 20)
    font = None
    font_paths = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
        "/usr/share/fonts/TTF/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
    ]

    for font_path in font_paths:
        try:
            font = ImageFont.truetype(font_path, font_size)
            logging.info(f"generate_placeholder: loaded font from {font_path}")
            break
        except (OSError, IOError):
            continue

    if font is None:
        try:
            font = ImageFont.load_default(size=font_size)
            logging.info(f"generate_placeholder: using default font (sized)")
        except TypeError:
            font = ImageFont.load_default()
            logging.info(f"generate_placeholder: using default font (basic)")

    # Calculate text dimensions - ensure we get reasonable values
    try:
        text_bbox = draw.textbbox((0, 0), message, font=font)
        text_width = text_bbox[2] - text_bbox[0]
        text_height = text_bbox[3] - text_bbox[1]
    except Exception:
        # Fallback estimation
        text_width = len(message) * (font_size * 0.6)
        text_height = font_size

    # Ensure minimum dimensions
    text_width = max(text_width, len(message) * 10)
    text_height = max(text_height, font_size)

    # Center the text
    text_x = (width - int(text_width)) // 2
    text_y = (height - int(text_height)) // 2 + 50  # Below center

    logging.info(f"generate_placeholder: text='{message}', pos=({text_x}, {text_y}), size=({text_width}, {text_height})")

    # Draw text shadow
    draw.text((text_x + 2, text_y + 2), message, fill=(0, 0, 0), font=font)
    # Draw main text in light blue
    draw.text((text_x, text_y), message, fill=(100, 150, 255), font=font)

    # Draw a subtle border
    border_color = (40, 60, 100)
    draw.rectangle([(0, 0), (width - 1, height - 1)], outline=border_color, width=2)

    # Convert to JPEG bytes
    buffer = io.BytesIO()
    img.save(buffer, format='JPEG', quality=85)
    return buffer.getvalue()


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
    # Only log non-frequent methods to reduce noise
    verbose = method_name not in ('get_status', 'get_next_frame')

    if verbose:
        logging.info(f"_run_async: called with method '{method_name}'")

    try:
        if args is None:
            args = {}

        method = getattr(bridge, method_name, None)
        if method is None:
            raise AttributeError(f"Bridge has no method '{method_name}'")

        result = method(**args)

        if verbose:
            logging.info(f"_run_async: method '{method_name}' returned")

        return result

    except Exception as e:
        logging.error(f"Error running method {method_name}: {e}")
        raise
