from typing import Literal

from pydantic import BaseModel

from scopinator.seestar.commands.common import BaseCommand


class SetViewPlanItemMosaic(BaseModel):
    """Mosaic parameters."""

    estimated_hours: float
    scale: float
    star_map_angle: float
    angle: float


class SetViewPlanItem(BaseModel):
    """View plan item."""

    alias_name: str
    duration_min: int
    target_id: int
    mosaic: SetViewPlanItemMosaic
    skip: bool
    target_name: str
    start_min: int
    target_ra_dec: list[float]


class SetViewPlanParameters(BaseModel):
    """Parameters for the SetViewPlan command."""

    plan_name: str
    update_time_seestar: str
    list: list[SetViewPlanItem] = []


class SetViewPlan(BaseCommand):
    """Set the view plan from the Seestar."""

    method: Literal["set_view_plan"] = "set_view_plan"
    params: SetViewPlanParameters


class StopViewPlan(BaseCommand):
    """Stop the view plan from the Seestar."""

    method: Literal["stop_func"] = "stop_func"
    params: dict[str, str] = {"name": "ViewPlan"}
