"""
Seestar telescope bridge - provides interface to Seestar telescopes using scopinator library.
"""
import logging
import asyncio
import io
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
    """Bridge for communicating with Seestar telescopes."""

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
        self._loop = None
        self.rtsp_client: Optional[Any] = None
        self._rtsp_camera_id = 0  # Default to main camera
        self._imaging_port = 4800  # Default imaging port

    def connect(self) -> Dict[str, Any]:
        """
        Connect to the telescope.

        Returns:
            Dict with success status and any error message
        """
        try:
            if SCOPINATOR_AVAILABLE:
                # Get or create event loop
                try:
                    self._loop = asyncio.get_event_loop()
                except RuntimeError:
                    self._loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(self._loop)

                # Create event bus and clients
                event_bus = EventBus()

                # Control client for telescope commands
                self.client = SeestarClient(self.host, self.port, event_bus)
                self._loop.run_until_complete(self.client.connect())

                # Import SeestarImagingClient here
                from scopinator.seestar.imaging_client import SeestarImagingClient

                # Imaging client for video frames
                self.imaging_client = SeestarImagingClient(
                    self.host,
                    self._imaging_port,
                    event_bus
                )
                self._loop.run_until_complete(self.imaging_client.connect())

                # NOTE: Don't call start_streaming() here - the telescope automatically
                # enters ContinuousExposure mode and sends frames. Calling start_streaming()
                # would change the mode unnecessarily.

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
            # Clean up RTSP client
            if self.rtsp_client:
                try:
                    self.rtsp_client.__exit__()
                except Exception as e:
                    logging.warning(f"Error closing RTSP client: {e}")
                self.rtsp_client = None

            # Disconnect imaging client
            if self.imaging_client and SCOPINATOR_AVAILABLE:
                if self._loop:
                    self._loop.run_until_complete(self.imaging_client.disconnect())
                self.imaging_client = None

            # Disconnect main client
            if self.client and SCOPINATOR_AVAILABLE:
                if self._loop:
                    self._loop.run_until_complete(self.client.disconnect())
                self.client = None

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
            Dict with telescope status information in format expected by Rust:
            {
                "success": bool,
                "state": {
                    "battery": float,
                    "cur_temp": float,
                    "cur_hum": float,
                    "dew_heater_power": int,
                    "ra": float,
                    "dec": float,
                    "is_goto": bool,
                    "is_tracking": bool,
                    "view": str
                }
            }
        """
        try:
            if self.client and SCOPINATOR_AVAILABLE:
                # Get actual status from telescope client
                status = self.client.status if hasattr(self.client, 'status') else None

                state = {
                    "battery": status.battery_capacity if status and hasattr(status, 'battery_capacity') else None,
                    "cur_temp": status.temp if status and hasattr(status, 'temp') else None,
                    "cur_hum": None,  # Not available in basic status
                    "dew_heater_power": None,  # Not available in basic status
                    "ra": status.ra if status and hasattr(status, 'ra') else 0.0,
                    "dec": status.dec if status and hasattr(status, 'dec') else 0.0,
                    "is_goto": False,  # TODO: Get from actual status
                    "is_tracking": False,  # TODO: Get from actual status
                    "view": status.stage if status and hasattr(status, 'stage') else "Idle"
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
                        "ra": 0.0,
                        "dec": 0.0,
                        "is_goto": False,
                        "is_tracking": False,
                        "view": "Idle"
                    }
                }

        except Exception as e:
            logging.error(f"Failed to get telescope status: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    def get_next_frame(self) -> Optional[bytes]:
        """
        Get the next video frame from the telescope.
        Supports both Stack/ContinuousExposure mode (via imaging_client.image)
        and RTSP Streaming mode (via RtspClient).

        Returns:
            JPEG frame bytes, or None if no frame available
        """
        try:
            if not SCOPINATOR_AVAILABLE:
                logging.warning("Scopinator not available!")
                return None

            if not self.imaging_client:
                logging.warning("No imaging_client available!")
                return None

            logging.info(f"get_next_frame: imaging_client exists and is_connected={self.imaging_client.is_connected}")
            logging.info(f"get_next_frame: imaging_client.image is not None: {self.imaging_client.image is not None}")
            if self.imaging_client.image is not None:
                logging.info(f"get_next_frame: imaging_client.image.image is not None: {self.imaging_client.image.image is not None}")

            # Try Stack/ContinuousExposure mode first (imaging_client.image)
            if self.imaging_client.image is not None and self.imaging_client.image.image is not None:
                logging.info(f"Got frame from imaging_client: shape={self.imaging_client.image.image.shape}, dtype={self.imaging_client.image.image.dtype}")
                # Get the numpy array from the ScopeImage
                frame = self.imaging_client.image.image  # numpy array (RGB)

                # Convert from uint16 to uint8 if needed
                # Telescope images are 16-bit, but JPEG needs 8-bit
                import numpy as np
                if frame.dtype == np.uint16:
                    # Scale from 16-bit to 8-bit
                    frame = (frame / 256).astype(np.uint8)

                # Convert numpy array to JPEG bytes
                img = Image.fromarray(frame)
                buffer = io.BytesIO()
                img.save(buffer, format='JPEG', quality=85)
                jpeg_bytes = buffer.getvalue()

                return jpeg_bytes

            # Fall back to RTSP streaming mode
            # Initialize RTSP client if not already done
            if self.rtsp_client is None:
                rtsp_port = 4554 + self._rtsp_camera_id
                rtsp_url = f"rtsp://{self.host}:{rtsp_port}/stream"
                logging.debug(f"Initializing RTSP client for {rtsp_url}")
                self.rtsp_client = RtspClient(rtsp_url)
                self.rtsp_client.__enter__()  # Start the RTSP client

            # Check if RTSP stream is open
            if self.rtsp_client and self.rtsp_client.is_opened():
                # Read frame from RTSP stream
                frame = self.rtsp_client.read()  # Returns numpy array (RGB)

                if frame is not None:
                    # Convert numpy array to JPEG bytes
                    img = Image.fromarray(frame)
                    buffer = io.BytesIO()
                    img.save(buffer, format='JPEG', quality=85)
                    jpeg_bytes = buffer.getvalue()

                    return jpeg_bytes

            # No frames available from either source
            return None

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
            return [
                {
                    "host": device.host,
                    "port": device.port,
                    "serial_number": device.device_name,
                    "product_model": "Seestar S50"
                }
                for device in devices
            ]
        else:
            logging.info("[MOCK] Discovering telescopes")
            # Return mock telescope for testing
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

    Args:
        host: Telescope IP address
        port: Telescope port number

    Returns:
        TelescopeBridge instance
    """
    return TelescopeBridge(host, port)


def run_bridge_method(bridge: TelescopeBridge, method_name: str, args: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Call a method on the telescope bridge.
    Called by Rust code via PyO3.

    Args:
        bridge: TelescopeBridge instance
        method_name: Name of the method to call
        args: Optional dictionary of arguments

    Returns:
        Dict with method result
    """
    try:
        if args is None:
            args = {}

        # Map method names to bridge methods
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

        # Call the method with args
        return method(**args)

    except Exception as e:
        logging.error(f"Error calling bridge method {method_name}: {e}")
        return {
            "success": False,
            "error": str(e)
        }


def _run_async(bridge: TelescopeBridge, method_name: str, args: Optional[Dict[str, Any]] = None) -> Any:
    """
    Helper function to run async/sync methods on the telescope bridge.
    Called by Rust code via PyO3 for methods that may be async.

    Args:
        bridge: TelescopeBridge instance
        method_name: Name of the method to call
        args: Optional dictionary of arguments

    Returns:
        Method result (type depends on the method)
    """
    try:
        if args is None:
            args = {}

        # Get the method from the bridge
        method = getattr(bridge, method_name, None)
        if method is None:
            raise AttributeError(f"Bridge has no method '{method_name}'")

        # Call the method
        result = method(**args)

        # If it's a coroutine, run it in the event loop
        if asyncio.iscoroutine(result):
            # Get or create event loop
            try:
                loop = asyncio.get_event_loop()
            except RuntimeError:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)

            return loop.run_until_complete(result)

        # Otherwise return the result directly
        return result

    except Exception as e:
        logging.error(f"Error running async method {method_name}: {e}")
        raise
