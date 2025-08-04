"""
Tests for network simulation middleware.
"""

import pytest
import asyncio
import time
from unittest.mock import MagicMock, patch, AsyncMock, Mock
from typing import Optional

from fastapi import Request, Response
from fastapi.responses import StreamingResponse, FileResponse
from starlette.datastructures import Headers

from middleware.network_simulation import (
    NetworkSimulationConfig,
    NetworkSimulationState,
    NetworkSimulationMiddleware,
    enable_simulation,
    disable_simulation,
    update_simulation_config,
    get_simulation_status,
    reset_simulation_stats,
    get_simulation_state
)
from api.routers.network_simulation import SIMULATION_PRESETS as NETWORK_PRESETS


class TestNetworkSimulationConfig:
    """Test the NetworkSimulationConfig class"""
    
    def test_config_defaults(self):
        """Test default configuration values"""
        config = NetworkSimulationConfig()
        
        assert config.base_delay_ms == 0.0
        assert config.delay_variation_ms == 0.0
        assert config.packet_loss_rate == 0.0
        assert config.bandwidth_limit_kbps is None
        assert config.connection_drop_rate == 0.0
        assert config.timeout_rate == 0.0
        assert config.timeout_delay_ms == 10000.0
        assert config.enabled is False
        assert config.apply_to_paths == [
            "/api/processing/",
            "/processed/",
            "/uploads/",
            ".png",
            ".jpg",
            ".jpeg",
            ".fit",
            ".fits"
        ]
    
    def test_config_custom_values(self):
        """Test custom configuration values"""
        config = NetworkSimulationConfig(
            base_delay_ms=100.0,
            delay_variation_ms=50.0,
            packet_loss_rate=0.1,
            bandwidth_limit_kbps=1000.0,
            connection_drop_rate=0.05,
            timeout_rate=0.02,
            timeout_delay_ms=5000.0,
            apply_to_paths=["/api/", "/custom/"],
            enabled=True
        )
        
        assert config.base_delay_ms == 100.0
        assert config.delay_variation_ms == 50.0
        assert config.packet_loss_rate == 0.1
        assert config.bandwidth_limit_kbps == 1000.0
        assert config.enabled is True
        assert config.apply_to_paths == ["/api/", "/custom/"]


class TestNetworkSimulationState:
    """Test the NetworkSimulationState class"""
    
    def test_state_initialization(self):
        """Test state initialization"""
        state = NetworkSimulationState()
        
        assert state.stats["requests_processed"] == 0
        assert state.stats["bytes_throttled"] == 0
        assert state.stats["requests_dropped"] == 0
        assert state.stats["total_delay_ms"] == 0.0
        assert state.stats["requests_delayed"] == 0
        assert isinstance(state.start_time, float)
        assert state.start_time > 0
    
    def test_get_global_state(self):
        """Test getting the global simulation state"""
        state = get_simulation_state()
        
        assert isinstance(state, NetworkSimulationState)
        assert hasattr(state, 'stats')
        assert 'requests_processed' in state.stats
        assert 'bytes_throttled' in state.stats


class TestSimulationControl:
    """Test simulation control functions"""
    
    def test_enable_disable_simulation(self):
        """Test enabling and disabling simulation"""
        # Initially should be disabled
        status = get_simulation_status()
        assert status['config']['enabled'] is False
        
        # Enable with custom config
        config = NetworkSimulationConfig(
            enabled=True,
            base_delay_ms=100,
            packet_loss_rate=0.1
        )
        enable_simulation(config)
        
        status = get_simulation_status()
        assert status['config']['enabled'] is True
        assert status['config']['base_delay_ms'] == 100
        assert status['config']['packet_loss_rate'] == 0.1
        
        # Disable
        disable_simulation()
        status = get_simulation_status()
        assert status['config']['enabled'] is False
    
    def test_update_simulation_config(self):
        """Test updating simulation config"""
        # Enable first
        enable_simulation(NetworkSimulationConfig(enabled=True))
        
        # Update config
        update_simulation_config(
            base_delay_ms=200,
            packet_loss_rate=0.2,
            bandwidth_limit_kbps=500
        )
        
        status = get_simulation_status()
        assert status['config']['base_delay_ms'] == 200
        assert status['config']['packet_loss_rate'] == 0.2
        assert status['config']['bandwidth_limit_kbps'] == 500
        assert status['config']['enabled'] is True
        
        # Clean up
        disable_simulation()
    
    def test_reset_stats(self):
        """Test resetting simulation statistics"""
        state = get_simulation_state()
        
        # Add some stats
        state.stats["requests_processed"] = 10
        state.stats["bytes_throttled"] = 5000
        state.stats["requests_dropped"] = 3
        state.stats["total_delay_ms"] = 1500.0
        state.stats["requests_delayed"] = 2
        
        # Reset
        reset_simulation_stats()
        
        # Check all stats are reset
        assert state.stats["requests_processed"] == 0
        assert state.stats["bytes_throttled"] == 0
        assert state.stats["requests_dropped"] == 0
        assert state.stats["total_delay_ms"] == 0.0
        assert state.stats["requests_delayed"] == 0
        # start_time should be updated
        assert state.start_time > 0


class TestNetworkPresets:
    """Test network simulation presets"""
    
    def test_presets_exist(self):
        """Test that all expected presets exist"""
        expected_presets = [
            'slow_3g',
            'slow_4g',
            'unstable_wifi',
            'satellite'
        ]
        
        for preset in expected_presets:
            assert preset in NETWORK_PRESETS
            assert isinstance(NETWORK_PRESETS[preset], NetworkSimulationConfig)
    
    def test_preset_values(self):
        """Test specific preset configurations"""
        # Test slow_3g preset
        slow_3g = NETWORK_PRESETS['slow_3g']
        assert slow_3g.base_delay_ms == 300
        assert slow_3g.delay_variation_ms == 100
        assert slow_3g.bandwidth_limit_kbps == 200
        
        # Test satellite preset
        satellite = NETWORK_PRESETS['satellite']
        assert satellite.base_delay_ms == 600
        assert satellite.delay_variation_ms == 100
        assert satellite.packet_loss_rate == 0.03


class TestNetworkSimulationMiddleware:
    """Test the NetworkSimulationMiddleware class"""
    
    @pytest.fixture
    def mock_app(self):
        """Create a mock ASGI app"""
        app = AsyncMock()
        return app
    
    @pytest.fixture
    def middleware(self, mock_app):
        """Create middleware instance"""
        return NetworkSimulationMiddleware(mock_app)
    
    @pytest.fixture
    def mock_request(self):
        """Create a mock request"""
        request = Mock(spec=Request)
        request.url.path = "/api/processing/test"
        request.method = "GET"
        request.headers = {}
        return request
    
    @pytest.mark.asyncio
    async def test_middleware_disabled(self, middleware, mock_request):
        """Test middleware when simulation is disabled"""
        disable_simulation()
        
        # Create a mock response
        mock_response = Response(content="test", status_code=200)
        
        async def call_next(request):
            return mock_response
        
        response = await middleware.dispatch(mock_request, call_next)
        
        assert response == mock_response
        assert response.status_code == 200
    
    @pytest.mark.asyncio
    async def test_middleware_path_not_matched(self, middleware, mock_request):
        """Test middleware with non-matching path"""
        # Enable simulation but use path that doesn't match
        config = NetworkSimulationConfig(
            enabled=True,
            apply_to_paths=["/other/"]
        )
        enable_simulation(config)
        
        mock_response = Response(content="test", status_code=200)
        
        async def call_next(request):
            return mock_response
        
        response = await middleware.dispatch(mock_request, call_next)
        
        assert response == mock_response
        assert response.status_code == 200
        
        # Clean up
        disable_simulation()
    
    @pytest.mark.asyncio
    async def test_middleware_connection_drop(self, middleware, mock_request):
        """Test middleware dropping connections"""
        # Enable simulation with high drop rate
        config = NetworkSimulationConfig(
            enabled=True,
            connection_drop_rate=1.0  # Always drop
        )
        enable_simulation(config)
        
        async def call_next(request):
            return Response(content="test", status_code=200)
        
        # Should raise HTTPException
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc_info:
            await middleware.dispatch(mock_request, call_next)
        
        assert exc_info.value.status_code == 503
        assert "connection drop" in exc_info.value.detail
        
        # Clean up
        disable_simulation()
    
    @pytest.mark.asyncio
    async def test_middleware_packet_loss(self, middleware, mock_request):
        """Test middleware packet loss simulation"""
        # Enable simulation with high packet loss
        config = NetworkSimulationConfig(
            enabled=True,
            packet_loss_rate=1.0  # Always lose packets
        )
        enable_simulation(config)
        
        async def call_next(request):
            return Response(content="test", status_code=200)
        
        # Should raise HTTPException
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc_info:
            await middleware.dispatch(mock_request, call_next)
        
        assert exc_info.value.status_code == 503
        assert "packet loss" in exc_info.value.detail
        
        # Clean up
        disable_simulation()
    
    @pytest.mark.asyncio
    async def test_middleware_with_delay(self, middleware, mock_request):
        """Test middleware applying delay"""
        # Enable simulation with delay
        config = NetworkSimulationConfig(
            enabled=True,
            base_delay_ms=100,
            delay_variation_ms=0
        )
        enable_simulation(config)
        
        mock_response = Response(content="test", status_code=200)
        
        async def call_next(request):
            return mock_response
        
        start_time = time.time()
        response = await middleware.dispatch(mock_request, call_next)
        elapsed = (time.time() - start_time) * 1000
        
        # Should have delayed approximately 100ms
        assert response == mock_response
        assert elapsed >= 90  # Allow some margin
        
        # Check stats were updated
        state = get_simulation_state()
        assert state.stats["requests_processed"] > 0
        assert state.stats["total_delay_ms"] > 0
        
        # Clean up
        disable_simulation()
        reset_simulation_stats()
    
    @pytest.mark.asyncio
    async def test_middleware_bandwidth_throttling_streaming(self, middleware, mock_request):
        """Test bandwidth throttling with streaming response"""
        # Enable simulation with bandwidth limit
        config = NetworkSimulationConfig(
            enabled=True,
            bandwidth_limit_kbps=100  # 100 KB/s
        )
        enable_simulation(config)
        
        # Create a streaming response
        async def generate():
            for i in range(5):
                yield b"x" * 1024  # 1KB chunks
        
        streaming_response = StreamingResponse(generate(), media_type="text/plain")
        
        async def call_next(request):
            return streaming_response
        
        response = await middleware.dispatch(mock_request, call_next)
        
        # Response should still be streaming
        assert isinstance(response, StreamingResponse)
        
        # Clean up
        disable_simulation()
    
    @pytest.mark.asyncio
    async def test_middleware_file_response(self, middleware, mock_request):
        """Test middleware with file response"""
        # Enable simulation
        config = NetworkSimulationConfig(
            enabled=True,
            base_delay_ms=50
        )
        enable_simulation(config)
        
        # Create a file response (using a test file path)
        file_response = FileResponse(__file__)  # Use this test file
        
        async def call_next(request):
            return file_response
        
        response = await middleware.dispatch(mock_request, call_next)
        
        # Should still be a file response
        assert isinstance(response, FileResponse)
        
        # Clean up
        disable_simulation()
    
    @pytest.mark.asyncio
    async def test_middleware_error_handling(self, middleware, mock_request):
        """Test middleware error handling"""
        # Enable simulation
        config = NetworkSimulationConfig(enabled=True)
        enable_simulation(config)
        
        # Make call_next raise an exception
        async def call_next(request):
            raise ValueError("Test error")
        
        with pytest.raises(ValueError, match="Test error"):
            await middleware.dispatch(mock_request, call_next)
        
        # Clean up
        disable_simulation()


class TestSimulationIntegration:
    """Integration tests for network simulation"""
    
    def test_full_simulation_lifecycle(self):
        """Test complete simulation lifecycle"""
        # Start with disabled state
        assert get_simulation_status()['config']['enabled'] is False
        
        # Enable with preset
        preset_config = NETWORK_PRESETS['slow_3g']
        enable_simulation(preset_config)
        
        # Verify enabled
        status = get_simulation_status()
        assert status['config']['enabled'] is True
        assert status['config']['base_delay_ms'] == 300  # slow_3g preset value
        
        # Update configuration
        update_simulation_config(packet_loss_rate=0.05)
        
        # Verify update
        status = get_simulation_status()
        assert status['config']['packet_loss_rate'] == 0.05
        assert status['config']['base_delay_ms'] == 300  # Should retain other values
        
        # Simulate some activity
        state = get_simulation_state()
        state.stats['requests_processed'] += 10
        state.stats['bytes_throttled'] += 10240
        
        # Get stats
        status = get_simulation_status()
        # Check that the stats increased by the expected amount
        assert status['stats']['requests_processed'] >= 10
        assert status['stats']['bytes_throttled'] >= 10240
        
        # Reset stats
        reset_simulation_stats()
        status = get_simulation_status()
        assert status['stats']['requests_processed'] == 0
        assert status['stats']['bytes_throttled'] == 0
        
        # Disable
        disable_simulation()
        assert get_simulation_status()['config']['enabled'] is False