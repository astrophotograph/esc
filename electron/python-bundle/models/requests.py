"""Request models for the Seestar API."""

from typing import Optional
from pydantic import BaseModel, Field
from smarttel.imaging.upscaler import UpscalingMethod, SharpeningMethod


class AddTelescopeRequest(BaseModel):
    """Request model for adding a telescope."""

    host: str = Field(..., description="IP address or hostname of the telescope")
    port: int = Field(default=4700, description="Port for telescope control")
    serial_number: Optional[str] = Field(
        None, description="Serial number of the telescope"
    )
    product_model: Optional[str] = Field(
        None, description="Product model of the telescope"
    )
    ssid: Optional[str] = Field(
        None, description="SSID of the telescope's WiFi network"
    )
    location: Optional[str] = Field(
        None, description="Physical location of the telescope"
    )


class SaveConfigurationRequest(BaseModel):
    """Request model for saving a configuration."""

    name: str = Field(
        ..., description="Name of the configuration", min_length=1, max_length=100
    )
    description: Optional[str] = Field(
        None, description="Description of the configuration", max_length=500
    )
    config_data: dict = Field(..., description="Configuration data as a JSON object")


class AddRemoteControllerRequest(BaseModel):
    """Request model for adding a remote controller."""

    host: str = Field(
        ..., description="IP address or hostname of the remote controller"
    )
    port: int = Field(..., description="Port for the remote controller API")
    name: Optional[str] = Field(
        None, description="Optional name for the remote controller"
    )
    description: Optional[str] = Field(
        None, description="Optional description of the remote controller"
    )


class ImageEnhancementSettingsRequest(BaseModel):
    """Request model for updating comprehensive image enhancement settings."""

    upscaling_enabled: bool = Field(
        default=False, description="Whether upscaling is enabled"
    )
    scale_factor: float = Field(
        default=2.0, ge=1.0, le=4.0, description="Upscaling factor (1.0-4.0)"
    )
    upscaling_method: UpscalingMethod = Field(
        default=UpscalingMethod.BICUBIC, description="Upscaling method"
    )
    sharpening_enabled: bool = Field(
        default=False, description="Whether sharpening is enabled"
    )
    sharpening_method: SharpeningMethod = Field(
        default=SharpeningMethod.UNSHARP_MASK, description="Sharpening method"
    )
    sharpening_strength: float = Field(
        default=1.0, ge=0.0, le=2.0, description="Sharpening strength (0.0-2.0)"
    )
    invert_enabled: bool = Field(
        default=False, description="Whether image inversion is enabled"
    )
    stretch_parameter: str = Field(
        default="15% Bg, 3 sigma", description="GraXpert stretch parameter"
    )


# Backward compatibility models
class UpscalingSettingsRequest(BaseModel):
    """Request model for updating upscaling settings."""

    enabled: bool = Field(..., description="Whether upscaling is enabled")
    scale_factor: float = Field(
        default=2.0, ge=1.0, le=4.0, description="Upscaling factor (1.0-4.0)"
    )
    method: UpscalingMethod = Field(
        default=UpscalingMethod.BICUBIC, description="Upscaling method"
    )