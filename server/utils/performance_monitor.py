"""Performance monitoring utilities for tracking system and application metrics."""

import asyncio
import time
from typing import Dict, List, Optional, Callable
from datetime import datetime
from collections import deque
from contextlib import asynccontextmanager

import psutil
from loguru import logger


class PerformanceMonitor:
    """
    Monitor and track performance metrics for the application.
    
    Tracks:
    - Request latencies
    - Memory usage
    - CPU usage
    - Active connections
    - Error rates
    """
    
    def __init__(self, window_size: int = 300):  # 5 minute window by default
        self.window_size = window_size
        self.start_time = time.time()
        
        # Metrics storage (using deque for efficient windowing)
        self.request_latencies: deque = deque(maxlen=1000)
        self.memory_samples: deque = deque(maxlen=window_size)
        self.cpu_samples: deque = deque(maxlen=window_size)
        self.error_counts: deque = deque(maxlen=window_size)
        self.active_connections: int = 0
        self.total_requests: int = 0
        self.total_errors: int = 0
        
        # Thresholds for alerts
        self.memory_threshold = 90.0  # percent
        self.cpu_threshold = 80.0  # percent
        self.latency_threshold = 5.0  # seconds
        
        # Callbacks for threshold alerts
        self.alert_callbacks: List[Callable] = []
        
        # Background monitoring task
        self._monitoring_task: Optional[asyncio.Task] = None
        
    def start_monitoring(self):
        """Start background monitoring of system metrics."""
        if not self._monitoring_task:
            self._monitoring_task = asyncio.create_task(self._monitor_loop())
            logger.info("Performance monitoring started")
            
    def stop_monitoring(self):
        """Stop background monitoring."""
        if self._monitoring_task:
            self._monitoring_task.cancel()
            self._monitoring_task = None
            logger.info("Performance monitoring stopped")
            
    async def _monitor_loop(self):
        """Background loop to collect system metrics."""
        process = psutil.Process()
        
        while True:
            try:
                # Collect memory info
                mem = psutil.virtual_memory()
                mem_info = {
                    "timestamp": time.time(),
                    "percent": mem.percent,
                    "used": mem.used,
                    "available": mem.available,
                    "process_rss": process.memory_info().rss
                }
                self.memory_samples.append(mem_info)
                
                # Collect CPU info
                cpu_info = {
                    "timestamp": time.time(),
                    "system_percent": psutil.cpu_percent(interval=0.1),
                    "process_percent": process.cpu_percent(interval=0.1)
                }
                self.cpu_samples.append(cpu_info)
                
                # Check thresholds
                await self._check_thresholds(mem_info, cpu_info)
                
                # Sleep for 1 second
                await asyncio.sleep(1)
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in performance monitoring loop: {e}")
                await asyncio.sleep(5)  # Back off on error
                
    async def _check_thresholds(self, mem_info: Dict, cpu_info: Dict):
        """Check if any metrics exceed thresholds and trigger alerts."""
        alerts = []
        
        if mem_info["percent"] > self.memory_threshold:
            alerts.append({
                "type": "memory",
                "severity": "critical" if mem_info["percent"] > 95 else "warning",
                "value": mem_info["percent"],
                "threshold": self.memory_threshold,
                "message": f"Memory usage at {mem_info['percent']:.1f}%"
            })
            
        if cpu_info["system_percent"] > self.cpu_threshold:
            alerts.append({
                "type": "cpu",
                "severity": "warning",
                "value": cpu_info["system_percent"],
                "threshold": self.cpu_threshold,
                "message": f"CPU usage at {cpu_info['system_percent']:.1f}%"
            })
            
        # Check latency if we have recent requests
        if self.request_latencies:
            recent_latencies = list(self.request_latencies)[-10:]
            avg_latency = sum(recent_latencies) / len(recent_latencies)
            if avg_latency > self.latency_threshold:
                alerts.append({
                    "type": "latency",
                    "severity": "warning",
                    "value": avg_latency,
                    "threshold": self.latency_threshold,
                    "message": f"Average latency at {avg_latency:.2f}s"
                })
                
        # Trigger callbacks for alerts
        for alert in alerts:
            logger.warning(f"Performance alert: {alert['message']}")
            for callback in self.alert_callbacks:
                try:
                    await callback(alert)
                except Exception as e:
                    logger.error(f"Error in alert callback: {e}")
                    
    def record_request(self, latency: float, error: bool = False):
        """Record a request completion."""
        self.total_requests += 1
        self.request_latencies.append(latency)
        
        if error:
            self.total_errors += 1
            current_time = time.time()
            self.error_counts.append(current_time)
            
            # Clean old error counts (outside window)
            cutoff = current_time - self.window_size
            while self.error_counts and self.error_counts[0] < cutoff:
                self.error_counts.popleft()
                
    def increment_connections(self):
        """Increment active connection count."""
        self.active_connections += 1
        
    def decrement_connections(self):
        """Decrement active connection count."""
        self.active_connections = max(0, self.active_connections - 1)
        
    def get_metrics(self) -> Dict:
        """Get current performance metrics."""
        now = time.time()
        uptime = now - self.start_time
        
        # Calculate request metrics
        request_metrics = {}
        if self.request_latencies:
            latencies = list(self.request_latencies)
            request_metrics = {
                "count": len(latencies),
                "avg_latency": sum(latencies) / len(latencies),
                "min_latency": min(latencies),
                "max_latency": max(latencies),
                "p50_latency": sorted(latencies)[len(latencies) // 2],
                "p95_latency": sorted(latencies)[int(len(latencies) * 0.95)] if len(latencies) > 20 else max(latencies),
                "p99_latency": sorted(latencies)[int(len(latencies) * 0.99)] if len(latencies) > 100 else max(latencies)
            }
            
        # Calculate memory metrics
        memory_metrics = {}
        if self.memory_samples:
            recent_memory = [s["percent"] for s in list(self.memory_samples)[-60:]]  # Last minute
            memory_metrics = {
                "current_percent": self.memory_samples[-1]["percent"] if self.memory_samples else 0,
                "avg_percent": sum(recent_memory) / len(recent_memory),
                "max_percent": max(recent_memory),
                "process_rss_mb": self.memory_samples[-1]["process_rss"] / 1024 / 1024 if self.memory_samples else 0
            }
            
        # Calculate CPU metrics
        cpu_metrics = {}
        if self.cpu_samples:
            recent_cpu = [s["system_percent"] for s in list(self.cpu_samples)[-60:]]  # Last minute
            cpu_metrics = {
                "current_percent": self.cpu_samples[-1]["system_percent"] if self.cpu_samples else 0,
                "avg_percent": sum(recent_cpu) / len(recent_cpu),
                "max_percent": max(recent_cpu),
                "process_percent": self.cpu_samples[-1]["process_percent"] if self.cpu_samples else 0
            }
            
        # Calculate error rate
        current_errors = len([e for e in self.error_counts if e > now - 60])  # Errors in last minute
        error_rate = (current_errors / max(1, self.total_requests)) * 100 if self.total_requests > 0 else 0
        
        return {
            "timestamp": datetime.now().isoformat(),
            "uptime_seconds": uptime,
            "requests": {
                "total": self.total_requests,
                "errors": self.total_errors,
                "error_rate_percent": error_rate,
                "recent_errors": current_errors,
                **request_metrics
            },
            "memory": memory_metrics,
            "cpu": cpu_metrics,
            "connections": {
                "active": self.active_connections
            }
        }
        
    def add_alert_callback(self, callback: Callable):
        """Add a callback to be triggered when thresholds are exceeded."""
        self.alert_callbacks.append(callback)
        
    def remove_alert_callback(self, callback: Callable):
        """Remove an alert callback."""
        if callback in self.alert_callbacks:
            self.alert_callbacks.remove(callback)


@asynccontextmanager
async def track_performance(monitor: PerformanceMonitor, operation_name: str):
    """
    Context manager to track performance of an operation.
    
    Usage:
        async with track_performance(monitor, "telescope_connect"):
            await telescope.connect()
    """
    start_time = time.time()
    error_occurred = False
    
    try:
        yield
    except Exception:
        error_occurred = True
        raise
    finally:
        duration = time.time() - start_time
        monitor.record_request(duration, error=error_occurred)
        
        # Log performance
        if error_occurred:
            logger.error(f"Operation {operation_name} failed after {duration:.3f}s")
        else:
            logger.info(f"Operation {operation_name} completed in {duration:.3f}s")


# Global performance monitor instance
_performance_monitor: Optional[PerformanceMonitor] = None


def get_performance_monitor() -> PerformanceMonitor:
    """Get the global performance monitor instance."""
    global _performance_monitor
    if _performance_monitor is None:
        _performance_monitor = PerformanceMonitor()
        _performance_monitor.start_monitoring()
    return _performance_monitor


def cleanup_performance_monitor():
    """Clean up the global performance monitor."""
    global _performance_monitor
    if _performance_monitor:
        _performance_monitor.stop_monitoring()
        _performance_monitor = None