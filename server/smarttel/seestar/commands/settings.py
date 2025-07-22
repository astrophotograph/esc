from typing import Literal, Optional, Any

from pydantic import BaseModel

from smarttel.seestar.commands.common import BaseCommand


class SetControlValue(BaseCommand):
    """Set the control value from the Seestar."""

    method: Literal["set_control_value"] = "set_control_value"
    params: tuple[str, int]


class SettingParameters(BaseCommand):
    """Parameters for the SetSetting command."""

    exp_ms: Optional[dict[str, int]]  # values: stack_l, continuous
    ae_bri_percent: Optional[int]
    stack_dither: Optional[dict[str, Any]]  # pix: int, interval: int, enable: bool
    save_discrete_frame: Optional[bool]
    save_discrete_ok_frame: Optional[bool]
    auto_3ppa_calib: Optional[bool]
    stack_lenhance: Optional[bool]


class SetSetting(BaseCommand):
    """Set the settings from the Seestar."""

    method: Literal["set_setting"] = "set_setting"
    params: SettingParameters

class SequenceSettingParameters(BaseModel):
    """Parameters for the SetSequenceSetting command."""
    group_name: Optional[str]

class SetSequenceSetting(BaseCommand):
    """Set the sequence setting from the Seestar."""
    method: Literal["set_sequence_setting"] = "set_sequence_setting"
    params: list[SequenceSettingParameters]
