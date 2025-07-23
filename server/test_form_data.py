#!/usr/bin/env python3
"""Simple test for astrometry.net form data format."""

import asyncio
import httpx
import json


async def test_form_data():
    """Test form data format for astrometry.net."""
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        # Test with form data using request-json format (astrometry.net API format)
        import json as json_module
        
        request_data = {"apikey": "test-key-123"}
        
        try:
            response = await client.post(
                "http://nova.astrometry.net/api/login",
                data={"request-json": json_module.dumps(request_data)}
            )
        except Exception as e:
            print(f"HTTP failed: {e}")
            print("Trying HTTPS...")
            response = await client.post(
                "https://nova.astrometry.net/api/login",
                data={"request-json": json_module.dumps(request_data)}
            )
        
        print(f"Status: {response.status_code}")
        print(f"Content-Type: {response.headers.get('content-type')}")
        print(f"Response: {response.text}")
        
        try:
            data = response.json()
            print(f"JSON: {json.dumps(data, indent=2)}")
        except:
            print("Not valid JSON")


if __name__ == "__main__":
    asyncio.run(test_form_data())