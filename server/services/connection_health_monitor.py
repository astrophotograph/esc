"""
Connection Health Monitor for Telescope Connections

This module provides health monitoring and automatic recovery for telescope connections
to prevent the "Connection reset by peer" issues that occur after extended periods.
"""

import asyncio
import time
from typing import Dict, Optional, Set
from datetime import datetime, timedelta
import logging
from loguru import logger

class ConnectionHealthMonitor:
    """
    Monitors telescope connections and handles automatic reconnection
    when connections become stale or unresponsive.
    """
    
    def __init__(self, check_interval: int = 30, max_idle_time: int = 300):
        """
        Initialize the connection health monitor.
        
        Args:
            check_interval: Seconds between health checks (default: 30)
            max_idle_time: Maximum seconds a connection can be idle before reconnection (default: 300)
        """
        self.check_interval = check_interval
        self.max_idle_time = max_idle_time
        self.connections: Dict[str, ConnectionInfo] = {}
        self.monitoring_task: Optional[asyncio.Task] = None
        self._running = False
        
    def register_connection(self, telescope_id: str, connection_obj: any):
        """Register a telescope connection for monitoring."""
        self.connections[telescope_id] = ConnectionInfo(
            telescope_id=telescope_id,
            connection=connection_obj,
            last_activity=time.time(),
            last_health_check=time.time(),
            consecutive_failures=0
        )
        logger.info(f"Registered connection for telescope {telescope_id} for health monitoring")
        
    def unregister_connection(self, telescope_id: str):
        """Remove a telescope connection from monitoring."""
        if telescope_id in self.connections:
            del self.connections[telescope_id]
            logger.info(f"Unregistered connection for telescope {telescope_id}")
            
    def update_activity(self, telescope_id: str):
        """Update the last activity timestamp for a connection."""
        if telescope_id in self.connections:
            self.connections[telescope_id].last_activity = time.time()
            self.connections[telescope_id].consecutive_failures = 0
            
    async def start_monitoring(self):
        """Start the health monitoring task."""
        if self._running:
            logger.warning("Health monitor already running")
            return
            
        self._running = True
        self.monitoring_task = asyncio.create_task(self._monitor_loop())
        logger.info("Started connection health monitoring")
        
    async def stop_monitoring(self):
        """Stop the health monitoring task."""
        self._running = False
        if self.monitoring_task:
            self.monitoring_task.cancel()
            try:
                await self.monitoring_task
            except asyncio.CancelledError:
                pass
        logger.info("Stopped connection health monitoring")
        
    async def _monitor_loop(self):
        """Main monitoring loop that checks connection health."""
        while self._running:
            try:
                await self._check_all_connections()
                await asyncio.sleep(self.check_interval)
            except Exception as e:
                logger.error(f"Error in health monitor loop: {e}")
                await asyncio.sleep(self.check_interval)
                
    async def _check_all_connections(self):
        """Check health of all registered connections."""
        current_time = time.time()
        stale_connections = []
        
        for telescope_id, conn_info in self.connections.items():
            try:
                # Check if connection has been idle too long
                idle_time = current_time - conn_info.last_activity
                if idle_time > self.max_idle_time:
                    logger.warning(
                        f"Connection {telescope_id} has been idle for {idle_time:.1f} seconds"
                    )
                    stale_connections.append(telescope_id)
                    continue
                    
                # Perform a lightweight health check
                if await self._perform_health_check(conn_info):
                    conn_info.last_health_check = current_time
                    conn_info.consecutive_failures = 0
                else:
                    conn_info.consecutive_failures += 1
                    logger.warning(
                        f"Health check failed for {telescope_id} "
                        f"(failures: {conn_info.consecutive_failures})"
                    )
                    
                    # Mark as stale after 3 consecutive failures
                    if conn_info.consecutive_failures >= 3:
                        stale_connections.append(telescope_id)
                        
            except Exception as e:
                logger.error(f"Error checking connection {telescope_id}: {e}")
                conn_info.consecutive_failures += 1
                if conn_info.consecutive_failures >= 3:
                    stale_connections.append(telescope_id)
                    
        # Handle stale connections
        for telescope_id in stale_connections:
            await self._handle_stale_connection(telescope_id)
            
    async def _perform_health_check(self, conn_info: 'ConnectionInfo') -> bool:
        """
        Perform a lightweight health check on a connection.
        
        This should be customized based on the actual connection type.
        For now, we'll check if the connection object exists and has expected attributes.
        """
        try:
            # Check if connection object exists and has required attributes
            if conn_info.connection is None:
                return False
                
            # If the connection has a method to check if it's alive, use it
            if hasattr(conn_info.connection, 'is_alive'):
                # Check if it's a property or callable
                is_alive = conn_info.connection.is_alive
                if callable(is_alive):
                    # If it's a method, check if it's async
                    import asyncio
                    if asyncio.iscoroutinefunction(is_alive):
                        return await is_alive()
                    else:
                        return is_alive()
                else:
                    # It's a property
                    return is_alive
            elif hasattr(conn_info.connection, 'connected'):
                return conn_info.connection.connected
            elif hasattr(conn_info.connection, 'is_connected'):
                # Check if it's a property or callable
                is_connected = conn_info.connection.is_connected
                if callable(is_connected):
                    # If it's a method, check if it's async
                    import asyncio
                    if asyncio.iscoroutinefunction(is_connected):
                        return await is_connected()
                    else:
                        return is_connected()
                else:
                    # It's a property
                    return is_connected
                
            # Default: assume connection is healthy if object exists
            return True
            
        except Exception as e:
            logger.error(f"Health check error: {e}")
            return False
            
    async def _handle_stale_connection(self, telescope_id: str):
        """
        Handle a stale connection by triggering reconnection.
        
        This should be customized to work with your actual connection manager.
        """
        logger.warning(f"Handling stale connection for telescope {telescope_id}")
        
        conn_info = self.connections.get(telescope_id)
        if not conn_info:
            return
            
        try:
            # Try to close the existing connection gracefully
            if hasattr(conn_info.connection, 'close'):
                try:
                    await conn_info.connection.close()
                except Exception as e:
                    logger.error(f"Error closing connection {telescope_id}: {e}")
                    
            # Reset the connection info
            conn_info.consecutive_failures = 0
            conn_info.last_health_check = time.time()
            
            # Trigger reconnection through the main controller
            # This should be customized to work with your actual system
            logger.info(f"Requesting reconnection for telescope {telescope_id}")
            
            # For now, just mark it as needing reconnection
            # The main controller should handle the actual reconnection
            conn_info.needs_reconnection = True
            
        except Exception as e:
            logger.error(f"Error handling stale connection {telescope_id}: {e}")
            

class ConnectionInfo:
    """Information about a monitored connection."""
    
    def __init__(self, telescope_id: str, connection: any, last_activity: float, 
                 last_health_check: float, consecutive_failures: int = 0):
        self.telescope_id = telescope_id
        self.connection = connection
        self.last_activity = last_activity
        self.last_health_check = last_health_check
        self.consecutive_failures = consecutive_failures
        self.needs_reconnection = False
        

# Global instance
_health_monitor: Optional[ConnectionHealthMonitor] = None

def get_health_monitor() -> ConnectionHealthMonitor:
    """Get or create the global health monitor instance."""
    global _health_monitor
    if _health_monitor is None:
        _health_monitor = ConnectionHealthMonitor()
    return _health_monitor
    
async def start_health_monitoring():
    """Start the global health monitor."""
    monitor = get_health_monitor()
    await monitor.start_monitoring()
    
async def stop_health_monitoring():
    """Stop the global health monitor."""
    monitor = get_health_monitor()
    await monitor.stop_monitoring()