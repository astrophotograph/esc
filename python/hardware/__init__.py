"""
Hardware control module
Interfaces with telescope control systems (ASCOM, INDI, etc.)
"""

from .telescope_driver import TelescopeDriver

__all__ = ["TelescopeDriver"]
