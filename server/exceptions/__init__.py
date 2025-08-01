"""Custom exceptions for the telescope server."""

from .telescope_exceptions import (
    TelescopeError,
    TelescopeConnectionError,
    TelescopeCommandError,
    TelescopeTimeoutError,
    TelescopeNotFoundError,
    TelescopeAlreadyExistsError,
    InvalidCoordinatesError,
    StarMapGenerationError,
    DiscoveryError,
)

__all__ = [
    "TelescopeError",
    "TelescopeConnectionError", 
    "TelescopeCommandError",
    "TelescopeTimeoutError",
    "TelescopeNotFoundError",
    "TelescopeAlreadyExistsError",
    "InvalidCoordinatesError",
    "StarMapGenerationError",
    "DiscoveryError",
]