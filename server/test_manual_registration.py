#!/usr/bin/env python3
"""
Manually test the remote controller registration process to see what fails.
"""

import asyncio
import logging
from remote_websocket_client import RemoteController, RemoteWebSocketManager


# Enable debug logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)


async def test_manual_registration():
    """Manually test the remote controller registration process."""
    
    print("🧪 MANUAL REMOTE CONTROLLER REGISTRATION TEST")
    print("=" * 60)
    
    # Create the same RemoteController object that main.py creates
    remote_controller = RemoteController(
        host="100.118.8.52",
        port=8000,
        telescope_id="870c9918",
        controller_id="100.118.8.52:8000"
    )
    
    print(f"📡 Created RemoteController:")
    print(f"   Host: {remote_controller.host}:{remote_controller.port}")
    print(f"   Telescope ID: {remote_controller.telescope_id}")
    print(f"   Controller ID: {remote_controller.controller_id}")
    
    # Create a message handler
    async def message_handler(telescope_id: str, message: dict):
        print(f"📨 Received message for {telescope_id}: {message.get('type', 'unknown')}")
    
    # Create the remote WebSocket manager (like in websocket_manager.py)
    remote_manager = RemoteWebSocketManager(message_handler)
    
    print(f"\n🔗 Testing RemoteWebSocketManager.add_remote_controller...")
    
    try:
        # This is what websocket_manager.register_remote_controller calls
        success = await remote_manager.add_remote_controller(remote_controller)
        print(f"📊 Registration result: {success}")
        
        if success:
            print("✅ Remote WebSocket registration succeeded!")
            
            # Check if we can send a message
            print(f"\n🎯 Testing message sending...")
            try:
                test_message = {
                    "id": "test-msg-1",
                    "type": "control_command",
                    "telescope_id": "870c9918",
                    "timestamp": 1000000000000,
                    "payload": {
                        "action": "get_status",
                        "parameters": {},
                        "response_expected": True
                    }
                }
                
                response = await remote_manager.send_to_telescope("870c9918", test_message)
                print(f"📨 Command response: {response}")
                
            except Exception as e:
                print(f"❌ Command failed: {e}")
                
        else:
            print("❌ Remote WebSocket registration failed!")
            
        # Check connection status
        status = remote_manager.get_telescope_connection_status("870c9918")
        print(f"📡 Connection status: {status}")
        
        # Keep alive for a bit to see messages
        print(f"\n👂 Listening for messages for 10 seconds...")
        await asyncio.sleep(10)
        
    except Exception as e:
        print(f"❌ Registration test failed: {e}")
        import traceback
        traceback.print_exc()
    
    finally:
        # Clean up
        await remote_manager.disconnect_all()
        print("🔌 Cleaned up connections")


if __name__ == "__main__":
    asyncio.run(test_manual_registration())