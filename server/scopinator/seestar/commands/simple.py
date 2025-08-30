"""Simple commands without parameters."""

from typing import Literal, NamedTuple, List, Optional, Any

from pydantic import BaseModel

from scopinator.seestar.commands.common import BaseCommand


class PiReboot(BaseCommand):
    """Reboot the Seestar."""
    method: Literal["pi_reboot"] = "pi_reboot"

class ScopeSync(BaseCommand):
    """Sync the scope from the Seestar."""
    method: Literal["scope_sync"] = "scope_sync"
    params: tuple[float, float]


class ScopePark(BaseCommand):
    """Park the scope from the Seestar."""

    method: Literal["scope_park"] = "scope_park"
    params: Optional[dict[str, Any]] = None


class TestConnection(BaseCommand):
    """Test the connection to the Seestar."""

    method: Literal["test_connection"] = "test_connection"


class GetAnnotatedResult(BaseCommand):  # xxx is there an issue?
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
    params: Optional[dict[str, Any]] = None


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


class PiIsVerified(BaseCommand):
    """Set that the Pi is verified."""
    method: Literal["pi_is_verified"] = "pi_is_verified"


class ScopeGetEquCoord(BaseCommand):
    """Get the equatorial coordinates from the Seestar."""

    method: Literal["scope_get_equ_coord"] = "scope_get_equ_coord"


class ScopeGetRaDecCoord(BaseCommand):
    """Get the right ascension and declination from the Seestar."""

    method: Literal["scope_get_ra_dec"] = "scope_get_ra_dec"


class ScopeGetHorizCoord(BaseCommand):
    """Get the right ascension and declination from the Seestar."""

    method: Literal["scope_get_horiz_coord"] = "scope_get_horiz_coord"


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


class DeviceInfo(BaseModel):
    """Device information section."""

    name: str
    firmware_ver_int: int
    firmware_ver_string: str
    is_verified: bool
    sn: str
    cpuId: str
    product_model: str
    user_product_model: str
    focal_len: int
    fnumber: int
    can_star_mode_sel_cam: Optional[bool] | None = None  # Newer field


class ExpMs(BaseModel):
    """Exposure time settings."""

    stack_l: int
    continuous: int


class StackDither(BaseModel):
    """Stack dither settings."""

    pix: int
    interval: int
    enable: bool


class MosaicSettings(BaseModel):
    """Mosaic settings."""

    scale: int
    angle: int
    estimated_hours: float
    star_map_angle: int
    star_map_ratio: int


class StackSettings(BaseModel):
    """Stack settings."""

    dbe: bool
    star_correction: bool
    cont_capt: bool


class SecondCameraSettings(BaseModel):
    """Second camera settings."""

    wide_cross_offset: List[int]
    ae_bri_percent: int
    manual_exp: bool
    isp_exp_ms: int
    isp_gain: int
    isp_range_gain: List[int]
    isp_range_exp_us: List[int]
    isp_range_exp_us_scenery: List[int]


class DeviceSettings(BaseModel):
    """Device settings section."""

    temp_unit: str
    beep_volume: str
    lang: str
    center_xy: List[int]
    stack_lenhance: bool
    heater_enable: bool
    expt_heater_enable: bool
    focal_pos: int
    factory_focal_pos: int
    exp_ms: ExpMs
    auto_power_off: bool
    stack_dither: StackDither
    auto_3ppa_calib: bool
    auto_af: bool
    frame_calib: bool
    calib_location: int
    wide_cam: bool
    stack_after_goto: bool
    guest_mode: bool
    user_stack_sim: bool
    usb_en_eth: Optional[bool] | None = None  # newer field
    dark_mode: Optional[bool] | None = None  # newer field
    af_before_stack: Optional[bool] | None = None  # newer field
    mosaic: MosaicSettings
    stack: StackSettings
    rtsp_roi_index: Optional[int] | None = None  # only S30?
    ae_bri_percent: int
    manual_exp: bool
    isp_exp_ms: int
    isp_gain: int
    isp_range_gain: List[int]
    isp_range_exp_us: List[int]
    isp_range_exp_us_scenery: List[int]
    second_camera: Optional[SecondCameraSettings] | None = None  # only S30


class CameraInfo(BaseModel):
    """Camera information."""

    chip_size: List[int]
    pixel_size_um: float
    debayer_pattern: str
    hpc_num: int


class FocuserInfo(BaseModel):
    """Focuser information."""

    state: str
    max_step: int
    step: int


class ApInfo(BaseModel):
    """Access Point information."""

    ssid: str
    passwd: str
    is_5g: bool


class StationInfo(BaseModel):
    """Station/WiFi information."""

    server: bool
    freq: Optional[int] | None = None  # ??
    ip: Optional[str] | None = None  # ??
    ssid: Optional[str] | None = None  # ??
    gateway: Optional[str] | None = None  # ??
    netmask: Optional[str] | None = None  # ??
    sig_lev: Optional[int] | None = None  # ??
    key_mgmt: Optional[str] | None = None  # ??


class StorageVolume(BaseModel):
    """Storage volume information."""

    name: str
    state: str
    total_mb: int
    totalMB: int
    free_mb: int
    freeMB: int
    disk_mb: int
    diskSizeMB: int
    used_percent: int


class StorageInfo(BaseModel):
    """Storage information."""

    is_typec_connected: bool
    connected_storage: List[str]
    storage_volume: List[StorageVolume]
    cur_storage: str


class SensorData(BaseModel):
    """Sensor data."""

    x: float
    y: float
    z: float


class BalanceSensorData(SensorData):
    """Balance sensor data."""

    angle: float


class CompassSensorData(SensorData):
    """Compass sensor data."""

    direction: float
    cali: int


class SensorInfo(BaseModel):
    """Sensor information base."""

    code: int
    data: SensorData


class BalanceSensorInfo(BaseModel):
    """Balance sensor information."""

    code: int
    data: BalanceSensorData


class CompassSensorInfo(BaseModel):
    """Compass sensor information."""

    code: int
    data: CompassSensorData


class MountInfo(BaseModel):
    """Mount information."""

    move_type: str
    close: bool
    tracking: bool
    equ_mode: bool


class PiStatusInfo(BaseModel):
    """Pi status information."""

    is_overtemp: bool
    temp: float
    charger_status: str
    battery_capacity: int
    charge_online: bool
    is_typec_connected: bool
    battery_overtemp: bool
    battery_temp: int
    battery_temp_type: str


class GetDeviceStateResponse(BaseModel):
    """Response from GetDeviceState.

    All fields are optional because during the request, the response keys may be specified."""
    device: Optional[DeviceInfo] = None
    setting: Optional[DeviceSettings] = None
    location_lon_lat: Optional[List[float]] = None
    camera: Optional[CameraInfo] = None
    second_camera: Optional[CameraInfo] | None = None  # only S30
    focuser: Optional[FocuserInfo] = None
    ap: Optional[ApInfo] = None
    station: Optional[StationInfo] = None
    storage: Optional[StorageInfo] = None
    balance_sensor: Optional[BalanceSensorInfo] = None
    compass_sensor: Optional[CompassSensorInfo] = None
    mount: Optional[MountInfo] = None
    pi_status: Optional[PiStatusInfo] = None
