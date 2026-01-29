"""Bridge to scopinator for Seestar telescope control.

This module provides a clean interface to the scopinator library
that can be easily called from Rust via PyO3.
"""

import asyncio
from typing import Any, Optional
from pydantic import BaseModel

from scopinator.seestar.client import SeestarClient, EventBus
from scopinator.seestar.imaging_client import SeestarImagingClient
from scopinator.seestar.commands import imaging, simple
from scopinator.seestar.commands import parameterized as parameterized_commands
from scopinator.seestar.commands.parameterized import (
    ScopeSpeedMove,
    ScopeSpeedMoveParameters,
    MoveFocuser,
    MoveFocuserParameters,
)
from scopinator.seestar.commands.simple import GetDeviceState, ScopeGetEquCoord


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

    def __init__(self, host: str, port: int = 4700, imaging_port: int = 4800):
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
        self.view_mode: str = "star"
        # Avoid spamming start/view/stream commands while streaming is idle.
        self._last_view_start_attempt: float = 0.0
        self._last_stream_start_attempt: float = 0.0
        # Temporarily suppress streaming (e.g. during goto) to avoid conflicts.
        self._suppress_streaming_until: float = 0.0

        # Event subscriptions are optional; leaving the queue empty in web mode.

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
                await self.client.disconnect()
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
            target_name = params.get("target_name") or params.get("targetName")
            ra = params.get("ra") or params.get("ra_decimal") or params.get("ra_deg")
            dec = params.get("dec") or params.get("dec_decimal") or params.get("dec_deg")

            if target_name is None or ra is None or dec is None:
                return {"success": False, "error": "Missing target_name, ra, or dec"}

            # Pause streaming briefly to avoid interfering with AutoGoto.
            if self.imaging_client and self.imaging_client.status.is_streaming:
                try:
                    await self.imaging_client.stop_streaming()
                except Exception:
                    pass
            import time
            self._suppress_streaming_until = time.monotonic() + 30.0

            # Ensure tracking is enabled (some firmware won't move if tracking is off/parked).
            try:
                await self.client.send_and_recv(parameterized_commands.ScopeSetTrackState(params=True))
            except Exception:
                pass

            # Use the GotoTarget command with J2000 coordinates.
            goto_params = parameterized_commands.GotoTargetParameters(
                target_name=target_name,
                is_j2000=True,
                ra=float(ra),
                dec=float(dec),
            )

            response = await self.client.send_and_recv(
                parameterized_commands.GotoTarget(params=goto_params)
            )

            if response is None:
                return {"success": False, "error": "No response from telescope"}

            response_code = getattr(response, "code", 0)
            response_error = getattr(response, "error", None)
            if response_code not in (None, 0) or response_error:
                error_str = str(response_error) if response_error else f"code {response_code}"
                # Some firmware doesn't support GotoTarget; fall back to IscopeStartView.
                if "method not found" in error_str.lower() or response_code not in (None, 0):
                    # Convert J2000 coordinates to current epoch for IscopeStartView.
                    try:
                        from astropy.coordinates import SkyCoord, FK5
                        from astropy.time import Time
                        import astropy.units as u

                        sky = SkyCoord(ra=float(ra) * u.deg, dec=float(dec) * u.deg, frame=FK5(equinox=Time("J2000")))
                        current = sky.transform_to(FK5(equinox=Time.now()))
                        ra_now = float(current.ra.deg)
                        dec_now = float(current.dec.deg)
                    except Exception:
                        ra_now = float(ra)
                        dec_now = float(dec)

                    # IscopeStartView appears to expect RA in hours.
                    ra_hours = ra_now / 15.0
                    print(f"GOTO debug: fallback iscope_start_view ra_hours={ra_hours:.6f} dec_deg={dec_now:.6f}")
                    response = await self.client.goto(
                        target_name=target_name,
                        in_ra=ra_hours,
                        in_dec=dec_now,
                        mode="star",
                    )
                    if response is None:
                        return {"success": False, "error": "No response from telescope"}
                    if hasattr(response, "error") and response.error:
                        return {"success": False, "error": str(response.error)}
                else:
                    return {"success": False, "error": error_str}

            # Debug: capture immediate view/coord state after issuing goto.
            try:
                view_state = await self.client.send_and_recv(simple.GetViewState())
                coord_state = await self.client.send_and_recv(simple.ScopeGetEquCoord())
                print(
                    "GOTO debug: view_state=",
                    view_state.model_dump() if view_state else None,
                    "coords=",
                    coord_state.model_dump() if coord_state else None,
                )
            except Exception as e:
                print(f"GOTO debug: failed to fetch view/coord state: {e}")

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
            response = await self.client.send_and_recv(simple.ScopePark())
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

    async def set_view_mode(self, params: dict[str, Any]) -> dict[str, Any]:
        """Set the view mode (star/scenery/solar_sys)."""
        if not self.client:
            return {"success": False, "error": "Not connected"}

        mode = (params.get("mode") or "star").lower()
        if mode not in {"star", "scenery", "solar_sys"}:
            return {"success": False, "error": f"Unsupported view mode: {mode}"}

        try:
            self.view_mode = mode
            response = await self.client.scope_view(mode=mode)
            # Reset backoff so stream startup can re-assert the mode if needed.
            self._last_view_start_attempt = 0.0
            return {
                "success": True,
                "mode": mode,
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
            Status dict
        """
        if not self.client:
            return {"success": False, "error": "Not connected"}

        try:
            # Prefer cached status to avoid blocking the command pipeline.
            status = getattr(self.client, "status", None)
            device_result = (status.device_state or {}) if status else {}
            coord_result = {
                "ra": status.ra if status else None,
                "dec": status.dec if status else None,
            }

            pi_status = (device_result or {}).get("pi_status", {}) or (status.pi_status if status else {})
            mount = (device_result or {}).get("mount", {})
            setting = (device_result or {}).get("setting", {})
            balance_sensor = (device_result or {}).get("balance_sensor")
            isp_gain = setting.get("isp_gain")
            manual_exp = setting.get("manual_exp")
            gain_value = isp_gain if isinstance(isp_gain, (int, float)) and isp_gain >= 0 else None
            if gain_value is None and status is not None and status.gain is not None:
                gain_value = status.gain
            gain_mode = "manual" if gain_value is not None else "auto" if manual_exp is False else None
            equ_mode = mount.get("equ_mode")
            mount_type = "Equatorial" if equ_mode else "Alt-Az"
            is_tracking = bool(mount.get("tracking")) or mount.get("move_type") in {"tracking", "track"}

            state = {
                "battery": pi_status.get("battery_capacity") if isinstance(pi_status, dict) else None,
                "battery_capacity": pi_status.get("battery_capacity") if isinstance(pi_status, dict) else None,
                "charger_status": pi_status.get("charger_status") if isinstance(pi_status, dict) else None,
                "cur_temp": pi_status.get("temp") if isinstance(pi_status, dict) else (status.temp if status else None),
                "temp": pi_status.get("temp") if isinstance(pi_status, dict) else (status.temp if status else None),
                "cur_hum": None,
                "dew_heater_power": 100 if setting.get("heater_enable") else 0,
                "ra": coord_result.get("ra"),
                "dec": coord_result.get("dec"),
                "is_goto": mount.get("move_type") not in (None, "none"),
                "is_tracking": is_tracking,
                "view": None,
                "balance_sensor": balance_sensor if balance_sensor is not None else (status.balance_sensor if status else None),
                "gain": gain_value,
                "gain_mode": gain_mode,
                "mount_type": mount_type,
            }

            return {"success": True, "state": state}
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
            import time

            # Ensure the telescope is in a view mode that produces frames.
            if self.client and getattr(self.client, "client_mode", None) in (None, "Idle"):
                now = time.monotonic()
                if now - self._last_view_start_attempt > 5.0:
                    self._last_view_start_attempt = now
                    try:
                        await self.client.scope_view(mode=self.view_mode)
                    except Exception as e:
                        print(f"Error starting view mode: {e}")
                        return None

            # Ensure streaming is enabled so the imaging client actually receives frames.
            if not self.imaging_client.status.is_streaming:
                now = time.monotonic()
                if now < self._suppress_streaming_until:
                    return None
                now = time.monotonic()
                if now - self._last_stream_start_attempt > 2.0:
                    self._last_stream_start_attempt = now
                    try:
                        await self.imaging_client.start_streaming()
                        # Match scopinator's "ContinuousExposure" mode for binary stream images.
                        self.imaging_client.client_mode = "ContinuousExposure"
                    except Exception as e:
                        print(f"Error starting streaming: {e}")
                        return None

            import cv2
            import numpy as np

            # Get next image from the imaging client
            async for image in self.imaging_client.get_next_image(camera_id):
                if image is not None and image.image is not None:
                    # Convert numpy array to JPEG
                    img = image.image
                    if img.dtype != np.uint8:
                        # Normalize non-8bit images for JPEG encoding.
                        img = cv2.normalize(img, None, 0, 255, cv2.NORM_MINMAX)
                        img = img.astype(np.uint8)

                    # Offload JPEG encoding to a thread to avoid blocking the event loop.
                    def _encode_jpeg():
                        ok, buffer = cv2.imencode(
                            ".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 85]
                        )
                        return buffer.tobytes() if ok else None

                    return await asyncio.to_thread(_encode_jpeg)

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
            speed = float(params.get("speed", 0.5))
            duration = float(params.get("duration_sec", 5.0))

            # Map direction to angle in degrees (0=N, 90=E, 180=S, 270=W).
            angle_map = {
                "n": 0,
                "north": 0,
                "ne": 45,
                "northeast": 45,
                "e": 90,
                "east": 90,
                "se": 135,
                "southeast": 135,
                "s": 180,
                "south": 180,
                "sw": 225,
                "southwest": 225,
                "w": 270,
                "west": 270,
                "nw": 315,
                "northwest": 315,
                "stop": 0,
            }
            angle = angle_map.get(direction, 0)

            # ScopeSpeedMoveParameters expects level/percent/dur_sec.
            # Keep level at 1 (slow) and scale percent from speed.
            percent = max(0, min(100, int(speed * 100)))
            if direction == "stop":
                percent = 0
                duration = 0.0

            move_params = ScopeSpeedMoveParameters(
                angle=angle,
                level=1,
                dur_sec=int(duration),
                percent=percent,
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
