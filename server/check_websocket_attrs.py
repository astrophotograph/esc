#!/usr/bin/env python3
"""
Check the actual attributes and methods of websockets ClientConnection.
"""

import asyncio
import websockets


async def check_websocket_attributes():
    """Check what attributes are available on ClientConnection."""
    
    try:
        async with websockets.connect("ws://100.118.8.52:8000/api/ws/870c9918") as websocket:
            print("🔍 WebSocket ClientConnection attributes:")
            print("=" * 50)
            
            # Get all attributes
            attrs = [attr for attr in dir(websocket) if not attr.startswith('_')]
            print(f"📝 Available attributes ({len(attrs)}):")
            for attr in sorted(attrs):
                try:
                    value = getattr(websocket, attr)
                    if callable(value):
                        print(f"   {attr}() - method")
                    else:
                        print(f"   {attr} = {value} ({type(value).__name__})")
                except Exception as e:
                    print(f"   {attr} - error: {e}")
            
            print("\n🔗 Connection state properties:")
            
            # Check specific state properties
            state_attrs = ['closed', 'close_code', 'close_reason', 'state']
            for attr in state_attrs:
                if hasattr(websocket, attr):
                    try:
                        value = getattr(websocket, attr)
                        print(f"   ✅ {attr}: {value} ({type(value).__name__})")
                    except Exception as e:
                        print(f"   ❌ {attr}: error - {e}")
                else:
                    print(f"   ❌ {attr}: not found")
            
            # Try some common connection state checks
            print("\n🧪 Testing connection state checks:")
            try:
                # Test different ways to check if connected
                print(f"   websocket.state: {websocket.state}")
                
                # Check if we can import the state enum
                from websockets.protocol import State
                print(f"   State.OPEN: {State.OPEN}")
                print(f"   websocket.state == State.OPEN: {websocket.state == State.OPEN}")
                
            except Exception as e:
                print(f"   State check error: {e}")
                
    except Exception as e:
        print(f"❌ Failed to connect: {e}")


if __name__ == "__main__":
    asyncio.run(check_websocket_attributes())