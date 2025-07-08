#!/usr/bin/env python3
"""
Simple WebSocket test utility for debugging telescope connections.

Usage:
    python test_websocket.py [telescope_id]
    
Example:
    python test_websocket.py 870c9918
"""

import asyncio
import json
import sys
import time
from typing import Optional

import websockets
from websockets.exceptions import ConnectionClosed, InvalidURI


class WebSocketTester:
    def __init__(self, base_url: str = "ws://localhost:8000"):
        self.base_url = base_url
        self.ws: Optional[websockets.WebSocketServerProtocol] = None
        
    async def test_connection(self, telescope_id: Optional[str] = None):
        """Test WebSocket connection to server."""
        
        # Build WebSocket URL
        if telescope_id:
            ws_url = f"{self.base_url}/api/ws/{telescope_id}"
            print(f"Testing telescope-specific endpoint: {ws_url}")
        else:
            ws_url = f"{self.base_url}/api/ws"
            print(f"Testing general endpoint: {ws_url}")
            
        try:
            print(f"Connecting to: {ws_url}")
            self.ws = await websockets.connect(ws_url)
            print("✅ WebSocket connected successfully!")
            
            # Send a test subscription
            await self._send_subscription(telescope_id)
            
            # Listen for messages for 10 seconds
            await self._listen_for_messages(duration=10)
            
        except ConnectionRefusedError:
            print("❌ Connection refused - is the server running on port 8000?")
        except InvalidURI as e:
            print(f"❌ Invalid URI: {e}")
        except Exception as e:
            print(f"❌ Connection failed: {e}")
        finally:
            if self.ws:
                await self.ws.close()
                print("🔌 WebSocket disconnected")
    
    async def _send_subscription(self, telescope_id: Optional[str]):
        """Send a subscription message."""
        subscription_msg = {
            "id": f"test-{int(time.time() * 1000)}",
            "type": "subscribe",
            "telescope_id": telescope_id,
            "timestamp": int(time.time() * 1000),
            "payload": {
                "subscription_types": ["all"],
                "all_telescopes": telescope_id is None
            }
        }
        
        print(f"📤 Sending subscription: {json.dumps(subscription_msg, indent=2)}")
        await self.ws.send(json.dumps(subscription_msg))
        print("✅ Subscription sent")
    
    async def _listen_for_messages(self, duration: int = 10):
        """Listen for messages for specified duration."""
        print(f"👂 Listening for messages for {duration} seconds...")
        
        try:
            # Set up timeout
            end_time = time.time() + duration
            
            while time.time() < end_time:
                try:
                    # Wait for message with timeout
                    remaining_time = end_time - time.time()
                    if remaining_time <= 0:
                        break
                        
                    message = await asyncio.wait_for(
                        self.ws.recv(), 
                        timeout=min(remaining_time, 1.0)
                    )
                    
                    try:
                        parsed = json.loads(message)
                        print(f"📨 Received message: {json.dumps(parsed, indent=2)}")
                    except json.JSONDecodeError:
                        print(f"📨 Received raw message: {message}")
                        
                except asyncio.TimeoutError:
                    print(".", end="", flush=True)  # Show we're still waiting
                    continue
                    
        except ConnectionClosed:
            print("\n❌ WebSocket connection closed by server")
        except Exception as e:
            print(f"\n❌ Error while listening: {e}")
        
        print(f"\n⏰ Finished listening after {duration} seconds")


async def test_server_health():
    """Test if the WebSocket server is responding."""
    import httpx
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get("http://localhost:8000/api/ws/health")
            print(f"🏥 Server health check: {response.status_code}")
            if response.status_code == 200:
                health_data = response.json()
                print(f"📊 Health data: {json.dumps(health_data, indent=2)}")
            else:
                print(f"❌ Health check failed with status {response.status_code}")
    except Exception as e:
        print(f"❌ Health check failed: {e}")


async def test_telescope_api(telescope_id: str):
    """Test telescope-related API endpoints."""
    import httpx
    
    print(f"\n🔭 Testing telescope API for {telescope_id}...")
    
    try:
        async with httpx.AsyncClient() as client:
            # Test telescope list
            response = await client.get("http://localhost:8000/api/telescopes")
            print(f"📡 Telescopes endpoint: {response.status_code}")
            if response.status_code == 200:
                telescopes = response.json()
                print(f"🔭 Found telescopes: {len(telescopes)}")
                
                # Look for our telescope
                target_telescope = None
                for telescope in telescopes:
                    if telescope.get("id") == telescope_id or telescope.get("serial_number") == telescope_id:
                        target_telescope = telescope
                        break
                
                if target_telescope:
                    print(f"✅ Found target telescope: {json.dumps(target_telescope, indent=2)}")
                else:
                    print(f"❌ Telescope {telescope_id} not found in list")
                    print(f"Available telescopes: {[t.get('id', 'no-id') for t in telescopes]}")
            
    except Exception as e:
        print(f"❌ API test failed: {e}")


async def main():
    """Main test function."""
    telescope_id = None
    
    if len(sys.argv) > 1:
        telescope_id = sys.argv[1]
        print(f"🎯 Testing with telescope ID: {telescope_id}")
    else:
        print("🌐 Testing general WebSocket connection (no telescope ID)")
    
    print("=" * 60)
    
    # Test server health first
    await test_server_health()
    
    # Test telescope API if telescope_id provided
    if telescope_id:
        await test_telescope_api(telescope_id)
    
    print("\n" + "=" * 60)
    print("🧪 Testing WebSocket Connection")
    print("=" * 60)
    
    # Test WebSocket connection
    tester = WebSocketTester()
    await tester.test_connection(telescope_id)
    
    print("\n" + "=" * 60)
    print("✅ Test completed!")


if __name__ == "__main__":
    asyncio.run(main())