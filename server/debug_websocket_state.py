#!/usr/bin/env python3
"""
Debug script to check WebSocket manager state and telescope registrations.
"""

import asyncio
import json
import httpx


async def check_websocket_manager_state():
    """Check the internal state of the WebSocket manager."""

    try:
        async with httpx.AsyncClient() as client:
            # Get health endpoint
            print("🔍 Checking WebSocket manager health...")
            response = await client.get("http://localhost:8000/api/ws/health")

            if response.status_code == 200:
                health_data = response.json()
                print(f"✅ WebSocket Health: {json.dumps(health_data, indent=2)}")

                # Check active connections
                print(
                    f"\n📊 Active Connections: {health_data.get('active_connections', 0)}"
                )
                print(
                    f"📡 Registered Telescopes: {health_data.get('registered_telescopes', 0)}"
                )

                # Show connection details
                connections = health_data.get("connection_details", [])
                for i, conn in enumerate(connections):
                    print(f"\n🔗 Connection {i + 1}:")
                    print(f"   ID: {conn.get('connection_id')}")
                    print(f"   Alive: {conn.get('is_alive')}")
                    print(
                        f"   Subscriptions: {json.dumps(conn.get('subscriptions', {}), indent=4)}"
                    )

            else:
                print(f"❌ Health check failed: {response.status_code}")

    except Exception as e:
        print(f"❌ Failed to check WebSocket health: {e}")


async def check_telescope_api():
    """Check the telescope API to see what telescopes are available."""

    try:
        async with httpx.AsyncClient() as client:
            print("\n🔭 Checking telescope API...")
            response = await client.get("http://localhost:8000/api/telescopes")

            if response.status_code == 200:
                telescopes = response.json()
                print(f"✅ Found {len(telescopes)} telescopes:")

                for i, telescope in enumerate(telescopes):
                    print(f"\n🔭 Telescope {i + 1}:")
                    print(f"   Name: {telescope.get('name')}")
                    print(
                        f"   ID/Serial: {telescope.get('id', telescope.get('serial_number'))}"
                    )
                    print(f"   Host: {telescope.get('host')}:{telescope.get('port')}")
                    print(f"   Connected: {telescope.get('connected')}")
                    print(f"   Is Remote: {telescope.get('is_remote')}")
                    print(f"   Remote Controller: {telescope.get('remote_controller')}")

            else:
                print(f"❌ Telescope API failed: {response.status_code}")

    except Exception as e:
        print(f"❌ Failed to check telescope API: {e}")


async def test_specific_telescope(telescope_id: str):
    """Test specific telescope availability via WebSocket command."""

    import websockets

    try:
        print(f"\n🎯 Testing specific telescope: {telescope_id}")

        # Connect to WebSocket
        ws_url = f"ws://localhost:8000/api/ws/{telescope_id}"
        async with websockets.connect(ws_url) as websocket:
            print(f"✅ Connected to: {ws_url}")

            # Send a test command
            test_command = {
                "id": f"debug-{asyncio.get_event_loop().time()}",
                "type": "control_command",
                "telescope_id": telescope_id,
                "timestamp": int(asyncio.get_event_loop().time() * 1000),
                "payload": {
                    "action": "get_status",
                    "parameters": {},
                    "response_expected": True,
                },
            }

            print(f"📤 Sending test command...")
            await websocket.send(json.dumps(test_command))

            # Wait for response
            print(f"👂 Waiting for response...")
            try:
                response = await asyncio.wait_for(websocket.recv(), timeout=5.0)
                parsed = json.loads(response)

                if parsed.get("type") == "command_response":
                    success = parsed.get("payload", {}).get("success", False)
                    error = parsed.get("payload", {}).get("error")

                    if success:
                        print(f"✅ Command succeeded!")
                    else:
                        print(f"❌ Command failed: {error}")
                else:
                    print(f"📨 Received: {json.dumps(parsed, indent=2)}")

            except asyncio.TimeoutError:
                print(f"⏰ Timeout waiting for response")

    except Exception as e:
        print(f"❌ Failed to test telescope {telescope_id}: {e}")


async def check_remote_controllers():
    """Check remote controllers endpoint."""

    try:
        async with httpx.AsyncClient() as client:
            print("\n🌐 Checking remote controllers...")
            response = await client.get("http://localhost:8000/api/remote-controllers")

            if response.status_code == 200:
                controllers = response.json()
                print(f"✅ Found {len(controllers)} remote controllers:")

                for controller_key, controller_data in controllers.items():
                    print(f"\n🎮 Controller: {controller_key}")
                    print(
                        f"   Host: {controller_data.get('host')}:{controller_data.get('port')}"
                    )
                    print(f"   Status: {controller_data.get('status')}")
                    print(f"   Last Seen: {controller_data.get('last_seen')}")

                    telescopes = controller_data.get("telescopes", {})
                    print(f"   Telescopes: {len(telescopes)}")
                    for tel_name, tel_data in telescopes.items():
                        print(
                            f"     - {tel_name}: {tel_data.get('serial_number')} ({'connected' if tel_data.get('connected') else 'disconnected'})"
                        )

            else:
                print(f"❌ Remote controllers API failed: {response.status_code}")

    except Exception as e:
        print(f"❌ Failed to check remote controllers: {e}")


async def main():
    """Main debug function."""

    print("=" * 60)
    print("🐛 WEBSOCKET MANAGER DEBUG TOOL")
    print("=" * 60)

    # Check all the things
    await check_websocket_manager_state()
    await check_telescope_api()
    await check_remote_controllers()

    # Test specific telescope
    telescope_id = "870c9918"
    await test_specific_telescope(telescope_id)

    print("\n" + "=" * 60)
    print("🏁 Debug check completed!")


if __name__ == "__main__":
    asyncio.run(main())
