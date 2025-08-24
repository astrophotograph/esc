#!/usr/bin/env python3
"""
Test if we're receiving status updates from the remote telescope.
"""

import asyncio
import json
import websockets


async def test_status_updates():
    """Listen for status updates from the remote telescope."""

    print("📊 TESTING STATUS UPDATES FROM REMOTE TELESCOPE")
    print("=" * 60)

    ws_url = "ws://localhost:8000/api/ws/870c9918"

    try:
        async with websockets.connect(ws_url) as websocket:
            print(f"✅ Connected to: {ws_url}")

            # Send subscription
            subscription = {
                "id": f"status-test-{asyncio.get_event_loop().time()}",
                "type": "subscribe",
                "telescope_id": "870c9918",
                "timestamp": int(asyncio.get_event_loop().time() * 1000),
                "payload": {"subscription_types": ["status"], "all_telescopes": False},
            }

            print("📤 Sending status subscription...")
            await websocket.send(json.dumps(subscription))

            # Listen specifically for status updates
            print("👂 Listening for status updates for 30 seconds...")

            status_count = 0
            heartbeat_count = 0
            other_count = 0

            end_time = asyncio.get_event_loop().time() + 30

            while asyncio.get_event_loop().time() < end_time:
                try:
                    message = await asyncio.wait_for(websocket.recv(), timeout=2.0)
                    parsed = json.loads(message)
                    msg_type = parsed.get("type", "unknown")

                    if msg_type == "status_update":
                        status_count += 1
                        print(f"📊 Status Update #{status_count}:")

                        # Show key status info
                        status = parsed.get("payload", {}).get("status", {})
                        temp = status.get("temp", "N/A")
                        battery = status.get("battery_capacity", "N/A")
                        stage = status.get("stage", "N/A")
                        target = status.get("target_name", "N/A")

                        print(f"   Temperature: {temp}°C")
                        print(f"   Battery: {battery}%")
                        print(f"   Stage: {stage}")
                        print(f"   Target: {target}")

                    elif msg_type == "heartbeat":
                        heartbeat_count += 1
                        if heartbeat_count <= 3:
                            print(f"💓 Heartbeat #{heartbeat_count}")
                        elif heartbeat_count == 4:
                            print("💓 ... (further heartbeats hidden)")

                    else:
                        other_count += 1
                        print(f"📨 Other message #{other_count} ({msg_type})")

                except asyncio.TimeoutError:
                    print(".", end="", flush=True)

            print(f"\n📈 Summary:")
            print(f"   Status updates: {status_count}")
            print(f"   Heartbeats: {heartbeat_count}")
            print(f"   Other messages: {other_count}")

            if status_count > 0:
                print("✅ Remote telescope status updates are working!")
            else:
                print("❌ No status updates received from remote telescope")

    except Exception as e:
        print(f"❌ Status test failed: {e}")


if __name__ == "__main__":
    asyncio.run(test_status_updates())
