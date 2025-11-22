#!/usr/bin/env python3
"""
Test script for solar system object detection in goto commands.

This script tests the special handling of solar system objects (Sun, Moon, planets)
in the telescope goto endpoint.
"""

import asyncio
import httpx
import json
from typing import Dict, Any


async def test_goto_object(
    base_url: str, 
    telescope_name: str, 
    target_name: str, 
    ra: float, 
    dec: float,
    is_j2000: bool = True
) -> Dict[str, Any]:
    """
    Send a goto command for a specific object.
    
    Args:
        base_url: Base URL of the API server
        telescope_name: Name/ID of the telescope
        target_name: Name of the target object
        ra: Right Ascension in degrees
        dec: Declination in degrees
        is_j2000: Whether coordinates are in J2000 epoch
    
    Returns:
        Response from the API
    """
    url = f"{base_url}/api/{telescope_name}/goto"
    
    payload = {
        "target_name": target_name,
        "ra": ra,
        "dec": dec,
        "is_j2000": is_j2000
    }
    
    print(f"\n{'='*60}")
    print(f"Testing: {target_name}")
    print(f"{'='*60}")
    print(f"Sending goto command to: {url}")
    print(f"Payload: {json.dumps(payload, indent=2)}")
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.post(url, json=payload)
            print(f"Response status: {response.status_code}")
            
            if response.status_code == 200:
                print(f"Success! Response: {response.json()}")
            else:
                print(f"Error: {response.text}")
                
            return {"status": response.status_code, "data": response.text}
            
        except Exception as e:
            print(f"Exception occurred: {e}")
            return {"status": "error", "error": str(e)}


async def main():
    """Main test function."""
    
    # Configuration
    BASE_URL = "http://localhost:8000"
    TELESCOPE_NAME = "telescopes"  # Adjust based on your telescope name
    
    # Test cases for solar system objects
    # Note: These are example coordinates - real implementation would calculate current positions
    test_objects = [
        {
            "name": "Sun",
            "ra": 280.0,  # Example RA
            "dec": -23.0,  # Example Dec
            "note": "WARNING: Requires solar filter!"
        },
        {
            "name": "Moon",
            "ra": 45.5,
            "dec": 15.2,
            "note": "Fast moving - needs frequent updates"
        },
        {
            "name": "Venus",
            "ra": 250.0,
            "dec": -15.0,
            "note": "Inner planet - often near Sun"
        },
        {
            "name": "Mars",
            "ra": 35.0,
            "dec": 10.0,
            "note": "The Red Planet"
        },
        {
            "name": "Jupiter",
            "ra": 350.0,
            "dec": -5.0,
            "note": "Gas giant with moons"
        },
        {
            "name": "Saturn",
            "ra": 320.0,
            "dec": -20.0,
            "note": "Ringed planet"
        },
        {
            "name": "Neptune",
            "ra": 355.0,
            "dec": -4.0,
            "note": "Distant ice giant"
        },
        {
            "name": "Pluto",
            "ra": 295.0,
            "dec": -22.5,
            "note": "Dwarf planet - very faint"
        }
    ]
    
    print("\n" + "="*60)
    print("SOLAR SYSTEM GOTO TEST")
    print("="*60)
    print(f"Server: {BASE_URL}")
    print(f"Telescope: {TELESCOPE_NAME}")
    print("\nThis test will send goto commands for various solar system objects")
    print("and verify that they are detected and logged with appropriate warnings.")
    print("\nCheck the server logs for detailed detection messages!")
    print("="*60)
    
    # Test each object
    for obj in test_objects:
        print(f"\n{obj['note']}")
        
        result = await test_goto_object(
            BASE_URL,
            TELESCOPE_NAME,
            obj["name"],
            obj["ra"],
            obj["dec"]
        )
        
        # Small delay between requests
        await asyncio.sleep(1)
    
    # Also test a non-solar system object for comparison
    print("\n" + "="*60)
    print("Testing regular deep-sky object (for comparison)")
    print("="*60)
    
    await test_goto_object(
        BASE_URL,
        TELESCOPE_NAME,
        "M42 - Orion Nebula",
        83.82,
        -5.39
    )
    
    print("\n" + "="*60)
    print("TEST COMPLETE")
    print("="*60)
    print("\nCheck the server logs to see the special handling messages for each solar system object!")
    print("Look for lines starting with 'SOLAR SYSTEM OBJECT DETECTED'")


if __name__ == "__main__":
    asyncio.run(main())