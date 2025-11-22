#!/usr/bin/env python3
"""
Test script to verify the Moon goto command fix.
This tests that coordinates are properly passed when sent at root level.
"""

import asyncio
import httpx
import json

async def test_moon_goto():
    """Test the Moon goto command with coordinates at root level."""
    
    # Test data matching what the frontend sends
    BASE_URL = "http://localhost:8000"
    
    # Create WebSocket connection to see the logs
    import websockets
    
    ws_url = "ws://localhost:8000/api/ws"
    
    try:
        async with websockets.connect(ws_url) as ws:
            print("Connected to WebSocket")
            
            # Subscribe to all telescopes
            subscribe_msg = {
                "type": "subscribe",
                "payload": {
                    "all_telescopes": True,
                    "subscription_types": ["all"]
                }
            }
            await ws.send(json.dumps(subscribe_msg))
            print("Subscribed to telescope updates")
            
            # Send goto command with coordinates at root level (as frontend does)
            goto_msg = {
                "type": "control_command",
                "telescope_id": "telescopes",  # Adjust to your telescope ID
                "payload": {
                    "action": "goto",
                    "ra": 256.9022263214155,  # Moon coordinates from the log
                    "dec": -22.83028135996604,
                    "target_name": "Moon",
                    "target_type": "Solar System",
                    "magnitude": "-12.7"
                }
            }
            
            print("\nSending goto command:")
            print(json.dumps(goto_msg, indent=2))
            await ws.send(json.dumps(goto_msg))
            
            # Listen for responses
            print("\nListening for responses...")
            for _ in range(10):  # Listen for up to 10 messages
                try:
                    response = await asyncio.wait_for(ws.recv(), timeout=2.0)
                    data = json.loads(response)
                    
                    # Skip heartbeat messages
                    if data.get("type") != "heartbeat":
                        print(f"Received: {data.get('type', 'unknown')}")
                        if "error" in str(data).lower():
                            print(f"  Error details: {data}")
                        elif data.get("type") == "command_response":
                            print(f"  Command response: {data.get('payload', {})}")
                            
                except asyncio.TimeoutError:
                    continue
                    
    except Exception as e:
        print(f"Error: {e}")
        print("\nMake sure the server is running with:")
        print("  cd server && uv run python main.py server")

if __name__ == "__main__":
    print("Moon Goto Fix Test")
    print("=" * 50)
    print("This test verifies that Moon coordinates are properly handled")
    print("when sent at the root level of the payload (as the frontend does)")
    print("=" * 50)
    
    asyncio.run(test_moon_goto())