"""Test telescope models for development and testing."""

import logging
from typing import Optional
import cv2
from pydantic import BaseModel
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from smarttel.seestar.client import EventBus


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
    def location(self) -> Optional[str]:
        """Return the location for the test telescope (synchronous)."""
        return self._location or "Test Lab"
    
    async def get_location(self) -> Optional[str]:
        """Return the location for the test telescope (async for compatibility)."""
        return self._location or "Test Lab"
    
    def __repr__(self):
        """Custom repr to avoid issues with properties."""
        return f"TestTelescope(host={self.host!r}, port={self.port!r}, serial_number={self.serial_number!r})"

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