#!/usr/bin/env python3
"""
Display a test pattern when telescope disconnects.

This script monitors WebSocket for disconnection events and displays
a visual test pattern in the terminal when a telescope disconnects.
"""

import asyncio
import json
import sys
import websockets
from datetime import datetime


def show_test_pattern(telescope_id: str, reason: str):
    """Display a test pattern for disconnected telescope."""
    width = 80
    
    # Clear screen (works on Unix/Mac/Windows with ANSI support)
    print("\033[2J\033[H", end="")
    
    # Test pattern header
    print("=" * width)
    print("█" * width)
    print("█" + " " * (width - 2) + "█")
    
    # Disconnection message
    msg = "TELESCOPE DISCONNECTED"
    padding = (width - len(msg) - 2) // 2
    print("█" + " " * padding + msg + " " * (width - padding - len(msg) - 2) + "█")
    
    print("█" + " " * (width - 2) + "█")
    
    # Telescope ID
    id_line = f"Telescope: {telescope_id}"
    padding = (width - len(id_line) - 2) // 2
    print("█" + " " * padding + id_line + " " * (width - padding - len(id_line) - 2) + "█")
    
    # Reason
    reason_line = f"Reason: {reason}"
    if len(reason_line) > width - 4:
        reason_line = reason_line[:width - 7] + "..."
    padding = (width - len(reason_line) - 2) // 2
    print("█" + " " * padding + reason_line + " " * (width - padding - len(reason_line) - 2) + "█")
    
    print("█" + " " * (width - 2) + "█")
    
    # Timestamp
    time_line = f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
    padding = (width - len(time_line) - 2) // 2
    print("█" + " " * padding + time_line + " " * (width - padding - len(time_line) - 2) + "█")
    
    print("█" + " " * (width - 2) + "█")
    print("█" * width)
    print("=" * width)
    
    # Test pattern grid
    print("\nTEST PATTERN:")
    patterns = ["░░", "▒▒", "▓▓", "██", "▓▓", "▒▒", "░░"]
    for row in range(10):
        line = ""
        for col in range(40):
            pattern_idx = (row + col) % len(patterns)
            line += patterns[pattern_idx]
        print(line)
    
    print("\n" + "=" * width)
    print("Waiting for reconnection...")
    print("Press Ctrl+C to exit")
    print("=" * width)


async def monitor_disconnections(websocket_url: str = "ws://localhost:8000/api/ws"):
    """Monitor WebSocket for disconnection events."""
    print("Connecting to WebSocket server...")
    
    try:
        async with websockets.connect(websocket_url) as websocket:
            print("Connected! Monitoring for telescope disconnections...")
            print("Test pattern will display when a telescope disconnects.\n")
            
            # Subscribe to all telescopes
            subscribe_msg = {
                "type": "subscribe",
                "payload": {
                    "all_telescopes": True,
                    "subscription_types": ["status", "all"]
                }
            }
            await websocket.send(json.dumps(subscribe_msg))
            
            # Listen for messages
            while True:
                try:
                    message = await asyncio.wait_for(websocket.recv(), timeout=1.0)
                    data = json.loads(message)
                    
                    # Check for disconnection events
                    if data.get("type") == "telescope_lost":
                        telescope_id = data.get("telescope_id", "unknown")
                        reason = data.get("payload", {}).get("reason", "Connection lost")
                        show_test_pattern(telescope_id, reason)
                    
                    elif data.get("type") == "event":
                        payload = data.get("payload", {})
                        if payload.get("event_type") == "connection_lost":
                            telescope_id = data.get("telescope_id", "unknown")
                            reason = payload.get("reason", "Connection lost")
                            duration = payload.get("disconnect_duration", 0)
                            detailed_reason = f"{reason} (disconnected for {duration:.1f}s)"
                            show_test_pattern(telescope_id, detailed_reason)
                            
                except asyncio.TimeoutError:
                    continue
                except json.JSONDecodeError:
                    continue
                    
    except websockets.exceptions.ConnectionClosed:
        print("\nWebSocket connection closed")
    except KeyboardInterrupt:
        print("\nStopped by user")
    except Exception as e:
        print(f"\nError: {e}")


async def main():
    """Main function."""
    print("=" * 80)
    print("TELESCOPE DISCONNECTION TEST PATTERN MONITOR")
    print("=" * 80)
    print("\nThis will display a test pattern when a telescope disconnects.")
    print("The pattern will show:")
    print("  - Telescope ID")
    print("  - Disconnection reason")
    print("  - Timestamp")
    print("  - Visual test pattern grid")
    print("\nPress Ctrl+C to exit.\n")
    print("-" * 80 + "\n")
    
    await monitor_disconnections()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n\nMonitor stopped.")
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)