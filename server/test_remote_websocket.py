#!/usr/bin/env python3
"""
Test if we can connect to the remote controller's WebSocket endpoint directly.
"""

import asyncio
import json
import websockets


async def test_remote_websocket_connection():
    """Test direct WebSocket connection to the remote controller."""

    print("🌐 Testing direct WebSocket connection to remote controller...")

    # The URL that our RemoteWebSocketClient would use
    remote_ws_url = "ws://100.118.8.52:8000/api/ws/870c9918"

    try:
        print(f"📡 Connecting to: {remote_ws_url}")

        async with websockets.connect(
            remote_ws_url, ping_interval=30, ping_timeout=10
        ) as websocket:
            print("✅ Connected to remote WebSocket!")

            # Send a subscription like our RemoteWebSocketClient does
            subscription = {
                "id": f"test-{int(asyncio.get_event_loop().time() * 1000)}",
                "type": "subscribe",
                "telescope_id": "870c9918",
                "timestamp": int(asyncio.get_event_loop().time() * 1000),
                "payload": {"subscription_types": ["all"], "all_telescopes": False},
            }

            print("📤 Sending subscription...")
            await websocket.send(json.dumps(subscription))
            print("✅ Subscription sent")

            # Listen for messages for a bit
            print("👂 Listening for messages for 10 seconds...")
            try:
                end_time = asyncio.get_event_loop().time() + 10
                message_count = 0

                while asyncio.get_event_loop().time() < end_time:
                    try:
                        message = await asyncio.wait_for(websocket.recv(), timeout=2.0)
                        message_count += 1

                        try:
                            parsed = json.loads(message)
                            msg_type = parsed.get("type", "unknown")
                            print(
                                f"📨 Message {message_count} ({msg_type}): {json.dumps(parsed, indent=2)}"
                            )
                        except json.JSONDecodeError:
                            print(f"📨 Raw message {message_count}: {message}")

                    except asyncio.TimeoutError:
                        print(".", end="", flush=True)

                print(f"\n📊 Received {message_count} messages")

                if message_count > 0:
                    print("✅ Remote WebSocket is working and sending data!")
                else:
                    print("⚠️  Remote WebSocket connected but no messages received")

            except Exception as e:
                print(f"❌ Error while listening: {e}")

    except websockets.exceptions.ConnectionClosed as e:
        print(f"❌ Connection closed: {e}")
    except websockets.exceptions.InvalidURI as e:
        print(f"❌ Invalid URI: {e}")
    except OSError as e:
        print(f"❌ Network error: {e}")
    except Exception as e:
        print(f"❌ Unexpected error: {e}")


async def test_remote_websocket_command():
    """Test sending a command to the remote WebSocket."""

    print("\n🎯 Testing command sending to remote WebSocket...")

    remote_ws_url = "ws://100.118.8.52:8000/api/ws/870c9918"

    try:
        async with websockets.connect(remote_ws_url) as websocket:
            print("✅ Connected for command test")

            # Send a command
            command = {
                "id": f"cmd-{int(asyncio.get_event_loop().time() * 1000)}",
                "type": "control_command",
                "telescope_id": "870c9918",
                "timestamp": int(asyncio.get_event_loop().time() * 1000),
                "payload": {
                    "action": "get_status",
                    "parameters": {},
                    "response_expected": True,
                },
            }

            print("📤 Sending command...")
            await websocket.send(json.dumps(command))

            # Wait for response
            print("👂 Waiting for command response...")
            try:
                response = await asyncio.wait_for(websocket.recv(), timeout=5.0)
                parsed = json.loads(response)

                if parsed.get("type") == "command_response":
                    success = parsed.get("payload", {}).get("success", False)
                    print(f"🎯 Command response: success={success}")
                    print(f"   Full response: {json.dumps(parsed, indent=2)}")
                else:
                    print(f"📨 Unexpected response: {json.dumps(parsed, indent=2)}")

            except asyncio.TimeoutError:
                print("⏰ Timeout waiting for command response")

    except Exception as e:
        print(f"❌ Command test failed: {e}")


async def main():
    """Run remote WebSocket tests."""

    print("=" * 60)
    print("🧪 REMOTE WEBSOCKET CONNECTION TEST")
    print("=" * 60)

    await test_remote_websocket_connection()
    await test_remote_websocket_command()

    print("\n" + "=" * 60)
    print("📝 ANALYSIS:")
    print("If this test works, then the issue is in our RemoteWebSocketClient")
    print("or the registration process. If it fails, then the remote controller")
    print("has WebSocket issues.")


if __name__ == "__main__":
    asyncio.run(main())
