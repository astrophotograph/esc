"""
Comprehensive tests for performance monitoring utilities.
Part of Phase 4: UI and Utilities testing
"""

import pytest
import asyncio
import time
from unittest.mock import MagicMock, patch, AsyncMock
from datetime import datetime
from collections import deque

from utils.performance_monitor import (
    PerformanceMonitor,
    track_performance,
    get_performance_monitor,
    cleanup_performance_monitor
)


class TestPerformanceMonitor:
    """Test the PerformanceMonitor class"""
    
    @pytest.fixture
    def monitor(self):
        """Create a PerformanceMonitor instance"""
        return PerformanceMonitor(window_size=60)
    
    def test_initialization(self, monitor):
        """Test monitor initialization"""
        assert monitor.window_size == 60
        assert monitor.active_connections == 0
        assert monitor.total_requests == 0
        assert monitor.total_errors == 0
        assert isinstance(monitor.request_latencies, deque)
        assert monitor.request_latencies.maxlen == 1000
        assert monitor._monitoring_task is None
    
    @pytest.mark.asyncio
    async def test_start_stop_monitoring(self, monitor):
        """Test starting and stopping monitoring"""
        with patch('asyncio.create_task') as mock_create_task:
            mock_task = MagicMock()
            mock_create_task.return_value = mock_task
            
            # Start monitoring
            monitor.start_monitoring()
            
            mock_create_task.assert_called_once()
            assert monitor._monitoring_task == mock_task
            
            # Stop monitoring
            monitor.stop_monitoring()
            
            mock_task.cancel.assert_called_once()
            assert monitor._monitoring_task is None
    
    @pytest.mark.asyncio
    async def test_monitor_loop(self, monitor):
        """Test the monitoring loop collects metrics"""
        # Mock psutil
        with patch('utils.performance_monitor.psutil') as mock_psutil:
            # Setup mocks
            mock_memory = MagicMock()
            mock_memory.percent = 50.0
            mock_memory.used = 4 * 1024 * 1024 * 1024  # 4GB
            mock_memory.available = 4 * 1024 * 1024 * 1024
            mock_psutil.virtual_memory.return_value = mock_memory
            
            mock_psutil.cpu_percent.return_value = 25.0
            
            mock_process = MagicMock()
            mock_process.memory_info.return_value.rss = 100 * 1024 * 1024  # 100MB
            mock_process.cpu_percent.return_value = 10.0
            mock_psutil.Process.return_value = mock_process
            
            # Run monitor loop briefly
            monitor_task = asyncio.create_task(monitor._monitor_loop())
            await asyncio.sleep(0.15)  # Let it collect a couple samples
            monitor_task.cancel()
            
            try:
                await monitor_task
            except asyncio.CancelledError:
                pass
            
            # Verify samples were collected
            assert len(monitor.memory_samples) > 0
            assert len(monitor.cpu_samples) > 0
            
            # Check sample content
            mem_sample = monitor.memory_samples[-1]
            assert mem_sample["percent"] == 50.0
            assert mem_sample["used"] == 4 * 1024 * 1024 * 1024
            assert "timestamp" in mem_sample
            
            cpu_sample = monitor.cpu_samples[-1]
            assert cpu_sample["system_percent"] == 25.0
            assert cpu_sample["process_percent"] == 10.0
    
    @pytest.mark.asyncio
    async def test_threshold_alerts(self, monitor):
        """Test threshold checking and alerts"""
        # Add alert callback
        alert_callback = AsyncMock()
        monitor.add_alert_callback(alert_callback)
        
        # Test memory alert
        mem_info = {
            "percent": 91.0,  # Above threshold
            "used": 7 * 1024 * 1024 * 1024,
            "available": 1 * 1024 * 1024 * 1024
        }
        cpu_info = {
            "system_percent": 50.0,  # Below threshold
            "process_percent": 20.0
        }
        
        await monitor._check_thresholds(mem_info, cpu_info)
        
        # Verify alert was triggered
        alert_callback.assert_called_once()
        alert = alert_callback.call_args[0][0]
        assert alert["type"] == "memory"
        assert alert["severity"] == "warning"
        assert alert["value"] == 91.0
        
        # Test CPU alert
        alert_callback.reset_mock()
        cpu_info["system_percent"] = 85.0  # Above threshold
        
        await monitor._check_thresholds(mem_info, cpu_info)
        
        # Should have 2 alerts now (memory + CPU)
        assert alert_callback.call_count == 2
    
    @pytest.mark.asyncio
    async def test_latency_alerts(self, monitor):
        """Test latency threshold alerts"""
        alert_callback = AsyncMock()
        monitor.add_alert_callback(alert_callback)
        
        # Add some high latency requests
        for _ in range(10):
            monitor.record_request(6.0)  # Above threshold
        
        # Check thresholds
        await monitor._check_thresholds({"percent": 50}, {"system_percent": 50})
        
        # Verify latency alert
        alert_callback.assert_called()
        found_latency_alert = False
        for call in alert_callback.call_args_list:
            if call[0][0]["type"] == "latency":
                found_latency_alert = True
                assert call[0][0]["value"] == 6.0
                break
        assert found_latency_alert
    
    def test_record_request(self, monitor):
        """Test recording request metrics"""
        # Record successful request
        monitor.record_request(0.5)
        
        assert monitor.total_requests == 1
        assert monitor.total_errors == 0
        assert list(monitor.request_latencies) == [0.5]
        
        # Record error request
        monitor.record_request(1.5, error=True)
        
        assert monitor.total_requests == 2
        assert monitor.total_errors == 1
        assert len(monitor.request_latencies) == 2
        assert len(monitor.error_counts) == 1
    
    def test_connection_tracking(self, monitor):
        """Test connection increment/decrement"""
        assert monitor.active_connections == 0
        
        monitor.increment_connections()
        assert monitor.active_connections == 1
        
        monitor.increment_connections()
        assert monitor.active_connections == 2
        
        monitor.decrement_connections()
        assert monitor.active_connections == 1
        
        # Test underflow protection
        monitor.decrement_connections()
        monitor.decrement_connections()
        assert monitor.active_connections == 0  # Should not go negative
    
    def test_get_metrics(self, monitor):
        """Test metrics calculation"""
        # Add some test data
        monitor.record_request(0.1)
        monitor.record_request(0.2)
        monitor.record_request(0.3, error=True)
        monitor.increment_connections()
        
        # Add memory and CPU samples
        monitor.memory_samples.append({
            "timestamp": time.time(),
            "percent": 60.0,
            "process_rss": 200 * 1024 * 1024
        })
        monitor.cpu_samples.append({
            "timestamp": time.time(),
            "system_percent": 30.0,
            "process_percent": 15.0
        })
        
        # Get metrics
        metrics = monitor.get_metrics()
        
        # Verify structure
        assert "timestamp" in metrics
        assert "uptime_seconds" in metrics
        assert metrics["uptime_seconds"] > 0
        
        # Check request metrics
        assert metrics["requests"]["total"] == 3
        assert metrics["requests"]["errors"] == 1
        assert metrics["requests"]["count"] == 3
        assert metrics["requests"]["avg_latency"] == pytest.approx(0.2, 0.01)
        assert metrics["requests"]["min_latency"] == 0.1
        assert metrics["requests"]["max_latency"] == 0.3
        
        # Check memory metrics
        assert metrics["memory"]["current_percent"] == 60.0
        assert metrics["memory"]["process_rss_mb"] == pytest.approx(200.0, 0.1)
        
        # Check CPU metrics
        assert metrics["cpu"]["current_percent"] == 30.0
        assert metrics["cpu"]["process_percent"] == 15.0
        
        # Check connections
        assert metrics["connections"]["active"] == 1
    
    def test_metrics_percentiles(self, monitor):
        """Test percentile calculations in metrics"""
        # Add 100 latency samples
        for i in range(100):
            monitor.record_request(i / 100.0)
        
        metrics = monitor.get_metrics()
        
        # Check percentiles
        assert metrics["requests"]["p50_latency"] == pytest.approx(0.5, 0.01)
        assert metrics["requests"]["p95_latency"] == pytest.approx(0.95, 0.01)
        assert metrics["requests"]["p99_latency"] == pytest.approx(0.99, 0.01)
    
    def test_alert_callback_management(self, monitor):
        """Test adding and removing alert callbacks"""
        callback1 = MagicMock()
        callback2 = MagicMock()
        
        # Add callbacks
        monitor.add_alert_callback(callback1)
        monitor.add_alert_callback(callback2)
        
        assert len(monitor.alert_callbacks) == 2
        
        # Remove callback
        monitor.remove_alert_callback(callback1)
        
        assert len(monitor.alert_callbacks) == 1
        assert monitor.alert_callbacks[0] == callback2
        
        # Remove non-existent callback (should not error)
        monitor.remove_alert_callback(callback1)
        assert len(monitor.alert_callbacks) == 1


class TestTrackPerformance:
    """Test the track_performance context manager"""
    
    @pytest.mark.asyncio
    async def test_track_performance_success(self):
        """Test tracking successful operation"""
        monitor = PerformanceMonitor()
        
        async with track_performance(monitor, "test_operation"):
            await asyncio.sleep(0.1)
        
        # Verify request was recorded
        assert monitor.total_requests == 1
        assert monitor.total_errors == 0
        assert len(monitor.request_latencies) == 1
        assert monitor.request_latencies[0] >= 0.1
    
    @pytest.mark.asyncio
    async def test_track_performance_error(self):
        """Test tracking failed operation"""
        monitor = PerformanceMonitor()
        
        with pytest.raises(ValueError):
            async with track_performance(monitor, "failing_operation"):
                raise ValueError("Test error")
        
        # Verify error was recorded
        assert monitor.total_requests == 1
        assert monitor.total_errors == 1
        assert len(monitor.request_latencies) == 1
    
    @pytest.mark.asyncio
    async def test_track_performance_logging(self):
        """Test performance logging"""
        monitor = PerformanceMonitor()
        
        with patch('utils.performance_monitor.logger') as mock_logger:
            # Successful operation
            async with track_performance(monitor, "test_op"):
                pass
            
            mock_logger.info.assert_called_once()
            assert "test_op completed" in mock_logger.info.call_args[0][0]
            
            # Failed operation
            mock_logger.reset_mock()
            with pytest.raises(Exception):
                async with track_performance(monitor, "fail_op"):
                    raise Exception("Test")
            
            mock_logger.error.assert_called_once()
            assert "fail_op failed" in mock_logger.error.call_args[0][0]


class TestGlobalMonitor:
    """Test global monitor instance management"""
    
    def test_get_performance_monitor(self):
        """Test getting global monitor instance"""
        # Clean up any existing instance
        cleanup_performance_monitor()
        
        with patch('utils.performance_monitor.PerformanceMonitor') as mock_monitor_class:
            mock_instance = MagicMock()
            mock_monitor_class.return_value = mock_instance
            
            # Get monitor
            monitor1 = get_performance_monitor()
            
            # Verify instance was created and monitoring started
            mock_monitor_class.assert_called_once()
            mock_instance.start_monitoring.assert_called_once()
            
            # Get monitor again - should return same instance
            monitor2 = get_performance_monitor()
            assert monitor1 == monitor2
            
            # Should not create new instance
            assert mock_monitor_class.call_count == 1
    
    def test_cleanup_performance_monitor(self):
        """Test cleanup of global monitor"""
        # Create a monitor
        with patch('utils.performance_monitor._performance_monitor') as mock_monitor:
            mock_monitor.stop_monitoring = MagicMock()
            
            cleanup_performance_monitor()
            
            # Should stop monitoring if monitor exists
            if mock_monitor:
                mock_monitor.stop_monitoring.assert_called_once()


class TestPerformanceMonitorIntegration:
    """Integration tests for performance monitoring"""
    
    @pytest.mark.asyncio
    async def test_full_monitoring_cycle(self):
        """Test complete monitoring cycle"""
        monitor = PerformanceMonitor(window_size=10)
        
        # Start monitoring
        monitor.start_monitoring()
        
        try:
            # Simulate some requests
            for i in range(5):
                async with track_performance(monitor, f"request_{i}"):
                    await asyncio.sleep(0.01)
            
            # Simulate an error
            try:
                async with track_performance(monitor, "error_request"):
                    raise Exception("Test error")
            except:
                pass
            
            # Add connections
            monitor.increment_connections()
            monitor.increment_connections()
            
            # Wait for some metrics to be collected
            await asyncio.sleep(0.2)
            
            # Get metrics
            metrics = monitor.get_metrics()
            
            # Verify metrics
            assert metrics["requests"]["total"] == 6
            assert metrics["requests"]["errors"] == 1
            assert metrics["connections"]["active"] == 2
            
            # Should have memory and CPU metrics
            assert "current_percent" in metrics.get("memory", {})
            assert "current_percent" in metrics.get("cpu", {})
            
        finally:
            # Clean up
            monitor.stop_monitoring()
            await asyncio.sleep(0.1)  # Let task finish
    
    @pytest.mark.asyncio
    async def test_concurrent_request_tracking(self):
        """Test tracking concurrent requests"""
        monitor = PerformanceMonitor()
        
        async def simulate_request(delay: float):
            async with track_performance(monitor, f"request_{delay}"):
                await asyncio.sleep(delay)
        
        # Run concurrent requests
        tasks = [
            simulate_request(0.01),
            simulate_request(0.02),
            simulate_request(0.03)
        ]
        
        await asyncio.gather(*tasks)
        
        # Verify all requests were tracked
        assert monitor.total_requests == 3
        assert len(monitor.request_latencies) == 3
        
        # Latencies should be approximately correct
        latencies = sorted(list(monitor.request_latencies))
        assert latencies[0] >= 0.01
        assert latencies[1] >= 0.02
        assert latencies[2] >= 0.03