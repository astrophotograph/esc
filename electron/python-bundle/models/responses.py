"""Response models for the Seestar API."""

from typing import Optional
from pydantic import BaseModel


class ConfigurationResponse(BaseModel):
    """Response model for configuration data."""

    name: str
    description: Optional[str]
    config_data: dict
    created_at: str
    updated_at: str


class ConfigurationListItem(BaseModel):
    """Response model for configuration list items."""

    name: str
    description: Optional[str]
    created_at: str
    updated_at: str


class RemoteControllerResponse(BaseModel):
    """Response model for remote controller data."""

    host: str
    port: int
    name: Optional[str]
    description: Optional[str]
    status: str
    last_connected: Optional[str]
    telescopes_count: int = 0


class ImageEnhancementSettingsResponse(BaseModel):
    """Response model for comprehensive image enhancement settings."""

    upscaling_enabled: bool
    scale_factor: float
    upscaling_method: str
    available_upscaling_methods: list[str]
    sharpening_enabled: bool
    sharpening_method: str
    sharpening_strength: float
    available_sharpening_methods: list[str]
    invert_enabled: bool
    stretch_parameter: str
    available_stretch_parameters: list[str]


class UpscalingSettingsResponse(BaseModel):
    """Response model for upscaling settings."""

    enabled: bool
    scale_factor: float
    method: str
    available_methods: list[str]