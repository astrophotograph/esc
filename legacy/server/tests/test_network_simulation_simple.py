"""
Simple tests for network simulation middleware.
Part of Phase 5: Final Coverage Push
"""

import pytest
import asyncio
import time
from unittest.mock import MagicMock, patch, AsyncMock
from typing import Dict, Any

from fastapi import Request, Response
from fastapi.responses import StreamingResponse

from middleware.network_simulation import (
    NetworkSimulationConfig,
    NetworkSimulationState,
    NetworkSimulationMiddleware,
    get_simulation_state,
    enable_simulation,
    disable_simulation,
    update_simulation_config,
    get_simulation_status,
    reset_simulation_stats
)


class TestNetworkSimulationConfig:
    """Test NetworkSimulationConfig dataclass"""
    
    def test_default_config(self):
        """Test default configuration"""
        config = NetworkSimulationConfig()
        
        assert config.base_delay_ms == 0.0
        assert config.delay_variation_ms == 0.0
        assert config.packet_loss_rate == 0.0
        assert config.bandwidth_limit_kbps is None
        assert config.connection_drop_rate == 0.0
        assert config.timeout_rate == 0.0
        assert config.enabled is False
        
        # Should have default paths
        assert isinstance(config.apply_to_paths, list)
        assert len(config.apply_to_paths) > 0
        assert "/api/processing/" in config.apply_to_paths
    
    def test_custom_config(self):
        """Test custom configuration"""
        config = NetworkSimulationConfig(
            base_delay_ms=100.0,
            packet_loss_rate=0.1,
            enabled=True,
            apply_to_paths=["/custom/"]
        )
        
        assert config.base_delay_ms == 100.0
        assert config.packet_loss_rate == 0.1
        assert config.enabled is True
        assert config.apply_to_paths == ["/custom/"]


class TestNetworkSimulationState:
    """Test NetworkSimulationState singleton"""
    
    def test_singleton(self):
        """Test singleton pattern"""
        state1 = NetworkSimulationState()
        state2 = NetworkSimulationState()
        assert state1 is state2
    
    def test_initial_state(self):
        """Test initial state"""
        # Reset singleton
        NetworkSimulationState._instance = None
        state = NetworkSimulationState()
        
        assert isinstance(state.config, NetworkSimulationConfig)
        assert state.config.enabled is False
        assert isinstance(state.stats, dict)
        assert state.stats["requests_total"] == 0
        assert state.stats["requests_delayed"] == 0
    
    def test_get_stats(self):
        """Test getting statistics"""
        state = NetworkSimulationState()
        state.stats["requests_total"] = 10
        state.stats["requests_delayed"] = 5
        
        stats = state.get_stats()
        assert stats["requests_total"] == 10
        assert stats["requests_delayed"] == 5
        assert "uptime_seconds" in stats


class TestGlobalFunctions:
    """Test global utility functions"""
    
    def test_get_simulation_state(self):
        """Test getting simulation state"""
        state = get_simulation_state()
        assert isinstance(state, NetworkSimulationState)
    
    def test_enable_disable_simulation(self):
        """Test enabling and disabling simulation"""
        # Enable with custom config
        config = NetworkSimulationConfig(
            base_delay_ms=50.0,
            enabled=True
        )
        enable_simulation(config)
        
        state = get_simulation_state()
        assert state.config.enabled is True
        assert state.config.base_delay_ms == 50.0
        
        # Disable
        disable_simulation()
        assert state.config.enabled is False
    
    def test_update_simulation_config(self):
        """Test updating configuration"""
        update_simulation_config(
            base_delay_ms=100.0,
            packet_loss_rate=0.2
        )
        
        state = get_simulation_state()
        assert state.config.base_delay_ms == 100.0
        assert state.config.packet_loss_rate == 0.2
    
    def test_get_simulation_status(self):
        """Test getting simulation status"""
        status = get_simulation_status()
        
        assert isinstance(status, dict)
        assert "enabled" in status
        assert "stats" in status
        assert "config" in status
    
    def test_reset_simulation_stats(self):
        """Test resetting statistics"""
        state = get_simulation_state()
        state.stats["requests_total"] = 100
        state.stats["requests_delayed"] = 50
        
        reset_simulation_stats()
        
        assert state.stats["requests_total"] == 0
        assert state.stats["requests_delayed"] == 0


class TestNetworkSimulationMiddleware:
    """Test NetworkSimulationMiddleware class"""
    
    @pytest.fixture
    def mock_app(self):
        """Create mock ASGI app"""
        return MagicMock()
    
    @pytest.fixture
    def middleware(self, mock_app):
        """Create middleware instance"""
        # Reset state
        NetworkSimulationState._instance = None
        return NetworkSimulationMiddleware(mock_app)
    
    @pytest.fixture
    def mock_request(self):
        """Create mock request"""
        request = MagicMock(spec=Request)
        request.url.path = "/api/processing/image.png"
        request.method = "GET"
        return request
    
    def test_middleware_initialization(self, middleware):
        """Test middleware initialization"""
        assert middleware.state is not None
        assert isinstance(middleware.state, NetworkSimulationState)
    
    def test_should_apply_simulation_disabled(self, middleware):
        """Test simulation check when disabled"""
        middleware.state.config.enabled = False
        
        assert middleware._should_apply_simulation("/api/test") is False
    
    def test_should_apply_simulation_path_match(self, middleware):
        """Test simulation check with path matching"""
        middleware.state.config.enabled = True
        middleware.state.config.apply_to_paths = ["/api/", ".png"]
        
        assert middleware._should_apply_simulation("/api/test") is True
        assert middleware._should_apply_simulation("/image.png") is True
        assert middleware._should_apply_simulation("/other/path") is False
    
    @pytest.mark.asyncio
    async def test_simulate_packet_loss(self, middleware):
        """Test packet loss simulation"""
        middleware.state.config.packet_loss_rate = 0.5
        
        # Test multiple times to get both outcomes
        results = []
        with patch('middleware.network_simulation.random.random') as mock_random:
            mock_random.side_effect = [0.3, 0.7]  # First drops, second doesn't
            
            results.append(await middleware._simulate_packet_loss())
            results.append(await middleware._simulate_packet_loss())
        
        assert True in results  # At least one dropped
        assert False in results  # At least one not dropped
        assert middleware.state.stats["requests_dropped"] > 0
    
    @pytest.mark.asyncio
    async def test_simulate_latency(self, middleware):
        """Test latency simulation"""
        middleware.state.config.base_delay_ms = 50.0
        middleware.state.config.delay_variation_ms = 10.0
        
        start_time = time.time()
        
        with patch('middleware.network_simulation.random.uniform', return_value=0.005):
            await middleware._simulate_latency()
        
        elapsed = time.time() - start_time
        
        # Should have delayed approximately 50ms
        assert elapsed >= 0.045  # Allow some tolerance
        assert middleware.state.stats["requests_delayed"] == 1
        assert middleware.state.stats["total_delay_ms"] > 0
    
    @pytest.mark.asyncio
    async def test_simulate_connection_drop(self, middleware):
        """Test connection drop simulation"""
        middleware.state.config.connection_drop_rate = 1.0  # Always drop
        
        result = await middleware._simulate_connection_drop()
        
        assert result is True
        assert middleware.state.stats["requests_dropped"] == 1
    
    @pytest.mark.asyncio
    async def test_simulate_timeout(self, middleware):
        """Test timeout simulation"""
        middleware.state.config.timeout_rate = 1.0  # Always timeout
        middleware.state.config.timeout_delay_ms = 10.0  # Short delay for test
        
        start_time = time.time()
        result = await middleware._simulate_timeout()
        elapsed = time.time() - start_time
        
        assert result is True
        assert elapsed >= 0.01
        assert middleware.state.stats["requests_timed_out"] == 1
    
    @pytest.mark.asyncio
    async def test_dispatch_disabled(self, middleware, mock_request):
        """Test dispatch when simulation is disabled"""
        middleware.state.config.enabled = False
        
        mock_response = Response(content="test")
        
        async def call_next(request):
            return mock_response
        
        response = await middleware.dispatch(mock_request, call_next)
        
        assert response == mock_response
        assert middleware.state.stats["requests_total"] == 0
    
    @pytest.mark.asyncio
    async def test_dispatch_with_simulation(self, middleware, mock_request):
        """Test dispatch with simulation enabled"""
        middleware.state.config.enabled = True
        middleware.state.config.base_delay_ms = 10.0
        middleware.state.config.apply_to_paths = ["/api/"]
        
        mock_response = Response(content="test")
        
        async def call_next(request):
            return mock_response
        
        with patch('middleware.network_simulation.logging'):
            start_time = time.time()
            response = await middleware.dispatch(mock_request, call_next)
            elapsed = time.time() - start_time
        
        assert response.status_code == 200
        assert elapsed >= 0.01  # Should have delay
        assert middleware.state.stats["requests_total"] > 0
        assert middleware.state.stats["requests_delayed"] > 0
    
    @pytest.mark.asyncio
    async def test_dispatch_connection_drop(self, middleware, mock_request):
        """Test dispatch with connection drop"""
        middleware.state.config.enabled = True
        middleware.state.config.connection_drop_rate = 1.0
        middleware.state.config.apply_to_paths = ["/api/"]
        
        mock_response = Response(content="test")
        
        async def call_next(request):
            return mock_response
        
        with patch('middleware.network_simulation.logging'):
            with pytest.raises(ConnectionError):
                await middleware.dispatch(mock_request, call_next)
        
        assert middleware.state.stats["requests_dropped"] > 0
    
    @pytest.mark.asyncio
    async def test_create_throttled_response(self, middleware):
        """Test bandwidth throttling"""
        middleware.state.config.bandwidth_limit_kbps = 1000.0  # 1 Mbps
        
        # Create regular response
        response = Response(content=b"x" * 1024)  # 1KB
        
        # Should return response (throttling happens in body iteration)
        throttled = await middleware._create_throttled_response(response)
        assert throttled is not None
    
    @pytest.mark.asyncio
    async def test_throttled_stream_generator(self, middleware):
        """Test throttled streaming"""
        middleware.state.config.bandwidth_limit_kbps = 8000.0  # 1 MB/s
        
        # Create chunks
        chunks = [b"x" * 1024 for _ in range(3)]  # 3 x 1KB chunks
        
        async def original_generator():
            for chunk in chunks:
                yield chunk
        
        # Create throttled generator
        gen = middleware._throttled_stream_generator(original_generator())
        
        # Consume and measure time
        start_time = time.time()
        received_chunks = []
        
        with patch('middleware.network_simulation.logging'):
            async for chunk in gen:
                received_chunks.append(chunk)
        
        elapsed = time.time() - start_time
        
        assert len(received_chunks) == 3
        assert middleware.state.stats["bytes_throttled"] == 3072  # 3KB
        # Should have some delay for throttling
        assert elapsed > 0


class TestNetworkSimulationIntegration:
    """Integration tests"""
    
    @pytest.mark.asyncio
    async def test_full_request_cycle(self):
        """Test complete request cycle with simulation"""
        # Setup
        NetworkSimulationState._instance = None
        enable_simulation(NetworkSimulationConfig(
            enabled=True,
            base_delay_ms=10.0,
            packet_loss_rate=0.0,  # No packet loss for predictable test
            apply_to_paths=["/"]
        ))
        
        # Create middleware
        app = MagicMock()
        middleware = NetworkSimulationMiddleware(app)
        
        # Create request/response
        request = MagicMock()
        request.url.path = "/api/test"
        request.method = "GET"
        
        response = Response(content="test response")
        
        async def call_next(req):
            return response
        
        # Execute
        with patch('middleware.network_simulation.logging'):
            result = await middleware.dispatch(request, call_next)
        
        # Verify
        assert result.status_code == 200
        
        stats = get_simulation_status()["stats"]
        assert stats["requests_total"] == 1
        assert stats["requests_delayed"] == 1
        
        # Cleanup
        disable_simulation()
        reset_simulation_stats()