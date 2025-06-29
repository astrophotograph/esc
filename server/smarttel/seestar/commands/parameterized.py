from enum import Enum
from typing import Literal, Any

from pydantic import BaseModel

from smarttel.seestar.commands.common import BaseCommand


class StopStage(str, Enum):
    """Stop stage."""
    DARK_LIBRARY = "DarkLibrary"
    STACK = "AutoGoto"
    AUTO_GOTO = "AutoGoto"

class IscopeStartStack(BaseCommand):
    """Start the stack from the Seestar."""
    method: Literal["iscope_start_stack"] = "iscope_start_stack"
    params: dict[str, Any] | None = None # restart boolean

class IscopeStartView(BaseCommand):
    """Start the view from the Seestar."""
    method: Literal["iscope_start_view"] = "iscope_start_view"
    params: dict[str, Any] | None = None

class IscopeStopView(BaseCommand):
    """Stop the view from the Seestar."""
    method: Literal["iscope_stop_view"] = "iscope_stop_view"
    params: dict[str, StopStage] | None = None # todo : make str just be 'stage'?

class ScopeSetTrackState(BaseCommand):
    """Set the track state from the Seestar."""
    method: Literal["scope_set_track_state"] = "scope_set_track_state"
    params: bool

class ScopeSpeedMoveParameters(BaseModel):
    """Parameters for the ScopeSpeedMove command."""
    speed: int
    angle: int
    dur_sec: int

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

class GotoTarget(BaseCommand):
    """Go to a target from the Seestar."""
    method: Literal["goto_target"] = "goto_target"
    params: GotoTargetParameters
