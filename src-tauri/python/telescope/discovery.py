"""
Telescope discovery module - provides network discovery of telescopes.

Supports:
- Seestar: ZWO Seestar smart telescopes via UDP broadcast
- Alpaca: ASCOM Alpaca servers via UDP broadcast discovery

For Alpaca, devices from the same server are grouped together as one
telescope entry. The V2 API Backend abstraction handles individual
device access within a telescope.
"""
import logging
import asyncio
from typing import Any, Optional

from scopinator.seestar.commands.discovery import discover_seestars
from scopinator.v2.backends.alpaca.discovery import (
    discover_alpaca_servers,
    discover_alpaca_devices,
)


def discover_telescopes_sync(
    timeout: float = 3.0,
    protocols: Optional[list[str]] = None
) -> list[dict[str, Any]]:
    """
    Discover telescopes on the network (synchronous wrapper).
    Called by Rust code via PyO3.

    Alpaca devices from the same server are grouped into a single telescope
    entry. Each entry represents one Backend that can contain multiple
    devices (mount, camera, focuser, etc).

    Args:
        timeout: Discovery timeout in seconds
        protocols: List of protocols to search for. Default: ["seestar", "alpaca"]

    Returns:
        List of discovered telescopes with their details
    """
    if protocols is None:
        protocols = ["seestar", "alpaca"]

    try:
        # Run async discovery in event loop
        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)

        return loop.run_until_complete(_discover_all(timeout, protocols))

    except Exception as e:
        logging.error(f"Discovery failed: {e}")
        return []


async def _discover_all(
    timeout: float,
    protocols: list[str]
) -> list[dict[str, Any]]:
    """Async discovery of all protocol types."""
    results = []

    # Discover Seestar telescopes
    if "seestar" in protocols:
        seestar_results = await _discover_seestar(timeout)
        results.extend(seestar_results)

    # Discover Alpaca servers (grouped by server, not individual devices)
    if "alpaca" in protocols:
        alpaca_results = await _discover_alpaca(timeout)
        results.extend(alpaca_results)

    return results


async def _discover_seestar(timeout: float) -> list[dict[str, Any]]:
    """Discover Seestar telescopes via UDP broadcast."""
    results = []

    try:
        devices = await discover_seestars(timeout=timeout)

        for device in devices:
            # Extract the address (IP)
            host = device.get("address", "")
            if not host:
                continue

            # Extract data from the result field
            data = device.get("data", {})
            device_info = data.get("result", {})

            results.append({
                "host": host,
                "port": 4700,  # Default Seestar port
                "protocol": "seestar",
                "serial_number": device_info.get("sn", ""),
                "product_model": device_info.get("product_model", "Seestar S50"),
                "ssid": device_info.get("ssid", ""),
                "discovery_method": "auto_discovery",
                # Seestar always has mount + camera
                "devices": {
                    "mount": ["seestar_mount"],
                    "camera": ["seestar_camera"],
                }
            })

    except Exception as e:
        logging.error(f"Seestar discovery failed: {e}")

    return results


async def _discover_alpaca(timeout: float) -> list[dict[str, Any]]:
    """Discover Alpaca servers and group devices by server.

    Each Alpaca server becomes ONE telescope entry, with all its
    devices (mount, camera, focuser, etc.) grouped together.
    """
    results = []

    try:
        # Discover Alpaca servers on the network
        servers = await discover_alpaca_servers(timeout=timeout)

        for server in servers:
            host = server.get("host", "")
            port = server.get("AlpacaPort", 11111)
            server_name = server.get("ServerName", "")

            if not host:
                continue

            # Query this server for its devices
            devices_by_type: dict[str, list[str]] = {}
            device_names: list[str] = []

            try:
                devices = await discover_alpaca_devices(host, port, timeout=timeout)

                for device in devices:
                    device_type = device.get("device_type", "").lower()
                    device_name = device.get("device_name", "Unknown")
                    device_number = device.get("device_number", 0)

                    if device_type:
                        # Map Alpaca device types to our internal types
                        type_mapping = {
                            "telescope": "mount",
                            "mount": "mount",
                            "camera": "camera",
                            "focuser": "focuser",
                            "filterwheel": "filterwheel",
                            "rotator": "rotator",
                        }
                        internal_type = type_mapping.get(device_type, device_type)

                        if internal_type not in devices_by_type:
                            devices_by_type[internal_type] = []

                        device_id = f"{internal_type}_{device_number}"
                        devices_by_type[internal_type].append(device_id)
                        device_names.append(device_name)

            except Exception as e:
                logging.warning(f"Failed to query Alpaca server {host}:{port}: {e}")

            # Create a descriptive name for this telescope
            if server_name:
                telescope_name = server_name
            elif device_names:
                # Use first device name as the telescope name
                telescope_name = device_names[0]
            else:
                telescope_name = f"Alpaca Server at {host}"

            # Create a single entry for this server
            results.append({
                "host": host,
                "port": port,
                "protocol": "alpaca",
                "serial_number": f"alpaca:{host}:{port}",
                "product_model": telescope_name,
                "ssid": "",
                "discovery_method": "alpaca_discovery",
                "devices": devices_by_type,
            })

    except Exception as e:
        logging.error(f"Alpaca discovery failed: {e}")

    return results


def discover_seestar_sync(timeout: float = 3.0) -> list[dict[str, Any]]:
    """Discover only Seestar telescopes (synchronous wrapper)."""
    return discover_telescopes_sync(timeout, protocols=["seestar"])


def discover_alpaca_sync(timeout: float = 3.0) -> list[dict[str, Any]]:
    """Discover only Alpaca devices (synchronous wrapper)."""
    return discover_telescopes_sync(timeout, protocols=["alpaca"])
