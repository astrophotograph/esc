from enum import Enum
from typing import Literal, Optional

from pydantic import BaseModel, field_validator

from scopinator.seestar.commands.common import BaseCommand


class StopStage(str, Enum):
    """Stop stage."""

    DARK_LIBRARY = "DarkLibrary"
    STACK = "Stack"
    AUTO_GOTO = "AutoGoto"


class StartStackParams(BaseModel):
    """Parameters for the StartStack command."""
    restart: Optional[bool]


class IscopeStartStack(BaseCommand):
    """Start the stack from the Seestar."""

    method: Literal["iscope_start_stack"] = "iscope_start_stack"
    params: StartStackParams | None = None


class IscopeStartViewParams(BaseModel):
    """Parameters for the IscopeStartView command."""

    mode: Literal["scenery", "solar_sys", "star"] | None = None
    target_name: str | None = None
    target_ra_dec: tuple[float, float] | None = None
    lp_filter: bool | None = None


class IscopeStartView(BaseCommand):
    """Start the view from the Seestar."""

    method: Literal["iscope_start_view"] = "iscope_start_view"
    params: IscopeStartViewParams


class IscopeStopView(BaseCommand):
    """Stop the view from the Seestar."""

    method: Literal["iscope_stop_view"] = "iscope_stop_view"
    params: dict[str, StopStage]


class ScopeSetTrackState(BaseCommand):
    """Set the track state from the Seestar."""

    method: Literal["scope_set_track_state"] = "scope_set_track_state"
    # { tracking: bool }
    params: bool


class ScopeSpeedMoveParameters(BaseModel):
    """Parameters for the ScopeSpeedMove command."""

    # Old values: speed, angle, dur_sec
    # New values: level, angle, dur_sec, percent
    #   percent of 0 seems to mean stop...
    # speed: int
    angle: int
    level: int
    dur_sec: int
    percent: int


class ScopeSpeedMove(BaseCommand):
    """Speed move the scope from the Seestar."""

    method: Literal["scope_speed_move"] = "scope_speed_move"
    params: ScopeSpeedMoveParameters


class GotoTargetParameters(BaseModel):
    """Parameters for the GotoTarget command."""

    target_name: str
    is_j2000: bool
    ra: float
    dec: float
    
    @field_validator('ra')
    @classmethod
    def validate_ra(cls, v: float) -> float:
        """Validate Right Ascension is in valid range (0-360 degrees)."""
        if not (0.0 <= v <= 360.0):
            raise ValueError(f"RA must be between 0 and 360 degrees, got {v}")
        return v
    
    @field_validator('dec')
    @classmethod
    def validate_dec(cls, v: float) -> float:
        """Validate Declination is in valid range (-90 to +90 degrees)."""
        if not (-90.0 <= v <= 90.0):
            raise ValueError(f"Dec must be between -90 and +90 degrees, got {v}")
        return v
    
    @field_validator('target_name')
    @classmethod
    def validate_target_name(cls, v: str) -> str:
        """Validate target name is not empty."""
        if not v or not v.strip():
            raise ValueError("Target name cannot be empty")
        return v.strip()


class GotoTarget(BaseCommand):
    """Go to a target from the Seestar."""

    method: Literal["goto_target"] = "goto_target"
    params: GotoTargetParameters


class MoveFocuserParameters(BaseModel):
    """Parameters for the MoveFocuser command."""

    step: int
    ret_step: bool = True


class MoveFocuser(BaseCommand):
    """Move the focuser from the Seestar."""

    method: Literal["move_focuser"] = "move_focuser"
    params: MoveFocuserParameters
