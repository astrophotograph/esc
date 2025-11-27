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

            return [
                {
                    "host": device.host,
                    "port": device.port,
                    "serial_number": device.device_name,
                    "product_model": "Seestar S50",
                    "ssid": getattr(device, 'ssid', ''),
                    "discovery_method": "auto_discovery"
                }
                for device in devices
            ]
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
