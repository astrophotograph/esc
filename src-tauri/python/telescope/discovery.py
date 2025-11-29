"""
Telescope discovery module - provides network discovery of Seestar telescopes.
"""
import logging
import asyncio
from typing import Dict, Any

# Try to import scopinator, fall back to mock if not available
try:
    from scopinator.seestar.commands.discovery import discover_seestars
    SCOPINATOR_AVAILABLE = True
except ImportError:
    SCOPINATOR_AVAILABLE = False
    logging.warning("scopinator not available, using mock discovery")


def discover_telescopes_sync(timeout: float = 3.0) -> list[Dict[str, Any]]:
    """
    Discover Seestar telescopes on the network (synchronous wrapper).
    Called by Rust code via PyO3.

    Args:
        timeout: Discovery timeout in seconds

    Returns:
        List of discovered telescopes with their details
    """
    try:
        if SCOPINATOR_AVAILABLE:
            # Run async discovery in event loop
            try:
                loop = asyncio.get_event_loop()
            except RuntimeError:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)

            devices = loop.run_until_complete(discover_seestars(timeout=timeout))

            # Parse scopinator discovery results
            # Each device is a dict with: address, data (containing result), discovered_via
            result = []
            for device in devices:
                # Extract the address (IP)
                host = device.get("address", "")
                if not host:
                    continue

                # Extract data from the result field
                data = device.get("data", {})
                device_info = data.get("result", {})

                result.append({
                    "host": host,
                    "port": 4700,  # Default Seestar port
                    "serial_number": device_info.get("sn", ""),
                    "product_model": device_info.get("product_model", "Seestar"),
                    "ssid": device_info.get("ssid", ""),
                    "discovery_method": "auto_discovery"
                })

            return result
        else:
            logging.info("[MOCK] Discovering telescopes")
            # Return mock telescope for testing
            return [
                {
                    "host": "192.168.1.100",
                    "port": 4700,
                    "serial_number": "MOCK123456",
                    "product_model": "Seestar S50 (Mock)",
                    "ssid": "Seestar_MOCK123456",
                    "discovery_method": "mock"
                }
            ]
    except Exception as e:
        logging.error(f"Discovery failed: {e}")
        return []
