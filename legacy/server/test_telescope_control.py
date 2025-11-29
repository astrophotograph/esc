#!/usr/bin/env python3
"""
Extended WebSocket test for telescope control and status updates.

Usage:
    python test_telescope_control.py [telescope_id]
"""

import asyncio
import json
import sys
import time
from typing import Optional

import websockets


class TelescopeControlTester:
    def __init__(self, base_url: str = "ws://localhost:8000"):
        self.base_url = base_url
        self.ws: Optional[websockets.WebSocketServerProtocol] = None
        self.message_count = 0

    async def test_control_commands(self, telescope_id: str):
        """Test sending control commands to a telescope."""

        ws_url = f"{self.base_url}/api/ws/{telescope_id}"
        print(f"🎮 Testing telescope control for {telescope_id}")
        print(f"Connecting to: {ws_url}")

        try:
            self.ws = await websockets.connect(ws_url)
            print("✅ WebSocket connected successfully!")

            # Send subscription first
            await self._send_subscription(telescope_id)

            # Wait a bit for subscription to take effect
            await asyncio.sleep(1)

            # Send a simple status request command
            await self._send_status_request(telescope_id)

            # Listen for responses
            await self._listen_for_responses(duration=15)

        except Exception as e:
            print(f"❌ Control test failed: {e}")
        finally:
            if self.ws:
                await self.ws.close()
                print("🔌 WebSocket disconnected")

    async def _send_subscription(self, telescope_id: str):
        """Send subscription message."""
        subscription_msg = {
            "id": f"sub-{int(time.time() * 1000)}",
            "type": "subscribe",
            "telescope_id": telescope_id,
            "timestamp": int(time.time() * 1000),
            "payload": {"subscription_types": ["all"], "all_telescopes": False},
        }

        print(f"📤 Sending subscription...")
        await self.ws.send(json.dumps(subscription_msg))
        print("✅ Subscription sent")

    async def _send_status_request(self, telescope_id: str):
        """Send a status request command."""
        command_msg = {
            "id": f"cmd-{int(time.time() * 1000)}",
            "type": "control_command",
            "telescope_id": telescope_id,
            "timestamp": int(time.time() * 1000),
            "payload": {
                "action": "get_status",
                "parameters": {},
                "response_expected": True,
            },
        }

        print(f"📤 Sending status request command...")
        await self.ws.send(json.dumps(command_msg))
        print("✅ Status request sent")

    async def _send_test_command(self, telescope_id: str):
        """Send a test move command (safe command)."""
        # Don't actually move the telescope, just test the command structure
        command_msg = {
            "id": f"cmd-move-{int(time.time() * 1000)}",
            "type": "control_command",
            "telescope_id": telescope_id,
            "timestamp": int(time.time() * 1000),
            "payload": {
                "action": "move",
                "parameters": {
                    "direction": "up",
                    "duration": 0.1,  # Very short move for testing
                },
                "response_expected": True,
            },
        }

        print(f"📤 Sending test move command...")
        await self.ws.send(json.dumps(command_msg))
        print("✅ Test command sent")

    async def _listen_for_responses(self, duration: int = 15):
        """Listen for responses and status updates."""
        print(f"👂 Listening for responses for {duration} seconds...")

        try:
            end_time = time.time() + duration

            while time.time() < end_time:
                try:
                    remaining_time = end_time - time.time()
                    if remaining_time <= 0:
                        break

                    message = await asyncio.wait_for(
                        self.ws.recv(), timeout=min(remaining_time, 2.0)
                    )

                    self.message_count += 1

                    try:
                        parsed = json.loads(message)
                        msg_type = parsed.get("type", "unknown")

                        if msg_type == "heartbeat":
                            print("💓 Heartbeat")
                        elif msg_type == "status_update":
                            print(f"📊 Status Update #{self.message_count}:")
                            print(f"   Telescope: {parsed.get('telescope_id')}")
                            if "payload" in parsed and "status" in parsed["payload"]:
                                status = parsed["payload"]["status"]
                                # Show key status fields
                                battery = status.get("battery_capacity", "N/A")
                                temp = status.get("temp", "N/A")
                                print(f"   Battery: {battery}%, Temp: {temp}°C")
                            print(f"   Full message: {json.dumps(parsed, indent=2)}")
                        elif msg_type == "command_response":
                            print(f"🎯 Command Response #{self.message_count}:")
                            print(
                                f"   Success: {parsed.get('payload', {}).get('success', 'unknown')}"
                            )
                            print(f"   Full message: {json.dumps(parsed, indent=2)}")
                        elif msg_type == "error":
                            print(f"❌ Error Message #{self.message_count}:")
                            print(
                                f"   Error: {parsed.get('payload', {}).get('message', 'unknown')}"
                            )
                            print(f"   Full message: {json.dumps(parsed, indent=2)}")
                        else:
                            print(f"📨 Message #{self.message_count} ({msg_type}):")
                            print(f"   {json.dumps(parsed, indent=2)}")

                    except json.JSONDecodeError:
                        print(f"📨 Raw message #{self.message_count}: {message}")

                except asyncio.TimeoutError:
                    print(".", end="", flush=True)
                    continue

        except Exception as e:
            print(f"\n❌ Error while listening: {e}")

        print(f"\n📈 Total messages received: {self.message_count}")


async def main():
    """Main test function."""
    if len(sys.argv) < 2:
        print("❌ Please provide a telescope ID")
        print("Usage: python test_telescope_control.py <telescope_id>")
        print("Example: python test_telescope_control.py 870c9918")
        sys.exit(1)

    telescope_id = sys.argv[1]

    print("=" * 60)
    print(f"🎮 TELESCOPE CONTROL TEST")
    print(f"🔭 Telescope ID: {telescope_id}")
    print("=" * 60)

    tester = TelescopeControlTester()
    await tester.test_control_commands(telescope_id)

    print("\n" + "=" * 60)
    print("✅ Control test completed!")


if __name__ == "__main__":
    asyncio.run(main())
