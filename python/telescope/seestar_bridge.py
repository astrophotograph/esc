"""Bridge to scopinator for Seestar telescope control.

This module provides a clean interface to the scopinator library
that can be easily called from Rust via PyO3.
"""

import asyncio
from typing import Any, Optional
from pydantic import BaseModel

from scopinator.seestar.client import SeestarClient, EventBus
from scopinator.seestar.imaging_client import SeestarImagingClient
from scopinator.seestar.commands import simple, goto, imaging
from scopinator.seestar.commands.parameterized import (
    ScopeSpeedMove,
    ScopeSpeedMoveParameters,
    MoveFocuser,
    MoveFocuserParameters,
)
from scopinator.seestar.events import DeviceStateEvent, ActionResultEvent


class TelescopeInfo(BaseModel):
    """Telescope connection information."""

    host: str
    port: int
    name: Optional[str] = None
    serial_number: Optional[str] = None
    model: Optional[str] = None


class GotoParameters(BaseModel):
    """Parameters for GOTO command."""

    target_name: str
    ra: float  # Right ascension in hours
    dec: float  # Declination in degrees


class ImagingParameters(BaseModel):
    """Parameters for imaging session."""

    exposure_ms: int = 10000
    gain: int = 80
    target_name: Optional[str] = None


class MoveParameters(BaseModel):
    """Parameters for telescope movement."""

    direction: str  # "n", "s", "e", "w", "ne", "nw", "se", "sw"
    speed: float = 1.0  # Speed multiplier (0.0-1.0)
    duration_sec: float = 5.0  # Duration of movement


class FocusParameters(BaseModel):
    """Parameters for focus control."""

    position: Optional[int] = None  # Absolute position
    increment: Optional[int] = None  # Relative increment


class SeestarBridge:
    """Bridge to scopinator for controlling Seestar telescopes."""

    def __init__(self, host: str, port: int = 4700, imaging_port: int = 554):
        """Initialize the bridge.

        Args:
            host: Telescope IP address
            port: Telescope port (default: 4700)
            imaging_port: Imaging/RTSP port (default: 554)
        """
        self.host = host
        self.port = port
        self.imaging_port = imaging_port
        self.event_bus = EventBus()
        self.client: Optional[SeestarClient] = None
        self.imaging_client: Optional[SeestarImagingClient] = None
        self._event_queue: list[dict[str, Any]] = []

        # Subscribe to events
        self.event_bus.subscribe(DeviceStateEvent, self._on_device_state)
        self.event_bus.subscribe(ActionResultEvent, self._on_action_result)

    def _on_device_state(self, event: DeviceStateEvent) -> None:
        """Handle device state events."""
        self._event_queue.append({
            "type": "device_state",
            "data": event.model_dump()
        })

    def _on_action_result(self, event: ActionResultEvent) -> None:
        """Handle action result events."""
        self._event_queue.append({
            "type": "action_result",
            "data": event.model_dump()
        })

    async def connect(self) -> dict[str, Any]:
        """Connect to the telescope.

        Returns:
            Connection status dict
        """
        try:
            self.client = SeestarClient(self.host, self.port, self.event_bus)
            await self.client.connect()

            # Also connect imaging client
            self.imaging_client = SeestarImagingClient(self.host, self.imaging_port, self.event_bus)
            await self.imaging_client.connect()

            # Get initial state
            response = await self.client.send_and_recv(simple.GetViewState())

            return {
                "success": True,
                "message": "Connected successfully (including imaging)",
                "state": response.model_dump() if response else None
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }

    async def disconnect(self) -> dict[str, Any]:
        """Disconnect from the telescope.

        Returns:
            Disconnection status dict
        """
        try:
            if self.imaging_client:
                await self.imaging_client.disconnect()
                self.imaging_client = None
            if self.client:
                await self.client.close()
                self.client = None
            return {
                "success": True,
                "message": "Disconnected successfully"
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }

    async def goto_target(self, params: dict[str, Any]) -> dict[str, Any]:
        """Point telescope at target coordinates.

        Args:
            params: GOTO parameters (target_name, ra, dec)

        Returns:
            Command response dict
        """
        if not self.client:
            return {"success": False, "error": "Not connected"}

        try:
            goto_params = goto.GotoTargetParameters(
                target_name=params["target_name"],
                ra_h=params["ra"],
                dec_deg=params["dec"]
            )

            response = await self.client.send_and_recv(
                goto.GotoTarget(params=goto_params)
            )

            return {
                "success": True,
                "response": response.model_dump() if response else None
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }

    async def park(self) -> dict[str, Any]:
        """Park the telescope.

        Returns:
            Command response dict
        """
        if not self.client:
            return {"success": False, "error": "Not connected"}

        try:
            response = await self.client.send_and_recv(simple.Park())
            return {
                "success": True,
                "response": response.model_dump() if response else None
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }

    async def start_imaging(self, params: dict[str, Any]) -> dict[str, Any]:
        """Start an imaging session.

        Args:
            params: Imaging parameters (exposure_ms, gain, target_name)

        Returns:
            Command response dict
        """
        if not self.client:
            return {"success": False, "error": "Not connected"}

        try:
            img_params = imaging.ImagingParameters(
                exposure_ms=params.get("exposure_ms", 10000),
                gain=params.get("gain", 80),
                target_name=params.get("target_name")
            )

            response = await self.client.send_and_recv(
                imaging.StartImaging(params=img_params)
            )

            return {
                "success": True,
                "response": response.model_dump() if response else None
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }

    async def stop_imaging(self) -> dict[str, Any]:
        """Stop the current imaging session.

        Returns:
            Command response dict
        """
        if not self.client:
            return {"success": False, "error": "Not connected"}

        try:
            response = await self.client.send_and_recv(imaging.StopImaging())
            return {
                "success": True,
                "response": response.model_dump() if response else None
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }

    async def get_status(self) -> dict[str, Any]:
        """Get current telescope status.

        Returns:
            Status dict with fields expected by Rust backend:
            - battery: battery percentage
            - cur_temp: temperature in Celsius
            - cur_hum: humidity percentage (not available)
            - dew_heater_power: dew heater power (not available)
            - ra: right ascension in hours
            - dec: declination in degrees
            - is_goto: whether currently doing GOTO
            - is_tracking: whether tracking is enabled
            - view: current view state/mode
            - gain: camera gain
        """
        if not self.client:
            return {"success": False, "error": "Not connected"}

        try:
            # Get aggregated status from client (updated from events)
            status = self.client.status

            # Also trigger a view state update to ensure fresh data
            await self.client.send_and_recv(simple.GetViewState())

            # Return data in format expected by Rust backend
            return {
                "success": True,
                "state": {
                    "battery": status.battery_capacity,
                    "cur_temp": status.temp,
                    "cur_hum": None,  # Not available from Seestar
                    "dew_heater_power": None,  # Not available from Seestar
                    "ra": status.ra,
                    "dec": status.dec,
                    "is_goto": status.stage == "AutoGoto" if status.stage else False,
                    "is_tracking": status.stage in ("Stack", "ContinuousExposure") if status.stage else False,
                    "view": status.stage or "Idle",
                    "gain": status.gain,
                    "focus_position": status.focus_position,
                    "stacked_frame": status.stacked_frame,
                    "target_name": status.target_name,
                }
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }

    def get_events(self) -> list[dict[str, Any]]:
        """Get queued events and clear the queue.

        Returns:
            List of event dicts
        """
        events = self._event_queue.copy()
        self._event_queue.clear()
        return events

    async def get_next_frame(self, camera_id: int = 0) -> Optional[bytes]:
        """Get the next video frame from the imaging client.

        Args:
            camera_id: Camera ID (default: 0)

        Returns:
            JPEG frame bytes or None if not available
        """
        if not self.imaging_client:
            return None

        try:
            import cv2
            import numpy as np

            # Get next image from the imaging client
            async for image in self.imaging_client.get_next_image(camera_id):
                if image is not None and image.image is not None:
                    # Convert numpy array to JPEG
                    img = image.image
                    _, buffer = cv2.imencode('.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, 85])
                    return buffer.tobytes()

                # Only get one frame
                break

            return None
        except Exception as e:
            print(f"Error getting frame: {e}")
            return None

    async def move(self, params: dict[str, Any]) -> dict[str, Any]:
        """Move the telescope in a direction.

        Args:
            params: Movement parameters (direction, speed, duration_sec)

        Returns:
            Command response dict
        """
        if not self.client:
            return {"success": False, "error": "Not connected"}

        try:
            direction = params.get("direction", "n").lower()
            speed = params.get("speed", 1.0)
            duration = params.get("duration_sec", 5.0)

            # Map direction strings to axis values
            # axis_x: positive = east, negative = west
            # axis_y: positive = north, negative = south
            direction_map = {
                "n": (0, 1),
                "s": (0, -1),
                "e": (1, 0),
                "w": (-1, 0),
                "ne": (1, 1),
                "nw": (-1, 1),
                "se": (1, -1),
                "sw": (-1, -1),
            }

            axis_x, axis_y = direction_map.get(direction, (0, 0))

            move_params = ScopeSpeedMoveParameters(
                axis_x=axis_x * speed,
                axis_y=axis_y * speed,
                dur_sec=duration,
            )

            response = await self.client.send_and_recv(
                ScopeSpeedMove(params=move_params)
            )

            return {
                "success": True,
                "response": response.model_dump() if response else None
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }

    async def stop_move(self) -> dict[str, Any]:
        """Stop any ongoing telescope movement.

        Returns:
            Command response dict
        """
        if not self.client:
            return {"success": False, "error": "Not connected"}

        try:
            # Send zero movement to stop
            move_params = ScopeSpeedMoveParameters(
                axis_x=0,
                axis_y=0,
                dur_sec=0,
            )

            response = await self.client.send_and_recv(
                ScopeSpeedMove(params=move_params)
            )

            return {
                "success": True,
                "response": response.model_dump() if response else None
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }

    async def focus(self, params: dict[str, Any]) -> dict[str, Any]:
        """Set focus position.

        Args:
            params: Focus parameters (position)

        Returns:
            Command response dict
        """
        if not self.client:
            return {"success": False, "error": "Not connected"}

        try:
            position = params.get("position", 0)

            focus_params = MoveFocuserParameters(step=position)
            response = await self.client.send_and_recv(
                MoveFocuser(params=focus_params)
            )

            return {
                "success": True,
                "response": response.model_dump() if response else None
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }

    async def focus_increment(self, params: dict[str, Any]) -> dict[str, Any]:
        """Adjust focus by increment from current position.

        Args:
            params: Focus parameters (increment)

        Returns:
            Command response dict
        """
        if not self.client:
            return {"success": False, "error": "Not connected"}

        try:
            increment = params.get("increment", 0)

            # Get current focus position first
            try:
                from scopinator.seestar.commands.simple import GetFocuserPosition
                pos_response = await self.client.send_and_recv(GetFocuserPosition())
                current_position = pos_response.step if pos_response else 0
            except Exception:
                current_position = 0

            new_position = current_position + increment

            focus_params = MoveFocuserParameters(step=new_position)
            response = await self.client.send_and_recv(
                MoveFocuser(params=focus_params)
            )

            return {
                "success": True,
                "response": response.model_dump() if response else None,
                "new_position": new_position
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }

    async def auto_focus(self) -> dict[str, Any]:
        """Start auto-focus routine.

        Returns:
            Command response dict
        """
        if not self.client:
            return {"success": False, "error": "Not connected"}

        try:
            response = await self.client.send_and_recv(simple.StartAutoFocus())
            return {
                "success": True,
                "response": response.model_dump() if response else None
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }

    async def set_gain(self, params: dict[str, Any]) -> dict[str, Any]:
        """Set camera gain.

        Args:
            params: Parameters with gain value

        Returns:
            Command response dict
        """
        if not self.client:
            return {"success": False, "error": "Not connected"}

        try:
            gain = params.get("gain", 80)

            # Use imaging command to set gain
            response = await self.client.send_and_recv(
                imaging.SetGain(params={"gain": gain})
            )

            return {
                "success": True,
                "response": response.model_dump() if response else None
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }

    async def set_exposure(self, params: dict[str, Any]) -> dict[str, Any]:
        """Set exposure time.

        Args:
            params: Parameters with exposure_ms value

        Returns:
            Command response dict
        """
        if not self.client:
            return {"success": False, "error": "Not connected"}

        try:
            exposure_ms = params.get("exposure_ms", 10000)

            # Use imaging command to set exposure
            response = await self.client.send_and_recv(
                imaging.SetExposure(params={"exposure_ms": exposure_ms})
            )

            return {
                "success": True,
                "response": response.model_dump() if response else None
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }

    async def stop_goto(self) -> dict[str, Any]:
        """Stop any ongoing GOTO operation.

        Returns:
            Command response dict
        """
        if not self.client:
            return {"success": False, "error": "Not connected"}

        try:
            # Stop the AutoGoto stage
            response = await self.client.stop_goto()
            return {
                "success": True,
                "response": response.model_dump() if hasattr(response, 'model_dump') else str(response)
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }

    async def get_focuser_position(self) -> dict[str, Any]:
        """Get current focuser position.

        Returns:
            Position info dict
        """
        if not self.client:
            return {"success": False, "error": "Not connected"}

        try:
            from scopinator.seestar.commands.simple import GetFocuserPosition
            response = await self.client.send_and_recv(GetFocuserPosition())
            return {
                "success": True,
                "position": response.step if response else None,
                "response": response.model_dump() if response else None
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }


# Synchronous wrapper for PyO3
def create_bridge(host: str, port: int = 4700) -> SeestarBridge:
    """Create a new telescope bridge.

    Args:
        host: Telescope IP address
        port: Telescope port

    Returns:
        SeestarBridge instance
    """
    return SeestarBridge(host, port)


async def _run_async(bridge: SeestarBridge, method: str, *args, **kwargs) -> dict[str, Any]:
    """Run an async method on the bridge."""
    method_func = getattr(bridge, method)
    return await method_func(*args, **kwargs)


def run_bridge_method(bridge: SeestarBridge, method: str, *args, **kwargs) -> dict[str, Any]:
    """Run a bridge method synchronously (for PyO3).

    Args:
        bridge: Bridge instance
        method: Method name to call
        *args: Positional arguments
        **kwargs: Keyword arguments

    Returns:
        Method result dict
    """
    return asyncio.run(_run_async(bridge, method, *args, **kwargs))
