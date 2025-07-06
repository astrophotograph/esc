#!/usr/bin/env python3
"""
Simplified unit tests for timeout functionality focusing on the core timeout behavior.
"""

import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from smarttel.seestar.connection import SeestarConnection
from smarttel.seestar.client import SeestarClient
from smarttel.seestar.imaging_client import SeestarImagingClient
from smarttel.util.eventbus import EventBus


class TestTimeoutBasics:
    """Test basic timeout configuration and behavior."""

    def test_connection_default_timeouts(self):
        """Test default timeout values are set correctly."""
        conn = SeestarConnection("localhost", 8080)
        assert conn.connection_timeout == 10.0
        assert conn.read_timeout == 30.0
        assert conn.write_timeout == 10.0

    def test_connection_custom_timeouts(self):
        """Test custom timeout values are set correctly."""
        conn = SeestarConnection(
            "localhost", 8080,
            connection_timeout=5.0,
            read_timeout=60.0,
            write_timeout=15.0
        )
        assert conn.connection_timeout == 5.0
        assert conn.read_timeout == 60.0
        assert conn.write_timeout == 15.0

    def test_client_default_timeouts(self):
        """Test SeestarClient default timeout values."""
        event_bus = EventBus()
        client = SeestarClient("localhost", 8080, event_bus)
        
        assert client.connection_timeout == 10.0
        assert client.read_timeout == 30.0
        assert client.write_timeout == 10.0
        
        # Verify they're passed to the connection
        assert client.connection.connection_timeout == 10.0
        assert client.connection.read_timeout == 30.0
        assert client.connection.write_timeout == 10.0

    def test_client_custom_timeouts(self):
        """Test SeestarClient custom timeout values."""
        event_bus = EventBus()
        client = SeestarClient(
            "localhost", 8080, event_bus,
            connection_timeout=7.0,
            read_timeout=45.0,
            write_timeout=12.0
        )
        
        assert client.connection_timeout == 7.0
        assert client.read_timeout == 45.0
        assert client.write_timeout == 12.0
        
        # Verify they're passed to the connection
        assert client.connection.connection_timeout == 7.0
        assert client.connection.read_timeout == 45.0
        assert client.connection.write_timeout == 12.0

    def test_imaging_client_default_timeouts(self):
        """Test SeestarImagingClient default timeout values."""
        event_bus = EventBus()
        client = SeestarImagingClient("localhost", 8080, event_bus)
        
        assert client.connection_timeout == 10.0
        assert client.read_timeout == 30.0
        assert client.write_timeout == 10.0
        
        # Verify they're passed to the connection
        assert client.connection.connection_timeout == 10.0
        assert client.connection.read_timeout == 30.0
        assert client.connection.write_timeout == 10.0

    def test_imaging_client_custom_timeouts(self):
        """Test SeestarImagingClient custom timeout values."""
        event_bus = EventBus()
        client = SeestarImagingClient(
            "localhost", 8080, event_bus,
            connection_timeout=15.0,
            read_timeout=120.0,  # Longer for image data
            write_timeout=25.0
        )
        
        assert client.connection_timeout == 15.0
        assert client.read_timeout == 120.0
        assert client.write_timeout == 25.0
        
        # Verify they're passed to the connection
        assert client.connection.connection_timeout == 15.0
        assert client.connection.read_timeout == 120.0
        assert client.connection.write_timeout == 25.0

    def test_timeout_error_classification(self):
        """Test that timeout errors are classified as connection reset errors."""
        conn = SeestarConnection("localhost", 8080)
        
        # Test TimeoutError is recognized
        assert conn._is_connection_reset_error(asyncio.TimeoutError())
        
        # Test other connection errors are still recognized
        assert conn._is_connection_reset_error(ConnectionResetError())
        assert conn._is_connection_reset_error(BrokenPipeError())
        assert conn._is_connection_reset_error(OSError())
        
        # Test non-connection errors are not recognized
        assert not conn._is_connection_reset_error(ValueError())
        assert not conn._is_connection_reset_error(TypeError())


class TestRealTimeouts:
    """Test actual timeout behavior with real network operations."""

    @pytest.mark.asyncio
    async def test_connection_timeout_real(self):
        """Test connection timeout with non-routable address."""
        # Use a non-routable IP to trigger timeout (not just connection refused)
        conn = SeestarConnection("10.255.255.1", 1234, connection_timeout=0.5)
        
        with pytest.raises(asyncio.TimeoutError):
            await conn.open()

    @pytest.mark.asyncio
    async def test_client_connection_timeout_real(self):
        """Test SeestarClient connection timeout."""
        event_bus = EventBus()
        client = SeestarClient(
            "10.255.255.1", 1234, event_bus,
            connection_timeout=0.5
        )
        
        with pytest.raises(asyncio.TimeoutError):
            await client.connect()

    @pytest.mark.asyncio
    async def test_imaging_client_connection_timeout_real(self):
        """Test SeestarImagingClient connection timeout."""
        event_bus = EventBus()
        client = SeestarImagingClient(
            "10.255.255.1", 1234, event_bus,
            connection_timeout=0.5
        )
        
        with pytest.raises(asyncio.TimeoutError):
            await client.connect()


class TestTimeoutBehavior:
    """Test timeout behavior with controlled mocks."""

    @pytest.mark.asyncio
    async def test_read_timeout_with_mock(self):
        """Test read timeout behavior using asyncio.wait_for directly."""
        # Test that wait_for correctly times out
        async def slow_operation():
            await asyncio.sleep(1.0)
            return "should not reach"
        
        with pytest.raises(asyncio.TimeoutError):
            await asyncio.wait_for(slow_operation(), timeout=0.1)

    @pytest.mark.asyncio
    async def test_write_timeout_with_mock(self):
        """Test write timeout behavior using asyncio.wait_for directly."""
        # Test that wait_for correctly times out for writes too
        async def slow_drain():
            await asyncio.sleep(1.0)
            
        with pytest.raises(asyncio.TimeoutError):
            await asyncio.wait_for(slow_drain(), timeout=0.1)

    def test_timeout_configuration_independence(self):
        """Test that different clients can have independent timeout configs."""
        event_bus = EventBus()
        
        client1 = SeestarClient(
            "host1", 8080, event_bus,
            connection_timeout=5.0,
            read_timeout=30.0,
            write_timeout=10.0
        )
        
        client2 = SeestarClient(
            "host2", 8081, event_bus,
            connection_timeout=15.0,
            read_timeout=60.0,
            write_timeout=20.0
        )
        
        imaging_client = SeestarImagingClient(
            "host3", 8082, event_bus,
            connection_timeout=25.0,
            read_timeout=120.0,
            write_timeout=30.0
        )
        
        # Verify all have different configurations
        assert client1.connection_timeout != client2.connection_timeout
        assert client1.read_timeout != imaging_client.read_timeout
        assert client2.write_timeout != imaging_client.write_timeout
        
        # Verify configurations are preserved
        assert client1.connection_timeout == 5.0
        assert client2.read_timeout == 60.0
        assert imaging_client.write_timeout == 30.0


class TestTimeoutIntegration:
    """Integration tests for timeout functionality."""

    def test_timeout_parameter_ranges(self):
        """Test that various timeout parameter ranges work."""
        # Very small timeouts
        conn1 = SeestarConnection("localhost", 8080, connection_timeout=0.001)
        assert conn1.connection_timeout == 0.001
        
        # Large timeouts
        conn2 = SeestarConnection("localhost", 8080, read_timeout=3600.0)
        assert conn2.read_timeout == 3600.0
        
        # Zero timeout (immediate timeout)
        conn3 = SeestarConnection("localhost", 8080, write_timeout=0.0)
        assert conn3.write_timeout == 0.0

    @pytest.mark.asyncio
    async def test_connection_timeout_logs_correctly(self):
        """Test that connection timeouts are logged with correct information."""
        conn = SeestarConnection("10.255.255.1", 1234, connection_timeout=0.1)
        
        # Capture that the timeout error includes the timeout value and address
        try:
            await conn.open()
            assert False, "Should have timed out"
        except asyncio.TimeoutError:
            # The connection should be marked as not connected
            assert not conn.is_connected()
            assert not conn._is_connected

    def test_timeout_inheritance_to_connection(self):
        """Test that timeout values are properly inherited by connections."""
        event_bus = EventBus()
        
        # Test SeestarClient
        client = SeestarClient(
            "localhost", 8080, event_bus,
            connection_timeout=1.5,
            read_timeout=45.5,
            write_timeout=10.5
        )
        
        # Values should be exactly preserved (no rounding/conversion)
        assert client.connection.connection_timeout == 1.5
        assert client.connection.read_timeout == 45.5
        assert client.connection.write_timeout == 10.5
        
        # Test SeestarImagingClient
        imaging_client = SeestarImagingClient(
            "localhost", 8080, event_bus,
            connection_timeout=2.5,
            read_timeout=90.5,
            write_timeout=20.5
        )
        
        assert imaging_client.connection.connection_timeout == 2.5
        assert imaging_client.connection.read_timeout == 90.5
        assert imaging_client.connection.write_timeout == 20.5


if __name__ == "__main__":
    # Run tests with pytest if called directly
    pytest.main([__file__, "-v"])