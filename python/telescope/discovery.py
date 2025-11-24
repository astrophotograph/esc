"""Auto-discovery wrapper for Seestar telescopes."""

import asyncio
from typing import Any

from scopinator.seestar.commands.discovery import discover_seestars


async def discover_telescopes(timeout: float = 3.0) -> list[dict[str, Any]]:
    """Discover Seestar telescopes on the network using UDP broadcast.

    Args:
        timeout: Discovery timeout in seconds (default: 3.0)

    Returns:
        List of discovered telescope dictionaries with host, serial_number, etc.
    """
    try:
        devices = await discover_seestars(timeout=timeout)

        # Convert to simpler format for Rust
        telescopes = []
        for device in devices:
            telescope = {
                "host": device.get("address", ""),
                "port": 4700,  # Default Seestar command port
                "serial_number": device.get("data", {}).get("result", {}).get("sn", ""),
                "product_model": device.get("data", {}).get("result", {}).get("product_model", ""),
                "ssid": device.get("data", {}).get("result", {}).get("ssid", ""),
                "discovery_method": "auto_discovery"
            }

            # Only add if we have at least a host
            if telescope["host"]:
                telescopes.append(telescope)

        return telescopes
    except Exception as e:
        print(f"Discovery error: {e}")
        return []


def discover_telescopes_sync(timeout: float = 3.0) -> list[dict[str, Any]]:
    """Synchronous wrapper for discover_telescopes (for PyO3).

    Args:
        timeout: Discovery timeout in seconds

    Returns:
        List of discovered telescopes
    """
    return asyncio.run(discover_telescopes(timeout))
