from typing import Literal, Annotated, Any

from pydantic import BaseModel, Field

from scopinator.seestar.plans import Plan
from scopinator.util import RaDecTuple

EventState = Literal["start", "cancel", "working", "complete", "fail"] | None

ModeType = Literal["star", "sky", "scenery", "solar_sys", "none"] | None


class BaseEvent(BaseModel):
    """Base event."""

    Event: str
    Timestamp: str


class AutoGotoEvent(BaseEvent):
    """Auto goto event."""

    Event: Literal["AutoGoto"] = "AutoGoto"
    state: EventState = None
    lapse_ms: int = 0
    count: int = 0
    hint: bool = False
    error: str | None = None
    code: int | None = None
    route: list[Any] = []


class AutoGotoStepEvent(BaseEvent):
    """Auto goto step event."""

    Event: Literal["AutoGotoStep"] = "AutoGotoStep"
    state: EventState = None
    tag: str = ""
    page: str = ""
    func: str = ""
    goto_ra_dec: str = ""
    count: int = 0
    lapse_ms: int = 0
    error: str = ""
    code: int = 0


class ContinuousExposureEvent(BaseEvent):
    """Continuous exposure event."""

    Event: Literal["ContinuousExposure"] = "ContinuousExposure"
    state: EventState = None
    lapse_ms: int = 0
    fps: float = 0.0
    route: list[Any] = []


class FocuserMoveEvent(BaseEvent):
    """Focuser move event."""

    Event: Literal["FocuserMove"] = "FocuserMove"
    state: EventState = None
    lapse_ms: int = 0
    position: int = 0
    route: list[Any] = []


class PiStatusEvent(BaseEvent):
    """Status event."""

    Event: Literal["PiStatus"] = "PiStatus"
    temp: float | None = None
    charger_status: Literal["Discharging", "Charging", "Full", "Not charging"] | None = None
    charge_online: bool | None = None
    battery_capacity: int | None = None


class RTSPEvent(BaseEvent):
    """RTSP event."""

    Event: Literal["RTSP"] = "RTSP"
    state: EventState = None
    lapse_ms: int = 0
    roi_index: int = 0
    port: int = 0
    route: list[Any] = []


class ScopeMoveToHorizonEvent(BaseEvent):
    """Scope move to horizon event."""

    Event: Literal["ScopeMoveToHorizon"] = "ScopeMoveToHorizon"
    state: EventState = None
    lapse_ms: int = 0
    close: bool = False


class ScopeHomeEvent(BaseEvent):
    """Scope home event."""

    Event: Literal["ScopeHome"] = "ScopeHome"
    state: EventState = None
    lapse_ms: int = 0
    close: bool = False


class ScopeTrackEvent(BaseEvent):
    """Scope track event."""

    Event: Literal["ScopeTrack"] = "ScopeTrack"
    state: Literal["off", "on"] | None = None
    tracking: bool = False
    manual: bool = False
    error: str | None = None
    code: int = 0
    route: list[Any] = []


class SecondViewEvent(BaseEvent):
    """Second view event."""

    Event: Literal["SecondView"] = "SecondView"
    state: EventState = None
    lapse_ms: int = 0
    mode: ModeType = "star"
    cam_id: int = 0
    exp_ms: float = 0.0
    manual_exp: bool = False


class ViewEvent(BaseEvent):
    """View event."""

    Event: Literal["View"] = "View"
    state: EventState = None
    lapse_ms: int = 0
    mode: ModeType = "star"
    cam_id: int = 0
    lp_filter: bool = False
    gain: int = 0
    route: list[Any] = []


class WheelMoveEvent(BaseEvent):
    """Wheel move event."""

    Event: Literal["WheelMove"] = "WheelMove"
    state: EventState = None
    position: int = 0


class ScopeGotoEvent(BaseEvent):
    """Scope goto event."""

    Event: Literal["ScopeGoto"] = "ScopeGoto"
    state: EventState = None
    lapse_ms: int = 0
    cur_ra_dec: RaDecTuple | None = None
    dist_deg: float = 0.0
    route: list[Any] = []


class SettingEvent(BaseEvent):
    """Setting event."""

    Event: Literal["Setting"] = "Setting"
    rtsp_roi_index: int = 0


class ViewPlanEvent(BaseEvent):
    """View plan event."""

    Event: Literal["ViewPlan"] = "ViewPlan"
    state: EventState = None
    lapse_ms: int = 0
    plan: Plan | None = None


class BatchStackEvent(BaseEvent):
    """Batch stack event."""

    Event: Literal["BatchStack"] = "BatchStack"
    state: EventState = None
    lapse_ms: int = 0
    percent: float = 0.0
    frame_type: str = ""  # light
    stacked_img: int = 0
    total_img: int = 0
    remaining_sec: int | None = None
    input_thn: str | None = None
    output_file: dict[str, Any] | None = None
    # { path, files: [ { name, date, thn, type }
    route: list[Any] = []


class EqModePAEvent(BaseEvent):
    """EqModePA event."""

    Event: Literal["EqModePA"] = "EqModePA"
    state: EventState = None
    lapse_ms: int = 0
    route: list[Any] = []


class ExposureEvent(BaseEvent):
    """Exposure event."""

    Event: Literal["Exposure"] = "Exposure"
    state: Literal["downloading"] | EventState = None
    lapse_ms: int = 0
    exp_ms: float = 0.0
    route: list[Any] = []


class ThreePPAEvent(BaseEvent):
    """3PPA event."""

    Event: Literal["3PPA"] = "3PPA"
    state: EventState = None
    state_code: int = 0
    auto_move: bool = False
    auto_update: bool = False
    paused: bool = False
    detail: dict[str, Any] = {}
    lapse_ms: int = 0
    retry_cnt: int = 0


class PlateSolveEvent(BaseEvent):
    """PlateSolve event."""

    Event: Literal["PlateSolve"] = "PlateSolve"
    state: Literal["solving"] | EventState = None
    page: str = ""  # preview
    error: str = ""
    code: int = 0
    result: dict[str, Any] = {}  # star_number,duration_ms
    lapse_ms: int = 0


class InitialiseEvent(BaseEvent):
    """Initialise event."""

    Event: Literal["Initialise"] = "Initialise"
    state: EventState = None
    lapse_ms: int = 0
    route: list[Any] = []


class DarkLibraryEvent(BaseEvent):
    """DarkLibrary event."""

    Event: Literal["DarkLibrary"] = "DarkLibrary"
    state: EventState = None
    lapse_ms: int = 0
    percent: float = 0.0
    route: list[Any] = []


class AutoFocusEvent(BaseEvent):
    """AutoFocus event."""

    Event: Literal["AutoFocus"] = "AutoFocus"
    state: EventState = None
    lapse_ms: int = 0
    route: list[Any] = []


class SelectCameraEvent(BaseEvent):
    """Select camera event."""

    Event: Literal["SelectCamera"] = "SelectCamera"
    selected_cam: Literal["SecondView", "View"] = "View"


class GoPixelEvent(BaseEvent):
    """GoPixel event."""

    Event: Literal["GoPixel"] = "GoPixel"
    state: EventState = None
    lapse_ms: int = 0
    cur_pix: list[int] = []  # tuple
    route: list[Any] = []


class StackEvent(BaseEvent):
    """Stack event."""

    Event: Literal["Stack"] = "Stack"
    state: Literal["frame_complete"] | EventState = None
    lapse_ms: int = 0
    frame_errcode: int = 0
    stacked_frame: int = 0
    dropped_frame: int = 0
    can_annotate: bool = False
    frame_type: str | None = None
    total_frame: int = 0
    error: str = ""
    route: list[Any] = []
    code: int = 0


class AlertEvent(BaseEvent):
    """Alert event."""

    Event: Literal["Alert"] = "Alert"
    state: EventState = None
    error: str = ""
    code: int = 0


class DiskSpaceEvent(BaseEvent):
    """DiskSpace event."""

    Event: Literal["DiskSpace"] = "DiskSpace"
    used_percent: int = 0


class Annotation(BaseModel):
    """Annotation."""

    type: str = ""  # star
    pixelx: float = 0.0
    pixely: float = 0.0
    radius: float = 0.0
    name: str = ""
    names: list[str] = []


class AnnotateResult(BaseModel):
    """Annotate result."""

    image_size: list[int] = []  # duple
    annotations: list[Annotation] = []
    image_id: int = 0


class AnnotateEvent(BaseEvent):
    """Annotate event."""

    Event: Literal["Annotate"] = "Annotate"
    page: str = ""
    state: EventState = None
    result: AnnotateResult | None = None


class SaveImageEvent(BaseEvent):
    """SaveImage event."""

    Event: Literal["SaveImage"] = "SaveImage"
    state: EventState = None
    filename: str = ""
    fullname: str = ""


class InternalEvent(BaseEvent):
    """Internal event."""

    Event: Literal["Internal"] = "Internal"
    params: dict[str, Any] = {}


EventTypes = Annotated[
    AlertEvent
    | AnnotateEvent
    | AutoFocusEvent
    | AutoGotoEvent
    | AutoGotoStepEvent
    | BatchStackEvent
    | ContinuousExposureEvent
    | DarkLibraryEvent
    | DiskSpaceEvent
    | EqModePAEvent
    | ExposureEvent
    | FocuserMoveEvent
    | GoPixelEvent
    | InitialiseEvent
    | PiStatusEvent
    | PlateSolveEvent
    | RTSPEvent
    | SaveImageEvent
    | ScopeGotoEvent
    | ScopeHomeEvent
    | ScopeMoveToHorizonEvent
    | ScopeTrackEvent
    | SecondViewEvent
    | SelectCameraEvent
    | SettingEvent
    | StackEvent
    | ThreePPAEvent
    | ViewEvent
    | ViewPlanEvent
    | WheelMoveEvent,
    Field(discriminator="Event"),
]
