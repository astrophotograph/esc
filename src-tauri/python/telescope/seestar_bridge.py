"""
Seestar telescope bridge - provides interface to Seestar telescopes using scopinator library.

Uses a dedicated background thread with a running event loop to handle async operations
properly and allow event processing (for RA/Dec updates, etc.).
"""
import logging
import asyncio
import io
import threading
import concurrent.futures
from typing import Dict, Any, Optional

# Try to import scopinator, fall back to mock if not available
try:
    from scopinator.seestar.client import SeestarClient, EventBus
    from scopinator.seestar.commands.discovery import discover_seestars
    from scopinator.seestar.rtspclient import RtspClient
    from PIL import Image
    SCOPINATOR_AVAILABLE = True
except ImportError:
    SCOPINATOR_AVAILABLE = False
    logging.warning("scopinator not available, using mock implementation")


class TelescopeBridge:
    """Bridge for communicating with Seestar telescopes.

    Uses a dedicated background thread with a running event loop to handle
    async operations without blocking and to allow event processing.
    """

    def __init__(self, host: str, port: int):
        """
        Initialize telescope bridge.

        Args:
            host: Telescope IP address
            port: Telescope port number
        """
        self.host = host
        self.port = port
        self.client: Optional[Any] = None  # SeestarClient for control
        self.imaging_client: Optional[Any] = None  # SeestarImagingClient for images
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._thread: Optional[threading.Thread] = None
        self._rtsp_camera_id = 0  # Default to main camera
        self._imaging_port = 4800  # Default imaging port
        self._lock = threading.Lock()  # Protect concurrent access

    def _start_event_loop_thread(self):
        """Start a background thread with a running event loop."""
        if self._thread is not None and self._thread.is_alive():
            return  # Already running

        def run_loop():
            """Run the event loop in the background thread."""
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
        for _ in range(100):  # Wait up to 1 second
            if self._loop is not None:
                break
            import time
            time.sleep(0.01)

    def _run_async(self, coro, timeout: float = 30.0):
        """Run an async coroutine in the background event loop thread.

        Args:
            coro: The coroutine to run
            timeout: Timeout in seconds

        Returns:
            The result of the coroutine
        """
        if self._loop is None:
            raise RuntimeError("Event loop not started")

        future = asyncio.run_coroutine_threadsafe(coro, self._loop)
        try:
            return future.result(timeout=timeout)
        except concurrent.futures.TimeoutError:
            future.cancel()
            raise TimeoutError(f"Async operation timed out after {timeout}s")

    def connect(self) -> Dict[str, Any]:
        """
        Connect to the telescope.

        Returns:
            Dict with success status and any error message
        """
        try:
            if SCOPINATOR_AVAILABLE:
                # Start the background event loop thread
                self._start_event_loop_thread()

                # Create event bus and clients
                event_bus = EventBus()

                # Control client for telescope commands
                self.client = SeestarClient(self.host, self.port, event_bus)
                self._run_async(self.client.connect())

                # Import SeestarImagingClient here
                from scopinator.seestar.imaging_client import SeestarImagingClient

                # Imaging client for video frames
                self.imaging_client = SeestarImagingClient(
                    self.host,
                    self._imaging_port,
                    event_bus
                )
                self._run_async(self.imaging_client.connect())

                # Start streaming to receive images
                # This puts the telescope in ContinuousExposure mode and starts sending frames
                self._run_async(self.imaging_client.start_streaming())
                logging.info(f"Started streaming for telescope at {self.host}:{self.port}")

                return {
                    "success": True,
                    "message": f"Connected to telescope at {self.host}:{self.port}"
                }
            else:
                # Mock connection for development
                logging.info(f"[MOCK] Connecting to telescope at {self.host}:{self.port}")
                return {
                    "success": True,
                    "message": f"[MOCK] Connected to telescope at {self.host}:{self.port}"
                }

        except Exception as e:
            logging.error(f"Failed to connect to telescope: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    def disconnect(self) -> Dict[str, Any]:
        """
        Disconnect from the telescope.

        Returns:
            Dict with success status
        """
        try:
            # Disconnect imaging client
            if self.imaging_client and SCOPINATOR_AVAILABLE and self._loop:
                try:
                    self._run_async(self.imaging_client.stop_streaming(), timeout=5.0)
                except Exception as e:
                    logging.warning(f"Error stopping streaming: {e}")
                try:
                    self._run_async(self.imaging_client.disconnect(), timeout=5.0)
                except Exception as e:
                    logging.warning(f"Error disconnecting imaging client: {e}")
                self.imaging_client = None

            # Disconnect main client
            if self.client and SCOPINATOR_AVAILABLE and self._loop:
                try:
                    self._run_async(self.client.disconnect(), timeout=5.0)
                except Exception as e:
                    logging.warning(f"Error disconnecting client: {e}")
                self.client = None

            # Stop the event loop
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

    def goto_target(self, target_name: str, ra: float, dec: float) -> Dict[str, Any]:
        """
        Slew telescope to target coordinates.

        Args:
            target_name: Name of the target
            ra: Right ascension in hours (0-24)
            dec: Declination in degrees (-90 to +90)

        Returns:
            Dict with success status
        """
        try:
            if self.client and SCOPINATOR_AVAILABLE:
                # Convert RA from hours to degrees
                ra_degrees = ra * 15.0

                # Send GOTO command (implementation depends on scopinator API)
                logging.info(f"GOTO {target_name}: RA={ra}h ({ra_degrees}°), Dec={dec}°")

                # TODO: Implement actual GOTO command when scopinator API is confirmed
                return {
                    "success": True,
                    "message": f"Slewing to {target_name}"
                }
            else:
                logging.info(f"[MOCK] GOTO {target_name}: RA={ra}h, Dec={dec}°")
                return {
                    "success": True,
                    "message": f"[MOCK] Slewing to {target_name}"
                }

        except Exception as e:
            logging.error(f"GOTO command failed: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    def park(self) -> Dict[str, Any]:
        """
        Park the telescope.

        Returns:
            Dict with success status
        """
        try:
            if self.client and SCOPINATOR_AVAILABLE:
                logging.info("Parking telescope")
                # TODO: Implement park command
                return {
                    "success": True,
                    "message": "Telescope parked"
                }
            else:
                logging.info("[MOCK] Parking telescope")
                return {
                    "success": True,
                    "message": "[MOCK] Telescope parked"
                }

        except Exception as e:
            logging.error(f"Park command failed: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    def get_status(self) -> Dict[str, Any]:
        """
        Get current telescope status.

        Returns:
            Dict with telescope status information in format expected by Rust
        """
        try:
            if self.client and SCOPINATOR_AVAILABLE:
                # Explicitly fetch current coordinates from telescope
                # This is needed because ScopeSpeedMove (manual movement) doesn't trigger
                # ScopeGoto events that would otherwise update RA/Dec
                if self._loop is not None:
                    try:
                        self._run_async(self.client.update_current_coords(), timeout=5.0)
                    except Exception as e:
                        logging.debug(f"Failed to update coordinates: {e}")

                # Get actual status from telescope client
                status = self.client.status if hasattr(self.client, 'status') else None

                # Determine is_goto and is_tracking from stage
                stage = status.stage if status and hasattr(status, 'stage') else None
                is_goto = stage == "AutoGoto" if stage else False
                is_tracking = stage in ("Stack", "ContinuousExposure") if stage else False

                # Extract balance sensor data if available
                balance_sensor = None
                if status and hasattr(status, 'balance_sensor') and status.balance_sensor:
                    bs = status.balance_sensor
                    if hasattr(bs, 'data') and bs.data:
                        balance_sensor = {
                            "x": bs.data.x if hasattr(bs.data, 'x') else None,
                            "y": bs.data.y if hasattr(bs.data, 'y') else None,
                            "z": bs.data.z if hasattr(bs.data, 'z') else None,
                            "angle": bs.data.angle if hasattr(bs.data, 'angle') else None,
                        }

                state = {
                    "battery": status.battery_capacity if status and hasattr(status, 'battery_capacity') else None,
                    "cur_temp": status.temp if status and hasattr(status, 'temp') else None,
                    "cur_hum": None,  # Not available in basic status
                    "dew_heater_power": None,  # Not available in basic status
                    "ra": status.ra if status and hasattr(status, 'ra') else None,
                    "dec": status.dec if status and hasattr(status, 'dec') else None,
                    "is_goto": is_goto,
                    "is_tracking": is_tracking,
                    "view": stage or "Idle",
                    "gain": status.gain if status and hasattr(status, 'gain') else None,
                    "focus_position": status.focus_position if status and hasattr(status, 'focus_position') else None,
                    "stacked_frame": status.stacked_frame if status and hasattr(status, 'stacked_frame') else None,
                    "target_name": status.target_name if status and hasattr(status, 'target_name') else None,
                    "free_mb": status.freeMB if status and hasattr(status, 'freeMB') else None,
                    "total_mb": status.totalMB if status and hasattr(status, 'totalMB') else None,
                    "balance_sensor": balance_sensor,
                }

                return {
                    "success": True,
                    "state": state
                }
            else:
                # Mock/disconnected state
                return {
                    "success": True,
                    "state": {
                        "battery": None,
                        "cur_temp": None,
                        "cur_hum": None,
                        "dew_heater_power": None,
                        "ra": None,
                        "balance_sensor": None,
                        "dec": None,
                        "is_goto": False,
                        "is_tracking": False,
                        "view": "Idle",
                        "gain": None,
                        "focus_position": None,
                        "stacked_frame": None,
                        "target_name": None,
                        "free_mb": None,
                        "total_mb": None,
                    }
                }

        except Exception as e:
            logging.error(f"Failed to get telescope status: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    def move(self, direction: str = "n", speed: float = 1.0, duration_sec: float = 5.0) -> Dict[str, Any]:
        """
        Move the telescope in a direction.

        Args:
            direction: Direction string ("n", "s", "e", "w", "north", "south", "east", "west", "stop")
            speed: Speed multiplier (0.0-1.0), maps to percent 0-100
            duration_sec: Duration of movement in seconds

        Returns:
            Dict with success status
        """
        try:
            if self.client and SCOPINATOR_AVAILABLE:
                from scopinator.seestar.commands.parameterized import (
                    ScopeSpeedMove,
                    ScopeSpeedMoveParameters,
                )

                # Map direction strings to angles in degrees
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
                    level=2,  # Medium speed level
                    dur_sec=int(duration_sec) if not is_stop else 1,
                    percent=int(speed * 100) if not is_stop else 0,  # 0 percent means stop
                )

                # Run the async command in the background thread
                async def do_move():
                    return await self.client.send_and_recv(ScopeSpeedMove(params=move_params))

                response = self._run_async(do_move())

                return {
                    "success": True,
                    "response": response.model_dump() if response and hasattr(response, 'model_dump') else str(response)
                }
            else:
                logging.info(f"[MOCK] Moving telescope: direction={direction}, speed={speed}")
                return {
                    "success": True,
                    "message": f"[MOCK] Moving {direction}"
                }

        except Exception as e:
            logging.error(f"Move command failed: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    def stop_move(self) -> Dict[str, Any]:
        """
        Stop any ongoing telescope movement.

        Returns:
            Dict with success status
        """
        return self.move(direction="stop", speed=0, duration_sec=1)

    def get_next_frame(self) -> Optional[bytes]:
        """
        Get the next video frame from the telescope.
        Uses the imaging client's get_next_image async generator.

        Returns:
            JPEG frame bytes, or None if no frame available
        """
        try:
            if not SCOPINATOR_AVAILABLE:
                return None

            if not self.imaging_client:
                return None

            if self._loop is None:
                return None

            # Use the async generator to get the next image
            async def fetch_one_frame():
                async for image in self.imaging_client.get_next_image(camera_id=0):
                    if image is not None and image.image is not None:
                        return image
                return None

            scope_image = self._run_async(fetch_one_frame(), timeout=10.0)

            if scope_image is None or scope_image.image is None:
                return None

            # Get the numpy array from the ScopeImage
            frame = scope_image.image  # numpy array (RGB)

            # Convert from uint16 to uint8 if needed
            import numpy as np
            if frame.dtype == np.uint16:
                frame = (frame / 256).astype(np.uint8)

            # Convert numpy array to JPEG bytes
            img = Image.fromarray(frame)
            buffer = io.BytesIO()
            img.save(buffer, format='JPEG', quality=85)
            jpeg_bytes = buffer.getvalue()

            return jpeg_bytes

        except Exception as e:
            logging.error(f"Failed to get frame: {e}")
            return None


async def discover_telescopes() -> list[Dict[str, Any]]:
    """
    Discover Seestar telescopes on the network.

    Returns:
        List of discovered telescopes with their details
    """
    try:
        if SCOPINATOR_AVAILABLE:
            devices = await discover_seestars(timeout=3.0)
            result = []
            for device in devices:
                if isinstance(device, dict):
                    host = device.get("address", "")
                    if not host:
                        continue
                    data = device.get("data", {})
                    device_info = data.get("result", {})
                    result.append({
                        "host": host,
                        "port": 4700,
                        "serial_number": device_info.get("sn", ""),
                        "product_model": device_info.get("product_model", "Seestar"),
                    })
                else:
                    result.append({
                        "host": device.host,
                        "port": device.port,
                        "serial_number": device.device_name,
                        "product_model": "Seestar S50"
                    })
            return result
        else:
            logging.info("[MOCK] Discovering telescopes")
            return [
                {
                    "host": "192.168.1.100",
                    "port": 4700,
                    "serial_number": "MOCK123456",
                    "product_model": "Seestar S50 (Mock)"
                }
            ]
    except Exception as e:
        logging.error(f"Discovery failed: {e}")
        return []


def create_bridge(host: str, port: int) -> TelescopeBridge:
    """
    Factory function to create a telescope bridge instance.
    Called by Rust code via PyO3.
    """
    return TelescopeBridge(host, port)


def run_bridge_method(bridge: TelescopeBridge, method_name: str, args: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Call a method on the telescope bridge.
    Called by Rust code via PyO3.
    """
    try:
        if args is None:
            args = {}

        method_map = {
            "connect": bridge.connect,
            "disconnect": bridge.disconnect,
            "goto_target": bridge.goto_target,
            "park": bridge.park,
            "get_status": bridge.get_status,
        }

        method = method_map.get(method_name)
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


def _run_async(bridge: TelescopeBridge, method_name: str, args: Optional[Dict[str, Any]] = None) -> Any:
    """
    Helper function to run methods on the telescope bridge.
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
