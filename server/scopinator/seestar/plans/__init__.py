"""Plans for Seestar."""

from pydantic import BaseModel, Field

from scopinator.util import RaDecTuple


class PlanItem(BaseModel):
    """Plan item."""

    target_ra_dec: RaDecTuple = [0, 0]
    target_name: str = ""
    lp_filter: bool = False
    state: str = ""  # "idle"
    target_id: int = 0
    start_min: int = 0
    duration_min: int = 0
    skip: bool = False
    alias_name: str = ""


class Plan(BaseModel):
    """Plan."""

    update_time_seestar: str = ""
    plan_name: str = ""
    items: list[PlanItem] = Field(default=[], alias="list")
