"""
Connection Recovery Service for Telescope Connections

Handles automatic recovery and reconnection of telescope connections
when they fail or become unresponsive.
"""

import asyncio
import time
from typing import Dict, Optional, Callable, Any
from loguru import logger
from datetime import datetime, timedelta

class ConnectionRecoveryService:
    """
    Service to handle automatic recovery of failed telescope connections.
    """
    
    def __init__(self):
        self.recovery_tasks: Dict[str, asyncio.Task] = {}
        self.reconnect_callbacks: Dict[str, Callable] = {}
        self.connection_states: Dict[str, ConnectionState] = {}
        
    def register_reconnect_callback(self, telescope_id: str, callback: Callable):
        """
        Register a callback function to be called when reconnection is needed.
        
        Args:
            telescope_id: The telescope identifier
            callback: Async function to call for reconnection
        """
        self.reconnect_callbacks[telescope_id] = callback
        self.connection_states[telescope_id] = ConnectionState(telescope_id)
        logger.info(f"Registered reconnect callback for telescope {telescope_id}")
        
    def unregister_telescope(self, telescope_id: str):
        """Remove a telescope from recovery management."""
        if telescope_id in self.recovery_tasks:
            task = self.recovery_tasks[telescope_id]
            task.cancel()
            del self.recovery_tasks[telescope_id]
            
        if telescope_id in self.reconnect_callbacks:
            del self.reconnect_callbacks[telescope_id]
            
        if telescope_id in self.connection_states:
            del self.connection_states[telescope_id]
            
        logger.info(f"Unregistered telescope {telescope_id} from recovery service")
        
    async def handle_connection_error(self, telescope_id: str, error: Exception) -> bool:
        """
        Handle a connection error and determine if recovery should be attempted.
        
        Args:
            telescope_id: The telescope identifier
            error: The exception that occurred
            
        Returns:
            True if recovery is being attempted, False otherwise
        """
        if telescope_id not in self.connection_states:
            logger.warning(f"Unknown telescope {telescope_id} in connection error handler")
            return False
            
        state = self.connection_states[telescope_id]
        
        # Check if this is a connection reset error
        is_connection_reset = (
            isinstance(error, (ConnectionResetError, BrokenPipeError, OSError)) and
            ("[Errno 54]" in str(error) or "Connection reset by peer" in str(error))
        )
        
        if is_connection_reset:
            state.connection_resets += 1
            state.last_error = error
            state.last_error_time = datetime.now()
            
            logger.warning(
                f"Connection reset detected for telescope {telescope_id} "
                f"(count: {state.connection_resets})"
            )
            
            # If we've had too many resets in a short time, force a full reconnection
            if state.connection_resets >= 3:
                logger.error(
                    f"Too many connection resets for telescope {telescope_id}. "
                    f"Initiating full reconnection."
                )
                return await self.initiate_recovery(telescope_id)
                
        return False
        
    async def initiate_recovery(self, telescope_id: str) -> bool:
        """
        Initiate recovery process for a telescope connection.
        
        Args:
            telescope_id: The telescope identifier
            
        Returns:
            True if recovery was initiated, False otherwise
        """
        if telescope_id not in self.reconnect_callbacks:
            logger.error(f"No reconnect callback registered for telescope {telescope_id}")
            return False
            
        # Cancel any existing recovery task
        if telescope_id in self.recovery_tasks:
            self.recovery_tasks[telescope_id].cancel()
            
        # Create new recovery task
        self.recovery_tasks[telescope_id] = asyncio.create_task(
            self._recovery_worker(telescope_id)
        )
        
        return True
        
    async def _recovery_worker(self, telescope_id: str):
        """
        Worker coroutine that attempts to recover a connection.
        
        Args:
            telescope_id: The telescope identifier
        """
        state = self.connection_states[telescope_id]
        callback = self.reconnect_callbacks[telescope_id]
        
        max_attempts = 5
        base_delay = 5  # Start with 5 second delay
        
        for attempt in range(1, max_attempts + 1):
            try:
                logger.info(
                    f"Recovery attempt {attempt}/{max_attempts} for telescope {telescope_id}"
                )
                
                state.recovery_attempts += 1
                state.is_recovering = True
                
                # Call the reconnection callback
                await callback(telescope_id)
                
                # If we get here, reconnection was successful
                logger.success(f"Successfully recovered connection for telescope {telescope_id}")
                state.is_recovering = False
                state.last_recovery_success = datetime.now()
                state.connection_resets = 0  # Reset the counter
                
                # Clean up the task
                if telescope_id in self.recovery_tasks:
                    del self.recovery_tasks[telescope_id]
                    
                return
                
            except Exception as e:
                logger.error(
                    f"Recovery attempt {attempt} failed for telescope {telescope_id}: {e}"
                )
                
                if attempt < max_attempts:
                    # Exponential backoff with jitter
                    delay = base_delay * (2 ** (attempt - 1))
                    jitter = delay * 0.1  # 10% jitter
                    actual_delay = delay + (jitter * (2 * asyncio.get_event_loop().time() % 1 - 1))
                    
                    logger.info(
                        f"Waiting {actual_delay:.1f} seconds before next recovery attempt"
                    )
                    await asyncio.sleep(actual_delay)
                else:
                    logger.error(
                        f"All recovery attempts failed for telescope {telescope_id}"
                    )
                    state.is_recovering = False
                    state.last_recovery_failure = datetime.now()
                    
        # Clean up the task
        if telescope_id in self.recovery_tasks:
            del self.recovery_tasks[telescope_id]
            
    def get_connection_state(self, telescope_id: str) -> Optional['ConnectionState']:
        """Get the current connection state for a telescope."""
        return self.connection_states.get(telescope_id)
        
    def is_recovering(self, telescope_id: str) -> bool:
        """Check if a telescope connection is currently being recovered."""
        state = self.connection_states.get(telescope_id)
        return state.is_recovering if state else False
        

class ConnectionState:
    """Tracks the state of a telescope connection."""
    
    def __init__(self, telescope_id: str):
        self.telescope_id = telescope_id
        self.connection_resets = 0
        self.recovery_attempts = 0
        self.is_recovering = False
        self.last_error: Optional[Exception] = None
        self.last_error_time: Optional[datetime] = None
        self.last_recovery_success: Optional[datetime] = None
        self.last_recovery_failure: Optional[datetime] = None
        

# Global instance
_recovery_service: Optional[ConnectionRecoveryService] = None

def get_recovery_service() -> ConnectionRecoveryService:
    """Get or create the global recovery service instance."""
    global _recovery_service
    if _recovery_service is None:
        _recovery_service = ConnectionRecoveryService()
    return _recovery_service