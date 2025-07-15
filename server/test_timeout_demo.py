#!/usr/bin/env python3
"""
Manual demonstration of timeout functionality.
This script shows the timeout behavior in action.
"""

import asyncio
import time
from smarttel.seestar.connection import SeestarConnection
from smarttel.seestar.client import SeestarClient
from smarttel.seestar.imaging_client import SeestarImagingClient
from smarttel.util.eventbus import EventBus


async def demo_connection_timeout():
    """Demonstrate connection timeout."""
    print("=== Connection Timeout Demo ===")

    # Short timeout for quick demo
    conn = SeestarConnection("10.255.255.1", 1234, connection_timeout=1.0)

    print(
        f"Attempting to connect to {conn.host}:{conn.port} with {conn.connection_timeout}s timeout..."
    )
    start_time = time.time()

    try:
        await conn.open()
        print("❌ Connection unexpectedly succeeded!")
    except asyncio.TimeoutError:
        elapsed = time.time() - start_time
        print(
            f"✅ Connection timed out after {elapsed:.2f}s (expected ~{conn.connection_timeout}s)"
        )
    except Exception as e:
        print(f"❌ Unexpected error: {e}")


async def demo_client_timeout():
    """Demonstrate client timeout configuration."""
    print("\n=== Client Timeout Configuration Demo ===")

    event_bus = EventBus()

    # Create clients with different timeout configurations
    fast_client = SeestarClient(
        "10.255.255.1",
        1234,
        event_bus,
        connection_timeout=0.5,
        read_timeout=1.0,
        write_timeout=0.5,
    )

    slow_client = SeestarClient(
        "10.255.255.1",
        1234,
        event_bus,
        connection_timeout=2.0,
        read_timeout=10.0,
        write_timeout=2.0,
    )

    print(
        f"Fast client timeouts: conn={fast_client.connection_timeout}s, read={fast_client.read_timeout}s, write={fast_client.write_timeout}s"
    )
    print(
        f"Slow client timeouts: conn={slow_client.connection_timeout}s, read={slow_client.read_timeout}s, write={slow_client.write_timeout}s"
    )

    # Test fast client timeout
    print("\nTesting fast client timeout...")
    start_time = time.time()
    try:
        await fast_client.connect()
        print("❌ Fast client unexpectedly connected!")
    except asyncio.TimeoutError:
        elapsed = time.time() - start_time
        print(f"✅ Fast client timed out after {elapsed:.2f}s")

    # Test slow client timeout (we'll let it run a bit longer)
    print("\nTesting slow client timeout...")
    start_time = time.time()
    try:
        await slow_client.connect()
        print("❌ Slow client unexpectedly connected!")
    except asyncio.TimeoutError:
        elapsed = time.time() - start_time
        print(f"✅ Slow client timed out after {elapsed:.2f}s")


async def demo_imaging_client_timeout():
    """Demonstrate imaging client timeout configuration."""
    print("\n=== Imaging Client Timeout Demo ===")

    event_bus = EventBus()

    # Imaging client with longer timeouts for large image transfers
    imaging_client = SeestarImagingClient(
        "10.255.255.1",
        1234,
        event_bus,
        connection_timeout=3.0,
        read_timeout=30.0,  # Longer for image data
        write_timeout=5.0,
    )

    print(
        f"Imaging client timeouts: conn={imaging_client.connection_timeout}s, read={imaging_client.read_timeout}s, write={imaging_client.write_timeout}s"
    )

    start_time = time.time()
    try:
        await imaging_client.connect()
        print("❌ Imaging client unexpectedly connected!")
    except asyncio.TimeoutError:
        elapsed = time.time() - start_time
        print(f"✅ Imaging client timed out after {elapsed:.2f}s")


async def demo_timeout_error_handling():
    """Demonstrate timeout error classification."""
    print("\n=== Timeout Error Classification Demo ===")

    conn = SeestarConnection("localhost", 8080)

    # Test that TimeoutError is classified as a connection reset error
    timeout_error = asyncio.TimeoutError()
    is_connection_error = conn._is_connection_reset_error(timeout_error)
    print(f"TimeoutError classified as connection reset error: {is_connection_error}")

    # Test other error types
    other_errors = [
        ConnectionResetError(),
        BrokenPipeError(),
        OSError(),
        ValueError(),
        TypeError(),
    ]

    for error in other_errors:
        is_connection_error = conn._is_connection_reset_error(error)
        print(
            f"{type(error).__name__} classified as connection reset error: {is_connection_error}"
        )


def demo_timeout_configuration():
    """Demonstrate timeout configuration options."""
    print("\n=== Timeout Configuration Demo ===")

    # Default timeouts
    conn_default = SeestarConnection("localhost", 8080)
    print(
        f"Default timeouts: conn={conn_default.connection_timeout}s, read={conn_default.read_timeout}s, write={conn_default.write_timeout}s"
    )

    # Custom timeouts
    conn_custom = SeestarConnection(
        "localhost", 8080, connection_timeout=5.0, read_timeout=60.0, write_timeout=15.0
    )
    print(
        f"Custom timeouts: conn={conn_custom.connection_timeout}s, read={conn_custom.read_timeout}s, write={conn_custom.write_timeout}s"
    )

    # Very fast timeouts for testing
    conn_fast = SeestarConnection(
        "localhost", 8080, connection_timeout=0.1, read_timeout=0.5, write_timeout=0.2
    )
    print(
        f"Fast timeouts: conn={conn_fast.connection_timeout}s, read={conn_fast.read_timeout}s, write={conn_fast.write_timeout}s"
    )


async def main():
    """Run all timeout demos."""
    print("🔍 Timeout Functionality Demonstration")
    print("=====================================")

    # Configuration demo (synchronous)
    demo_timeout_configuration()

    # Async demos
    await demo_connection_timeout()
    await demo_client_timeout()
    await demo_imaging_client_timeout()
    await demo_timeout_error_handling()

    print("\n✅ All timeout demos completed!")
    print("\nKey takeaways:")
    print("- Connection timeouts prevent hanging on unreachable hosts")
    print("- Read/write timeouts handle slow network conditions")
    print("- Different clients can have different timeout configurations")
    print("- Timeout errors are properly classified for reconnection logic")


if __name__ == "__main__":
    asyncio.run(main())
