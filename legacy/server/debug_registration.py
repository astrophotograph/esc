#!/usr/bin/env python3
"""
Debug remote telescope registration issue by checking the actual registration process.
"""

import asyncio
import json
import httpx


async def test_registration_process():
    """Test the entire registration process step by step."""

    print("🔍 DEBUGGING REMOTE TELESCOPE REGISTRATION")
    print("=" * 60)

    # Step 1: Check if remote controller is reachable
    print("📡 Step 1: Testing remote controller connectivity...")
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get("http://100.118.8.52:8000/api/telescopes")
            if response.status_code == 200:
                telescopes = response.json()
                print(
                    f"✅ Remote controller reachable, found {len(telescopes)} telescopes:"
                )
                for telescope in telescopes:
                    print(
                        f"   - {telescope.get('name')}: {telescope.get('serial_number')}"
                    )
            else:
                print(f"❌ Remote controller returned {response.status_code}")
                return
    except Exception as e:
        print(f"❌ Cannot reach remote controller: {e}")
        return

    # Step 2: Check local server telescope list
    print("\n🔭 Step 2: Checking local server telescope list...")
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get("http://localhost:8000/api/telescopes")
            if response.status_code == 200:
                local_telescopes = response.json()
                print(f"✅ Local server has {len(local_telescopes)} telescopes:")
                target_found = False
                for telescope in local_telescopes:
                    name = telescope.get("name")
                    is_remote = telescope.get("is_remote", False)
                    connected = telescope.get("connected", False)
                    print(
                        f"   - {name}: {'remote' if is_remote else 'local'}, {'connected' if connected else 'disconnected'}"
                    )
                    if name == "870c9918":
                        target_found = True
                        print(
                            f"     🎯 Target telescope found: remote={is_remote}, connected={connected}"
                        )

                if not target_found:
                    print(
                        "❌ Target telescope 870c9918 not found in local server list!"
                    )
                    return
            else:
                print(f"❌ Local server returned {response.status_code}")
                return
    except Exception as e:
        print(f"❌ Cannot reach local server: {e}")
        return

    # Step 3: Check remote controllers status
    print("\n🌐 Step 3: Checking remote controllers registration...")
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get("http://localhost:8000/api/remote-controllers")
            if response.status_code == 200:
                controllers = response.json()
                print(f"✅ Found {len(controllers)} remote controllers:")
                for controller in controllers:
                    host = controller.get("host")
                    port = controller.get("port")
                    status = controller.get("status")
                    telescopes_count = controller.get("telescopes_count", 0)
                    print(
                        f"   - {host}:{port}: {status}, {telescopes_count} telescopes"
                    )

                    if host == "100.118.8.52" and port == 8000:
                        if status == "connected":
                            print("     ✅ Target controller is connected")
                        else:
                            print(f"     ❌ Target controller status: {status}")
            else:
                print(f"❌ Remote controllers endpoint returned {response.status_code}")
    except Exception as e:
        print(f"❌ Cannot check remote controllers: {e}")

    # Step 4: Test WebSocket manager state
    print("\n🔧 Step 4: Checking WebSocket manager state...")
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get("http://localhost:8000/api/ws/health")
            if response.status_code == 200:
                health = response.json()
                print(f"✅ WebSocket manager: {health.get('status')}")
                print(f"   Active connections: {health.get('active_connections')}")
                print(
                    f"   Registered telescopes: {health.get('registered_telescopes')}"
                )

                # Note: The health endpoint doesn't show local vs remote breakdown
                # That's why we need the debug endpoint

            else:
                print(f"❌ WebSocket health endpoint returned {response.status_code}")
    except Exception as e:
        print(f"❌ Cannot check WebSocket health: {e}")

    # Step 5: Test actual command
    print("\n🎯 Step 5: Testing actual WebSocket command...")
    import websockets

    try:
        ws_url = "ws://localhost:8000/api/ws/870c9918"
        async with websockets.connect(ws_url) as websocket:
            command = {
                "id": "debug-test",
                "type": "control_command",
                "telescope_id": "870c9918",
                "timestamp": 1000000000000,
                "payload": {
                    "action": "get_status",
                    "parameters": {},
                    "response_expected": True,
                },
            }

            await websocket.send(json.dumps(command))
            response = await asyncio.wait_for(websocket.recv(), timeout=3.0)
            parsed = json.loads(response)

            if parsed.get("type") == "command_response":
                success = parsed.get("payload", {}).get("success", False)
                error = parsed.get("payload", {}).get("error")

                if success:
                    print("✅ Command succeeded!")
                else:
                    print(f"❌ Command failed: {error}")

                    # Analyze the error
                    if "not available" in str(error):
                        print(
                            "🔍 Analysis: Telescope not registered in WebSocket manager"
                        )
                        print(
                            "   This means the remote controller registration didn't work properly"
                        )
            else:
                print(f"📨 Unexpected response type: {parsed.get('type')}")

    except Exception as e:
        print(f"❌ WebSocket command test failed: {e}")

    print("\n" + "=" * 60)
    print("📋 DIAGNOSIS:")
    print("If the remote controller is 'connected' but commands fail with")
    print("'not available', then the WebSocket registration isn't working.")
    print("This could be due to:")
    print("1. The bug fix didn't take effect (server not restarted properly)")
    print("2. The remote WebSocket connection to the remote controller is failing")
    print("3. There's another issue in the registration logic")


if __name__ == "__main__":
    asyncio.run(test_registration_process())
