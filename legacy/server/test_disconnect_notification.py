#!/usr/bin/env python3
"""
Test script to verify telescope disconnection notifications via WebSocket.

This script:
1. Connects to the WebSocket endpoint
2. Subscribes to telescope status updates
3. Listens for disconnection notifications
4. Prints notifications when received
"""

import asyncio
import json
import time
import sys
from typing import Optional
import websockets
from loguru import logger


class DisconnectionTestClient:
    """Test client for monitoring telescope disconnection notifications."""
    
    def __init__(self, websocket_url: str = "ws://localhost:8000/api/ws"):
        self.websocket_url = websocket_url
        self.websocket: Optional[websockets.WebSocketClientProtocol] = None
        self.running = False
        
    async def connect(self):
        """Connect to the WebSocket server."""
        try:
            logger.info(f"Connecting to {self.websocket_url}...")
            self.websocket = await websockets.connect(self.websocket_url)
            logger.success("Connected to WebSocket server")
            return True
        except Exception as e:
            logger.error(f"Failed to connect: {e}")
            return False
    
    async def subscribe_to_telescopes(self):
        """Subscribe to all telescope status updates."""
        if not self.websocket:
            logger.error("Not connected to WebSocket")
            return
        
        # Subscribe to all telescopes
        subscribe_msg = {
            "type": "subscribe",
            "payload": {
                "all_telescopes": True,
                "subscription_types": ["status", "all"]
            }
        }
        
        await self.websocket.send(json.dumps(subscribe_msg))
        logger.info("Subscribed to all telescope status updates")
    
    async def listen_for_notifications(self):
        """Listen for disconnection notifications."""
        if not self.websocket:
            logger.error("Not connected to WebSocket")
            return
        
        self.running = True
        logger.info("Listening for disconnection notifications...")
        logger.info("Waiting for telescopes to disconnect (this may take a few seconds)...")
        print("\n" + "="*60)
        print("MONITORING FOR TELESCOPE DISCONNECTION EVENTS")
        print("="*60 + "\n")
        
        try:
            while self.running:
                try:
                    # Wait for a message with timeout
                    message = await asyncio.wait_for(
                        self.websocket.recv(),
                        timeout=1.0
                    )
                    
                    # Parse the message
                    data = json.loads(message)
                    
                    # Check for telescope_lost messages
                    if data.get("type") == "telescope_lost":
                        telescope_id = data.get("telescope_id", "unknown")
                        payload = data.get("payload", {})
                        reason = payload.get("reason", "Unknown reason")
                        show_test_pattern = payload.get("show_test_pattern", False)
                        
                        print(f"\n🔴 TELESCOPE DISCONNECTED!")
                        print(f"   Telescope ID: {telescope_id}")
                        print(f"   Reason: {reason}")
                        print(f"   Show Test Pattern: {show_test_pattern}")
                        print(f"   Timestamp: {time.strftime('%Y-%m-%d %H:%M:%S')}")
                        print("-" * 40)
                        
                        if show_test_pattern:
                            print("   📺 CLIENT SHOULD DISPLAY TEST PATTERN")
                            print("-" * 40)
                        
                        logger.warning(f"Telescope {telescope_id} disconnected: {reason} (show_test_pattern={show_test_pattern})")
                    
                    # Check for connection_lost events
                    elif data.get("type") == "event":
                        payload = data.get("payload", {})
                        if payload.get("event_type") == "connection_lost":
                            telescope_id = data.get("telescope_id", "unknown")
                            duration = payload.get("disconnect_duration", 0)
                            reason = payload.get("reason", "Unknown")
                            failures = payload.get("health_check_failures", 0)
                            
                            print(f"\n⚠️  DETAILED DISCONNECTION EVENT:")
                            print(f"   Telescope ID: {telescope_id}")
                            print(f"   Disconnect Duration: {duration:.1f} seconds")
                            print(f"   Health Check Failures: {failures}")
                            print(f"   Reason: {reason}")
                            print(f"   Timestamp: {time.strftime('%Y-%m-%d %H:%M:%S')}")
                            print("-" * 40)
                            
                            logger.info(
                                f"Detailed disconnect event for {telescope_id}: "
                                f"duration={duration:.1f}s, failures={failures}"
                            )
                    
                    # Log heartbeats (but don't print them)
                    elif data.get("type") == "heartbeat":
                        logger.trace("Received heartbeat")
                    
                    # Log other message types
                    else:
                        msg_type = data.get("type", "unknown")
                        if msg_type not in ["status_update", "echo_request"]:
                            logger.debug(f"Received message type: {msg_type}")
                        
                except asyncio.TimeoutError:
                    # No message received, continue
                    continue
                except json.JSONDecodeError as e:
                    logger.error(f"Failed to parse message: {e}")
                    continue
                    
        except websockets.exceptions.ConnectionClosed:
            logger.warning("WebSocket connection closed")
        except KeyboardInterrupt:
            logger.info("Interrupted by user")
        except Exception as e:
            logger.error(f"Error in listener: {e}")
        finally:
            self.running = False
    
    async def disconnect(self):
        """Disconnect from the WebSocket server."""
        if self.websocket:
            await self.websocket.close()
            logger.info("Disconnected from WebSocket server")
    
    async def run_test(self):
        """Run the disconnection notification test."""
        # Connect to WebSocket
        if not await self.connect():
            return
        
        try:
            # Subscribe to telescopes
            await self.subscribe_to_telescopes()
            
            # Listen for notifications
            await self.listen_for_notifications()
            
        finally:
            await self.disconnect()


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
    print("TELESCOPE DISCONNECTION NOTIFICATION TEST")
    print("="*60)
    print("\nThis test will monitor for telescope disconnection notifications.")
    print("Notifications should appear when a telescope:")
    print("  - Loses connection for more than 3 seconds")
    print("  - Fails multiple health checks")
    print("  - Has been idle for too long")
    print("\nPress Ctrl+C to stop monitoring.\n")
    
    # Create and run test client
    client = DisconnectionTestClient()
    await client.run_test()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n\nTest stopped by user.")
    except Exception as e:
        logger.error(f"Test failed: {e}")
        sys.exit(1)