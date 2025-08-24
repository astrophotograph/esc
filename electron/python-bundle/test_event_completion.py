#!/usr/bin/env python3
"""Test script for the wait_for_event_completion function."""

import asyncio
import time
from smarttel.seestar.client import SeestarClient
from smarttel.util.eventbus import EventBus
from smarttel.seestar.events import AutoGotoEvent, FocuserMoveEvent


async def test_event_completion():
    """Test the event completion functionality."""

    # Create event bus and client
    event_bus = EventBus()
    client = SeestarClient("localhost", 4700, event_bus)

    print("Testing wait_for_event_completion function...")

    # Test 1: Successful completion
    print("\n1. Testing successful completion (AutoGoto -> complete)")

    # Start waiting for AutoGoto completion in background
    wait_task = asyncio.create_task(
        client.wait_for_event_completion("AutoGoto", timeout=5.0)
    )

    # Simulate events
    await asyncio.sleep(0.1)  # Small delay

    # Send working state
    working_event = AutoGotoEvent(
        Event="AutoGoto", Timestamp=time.strftime("%Y-%m-%dT%H:%M:%S"), state="working"
    )
    event_bus.emit("AutoGoto", working_event)

    await asyncio.sleep(0.5)

    # Send completion
    complete_event = AutoGotoEvent(
        Event="AutoGoto", Timestamp=time.strftime("%Y-%m-%dT%H:%M:%S"), state="complete"
    )
    event_bus.emit("AutoGoto", complete_event)

    # Wait for result
    try:
        result = await wait_task
        print(f"Result: {result} (expected: True)")
    except Exception as e:
        print(f"Error: {e}")

    # Test 2: Failed completion
    print("\n2. Testing failed completion (FocuserMove -> fail)")

    wait_task = asyncio.create_task(
        client.wait_for_event_completion("FocuserMove", timeout=5.0)
    )

    await asyncio.sleep(0.1)

    # Send failure
    fail_event = FocuserMoveEvent(
        Event="FocuserMove", Timestamp=time.strftime("%Y-%m-%dT%H:%M:%S"), state="fail"
    )
    event_bus.emit("FocuserMove", fail_event)

    try:
        result = await wait_task
        print(f"Result: {result} (expected: False)")
    except Exception as e:
        print(f"Error: {e}")

    # Test 3: Timeout
    print("\n3. Testing timeout")

    try:
        result = await client.wait_for_event_completion("AutoGoto", timeout=1.0)
        print(f"Unexpected result: {result}")
    except asyncio.TimeoutError:
        print("Timeout occurred as expected")
    except Exception as e:
        print(f"Unexpected error: {e}")

    print("\nTest completed!")


if __name__ == "__main__":
    asyncio.run(test_event_completion())
