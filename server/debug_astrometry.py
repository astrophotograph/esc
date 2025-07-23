#!/usr/bin/env python3
"""Debug script to test astrometry.net API directly."""

import asyncio
import httpx
import json
import os


async def test_astrometry_api():
    """Test the astrometry.net API directly."""
    
    # Test without API key first to see basic connectivity
    headers = {
        "User-Agent": "ALP-Experimental-Telescope-Control/1.0",
        "Accept": "application/json",
    }
    
    # Test both HTTP and HTTPS endpoints
    base_urls = [
        "http://nova.astrometry.net/api/",
        "https://nova.astrometry.net/api/"
    ]
    
    async with httpx.AsyncClient(timeout=30.0, headers=headers) as client:
        for base_url in base_urls:
            print(f"\n{'='*60}")
            print(f"Testing endpoint: {base_url}")
            
            try:
                # First test without authentication to check basic connectivity
                print(f"\n1. Testing basic connectivity...")
                response = await client.get(base_url)
                print(f"GET {base_url}")
                print(f"Status: {response.status_code}")
                print(f"Headers: {dict(response.headers)}")
                print(f"Content-Type: {response.headers.get('content-type', 'None')}")
                print(f"Response (first 200 chars): {response.text[:200]}")
                
                # Now test login with a dummy API key if no real one is provided
                api_key = os.getenv("ASTROMETRY_API_KEY") or "test-key-123"
                
                print(f"\n2. Testing login endpoint...")
                login_url = f"{base_url}login"
                print(f"POST {login_url}")
                print(f"API key: {api_key[:10]}..." if len(api_key) > 10 else f"API key: {api_key}")
                
                # Try both JSON and form data formats
                print("  Trying JSON format...")
                response = await client.post(
                    login_url, 
                    json={"apikey": api_key}
                )
                
                print(f"  Status: {response.status_code}")
                print(f"  Response: {response.text[:200]}")
                
                if "no json" in response.text:
                    print("  JSON format failed, trying form data...")
                    response = await client.post(
                        login_url, 
                        data={"apikey": api_key}
                    )
                
                print(f"Status: {response.status_code}")
                print(f"Headers: {dict(response.headers)}")
                print(f"Content-Type: {response.headers.get('content-type', 'None')}")
                print(f"Response (first 500 chars): {response.text[:500]}")
                
                # Try to parse as JSON
                try:
                    data = response.json()
                    print(f"\nParsed JSON successfully:")
                    print(json.dumps(data, indent=2))
                    
                    if data.get("status") == "success":
                        print("✅ Login successful!")
                    else:
                        print(f"❌ Login failed: {data.get('errormessage', 'Unknown error')}")
                        
                except json.JSONDecodeError as e:
                    print(f"\n❌ Failed to parse as JSON: {e}")
                    print("This explains why the login is failing!")
                    
            except Exception as e:
                print(f"❌ Error making request to {base_url}: {e}")


if __name__ == "__main__":
    asyncio.run(test_astrometry_api())