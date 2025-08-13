"""Memory monitoring utilities for debugging memory leaks."""

import asyncio
import gc
import os
import psutil
import tracemalloc
from datetime import datetime
from typing import Dict, Optional, Any
from loguru import logger

class MemoryMonitor:
    """Monitor memory usage and log statistics periodically."""
    
    def __init__(self, interval_seconds: int = 60, enable_tracemalloc: bool = False):
        """
        Initialize memory monitor.
        
        Args:
            interval_seconds: How often to log memory stats (default: 60 seconds)
            enable_tracemalloc: Whether to enable detailed memory tracing (has overhead)
        """
        self.interval = interval_seconds
        self.enable_tracemalloc = enable_tracemalloc
        self.process = psutil.Process(os.getpid())
        self.monitoring_task: Optional[asyncio.Task] = None
        self.initial_memory: Optional[float] = None
        self.peak_memory: float = 0
        self.last_stats: Dict[str, Any] = {}
        
        if self.enable_tracemalloc:
            tracemalloc.start()
            logger.info("Tracemalloc enabled for detailed memory tracking")
    
    async def start(self):
        """Start the memory monitoring background task."""
        if self.monitoring_task is not None:
            logger.warning("Memory monitor already running")
            return
        
        self.initial_memory = self.get_memory_usage()
        self.peak_memory = self.initial_memory
        logger.info(f"Starting memory monitor (interval: {self.interval}s, initial: {self.initial_memory:.2f} MB)")
        
        self.monitoring_task = asyncio.create_task(self._monitor_loop())
    
    async def stop(self):
        """Stop the memory monitoring."""
        if self.monitoring_task:
            self.monitoring_task.cancel()
            try:
                await self.monitoring_task
            except asyncio.CancelledError:
                pass
            self.monitoring_task = None
            logger.info("Memory monitor stopped")
            
            if self.enable_tracemalloc:
                tracemalloc.stop()
    
    def get_memory_usage(self) -> float:
        """Get current memory usage in MB."""
        return self.process.memory_info().rss / 1024 / 1024
    
    def get_memory_stats(self) -> Dict[str, Any]:
        """Get detailed memory statistics."""
        memory_info = self.process.memory_info()
        current_mb = memory_info.rss / 1024 / 1024
        
        stats = {
            "timestamp": datetime.now().isoformat(),
            "current_mb": current_mb,
            "peak_mb": self.peak_memory,
            "initial_mb": self.initial_memory or 0,
            "delta_mb": current_mb - (self.initial_memory or current_mb),
            "percent": self.process.memory_percent(),
            "vms_mb": memory_info.vms / 1024 / 1024,
            "threads": self.process.num_threads(),
            "open_files": len(self.process.open_files()),
            "connections": len(self.process.connections()),
        }
        
        # Add garbage collection stats
        gc_stats = gc.get_stats()
        if gc_stats:
            stats["gc"] = {
                "collections": [s.get("collections", 0) for s in gc_stats],
                "collected": [s.get("collected", 0) for s in gc_stats],
                "uncollectable": [s.get("uncollectable", 0) for s in gc_stats],
            }
        
        # Add tracemalloc stats if enabled
        if self.enable_tracemalloc:
            snapshot = tracemalloc.take_snapshot()
            top_stats = snapshot.statistics('lineno')[:5]  # Top 5 memory consumers
            stats["top_allocations"] = [
                {
                    "file": stat.traceback.format()[0] if stat.traceback else "unknown",
                    "size_mb": stat.size / 1024 / 1024,
                    "count": stat.count
                }
                for stat in top_stats
            ]
        
        # Track asyncio tasks
        try:
            all_tasks = asyncio.all_tasks()
            stats["asyncio"] = {
                "total_tasks": len(all_tasks),
                "running_tasks": sum(1 for t in all_tasks if not t.done()),
                "pending_tasks": sum(1 for t in all_tasks if not t.done() and not t.cancelled()),
            }
        except Exception as e:
            logger.warning(f"Failed to get asyncio stats: {e}")
        
        self.last_stats = stats
        return stats
    
    async def _monitor_loop(self):
        """Background loop to monitor and log memory stats."""
        try:
            while True:
                await asyncio.sleep(self.interval)
                
                stats = self.get_memory_stats()
                current_mb = stats["current_mb"]
                
                # Update peak memory
                if current_mb > self.peak_memory:
                    self.peak_memory = current_mb
                    logger.warning(f"New peak memory: {self.peak_memory:.2f} MB")
                
                # Log at appropriate level based on memory growth
                delta_mb = stats["delta_mb"]
                if abs(delta_mb) < 10:
                    log_level = logger.debug
                elif abs(delta_mb) < 50:
                    log_level = logger.info
                else:
                    log_level = logger.warning
                
                log_level(
                    f"Memory: {current_mb:.1f}MB (Δ{delta_mb:+.1f}MB, "
                    f"{stats['percent']:.1f}%, threads={stats['threads']}, "
                    f"tasks={stats['asyncio']['total_tasks']}, "
                    f"files={stats['open_files']}, conns={stats['connections']})"
                )
                
                # Log top allocations if memory growth is significant
                if self.enable_tracemalloc and delta_mb > 20:
                    logger.info("Top memory allocations:")
                    for alloc in stats.get("top_allocations", []):
                        logger.info(f"  {alloc['file']}: {alloc['size_mb']:.2f}MB ({alloc['count']} objects)")
                
                # Force garbage collection if memory is growing significantly
                if delta_mb > 100:
                    logger.warning(f"High memory growth detected ({delta_mb:.1f}MB), forcing garbage collection")
                    gc.collect()
                    new_usage = self.get_memory_usage()
                    logger.info(f"After GC: {new_usage:.1f}MB (freed {current_mb - new_usage:.1f}MB)")
                
        except asyncio.CancelledError:
            logger.debug("Memory monitor loop cancelled")
            raise
        except Exception as e:
            logger.error(f"Error in memory monitor loop: {e}", exc_info=True)
            raise
    
    def get_prometheus_metrics(self) -> str:
        """Get memory stats in Prometheus format."""
        stats = self.last_stats or self.get_memory_stats()
        
        metrics = []
        metrics.append(f'# HELP python_memory_bytes Current memory usage in bytes')
        metrics.append(f'# TYPE python_memory_bytes gauge')
        metrics.append(f'python_memory_bytes{{type="rss"}} {stats["current_mb"] * 1024 * 1024}')
        metrics.append(f'python_memory_bytes{{type="vms"}} {stats["vms_mb"] * 1024 * 1024}')
        
        metrics.append(f'# HELP python_memory_percent Memory usage percentage')
        metrics.append(f'# TYPE python_memory_percent gauge')
        metrics.append(f'python_memory_percent {stats["percent"]}')
        
        metrics.append(f'# HELP python_threads Number of threads')
        metrics.append(f'# TYPE python_threads gauge')
        metrics.append(f'python_threads {stats["threads"]}')
        
        metrics.append(f'# HELP python_open_files Number of open files')
        metrics.append(f'# TYPE python_open_files gauge')
        metrics.append(f'python_open_files {stats["open_files"]}')
        
        metrics.append(f'# HELP python_connections Number of network connections')
        metrics.append(f'# TYPE python_connections gauge')
        metrics.append(f'python_connections {stats["connections"]}')
        
        if "asyncio" in stats:
            metrics.append(f'# HELP python_asyncio_tasks Number of asyncio tasks')
            metrics.append(f'# TYPE python_asyncio_tasks gauge')
            metrics.append(f'python_asyncio_tasks{{state="total"}} {stats["asyncio"]["total_tasks"]}')
            metrics.append(f'python_asyncio_tasks{{state="running"}} {stats["asyncio"]["running_tasks"]}')
            metrics.append(f'python_asyncio_tasks{{state="pending"}} {stats["asyncio"]["pending_tasks"]}')
        
        if "gc" in stats:
            for gen, collections in enumerate(stats["gc"]["collections"]):
                metrics.append(f'# HELP python_gc_collections_total Total garbage collections')
                metrics.append(f'# TYPE python_gc_collections_total counter')
                metrics.append(f'python_gc_collections_total{{generation="{gen}"}} {collections}')
        
        return '\n'.join(metrics)