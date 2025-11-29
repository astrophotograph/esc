"""Custom exceptions for telescope operations."""

from typing import Optional


class TelescopeError(Exception):
    """Base exception for all telescope-related errors."""
    
    def __init__(self, message: str, telescope_id: Optional[str] = None, error_code: Optional[str] = None):
        self.message = message
        self.telescope_id = telescope_id
        self.error_code = error_code
        super().__init__(message)
        
    def __str__(self):
        parts = [self.message]
        if self.telescope_id:
            parts.append(f"Telescope: {self.telescope_id}")
        if self.error_code:
            parts.append(f"Code: {self.error_code}")
        return " | ".join(parts)


class TelescopeConnectionError(TelescopeError):
    """Raised when telescope connection fails."""
    
    def __init__(self, message: str, telescope_id: Optional[str] = None, host: Optional[str] = None, port: Optional[int] = None):
        self.host = host
        self.port = port
        super().__init__(message, telescope_id, "CONNECTION_ERROR")
        
    def __str__(self):
        parts = [self.message]
        if self.telescope_id:
            parts.append(f"Telescope: {self.telescope_id}")
        if self.host and self.port:
            parts.append(f"Address: {self.host}:{self.port}")
        return " | ".join(parts)


class TelescopeCommandError(TelescopeError):
    """Raised when telescope command execution fails."""
    
    def __init__(self, message: str, command: Optional[str] = None, telescope_id: Optional[str] = None):
        self.command = command
        super().__init__(message, telescope_id, "COMMAND_ERROR")
        
    def __str__(self):
        parts = [self.message]
        if self.command:
            parts.append(f"Command: {self.command}")
        if self.telescope_id:
            parts.append(f"Telescope: {self.telescope_id}")
        return " | ".join(parts)


class TelescopeTimeoutError(TelescopeError):
    """Raised when telescope operations timeout."""
    
    def __init__(self, message: str, timeout_seconds: Optional[float] = None, telescope_id: Optional[str] = None):
        self.timeout_seconds = timeout_seconds
        super().__init__(message, telescope_id, "TIMEOUT_ERROR")
        
    def __str__(self):
        parts = [self.message]
        if self.timeout_seconds:
            parts.append(f"Timeout: {self.timeout_seconds}s")
        if self.telescope_id:
            parts.append(f"Telescope: {self.telescope_id}")
        return " | ".join(parts)


class TelescopeNotFoundError(TelescopeError):
    """Raised when telescope is not found."""
    
    def __init__(self, telescope_id: str):
        super().__init__(f"Telescope not found: {telescope_id}", telescope_id, "NOT_FOUND")


class TelescopeAlreadyExistsError(TelescopeError):
    """Raised when attempting to add a telescope that already exists."""
    
    def __init__(self, telescope_id: str):
        super().__init__(f"Telescope already exists: {telescope_id}", telescope_id, "ALREADY_EXISTS")


class InvalidCoordinatesError(TelescopeError):
    """Raised when invalid coordinates are provided."""
    
    def __init__(self, message: str, ra: Optional[float] = None, dec: Optional[float] = None):
        self.ra = ra
        self.dec = dec
        super().__init__(message, error_code="INVALID_COORDINATES")
        
    def __str__(self):
        parts = [self.message]
        if self.ra is not None and self.dec is not None:
            parts.append(f"Coordinates: RA={self.ra}, Dec={self.dec}")
        return " | ".join(parts)


class StarMapGenerationError(TelescopeError):
    """Raised when star map generation fails."""
    
    def __init__(self, message: str, ra: Optional[float] = None, dec: Optional[float] = None):
        self.ra = ra
        self.dec = dec
        super().__init__(message, error_code="STARMAP_ERROR")


class DiscoveryError(TelescopeError):
    """Raised when telescope discovery fails."""
    
    def __init__(self, message: str, discovery_method: Optional[str] = None):
        self.discovery_method = discovery_method
        super().__init__(message, error_code="DISCOVERY_ERROR")
        
    def __str__(self):
        parts = [self.message]
        if self.discovery_method:
            parts.append(f"Method: {self.discovery_method}")
        return " | ".join(parts)