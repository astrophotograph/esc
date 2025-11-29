#!/usr/bin/env python3
"""
Test harness for Seestar imaging - connects to telescope and pulls images.
This helps diagnose video feed issues.
"""
import asyncio
import logging
import sys
from pathlib import Path

# Setup logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Add venv to path
venv_site_packages = Path(__file__).parent / ".venv/lib/python3.12/site-packages"
if venv_site_packages.exists():
    sys.path.insert(0, str(venv_site_packages))
    logger.info(f"Added venv to path: {venv_site_packages}")

from scopinator.seestar.client import SeestarClient
from scopinator.seestar.imaging_client import SeestarImagingClient
from scopinator.util.eventbus import EventBus


async def test_telescope_imaging(host: str = "192.168.42.41"):
    """Test telescope imaging connection and frame capture."""
    control_port = 4700
    imaging_port = 4800

    logger.info(f"Starting Seestar imaging test for {host}")
    logger.info(f"Control port: {control_port}")
    logger.info(f"Imaging port: {imaging_port}")
    logger.info("=" * 60)

    # Create event bus
    event_bus = EventBus()

    # Create clients
    logger.info("Creating clients...")
    control_client = SeestarClient(host, control_port, event_bus)
    imaging_client = SeestarImagingClient(host, imaging_port, event_bus)

    try:
        # Connect control client
        logger.info("Connecting control client...")
        await control_client.connect()
        logger.info(f"✓ Control client connected: {control_client.is_connected}")

        # Connect imaging client
        logger.info("Connecting imaging client...")
        await imaging_client.connect()
        logger.info(f"✓ Imaging client connected: {imaging_client.is_connected}")

        # Check imaging client status
        logger.info("\nImaging client status:")
        logger.info(f"  - client_mode: {imaging_client.client_mode}")
        logger.info(f"  - is_streaming: {imaging_client.status.is_streaming}")
        logger.info(f"  - is_fetching_images: {imaging_client.status.is_fetching_images}")
        logger.info(f"  - image: {imaging_client.image is not None}")
        if imaging_client.image:
            logger.info(f"  - image.image: {imaging_client.image.image is not None}")

        # Try starting streaming mode
        logger.info("\nAttempting to start streaming mode...")
        try:
            await imaging_client.start_streaming()
            logger.info("✓ Streaming started")
            await asyncio.sleep(2)  # Wait for frames

            logger.info(f"\nAfter start_streaming:")
            logger.info(f"  - is_streaming: {imaging_client.status.is_streaming}")
            logger.info(f"  - image: {imaging_client.image is not None}")
            if imaging_client.image:
                logger.info(f"  - image.image: {imaging_client.image.image is not None}")
                if imaging_client.image.image is not None:
                    logger.info(f"  - image shape: {imaging_client.image.image.shape}")
                    logger.info(f"  - image dtype: {imaging_client.image.image.dtype}")
        except Exception as e:
            logger.error(f"✗ Failed to start streaming: {e}")

        # Try getting frames for 10 seconds
        logger.info("\nMonitoring for frames (10 seconds)...")
        for i in range(10):
            await asyncio.sleep(1)

            has_image = imaging_client.image is not None
            has_data = has_image and imaging_client.image.image is not None

            status = "✓" if has_data else "○"
            logger.info(
                f"{status} Second {i+1}: "
                f"streaming={imaging_client.status.is_streaming}, "
                f"image={has_image}, "
                f"data={has_data}"
            )

            if has_data:
                logger.info(f"  → Frame shape: {imaging_client.image.image.shape}")

        logger.info("\n" + "=" * 60)
        logger.info("Test completed")

    except Exception as e:
        logger.error(f"Test failed: {e}", exc_info=True)
    finally:
        # Cleanup
        logger.info("\nCleaning up...")
        try:
            if imaging_client.is_connected:
                await imaging_client.disconnect()
                logger.info("✓ Imaging client disconnected")
        except Exception as e:
            logger.error(f"Error disconnecting imaging client: {e}")

        try:
            if control_client.is_connected:
                await control_client.disconnect()
                logger.info("✓ Control client disconnected")
        except Exception as e:
            logger.error(f"Error disconnecting control client: {e}")


if __name__ == "__main__":
    # Get host from command line or use default
    host = sys.argv[1] if len(sys.argv) > 1 else "192.168.42.41"

    # Run the test
    asyncio.run(test_telescope_imaging(host))
