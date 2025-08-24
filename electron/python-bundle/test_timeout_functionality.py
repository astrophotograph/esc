#!/usr/bin/env python3
"""
Unit tests for timeout functionality in SeestarConnection, SeestarClient, and SeestarImagingClient.
"""

import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import socket

from smarttel.seestar.connection import SeestarConnection
from smarttel.seestar.client import SeestarClient
from smarttel.seestar.imaging_client import SeestarImagingClient
from smarttel.util.eventbus import EventBus


class TestSeestarConnectionTimeouts:
    """Test timeout functionality in SeestarConnection."""

    def test_default_timeout_values(self):
        """Test that default timeout values are set correctly."""
        conn = SeestarConnection("localhost", 8080)
        assert conn.connection_timeout == 10.0
        assert conn.read_timeout == 30.0
        assert conn.write_timeout == 10.0

    def test_custom_timeout_values(self):
        """Test that custom timeout values are set correctly."""
        conn = SeestarConnection(
            "localhost",
            8080,
            connection_timeout=5.0,
            read_timeout=60.0,
            write_timeout=15.0,
        )
        assert conn.connection_timeout == 5.0
        assert conn.read_timeout == 60.0
        assert conn.write_timeout == 15.0

    @pytest.mark.asyncio
    async def test_connection_timeout(self):
        """Test that connection timeout is enforced."""
        # Use a non-routable IP to trigger timeout
        conn = SeestarConnection("10.255.255.1", 1234, connection_timeout=0.1)

        with pytest.raises(asyncio.TimeoutError):
            await conn.open()

    @pytest.mark.asyncio
    async def test_connection_timeout_error_handling(self):
        """Test that connection timeout errors are properly classified."""
        conn = SeestarConnection("10.255.255.1", 1234, connection_timeout=0.1)

        try:
            await conn.open()
        except asyncio.TimeoutError as e:
            # Verify it's recognized as a connection reset error
            assert conn._is_connection_reset_error(e)

    @pytest.mark.asyncio
    async def test_read_timeout(self):
        """Test that read timeout is enforced."""
        conn = SeestarConnection("localhost", 8080, read_timeout=0.1)

        # Mock the connection to simulate a hanging read
        mock_reader = AsyncMock()
        mock_writer = MagicMock()

        # Make readuntil hang longer than timeout
        async def slow_read():
            await asyncio.sleep(1.0)
            return b"test\n"

        mock_reader.readuntil.side_effect = slow_read

        conn.reader = mock_reader
        conn.writer = mock_writer
        conn._is_connected = True

        # Mock reconnection to fail to test pure timeout behavior
        with patch.object(conn, "_reconnect_with_backoff", return_value=False):
            result = await conn.read()
            assert result is None

    @pytest.mark.asyncio
    async def test_read_exactly_timeout(self):
        """Test that read_exactly timeout is enforced."""
        conn = SeestarConnection("localhost", 8080, read_timeout=0.1)

        # Mock the connection to simulate a hanging read
        mock_reader = AsyncMock()
        mock_writer = MagicMock()

        # Make readexactly hang longer than timeout
        async def slow_read_exactly(n):
            await asyncio.sleep(1.0)
            return b"x" * n

        mock_reader.readexactly.side_effect = slow_read_exactly

        conn.reader = mock_reader
        conn.writer = mock_writer
        conn._is_connected = True

        # Mock reconnection to fail to test pure timeout behavior
        with patch.object(conn, "_reconnect_with_backoff", return_value=False):
            result = await conn.read_exactly(10)
            assert result is None

    @pytest.mark.asyncio
    async def test_write_timeout(self):
        """Test that write timeout is enforced."""
        conn = SeestarConnection("localhost", 8080, write_timeout=0.1)

        # Mock the connection to simulate a hanging write
        mock_reader = MagicMock()
        mock_writer = AsyncMock()

        # Make drain hang longer than timeout
        async def slow_drain():
            await asyncio.sleep(1.0)

        mock_writer.drain.side_effect = slow_drain
        mock_writer.write = MagicMock()

        conn.reader = mock_reader
        conn.writer = mock_writer
        conn._is_connected = True

        # Mock the reconnection to fail so we get the connection error
        with patch.object(conn, "_reconnect_with_backoff", return_value=False):
            with pytest.raises(ConnectionError, match="Failed to reconnect"):
                await conn.write("test message")

    @pytest.mark.asyncio
    async def test_timeout_error_classification(self):
        """Test that timeout errors are properly classified as connection reset errors."""
        conn = SeestarConnection("localhost", 8080)

        timeout_error = asyncio.TimeoutError()
        assert conn._is_connection_reset_error(timeout_error)

        # Also test other connection errors are still recognized
        assert conn._is_connection_reset_error(ConnectionResetError())
        assert conn._is_connection_reset_error(BrokenPipeError())
        assert conn._is_connection_reset_error(OSError())

        # But not other types of errors
        assert not conn._is_connection_reset_error(ValueError())

    @pytest.mark.asyncio
    async def test_read_timeout_triggers_reconnection(self):
        """Test that read timeout triggers reconnection logic."""
        conn = SeestarConnection("localhost", 8080, read_timeout=0.1)

        # Mock the connection and reconnection
        mock_reader = AsyncMock()
        mock_writer = MagicMock()

        # Make read hang to trigger timeout
        async def read_with_timeout():
            await asyncio.sleep(1.0)  # Timeout
            return b"success\n"

        mock_reader.readuntil.side_effect = read_with_timeout

        conn.reader = mock_reader
        conn.writer = mock_writer
        conn._is_connected = True

        # Track if reconnection was called
        reconnect_called = False

        async def mock_reconnect():
            nonlocal reconnect_called
            reconnect_called = True
            return True

        with patch.object(conn, "_reconnect_with_backoff", side_effect=mock_reconnect):
            result = await conn.read()
            # Should return None and trigger reconnection
            assert result is None
            assert reconnect_called

    @pytest.mark.asyncio
    async def test_write_timeout_behavior(self):
        """Test write timeout behavior with reconnection."""
        conn = SeestarConnection("localhost", 8080, write_timeout=0.1)

        # Mock the connection
        mock_reader = MagicMock()
        mock_writer = AsyncMock()

        # Make drain hang to trigger timeout
        async def drain_with_timeout():
            await asyncio.sleep(1.0)  # Timeout

        mock_writer.drain.side_effect = drain_with_timeout
        mock_writer.write = MagicMock()

        conn.reader = mock_reader
        conn.writer = mock_writer
        conn._is_connected = True

        # Track if reconnection was called
        reconnect_called = False

        async def mock_reconnect():
            nonlocal reconnect_called
            reconnect_called = True
            return False  # Fail reconnection for simpler test

        with patch.object(conn, "_reconnect_with_backoff", side_effect=mock_reconnect):
            with pytest.raises(ConnectionError):
                await conn.write("test message")
            assert reconnect_called


class TestSeestarClientTimeouts:
    """Test timeout configuration in SeestarClient."""

    def test_default_timeout_values(self):
        """Test that default timeout values are set correctly."""
        event_bus = EventBus()
        client = SeestarClient("localhost", 8080, event_bus)

        assert client.connection_timeout == 10.0
        assert client.read_timeout == 30.0
        assert client.write_timeout == 10.0

        # Verify timeouts are passed to connection
        assert client.connection.connection_timeout == 10.0
        assert client.connection.read_timeout == 30.0
        assert client.connection.write_timeout == 10.0

    def test_custom_timeout_values(self):
        """Test that custom timeout values are set correctly."""
        event_bus = EventBus()
        client = SeestarClient(
            "localhost",
            8080,
            event_bus,
            connection_timeout=5.0,
            read_timeout=60.0,
            write_timeout=15.0,
        )

        assert client.connection_timeout == 5.0
        assert client.read_timeout == 60.0
        assert client.write_timeout == 15.0

        # Verify timeouts are passed to connection
        assert client.connection.connection_timeout == 5.0
        assert client.connection.read_timeout == 60.0
        assert client.connection.write_timeout == 15.0

    @pytest.mark.asyncio
    async def test_connection_timeout_during_connect(self):
        """Test that connection timeout is enforced during client connect."""
        event_bus = EventBus()
        client = SeestarClient("10.255.255.1", 1234, event_bus, connection_timeout=0.1)

        with pytest.raises(asyncio.TimeoutError):
            await client.connect()

    @pytest.mark.asyncio
    async def test_timeout_configuration_isolation(self):
        """Test that different clients can have different timeout configurations."""
        event_bus = EventBus()

        client1 = SeestarClient(
            "localhost",
            8080,
            event_bus,
            connection_timeout=5.0,
            read_timeout=30.0,
            write_timeout=10.0,
        )

        client2 = SeestarClient(
            "localhost",
            8081,
            event_bus,
            connection_timeout=15.0,
            read_timeout=60.0,
            write_timeout=20.0,
        )

        # Verify they have different timeout values
        assert client1.connection_timeout != client2.connection_timeout
        assert client1.read_timeout != client2.read_timeout
        assert client1.write_timeout != client2.write_timeout

        # Verify underlying connections have correct values
        assert client1.connection.connection_timeout == 5.0
        assert client2.connection.connection_timeout == 15.0


class TestSeestarImagingClientTimeouts:
    """Test timeout configuration in SeestarImagingClient."""

    def test_default_timeout_values(self):
        """Test that default timeout values are set correctly."""
        event_bus = EventBus()
        client = SeestarImagingClient("localhost", 8080, event_bus)

        assert client.connection_timeout == 10.0
        assert client.read_timeout == 30.0
        assert client.write_timeout == 10.0

        # Verify timeouts are passed to connection
        assert client.connection.connection_timeout == 10.0
        assert client.connection.read_timeout == 30.0
        assert client.connection.write_timeout == 10.0

    def test_custom_timeout_values(self):
        """Test that custom timeout values are set correctly."""
        event_bus = EventBus()
        client = SeestarImagingClient(
            "localhost",
            8080,
            event_bus,
            connection_timeout=7.0,
            read_timeout=45.0,
            write_timeout=12.0,
        )

        assert client.connection_timeout == 7.0
        assert client.read_timeout == 45.0
        assert client.write_timeout == 12.0

        # Verify timeouts are passed to connection
        assert client.connection.connection_timeout == 7.0
        assert client.connection.read_timeout == 45.0
        assert client.connection.write_timeout == 12.0

    @pytest.mark.asyncio
    async def test_connection_timeout_during_connect(self):
        """Test that connection timeout is enforced during imaging client connect."""
        event_bus = EventBus()
        client = SeestarImagingClient(
            "10.255.255.1", 1234, event_bus, connection_timeout=0.1
        )

        with pytest.raises(asyncio.TimeoutError):
            await client.connect()

    def test_different_timeout_values_from_regular_client(self):
        """Test that imaging client can have different timeouts from regular client."""
        event_bus = EventBus()

        regular_client = SeestarClient("localhost", 8080, event_bus)
        imaging_client = SeestarImagingClient(
            "localhost",
            8080,
            event_bus,
            connection_timeout=25.0,
            read_timeout=120.0,  # Longer for image data
            write_timeout=30.0,
        )

        # Should have different timeout values optimized for their use cases
        assert regular_client.read_timeout != imaging_client.read_timeout
        assert imaging_client.read_timeout == 120.0  # Longer for large image transfers


class TestTimeoutIntegration:
    """Integration tests for timeout functionality."""

    @pytest.mark.asyncio
    async def test_realistic_timeout_scenario(self):
        """Test a realistic scenario where network conditions cause timeouts."""
        event_bus = EventBus()

        # Create client with short timeouts for testing
        client = SeestarClient(
            "localhost",
            8080,
            event_bus,
            connection_timeout=1.0,
            read_timeout=2.0,
            write_timeout=1.0,
        )

        # Mock the connection to simulate various timeout scenarios
        with patch("smarttel.seestar.connection.asyncio.open_connection") as mock_open:
            # Simulate connection timeout
            async def slow_connect(host, port):
                await asyncio.sleep(2.0)  # Longer than timeout
                raise ConnectionError("Should not reach here")

            mock_open.side_effect = slow_connect

            with pytest.raises(asyncio.TimeoutError):
                await client.connect()

    @pytest.mark.asyncio
    async def test_timeout_error_propagation(self):
        """Test that timeout errors are properly propagated through the client stack."""
        event_bus = EventBus()
        client = SeestarClient("10.255.255.1", 1234, event_bus, connection_timeout=0.1)

        # Connection should timeout and raise the error
        with pytest.raises(asyncio.TimeoutError):
            await client.connect()

        # Client should not be marked as connected
        assert not client.is_connected

    def test_timeout_parameter_validation(self):
        """Test that timeout parameters are properly validated."""
        event_bus = EventBus()

        # Test that negative timeouts work (though not recommended)
        client = SeestarClient(
            "localhost",
            8080,
            event_bus,
            connection_timeout=0.0,  # Zero timeout
            read_timeout=0.001,  # Very small timeout
            write_timeout=999.0,  # Very large timeout
        )

        assert client.connection_timeout == 0.0
        assert client.read_timeout == 0.001
        assert client.write_timeout == 999.0


if __name__ == "__main__":
    # Run tests with pytest if called directly
    pytest.main([__file__, "-v"])
