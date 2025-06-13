"""Simple commands without parameters."""
from typing import Literal, NamedTuple

from pydantic import BaseModel

from smarttel.seestar.commands.common import BaseCommand

class GetAnnotatedResult(BaseCommand): # xxx is there an issue?
    """Get the annotated result from the Seestar."""
    method: Literal["get_annotated_result"] = "get_annotated_result"

class GetCameraInfo(BaseCommand):
    """Get the camera info from the Seestar."""
    method: Literal["get_camera_info"] = "get_camera_info"


class GetCameraState(BaseCommand):
    """Get the camera state from the Seestar."""
    method: Literal["get_camera_state"] = "get_camera_state"

class GetDeviceState(BaseCommand):
    """Get the device state from the Seestar."""
    method: Literal["get_device_state"] = "get_device_state"


class GetDiskVolume(BaseCommand):
    """Get the disk volume from the Seestar."""
    method: Literal["get_disk_volume"] = "get_disk_volume"

class GetFocuserPosition(BaseCommand):
    """Get the focuser position from the Seestar."""
    method: Literal["get_focuser_position"] = "get_focuser_position"

class GetLastSolveResult(BaseCommand):
    """Get the last solve result from the Seestar."""
    method: Literal["get_last_solve_result"] = "get_last_solve_result"

class GetSetting(BaseCommand):
    """Get the settings from the Seestar."""
    method: Literal["get_setting"] = "get_setting"

class GetSolveResult(BaseCommand):
    """Get the solve result from the Seestar."""
    method: Literal["get_solve_result"] = "get_solve_result"

class GetStackSetting(BaseCommand):
    """Get the stack setting from the Seestar."""
    method: Literal["get_stack_setting"] = "get_stack_setting"

class GetStackInfo(BaseCommand):
    """Get the stack info from the Seestar."""
    method: Literal["get_stack_info"] = "get_stack_info"


class GetTime(BaseCommand):
    """Get the current time from the Seestar."""
    method: Literal["pi_get_time"] = "pi_get_time"

class GetUserLocation(BaseCommand):
    """Get the user location from the Seestar."""
    method: Literal["get_user_location"] = "get_user_location"

class GetViewState(BaseCommand):
    """Get the view state from the Seestar."""
    method: Literal["get_view_state"] = "get_view_state"

class GetWheelPosition(BaseCommand):
    """Get the wheel position from the Seestar."""
    method: Literal["get_wheel_position"] = "get_wheel_position"

class GetWheelSetting(BaseCommand):
    """Get the wheel setting from the Seestar."""
    method: Literal["get_wheel_setting"] = "get_wheel_setting"

class GetWheelState(BaseCommand):
    """Get the wheel state from the Seestar."""
    method: Literal["get_wheel_state"] = "get_wheel_state"

class ScopeGetEquCoord(BaseCommand):
    """Get the equatorial coordinates from the Seestar."""
    method: Literal["scope_get_equ_coord"] = "scope_get_equ_coord"

class ScopeGetRaDecCoord(BaseCommand):
    """Get the right ascension and declination from the Seestar."""
    method: Literal["scope_get_ra_dec"] = "scope_get_ra_dec"

class ScopePark(BaseCommand):
    """Park the scope from the Seestar."""
    method: Literal["scope_park"] = "scope_park"

class StartAutoFocus(BaseCommand):
    """Start the auto focus from the Seestar."""
    method: Literal["start_auto_focuse"] = "start_auto_focuse"

class StopAutoFocus(BaseCommand):
    """Stop the auto focus from the Seestar."""
    method: Literal["stop_auto_focuse"] = "stop_auto_focuse"

class StartSolve(BaseCommand):
    """Start the solve from the Seestar."""
    method: Literal["start_solve"] = "start_solve"

#############################

class GetTimeResponse(BaseModel):
    """Response from PiGetTime."""
    year: int
    mon: int
    day: int
    hour: int
    min: int
    sec: int
    time_zone: str

class ChipSize(NamedTuple):
    """Size of the chip."""
    width: int
    height: int

class GetCameraInfoResponse(BaseModel):
    """Response from GetCameraInfo."""
    chip_size: ChipSize
    bins: tuple[int, int]
    pixel_size_um: float
    unity_gain: int
    has_cooler: bool
    is_color: bool
    is_usb3_host: bool
    has_hpc: bool
    debayer_pattern: str

class GetCameraStateResponse(BaseModel):
    """Response from GetCameraState."""
    state: str
    name: str
    path: str

class GetDiskVolumeResponse(BaseModel):
    """Response from GetDiskVolume."""
    totalMB: int
    freeMB: int