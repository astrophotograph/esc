#!/usr/bin/env python3
"""Test script for plate solving functionality."""

import asyncio
import os
import numpy as np
from smarttel.seestar.protocol_handlers import ScopeImage
from services.astrometry_client import AstrometryClient


async def test_plate_solve():
    """Test the astrometry client with a dummy image."""
    
    # Create a dummy image
    dummy_image = np.random.randint(0, 255, (1024, 1024, 3), dtype=np.uint8)
    
    # Create ScopeImage
    scope_image = ScopeImage(
        width=1024,
        height=1024,
        image=dummy_image
    )
    
    # Get API key from environment
    api_key = os.getenv("ASTROMETRY_API_KEY")
    if not api_key:
        print("Please set ASTROMETRY_API_KEY environment variable")
        return
    
    # Create client and test
    client = AstrometryClient(api_key)
    
    try:
        print("Testing plate solve...")
        result = await client.solve_image(scope_image)
        
        if result.success:
            print(f"Plate solve successful!")
            print(f"  RA: {result.ra}°")
            print(f"  Dec: {result.dec}°")
            print(f"  Orientation: {result.orientation}°")
            print(f"  Pixel scale: {result.pixscale} arcsec/pixel")
            print(f"  Field width: {result.field_width}°")
            print(f"  Field height: {result.field_height}°")
        else:
            print(f"Plate solve failed: {result.error}")
            
    finally:
        await client.close()


if __name__ == "__main__":
    asyncio.run(test_plate_solve())