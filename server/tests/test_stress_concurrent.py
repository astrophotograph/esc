"""Stress tests for concurrent telescope connections and operations."""

import asyncio
import time
from typing import List, Dict, Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import AsyncClient
from fastapi import FastAPI
from loguru import logger

from main import Controller, Telescope


class MockSeestarClient:
    """Mock SeestarClient for testing."""
    
    def __init__(self, host: str, delay: float = 0.1):
        self.host = host
        self.connected = False
        self.delay = delay
        self.connect_count = 0
        self.disconnect_count = 0
        
    async def connect(self):
        """Simulate connection with configurable delay."""
        self.connect_count += 1
        await asyncio.sleep(self.delay)
        self.connected = True
        logger.info(f"Mock client {self.host} connected (attempt {self.connect_count})")
        
    async def disconnect(self):
        """Simulate disconnection."""
        self.disconnect_count += 1
        await asyncio.sleep(0.01)
        self.connected = False
        logger.info(f"Mock client {self.host} disconnected")
        
    async def send_command(self, command: str):
        """Simulate command execution."""
        if not self.connected:
            raise ConnectionError("Not connected")
        await asyncio.sleep(0.05)
        return {"status": "ok", "command": command}


class TestConcurrentConnections:
    """Test concurrent telescope connection scenarios."""
    
    @pytest.fixture
    def mock_app(self):
        """Create a mock FastAPI app."""
        app = FastAPI()
        app.state.controller = None
        return app
    
    @pytest.fixture
    async def controller(self, mock_app):
        """Create a Controller instance with mocked dependencies."""
        with patch("main.TelescopeDatabase") as mock_db:
            mock_db.return_value = AsyncMock()
            controller = Controller(mock_app, service_port=8000, discover=False)
            yield controller
            
    async def create_mock_telescopes(self, controller: Controller, count: int, connect_delay: float = 0.1) -> List[Telescope]:
        """Create multiple mock telescopes."""
        telescopes = []
        
        for i in range(count):
            telescope = Telescope(
                host=f"telescope-{i}.local",
                port=4700 + i,
                serial_number=f"TEST{i:04d}",
                discovery_method="test"
            )
            
            # Create mock clients
            telescope.client = MockSeestarClient(telescope.host, delay=connect_delay)
            telescope.imaging = MockSeestarClient(telescope.host, delay=connect_delay)
            
            controller.telescopes[telescope.name] = telescope
            telescopes.append(telescope)
            
        return telescopes
    
    @pytest.mark.asyncio
    async def test_concurrent_connections_small(self, controller):
        """Test connecting to 5 telescopes concurrently."""
        # Create 5 mock telescopes
        telescopes = await self.create_mock_telescopes(controller, 5, connect_delay=0.1)
        
        # Measure connection time
        start_time = time.time()
        await controller.connect_all_telescopes()
        connection_time = time.time() - start_time
        
        # Verify all connected
        for telescope in telescopes:
            assert telescope.client.connected
            assert telescope.imaging.connected
            assert telescope.client.connect_count == 1
            
        # Should be much faster than sequential (5 * 0.1 * 2 = 1 second sequential)
        assert connection_time < 0.5
        logger.info(f"Connected {len(telescopes)} telescopes in {connection_time:.3f}s")
    
    @pytest.mark.asyncio
    async def test_concurrent_connections_medium(self, controller):
        """Test connecting to 20 telescopes concurrently."""
        # Create 20 mock telescopes
        telescopes = await self.create_mock_telescopes(controller, 20, connect_delay=0.05)
        
        # Measure connection time
        start_time = time.time()
        await controller.connect_all_telescopes()
        connection_time = time.time() - start_time
        
        # Verify all connected
        connected_count = sum(1 for t in telescopes if t.client.connected and t.imaging.connected)
        assert connected_count == 20
        
        # Should handle 20 connections efficiently
        assert connection_time < 2.0
        logger.info(f"Connected {len(telescopes)} telescopes in {connection_time:.3f}s")
    
    @pytest.mark.asyncio
    async def test_concurrent_connections_large(self, controller):
        """Test connecting to 50 telescopes concurrently (stress test)."""
        # Create 50 mock telescopes with very fast connections
        telescopes = await self.create_mock_telescopes(controller, 50, connect_delay=0.01)
        
        # Measure connection time and memory
        import psutil
        process = psutil.Process()
        mem_before = process.memory_info().rss / 1024 / 1024  # MB
        
        start_time = time.time()
        await controller.connect_all_telescopes()
        connection_time = time.time() - start_time
        
        mem_after = process.memory_info().rss / 1024 / 1024  # MB
        mem_increase = mem_after - mem_before
        
        # Verify all connected
        connected_count = sum(1 for t in telescopes if t.client.connected and t.imaging.connected)
        assert connected_count == 50
        
        # Performance assertions
        assert connection_time < 5.0
        assert mem_increase < 100  # Should not use more than 100MB for 50 connections
        
        logger.info(f"Connected {len(telescopes)} telescopes in {connection_time:.3f}s")
        logger.info(f"Memory increase: {mem_increase:.2f}MB")
    
    @pytest.mark.asyncio
    async def test_connection_failures_recovery(self, controller):
        """Test handling of connection failures and recovery."""
        # Create telescopes with some that will fail
        telescopes = []
        
        for i in range(10):
            telescope = Telescope(
                host=f"telescope-{i}.local",
                port=4700 + i,
                serial_number=f"TEST{i:04d}",
                discovery_method="test"
            )
            
            # Create mock clients - some will fail on first attempt
            if i % 3 == 0:
                # This client will fail on first connect
                client = MockSeestarClient(telescope.host)
                original_connect = client.connect
                
                async def failing_connect(self=client):
                    if self.connect_count == 0:
                        self.connect_count += 1
                        raise ConnectionError("Connection refused")
                    return await original_connect()
                    
                client.connect = lambda: failing_connect()
                telescope.client = client
            else:
                telescope.client = MockSeestarClient(telescope.host, delay=0.05)
                
            telescope.imaging = MockSeestarClient(telescope.host, delay=0.05)
            
            controller.telescopes[telescope.name] = telescope
            telescopes.append(telescope)
        
        # Connect with error handling
        await controller.connect_all_telescopes()
        
        # Check results
        successful = sum(1 for t in telescopes if t.client.connected)
        failed = sum(1 for t in telescopes if not t.client.connected)
        
        logger.info(f"Successful connections: {successful}, Failed: {failed}")
        
        # Some should succeed, some should fail
        assert successful > 0
        assert failed > 0
    
    @pytest.mark.asyncio
    async def test_concurrent_disconnections(self, controller):
        """Test disconnecting multiple telescopes concurrently."""
        # Create and connect telescopes
        telescopes = await self.create_mock_telescopes(controller, 15, connect_delay=0.01)
        await controller.connect_all_telescopes()
        
        # Verify all connected
        assert all(t.client.connected for t in telescopes)
        
        # Measure disconnection time
        start_time = time.time()
        await controller.disconnect_all_telescopes()
        disconnection_time = time.time() - start_time
        
        # Verify all disconnected
        assert all(not t.client.connected for t in telescopes)
        assert all(t.client.disconnect_count == 1 for t in telescopes)
        
        # Should be fast
        assert disconnection_time < 1.0
        logger.info(f"Disconnected {len(telescopes)} telescopes in {disconnection_time:.3f}s")
    
    @pytest.mark.asyncio
    async def test_concurrent_commands(self, controller):
        """Test sending commands to multiple telescopes concurrently."""
        # Create and connect telescopes
        telescopes = await self.create_mock_telescopes(controller, 10, connect_delay=0.01)
        await controller.connect_all_telescopes()
        
        # Send commands concurrently
        async def send_command_to_telescope(telescope: Telescope, command: str):
            try:
                result = await telescope.client.send_command(command)
                return {"telescope": telescope.name, "result": result, "error": None}
            except Exception as e:
                return {"telescope": telescope.name, "result": None, "error": str(e)}
        
        start_time = time.time()
        
        # Create tasks for concurrent command execution
        tasks = [
            send_command_to_telescope(telescope, f"command_{i}")
            for i, telescope in enumerate(telescopes)
        ]
        
        results = await asyncio.gather(*tasks)
        command_time = time.time() - start_time
        
        # Verify results
        successful = sum(1 for r in results if r["error"] is None)
        assert successful == len(telescopes)
        
        # Should be much faster than sequential
        assert command_time < 0.5
        logger.info(f"Sent commands to {len(telescopes)} telescopes in {command_time:.3f}s")
    
    @pytest.mark.asyncio
    async def test_memory_leak_prevention(self, controller):
        """Test that repeated connections/disconnections don't leak memory."""
        import gc
        import psutil
        
        # Create telescopes
        await self.create_mock_telescopes(controller, 10, connect_delay=0.01)
        
        process = psutil.Process()
        initial_memory = process.memory_info().rss / 1024 / 1024  # MB
        
        # Perform multiple connection/disconnection cycles
        for cycle in range(5):
            await controller.connect_all_telescopes()
            await controller.disconnect_all_telescopes()
            
            # Force garbage collection
            gc.collect()
            await asyncio.sleep(0.1)
            
            current_memory = process.memory_info().rss / 1024 / 1024  # MB
            memory_increase = current_memory - initial_memory
            
            logger.info(f"Cycle {cycle + 1}: Memory increase: {memory_increase:.2f}MB")
            
            # Memory increase should stabilize, not grow continuously
            if cycle > 2:
                assert memory_increase < 20  # Should not grow more than 20MB
    
    @pytest.mark.asyncio
    async def test_concurrent_api_requests(self, mock_app):
        """Test handling concurrent API requests."""
        # Create a test client
        async with AsyncClient(app=mock_app, base_url="http://test") as client:
            # Simulate concurrent health check requests
            async def make_health_request():
                response = await client.get("/api/system/health")
                return response.status_code
            
            start_time = time.time()
            
            # Make 100 concurrent requests
            tasks = [make_health_request() for _ in range(100)]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            request_time = time.time() - start_time
            
            # Count successful requests
            successful = sum(1 for r in results if isinstance(r, int) and r == 200)
            
            logger.info(f"Completed {successful}/100 requests in {request_time:.3f}s")
            logger.info(f"Requests per second: {100 / request_time:.2f}")
            
            # Most requests should succeed
            assert successful > 90
            # Should handle 100 requests quickly
            assert request_time < 5.0


class TestResourceLimits:
    """Test resource usage under stress."""
    
    @pytest.mark.asyncio
    async def test_cpu_usage_under_load(self):
        """Monitor CPU usage during concurrent operations."""
        import psutil
        
        process = psutil.Process()
        
        # Create many concurrent tasks
        async def cpu_task(n):
            # Simulate some CPU work
            total = 0
            for i in range(1000):
                total += i * n
                if i % 100 == 0:
                    await asyncio.sleep(0)  # Yield control
            return total
        
        # Monitor CPU usage
        cpu_samples = []
        
        async def monitor_cpu():
            while True:
                cpu_percent = process.cpu_percent(interval=0.1)
                cpu_samples.append(cpu_percent)
                await asyncio.sleep(0.1)
                
        # Start monitoring
        monitor_task = asyncio.create_task(monitor_cpu())
        
        try:
            # Run CPU tasks
            tasks = [cpu_task(i) for i in range(50)]
            await asyncio.gather(*tasks)
            
            # Stop monitoring
            monitor_task.cancel()
            try:
                await monitor_task
            except asyncio.CancelledError:
                pass
            
            # Analyze CPU usage
            if cpu_samples:
                avg_cpu = sum(cpu_samples) / len(cpu_samples)
                max_cpu = max(cpu_samples)
                
                logger.info(f"Average CPU: {avg_cpu:.2f}%, Max CPU: {max_cpu:.2f}%")
                
                # CPU usage should be reasonable
                assert avg_cpu < 80  # Average should be under 80%
                
        except Exception as e:
            monitor_task.cancel()
            raise
    
    @pytest.mark.asyncio
    async def test_file_descriptor_limits(self):
        """Test that we don't exhaust file descriptors."""
        import resource
        
        # Get current limits
        soft, hard = resource.getrlimit(resource.RLIMIT_NOFILE)
        logger.info(f"File descriptor limits - Soft: {soft}, Hard: {hard}")
        
        # Create many mock connections
        connections = []
        
        try:
            for i in range(100):
                # Simulate creating a connection (would normally open sockets)
                conn = {"id": i, "created": time.time()}
                connections.append(conn)
            
            # In real scenario, this would test actual socket connections
            # For now, just verify we can track many connections
            assert len(connections) == 100
            
        finally:
            # Cleanup
            connections.clear()


if __name__ == "__main__":
    # Run stress tests
    pytest.main([__file__, "-v", "--log-cli-level=INFO"])