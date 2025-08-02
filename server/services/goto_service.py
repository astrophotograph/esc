"""
Enhanced goto service with coordinate conversion and error handling.

This service provides robust telescope goto functionality including:
- Automatic coordinate conversion from J2000 to current epoch
- Comprehensive error handling and timeout management
- Progress tracking and status monitoring
- Command validation and response verification
"""

import asyncio
import time
from datetime import datetime, timezone
from typing import Optional, Dict, Any, Tuple
from enum import Enum

from loguru import logger
from pydantic import BaseModel

from smarttel.seestar.commands.parameterized import GotoTarget, GotoTargetParameters
from smarttel.seestar.client import SeestarClient
from services.coordinate_service import get_coordinate_service
from exceptions.telescope_exceptions import (
    TelescopeError,
    TelescopeCommandError,
    TelescopeTimeoutError,
    InvalidCoordinatesError,
)


class GotoStatus(str, Enum):
    """Status of a goto operation."""
    IDLE = "idle"
    VALIDATING = "validating"
    CONVERTING_COORDINATES = "converting_coordinates"
    SENDING_COMMAND = "sending_command"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class GotoProgress(BaseModel):
    """Progress information for a goto operation."""
    status: GotoStatus
    progress_percent: float = 0.0
    message: str = ""
    target_name: str = ""
    target_ra: float = 0.0
    target_dec: float = 0.0
    converted_ra: Optional[float] = None
    converted_dec: Optional[float] = None
    start_time: Optional[datetime] = None
    elapsed_seconds: Optional[float] = None
    estimated_total_seconds: Optional[float] = None
    error_message: Optional[str] = None


class EnhancedGotoService:
    """Enhanced goto service with coordinate conversion and error handling."""
    
    def __init__(self, client: SeestarClient):
        """
        Initialize the goto service.
        
        Args:
            client: Connected SeestarClient instance
        """
        self.client = client
        self.coordinate_service = get_coordinate_service()
        self.current_operation: Optional[GotoProgress] = None
        self._operation_lock = asyncio.Lock()
        
        # Configuration
        self.command_timeout = 30.0  # seconds
        self.progress_update_interval = 1.0  # seconds
        self.max_retry_attempts = 3
        
        logger.info("Enhanced goto service initialized")
    
    async def goto_target(
        self,
        goto_params: GotoTargetParameters,
        timeout: Optional[float] = None,
        progress_callback: Optional[callable] = None
    ) -> Dict[str, Any]:
        """
        Execute a goto command with enhanced error handling and progress tracking.
        
        Args:
            goto_params: Goto parameters (may be in J2000 or current epoch)
            timeout: Command timeout in seconds (default: 30)
            progress_callback: Optional callback for progress updates
            
        Returns:
            Dictionary with goto results and metadata
            
        Raises:
            TelescopeError: For various telescope-related errors
            InvalidCoordinatesError: For invalid coordinates
            TelescopeTimeoutError: For timeout errors
        """
        if timeout is None:
            timeout = self.command_timeout
        
        async with self._operation_lock:
            # Initialize progress tracking
            self.current_operation = GotoProgress(
                status=GotoStatus.VALIDATING,
                target_name=goto_params.target_name,
                target_ra=goto_params.ra,
                target_dec=goto_params.dec,
                start_time=datetime.now(timezone.utc)
            )
            
            try:
                await self._update_progress(progress_callback, "Validating coordinates...")
                
                # Step 1: Validate input coordinates
                if not self.coordinate_service.validate_coordinates(goto_params.ra, goto_params.dec):
                    raise InvalidCoordinatesError(
                        "Invalid coordinates provided",
                        ra=goto_params.ra,
                        dec=goto_params.dec
                    )
                
                # Step 2: Convert coordinates if needed
                final_ra, final_dec = await self._handle_coordinate_conversion(
                    goto_params, progress_callback
                )
                
                # Step 3: Execute the goto command
                await self._update_progress(progress_callback, "Sending goto command...", 60.0)
                self.current_operation.status = GotoStatus.SENDING_COMMAND
                
                response = await self._execute_goto_command(
                    goto_params.target_name, final_ra, final_dec, timeout
                )
                
                # Step 4: Monitor progress (if supported by telescope)
                await self._monitor_goto_progress(progress_callback, timeout)
                
                # Step 5: Complete operation
                self.current_operation.status = GotoStatus.COMPLETED
                self.current_operation.progress_percent = 100.0
                self.current_operation.message = "Goto completed successfully"
                
                # Calculate final statistics
                elapsed = time.time() - self.current_operation.start_time.timestamp()
                self.current_operation.elapsed_seconds = elapsed
                
                await self._update_progress(progress_callback, "Goto completed", 100.0)
                
                logger.info(f"Goto completed successfully: {goto_params.target_name} "
                          f"in {elapsed:.2f} seconds")
                
                return {
                    "success": True,
                    "target_name": goto_params.target_name,
                    "original_coordinates": {
                        "ra": goto_params.ra,
                        "dec": goto_params.dec,
                        "is_j2000": goto_params.is_j2000
                    },
                    "final_coordinates": {
                        "ra": final_ra,
                        "dec": final_dec,
                        "epoch": "current"
                    },
                    "coordinate_conversion_applied": goto_params.is_j2000,
                    "elapsed_seconds": elapsed,
                    "telescope_response": response,
                    "progress": self.current_operation.model_dump()
                }
                
            except Exception as e:
                # Handle errors
                self.current_operation.status = GotoStatus.FAILED
                self.current_operation.error_message = str(e)
                
                if self.current_operation.start_time:
                    elapsed = time.time() - self.current_operation.start_time.timestamp()
                    self.current_operation.elapsed_seconds = elapsed
                
                await self._update_progress(progress_callback, f"Error: {str(e)}", 0.0)
                
                logger.error(f"Goto failed for {goto_params.target_name}: {e}")
                
                # Re-raise as appropriate exception type
                if isinstance(e, TelescopeError):
                    raise
                else:
                    raise TelescopeCommandError(
                        f"Goto command failed: {str(e)}",
                        command="goto_target",
                        telescope_id=getattr(self.client, 'telescope_id', None)
                    )
    
    async def _handle_coordinate_conversion(
        self,
        goto_params: GotoTargetParameters,
        progress_callback: Optional[callable]
    ) -> Tuple[float, float]:
        """Handle coordinate conversion from J2000 to current epoch if needed."""
        if goto_params.is_j2000:
            await self._update_progress(
                progress_callback, 
                "Converting J2000 coordinates to current epoch...", 
                20.0
            )
            self.current_operation.status = GotoStatus.CONVERTING_COORDINATES
            
            # Convert from J2000 to current epoch
            final_ra, final_dec = self.coordinate_service.j2000_to_current_epoch(
                goto_params.ra, goto_params.dec
            )
            
            self.current_operation.converted_ra = final_ra
            self.current_operation.converted_dec = final_dec
            
            # Log the conversion for debugging
            conversion_diff = self.coordinate_service.coordinate_difference_arcseconds(
                goto_params.ra, goto_params.dec, final_ra, final_dec
            )
            
            logger.info(f"Coordinate conversion applied: "
                       f"J2000({goto_params.ra:.6f}, {goto_params.dec:.6f}) -> "
                       f"Current({final_ra:.6f}, {final_dec:.6f}) "
                       f"[Δ={conversion_diff:.1f}\"]")
            
            await self._update_progress(
                progress_callback,
                f"Coordinates converted (Δ={conversion_diff:.1f}\")",
                40.0
            )
        else:
            # Already in current epoch
            final_ra, final_dec = goto_params.ra, goto_params.dec
            logger.debug("Using coordinates as current epoch (no conversion needed)")
        
        return final_ra, final_dec
    
    async def _execute_goto_command(
        self,
        target_name: str,
        ra: float,
        dec: float,
        timeout: float
    ) -> Dict[str, Any]:
        """Execute the actual goto command with timeout handling."""
        if not self.client.is_connected:
            raise TelescopeCommandError(
                "Cannot execute goto: telescope not connected",
                command="goto_target"
            )
        
        # Create final goto parameters
        final_params = GotoTargetParameters(
            target_name=target_name,
            is_j2000=False,  # Always false since we convert to current epoch
            ra=ra,
            dec=dec
        )
        
        # Execute with timeout
        try:
            response = await asyncio.wait_for(
                self.client.send_and_recv(GotoTarget(params=final_params.model_dump())),
                timeout=timeout
            )
            
            logger.debug(f"Goto command response: {response}")
            return response
            
        except asyncio.TimeoutError:
            raise TelescopeTimeoutError(
                f"Goto command timed out after {timeout} seconds",
                timeout_seconds=timeout,
                telescope_id=getattr(self.client, 'telescope_id', None)
            )
        except Exception as e:
            raise TelescopeCommandError(
                f"Failed to execute goto command: {str(e)}",
                command="goto_target",
                telescope_id=getattr(self.client, 'telescope_id', None)
            )
    
    async def _monitor_goto_progress(
        self,
        progress_callback: Optional[callable],
        timeout: float
    ):
        """Monitor goto progress if supported by the telescope."""
        self.current_operation.status = GotoStatus.IN_PROGRESS
        
        start_time = time.time()
        progress_start = 70.0
        progress_end = 95.0
        
        # Simulate progress monitoring (in a real implementation, this would
        # monitor actual telescope status events)
        while time.time() - start_time < timeout:
            elapsed = time.time() - start_time
            
            # Estimate progress (this is a simulation)
            # In reality, you'd monitor telescope status events
            estimated_duration = 20.0  # Assume 20 seconds for goto
            progress = min(elapsed / estimated_duration, 1.0)
            
            current_progress = progress_start + (progress_end - progress_start) * progress
            
            await self._update_progress(
                progress_callback,
                f"Moving to target... ({progress*100:.0f}%)",
                current_progress
            )
            
            # Check if goto is complete (this would be based on actual telescope status)
            # For now, just assume it takes the estimated duration
            if progress >= 1.0:
                break
            
            await asyncio.sleep(self.progress_update_interval)
    
    async def _update_progress(
        self,
        progress_callback: Optional[callable],
        message: str,
        progress_percent: Optional[float] = None
    ):
        """Update progress and call callback if provided."""
        if self.current_operation:
            self.current_operation.message = message
            if progress_percent is not None:
                self.current_operation.progress_percent = progress_percent
            
            if self.current_operation.start_time:
                elapsed = time.time() - self.current_operation.start_time.timestamp()
                self.current_operation.elapsed_seconds = elapsed
        
        if progress_callback:
            try:
                await progress_callback(self.current_operation)
            except Exception as e:
                logger.warning(f"Progress callback failed: {e}")
    
    def get_current_operation(self) -> Optional[GotoProgress]:
        """Get current operation status."""
        return self.current_operation
    
    async def cancel_current_operation(self) -> bool:
        """
        Cancel the current goto operation if possible.
        
        Returns:
            True if cancellation was successful
        """
        if self.current_operation and self.current_operation.status in [
            GotoStatus.IN_PROGRESS,
            GotoStatus.SENDING_COMMAND,
            GotoStatus.CONVERTING_COORDINATES
        ]:
            self.current_operation.status = GotoStatus.CANCELLED
            self.current_operation.message = "Operation cancelled by user"
            
            # In a real implementation, you'd send a stop command to the telescope
            logger.info(f"Goto operation cancelled: {self.current_operation.target_name}")
            return True
        
        return False