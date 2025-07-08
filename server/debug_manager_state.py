#!/usr/bin/env python3
"""
Direct debug of WebSocket manager internal state.
"""

import asyncio
import httpx


async def debug_manager_internals():
    """Add a debug endpoint to inspect WebSocket manager internals."""
    
    try:
        # First check if we can add a debug endpoint
        async with httpx.AsyncClient() as client:
            print("🔍 Testing debug endpoint access...")
            
            # Test the health endpoint first
            response = await client.get("http://localhost:8000/api/ws/health")
            if response.status_code == 200:
                health = response.json()
                print(f"✅ WebSocket health: {health['status']}")
                print(f"📊 Active connections: {health['active_connections']}")
                print(f"📡 Registered telescopes: {health['registered_telescopes']}")
            
            # Try to test what telescopes are considered "available"
            print("\n🔭 Testing telescope availability...")
            
            # Test local telescope
            test_local = "cfcf05c4"
            print(f"Testing local telescope: {test_local}")
            
            # Test remote telescope  
            test_remote = "870c9918"
            print(f"Testing remote telescope: {test_remote}")
            
            print("\n💡 To debug this properly, we need to add debug endpoints to the server")
            print("   or restart the server to pick up the registration fix.")
            
    except Exception as e:
        print(f"❌ Debug failed: {e}")


async def test_command_directly():
    """Test sending a command directly to see the exact error."""
    
    import websockets
    import json
    
    try:
        print("\n🎯 Testing command directly...")
        ws_url = "ws://localhost:8000/api/ws/870c9918"
        
        async with websockets.connect(ws_url) as websocket:
            # Send a command and see what happens
            command = {
                "id": "debug-cmd-1",
                "type": "control_command",
                "telescope_id": "870c9918",
                "timestamp": 1000000000000,
                "payload": {
                    "action": "get_status",
                    "parameters": {},
                    "response_expected": True
                }
            }
            
            print(f"📤 Sending command: {json.dumps(command, indent=2)}")
            await websocket.send(json.dumps(command))
            
            # Wait for response
            response = await asyncio.wait_for(websocket.recv(), timeout=3.0)
            parsed = json.loads(response)
            
            print(f"📨 Response: {json.dumps(parsed, indent=2)}")
            
            # Check what the error says
            if parsed.get("type") == "command_response":
                payload = parsed.get("payload", {})
                if not payload.get("success"):
                    error = payload.get("error", "Unknown error")
                    print(f"❌ Command failed: {error}")
                    
                    # This will tell us if it's a registration issue
                    if "not available" in error:
                        print("🔍 This confirms the telescope is not registered in WebSocket manager")
                        
    except Exception as e:
        print(f"❌ Command test failed: {e}")


async def main():
    print("=" * 60)
    print("🔍 WEBSOCKET MANAGER STATE DEBUG")
    print("=" * 60)
    
    await debug_manager_internals()
    await test_command_directly()
    
    print("\n" + "=" * 60)
    print("📝 SUMMARY")
    print("=" * 60)
    print("The issue is likely that the remote telescope registration")
    print("didn't work properly due to the bug we fixed. The fix will")
    print("only take effect when:")
    print("1. The server is restarted, OR")
    print("2. The remote controller is successfully re-registered")
    print()
    print("Since the remote controller shows as 'disconnected', the")
    print("WebSocket registration part isn't working properly.")


if __name__ == "__main__":
    asyncio.run(main())