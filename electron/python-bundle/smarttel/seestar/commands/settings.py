from typing import Literal, Optional, Any

from pydantic import BaseModel

from smarttel.seestar.commands.common import BaseCommand


class PiSetTimeParameter(BaseModel):
    """Parameters for the PiSetTime command."""
    year: int
    mon: int
    day: int
    hour: int
    min: int
    sec: int
    time_zone: str


class PiSetTime(BaseCommand):
    """Set the time on the Seestar."""

    method: Literal["pi_set_time"] = "pi_set_time"
    params: list[PiSetTimeParameter]

class PiOutputSet2(BaseCommand):
    """Set the output 2 on the Seestar."""
    method: Literal["pi_output_set2"] = "pi_output_set2"
    params: dict[str, Any]


class SetControlValue(BaseCommand):
    """Set the control value from the Seestar."""

    method: Literal["set_control_value"] = "set_control_value"
    params: tuple[str, int]


class SetUserLocationParameters(BaseModel):
    """Parameters for the SetUserLocation command."""
    lat: float
    lon: float
    force: bool = True

class SetUserLocation(BaseCommand):
    """Set the user location on the Seestar."""

    method: Literal["set_user_location"] = "set_user_location"
    params: SetUserLocationParameters


class SettingParameters(BaseModel):
    """Parameters for the SetSetting command."""

    exp_ms: Optional[dict[str, int]] = None # values: stack_l, continuous
    ae_bri_percent: Optional[int] = None
    stack_dither: Optional[dict[str, Any]] = None  # pix: int, interval: int, enable: bool
    save_discrete_frame: Optional[bool] = None
    save_discrete_ok_frame: Optional[bool] = None
    auto_3ppa_calib: Optional[bool] = None
    stack_lenhance: Optional[bool] = None
    lang: Optional[str] = None
    auto_af: Optional[bool] = None
    stack_after_goto: Optional[bool] = None
    frame_calib: Optional[bool] = None
    stack: Optional[dict[str, bool]] = None
    # stack_l: Optional[int] = None
    # auto_power_off: Optional[bool] = None
    # is_frame_calibrated: Optional[bool] = None


class SetSetting(BaseCommand):
    """Set the settings from the Seestar."""

    method: Literal["set_setting"] = "set_setting"
    params: SettingParameters | None = None

class SequenceSettingParameters(BaseModel):
    """Parameters for the SetSequenceSetting command."""
    group_name: Optional[str]

class SetSequenceSetting(BaseCommand):
    """Set the sequence setting from the Seestar."""
    method: Literal["set_sequence_setting"] = "set_sequence_setting"
    params: list[SequenceSettingParameters]


class SetStackSettingParameters(BaseModel):
    """Parameters for the SetStackSetting command."""
    save_discrete_ok_frame: Optional[bool]
    save_discrete_frame: Optional[bool]

class SetStackSetting(BaseCommand):
    """Set the stack setting from the Seestar."""
    method: Literal["set_stack_setting"] = "set_stack_setting"
    params: SetStackSettingParameters

