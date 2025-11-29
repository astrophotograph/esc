#!/usr/bin/env python3
"""
Test script to verify the full integration of telescope disconnection handling.

This tests:
1. Server sends telescope_lost message with show_test_pattern flag
2. Frontend receives message and updates telescope state
3. CameraView component detects disconnection and shows test pattern
"""

import asyncio
import json
import time
import sys
from typing import Optional
import websockets
from loguru import logger


async def test_integration():
    """Test the full disconnection flow."""
    ws_url = "ws://localhost:8000/api/ws"
    
    print("\n" + "="*60)
    print("FRONTEND INTEGRATION TEST")
    print("="*60)
    print("\nThis test verifies:")
    print("1. Server sends telescope_lost with show_test_pattern=true")
    print("2. Frontend TelescopeContext handles the message")
    print("3. CameraView shows test pattern when telescope.connected=false")
    print("\n" + "-"*60)
    
    try:
        logger.info(f"Connecting to {ws_url}...")
        async with websockets.connect(ws_url) as websocket:
            logger.success("Connected to WebSocket server")
            
            # Subscribe to all telescopes
            subscribe_msg = {
                "type": "subscribe",
                "payload": {
                    "all_telescopes": True,
                    "subscription_types": ["status", "all"]
                }
            }
            await websocket.send(json.dumps(subscribe_msg))
            logger.info("Subscribed to telescope updates")
            
            print("\n📋 EXPECTED FLOW:")
            print("1. Telescope disconnects (network issue, power off, etc.)")
            print("2. Server health monitor detects disconnection after ~3 seconds")
            print("3. Server sends telescope_lost message:")
            print("   {")
            print('     "type": "telescope_lost",')
            print('     "telescope_id": "...",')
            print('     "payload": {')
            print('       "reason": "Connection lost - no response for X.X seconds",')
            print('       "show_test_pattern": true')
            print("     }")
            print("   }")
            print("4. Frontend TelescopeContext.handleTelescopeLost() processes message")
            print("5. Sets telescope.connected = false")
            print("6. CameraView useEffect detects telescope.connected === false")
            print("7. CameraView sets connectionLost = true")
            print("8. Test pattern is displayed!")
            
            print("\n" + "-"*60)
            print("🔍 MONITORING FOR DISCONNECTION EVENTS...")
            print("(Disconnect a telescope to test)\n")
            
            # Listen for messages
            while True:
                try:
                    message = await asyncio.wait_for(websocket.recv(), timeout=1.0)
                    data = json.loads(message)
                    
                    # Check for telescope_lost message
                    if data.get("type") == "telescope_lost":
                        telescope_id = data.get("telescope_id", "unknown")
                        payload = data.get("payload", {})
                        reason = payload.get("reason", "Unknown")
                        show_test_pattern = payload.get("show_test_pattern", False)
                        
                        print(f"\n✅ STEP 3: Server sent telescope_lost message!")
                        print(f"   Telescope: {telescope_id}")
                        print(f"   Reason: {reason}")
                        print(f"   show_test_pattern: {show_test_pattern}")
                        
                        if show_test_pattern:
                            print(f"\n✅ STEP 4-8: Frontend should now:")
                            print(f"   - Process message in handleTelescopeLost()")
                            print(f"   - Set telescope.connected = false")
                            print(f"   - Trigger CameraView useEffect")
                            print(f"   - Set connectionLost = true")
                            print(f"   - Display ConnectionLostTestPattern component")
                            print(f"\n🖼️  CHECK THE UI - TEST PATTERN SHOULD BE VISIBLE!")
                        else:
                            print(f"\n⚠️  show_test_pattern is false - no test pattern expected")
                        
                        print("-" * 40)
                    
                    # Check for connection_lost event
                    elif data.get("type") == "event" and data.get("payload", {}).get("event_type") == "connection_lost":
                        telescope_id = data.get("telescope_id", "unknown")
                        payload = data.get("payload", {})
                        show_test_pattern = payload.get("show_test_pattern", False)
                        
                        print(f"\n📊 Detailed connection_lost event received")
                        print(f"   Telescope: {telescope_id}")
                        print(f"   Duration: {payload.get('disconnect_duration', 0):.1f}s")
                        print(f"   show_test_pattern: {show_test_pattern}")
                        
                except asyncio.TimeoutError:
                    continue
                except json.JSONDecodeError:
                    continue
                    
    except websockets.exceptions.ConnectionClosed:
        logger.warning("WebSocket connection closed")
    except KeyboardInterrupt:
        print("\n\nTest stopped by user")
    except Exception as e:
        logger.error(f"Test error: {e}")


async def main():
    """Main test function."""
    # Configure logging
    logger.remove()
    logger.add(
        sys.stderr,
        format="<green>{time:HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{message}</cyan>",
        level="INFO"
    )
    
    print("\n" + "="*60)
    print("TELESCOPE DISCONNECTION - FRONTEND INTEGRATION TEST")
    print("="*60)
    print("\nPREREQUISITES:")
    print("1. Server running: uv run python main.py server")
    print("2. Frontend running: npm run dev")
    print("3. Browser open to http://localhost:3000")
    print("4. At least one telescope connected")
    print("\nTO TEST:")
    print("1. Run this script")
    print("2. Disconnect a telescope (network/power)")
    print("3. Watch for test pattern in UI after ~3 seconds")
    print("\nPress Ctrl+C to stop.\n")
    
    await test_integration()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n\nTest stopped.")
    except Exception as e:
        logger.error(f"Test failed: {e}")
        sys.exit(1)