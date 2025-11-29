"""Models package for the Seestar API."""

from .requests import (
    AddTelescopeRequest,
    SaveConfigurationRequest,
    AddRemoteControllerRequest,
    ImageEnhancementSettingsRequest,
    UpscalingSettingsRequest,
)

from .responses import (
    ConfigurationResponse,
    ConfigurationListItem,
    RemoteControllerResponse,
    ImageEnhancementSettingsResponse,
    UpscalingSettingsResponse,
)

from .telescope import Telescope
from .test_telescope import TestTelescope, MockImagingClient, MockSeestarClient

__all__ = [
    # Requests
    "AddTelescopeRequest",
    "SaveConfigurationRequest",
    "AddRemoteControllerRequest",
    "ImageEnhancementSettingsRequest",
    "UpscalingSettingsRequest",
    # Responses
    "ConfigurationResponse",
    "ConfigurationListItem",
    "RemoteControllerResponse",
    "ImageEnhancementSettingsResponse",
    "UpscalingSettingsResponse",
    # Models
    "Telescope",
    "TestTelescope",
    "MockImagingClient",
    "MockSeestarClient",
]