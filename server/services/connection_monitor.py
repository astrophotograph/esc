"""
Telescope connection monitoring service.

Monitors telescope connections and sends notifications to frontend when
a telescope has been disconnected for more than a few seconds.
"""

import asyncio
import time
from typing import Dict, Optional, Set
from loguru import logger
from dataclasses import dataclass, field


@dataclass
class TelescopeConnectionState:
    """Tracks the connection state of a telescope."""
    telescope_id: str
    last_seen: float = field(default_factory=time.time)
    is_connected: bool = True
    disconnected_notified: bool = False
    disconnect_start: Optional[float] = None
    
    def update_seen(self):
        """Update the last seen timestamp."""
        self.last_seen = time.time()
        if not self.is_connected:
            # Telescope is back online
            self.is_connected = True
            self.disconnect_start = None
            self.disconnected_notified = False
            logger.info(f"Telescope {self.telescope_id} reconnected")
    
    def mark_disconnected(self):
        """Mark telescope as disconnected."""
        if self.is_connected:
            self.is_connected = False
            self.disconnect_start = time.time()
            logger.warning(f"Telescope {self.telescope_id} marked as disconnected")


class TelescopeConnectionMonitor:
    """
    Monitors telescope connections and sends WebSocket notifications
    when telescopes have been disconnected for more than a few seconds.
    """
    
    def __init__(self, websocket_manager=None, disconnect_threshold: float = 5.0):
        """
        Initialize the connection monitor.
        
        Args:
            websocket_manager: WebSocket manager for sending notifications
            disconnect_threshold: Seconds before considering a telescope disconnected (default 5.0)
        """
        self.websocket_manager = websocket_manager
        self.disconnect_threshold = disconnect_threshold
        self.connection_states: Dict[str, TelescopeConnectionState] = {}
        self.monitor_task: Optional[asyncio.Task] = None
        self._running = False
        
        # Time thresholds
        self.heartbeat_timeout = 10.0  # Consider disconnected after 10s without heartbeat
        self.notification_delay = 3.0   # Send notification after 3s of disconnection
        
        logger.info(f"Connection monitor initialized with {disconnect_threshold}s threshold")
    
    def track_telescope(self, telescope_id: str):
        """Start tracking a telescope's connection state."""
        if telescope_id not in self.connection_states:
            self.connection_states[telescope_id] = TelescopeConnectionState(telescope_id)
            logger.debug(f"Started tracking telescope: {telescope_id}")
    
    def untrack_telescope(self, telescope_id: str):
        """Stop tracking a telescope's connection state."""
        if telescope_id in self.connection_states:
            del self.connection_states[telescope_id]
            logger.debug(f"Stopped tracking telescope: {telescope_id}")
    
    def update_telescope_activity(self, telescope_id: str):
        """
        Update the last seen time for a telescope.
        This should be called whenever we receive any message from the telescope.
        """
        if telescope_id not in self.connection_states:
            self.track_telescope(telescope_id)
        
        state = self.connection_states[telescope_id]
        state.update_seen()
    
    def check_telescope_connection(self, telescope_id: str, client) -> bool:
        """
        Check if a telescope client is actually connected.
        
        Args:
            telescope_id: The telescope identifier
            client: The telescope client object (e.g., SeestarClient)
        
        Returns:
            True if connected, False otherwise
        """
        try:
            # Check multiple connection indicators
            if hasattr(client, 'is_connected'):
                if not client.is_connected:
                    return False
            
            if hasattr(client, 'connection'):
                if client.connection is None:
                    return False
                if hasattr(client.connection, 'is_connected'):
                    if not client.connection.is_connected():
                        return False
            
            return True
        except Exception as e:
            logger.error(f"Error checking connection for telescope {telescope_id}: {e}")
            return False
    
    async def start(self):
        """Start the connection monitoring loop."""
        if self._running:
            return
        
        self._running = True
        self.monitor_task = asyncio.create_task(self._monitor_loop())
        logger.info("Telescope connection monitor started")
    
    async def stop(self):
        """Stop the connection monitoring loop."""
        self._running = False
        
        if self.monitor_task:
            self.monitor_task.cancel()
            try:
                await self.monitor_task
            except asyncio.CancelledError:
                pass
        
        logger.info("Telescope connection monitor stopped")
    
    async def _monitor_loop(self):
        """Main monitoring loop that checks telescope connections."""
        logger.info("Connection monitor loop started")
        
        while self._running:
            try:
                current_time = time.time()
                
                # Check each tracked telescope
                for telescope_id, state in list(self.connection_states.items()):
                    time_since_seen = current_time - state.last_seen
                    
                    # Check if telescope appears to be disconnected
                    if time_since_seen > self.heartbeat_timeout:
                        if state.is_connected:
                            # Just disconnected
                            state.mark_disconnected()
                            logger.warning(
                                f"Telescope {telescope_id} appears disconnected "
                                f"(no activity for {time_since_seen:.1f}s)"
                            )
                    
                    # Check if we should send a disconnection notification
                    if not state.is_connected and not state.disconnected_notified:
                        if state.disconnect_start:
                            disconnect_duration = current_time - state.disconnect_start
                            
                            if disconnect_duration >= self.notification_delay:
                                # Send notification via WebSocket
                                await self._send_disconnect_notification(
                                    telescope_id, 
                                    disconnect_duration
                                )
                                state.disconnected_notified = True
                
                # Wait before next check
                await asyncio.sleep(1.0)
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in connection monitor loop: {e}")
                await asyncio.sleep(5.0)
    
    async def _send_disconnect_notification(self, telescope_id: str, duration: float):
        """Send a disconnection notification via WebSocket."""
        try:
            if self.websocket_manager:
                # Send a telescope_lost message
                reason = f"No response for {duration:.1f} seconds"
                await self.websocket_manager.broadcast_telescope_lost(
                    telescope_id=telescope_id,
                    reason=reason
                )
                
                # Also send a more detailed disconnection event
                disconnection_event = {
                    "type": "telescope_disconnection",
                    "telescope_id": telescope_id,
                    "payload": {
                        "disconnect_duration": duration,
                        "reason": reason,
                        "timestamp": time.time()
                    }
                }
                
                # Send as a custom event to all subscribed clients
                from websocket_protocol import MessageFactory, MessageType
                message = MessageFactory.create_message(
                    message_type=MessageType.EVENT,
                    telescope_id=telescope_id,
                    payload=disconnection_event
                )
                
                # Broadcast to all connections subscribed to this telescope
                for connection in self.websocket_manager.connections.values():
                    if connection.is_subscribed_to(telescope_id, "STATUS"):
                        await connection.send_message(message)
                
                logger.info(
                    f"Sent disconnection notification for telescope {telescope_id} "
                    f"(disconnected for {duration:.1f}s)"
                )
            else:
                logger.warning("No WebSocket manager available for disconnect notification")
                
        except Exception as e:
            logger.error(f"Error sending disconnect notification for {telescope_id}: {e}")
    
    async def check_and_notify_immediate(self, telescope_id: str):
        """
        Immediately check a telescope's connection and notify if disconnected.
        This can be called when we detect a connection error.
        """
        if telescope_id in self.connection_states:
            state = self.connection_states[telescope_id]
            
            if state.is_connected:
                state.mark_disconnected()
                
                # Send immediate notification
                await self._send_disconnect_notification(telescope_id, 0.0)
                state.disconnected_notified = True
                
                logger.info(f"Immediate disconnect notification sent for {telescope_id}")


# Global instance
_connection_monitor: Optional[TelescopeConnectionMonitor] = None


def get_connection_monitor() -> TelescopeConnectionMonitor:
    """Get the global connection monitor instance."""
    global _connection_monitor
    if _connection_monitor is None:
        _connection_monitor = TelescopeConnectionMonitor()
    return _connection_monitor


def initialize_connection_monitor(websocket_manager) -> TelescopeConnectionMonitor:
    """Initialize the connection monitor with a WebSocket manager."""
    global _connection_monitor
    _connection_monitor = TelescopeConnectionMonitor(websocket_manager)
    return _connection_monitor