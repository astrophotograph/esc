#!/usr/bin/env python3
"""Example usage of wait_for_event_completion with telescope operations."""

import asyncio
from smarttel.seestar.client import SeestarClient
from smarttel.seestar.commands.parameterized import (
    IscopeStartView,
    IscopeStartViewParams,
)
from smarttel.seestar.commands.simple import ScopeFocusIn, ScopeFocusOut
from smarttel.util.eventbus import EventBus


async def goto_with_completion(
    client: SeestarClient, target_name: str, ra: float, dec: float
):
    """Perform a goto operation and wait for completion."""
    print(f"Starting goto to {target_name} (RA: {ra}, Dec: {dec})")

    # Start the goto operation
    command = IscopeStartView(
        params=IscopeStartViewParams(
            mode="star", target_name=target_name, target_ra_dec=(ra, dec)
        )
    )

    # Send command (this would be async in real usage)
    client.send_command(command)

    # Wait for the AutoGoto event to complete
    try:
        success = await client.wait_for_event_completion("AutoGoto", timeout=120.0)
        if success:
            print(f"✓ Goto to {target_name} completed successfully")
            return True
        else:
            print(f"✗ Goto to {target_name} failed or was cancelled")
            return False
    except asyncio.TimeoutError:
        print(f"✗ Goto to {target_name} timed out after 2 minutes")
        return False


async def focus_with_completion(
    client: SeestarClient, direction: str, steps: int = 100
):
    """Perform focus adjustment and wait for completion."""
    print(f"Starting focus {direction} ({steps} steps)")

    # Send focus command
    if direction.lower() == "in":
        command = ScopeFocusIn(params=steps)
    else:
        command = ScopeFocusOut(params=steps)

    client.send_command(command)

    # Wait for the FocuserMove event to complete
    try:
        success = await client.wait_for_event_completion("FocuserMove", timeout=30.0)
        if success:
            print(f"✓ Focus {direction} completed successfully")
            return True
        else:
            print(f"✗ Focus {direction} failed")
            return False
    except asyncio.TimeoutError:
        print(f"✗ Focus {direction} timed out")
        return False


async def automated_observation_sequence():
    """Example of an automated observation sequence using event completion."""
    print("=== Automated Observation Sequence ===\n")

    # This would normally connect to a real telescope
    event_bus = EventBus()
    client = SeestarClient("seestar.local", 4700, event_bus)

    # Example targets
    targets = [
        ("M31 - Andromeda Galaxy", 10.6847, 41.2691),
        ("M42 - Orion Nebula", 83.8221, -5.3911),
        ("M13 - Hercules Cluster", 250.4232, 36.4631),
    ]

    for target_name, ra, dec in targets:
        print(f"\n--- Observing {target_name} ---")

        # Step 1: Goto target
        goto_success = await goto_with_completion(client, target_name, ra, dec)
        if not goto_success:
            print(f"Skipping {target_name} due to goto failure")
            continue

        # Step 2: Fine focus adjustment
        focus_success = await focus_with_completion(client, "in", 50)
        if not focus_success:
            print(f"Warning: Focus adjustment failed for {target_name}")

        # Step 3: Start imaging (this would use a different event type)
        print(f"Starting 5-minute exposure of {target_name}")
        # In real usage, you might wait for "ContinuousExposure" or "Stack" events

        await asyncio.sleep(1)  # Simulate some processing time

    print("\n=== Sequence Complete ===")


async def main():
    """Main function demonstrating various usage patterns."""
    print("Event Completion Function Usage Examples\n")

    # Example 1: Simple event waiting
    print("1. Basic Usage:")
    print("   success = await client.wait_for_event_completion('AutoGoto')")
    print("   # Returns True for 'complete', False for 'cancel'/'fail'\n")

    # Example 2: With timeout
    print("2. With Custom Timeout:")
    print(
        "   success = await client.wait_for_event_completion('FocuserMove', timeout=30.0)\n"
    )

    # Example 3: Error handling
    print("3. With Error Handling:")
    print("""   try:
       success = await client.wait_for_event_completion('AutoGoto')
   except asyncio.TimeoutError:
       print("Operation timed out")
   except ValueError:
       print("No event bus available")\n""")

    # Example 4: Multiple events
    print("4. Waiting for Multiple Event Types:")
    print("""   # Wait for different operations
   goto_success = await client.wait_for_event_completion('AutoGoto')
   focus_success = await client.wait_for_event_completion('FocuserMove')
   rtsp_success = await client.wait_for_event_completion('RTSP')\n""")

    print("Event types that support state completion:")
    event_types = [
        "AutoGoto",
        "AutoGotoStep",
        "ContinuousExposure",
        "FocuserMove",
        "RTSP",
        "ScopeMoveToHorizon",
        "ScopeHome",
        "Stack",
        "Annotate",
    ]
    for event_type in event_types:
        print(f"   - {event_type}")

    print("\nFor a full automated sequence example, run:")
    print("   await automated_observation_sequence()")


if __name__ == "__main__":
    asyncio.run(main())
