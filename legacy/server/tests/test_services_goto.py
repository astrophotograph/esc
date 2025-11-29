"""
Comprehensive tests for enhanced goto service.
Part of Phase 5: Final Coverage Push
"""

import pytest
import asyncio
from datetime import datetime, timezone
from unittest.mock import MagicMock, AsyncMock, patch
from typing import Dict, Any

from services.goto_service import (
    EnhancedGotoService,
    GotoStatus,
    GotoProgress
)
from exceptions.telescope_exceptions import (
    TelescopeError,
    TelescopeCommandError,
    TelescopeTimeoutError,
    InvalidCoordinatesError
)


class TestGotoStatus:
    """Test the GotoStatus enum"""
    
    def test_goto_status_values(self):
        """Test all status values exist"""
        assert GotoStatus.IDLE == "idle"
        assert GotoStatus.VALIDATING == "validating"
        assert GotoStatus.CONVERTING_COORDINATES == "converting_coordinates"
        assert GotoStatus.SENDING_COMMAND == "sending_command"
        assert GotoStatus.IN_PROGRESS == "in_progress"
        assert GotoStatus.COMPLETED == "completed"
        assert GotoStatus.FAILED == "failed"
        assert GotoStatus.CANCELLED == "cancelled"
    
    def test_goto_status_is_enum(self):
        """Test that GotoStatus is an enum"""
        assert isinstance(GotoStatus.IDLE, GotoStatus)
        assert isinstance(GotoStatus.COMPLETED, str)


class TestGotoProgress:
    """Test the GotoProgress model"""
    
    def test_goto_progress_creation(self):
        """Test creating GotoProgress with defaults"""
        progress = GotoProgress(status=GotoStatus.IDLE)
        
        assert progress.status == GotoStatus.IDLE
        assert progress.progress_percent == 0.0
        assert progress.message == ""
        assert progress.target_name == ""
        assert progress.start_time is None
        assert progress.error_message is None
    
    def test_goto_progress_full(self):
        """Test creating GotoProgress with all fields"""
        now = datetime.now(timezone.utc)
        progress = GotoProgress(
            status=GotoStatus.IN_PROGRESS,
            progress_percent=45.5,
            message="Slewing to target",
            target_name="M42",
            target_ra=83.822,
            target_dec=-5.391,
            converted_ra=83.825,
            converted_dec=-5.389,
            start_time=now,
            elapsed_seconds=30.5,
            estimated_total_seconds=60.0,
            error_message=None
        )
        
        assert progress.status == GotoStatus.IN_PROGRESS
        assert progress.progress_percent == 45.5
        assert progress.message == "Slewing to target"
        assert progress.target_name == "M42"
        assert progress.converted_ra == 83.825
        assert progress.elapsed_seconds == 30.5
    
    def test_goto_progress_serialization(self):
        """Test that GotoProgress can be serialized"""
        progress = GotoProgress(
            status=GotoStatus.COMPLETED,
            progress_percent=100.0,
            message="Goto completed"
        )
        
        # Should be able to convert to dict
        data = progress.model_dump()
        assert data["status"] == "completed"
        assert data["progress_percent"] == 100.0
        
        # Should be able to convert to JSON
        json_str = progress.model_dump_json()
        assert "completed" in json_str
        assert "100.0" in json_str


class TestEnhancedGotoService:
    """Test the EnhancedGotoService class"""
    
    @pytest.fixture
    def mock_telescope(self):
        """Create mock telescope client"""
        telescope = MagicMock()
        telescope.send_command = AsyncMock()
        telescope.cancel_goto = AsyncMock()
        telescope.connected = True
        return telescope
    
    @pytest.fixture
    def mock_coordinate_service(self):
        """Create mock coordinate service"""
        service = MagicMock()
        service.j2000_to_current = MagicMock(return_value=(84.0, -5.0))
        return service
    
    @pytest.fixture
    def goto_service(self, mock_telescope, mock_coordinate_service):
        """Create EnhancedGotoService instance"""
        with patch('services.goto_service.get_coordinate_service', return_value=mock_coordinate_service):
            with patch('services.goto_service.logger'):
                service = EnhancedGotoService(mock_telescope)
                return service
    
    def test_initialization(self, mock_telescope, mock_coordinate_service):
        """Test service initialization"""
        with patch('services.goto_service.get_coordinate_service', return_value=mock_coordinate_service):
            with patch('services.goto_service.logger'):
                service = EnhancedGotoService(mock_telescope)
        
        assert service.telescope == mock_telescope
        assert service.coordinate_service == mock_coordinate_service
        assert service._current_task is None
        assert service._current_progress is not None
        assert service._current_progress.status == GotoStatus.IDLE
    
    def test_validate_coordinates_valid(self, goto_service):
        """Test coordinate validation with valid coordinates"""
        # Valid coordinates should not raise
        goto_service._validate_coordinates(180.0, 0.0)
        goto_service._validate_coordinates(0.0, 90.0)
        goto_service._validate_coordinates(359.9, -89.9)
    
    def test_validate_coordinates_invalid_ra(self, goto_service):
        """Test coordinate validation with invalid RA"""
        with pytest.raises(InvalidCoordinatesError) as exc_info:
            goto_service._validate_coordinates(-1.0, 0.0)
        assert "Invalid RA" in str(exc_info.value)
        
        with pytest.raises(InvalidCoordinatesError) as exc_info:
            goto_service._validate_coordinates(360.1, 0.0)
        assert "Invalid RA" in str(exc_info.value)
    
    def test_validate_coordinates_invalid_dec(self, goto_service):
        """Test coordinate validation with invalid Dec"""
        with pytest.raises(InvalidCoordinatesError) as exc_info:
            goto_service._validate_coordinates(180.0, -91.0)
        assert "Invalid Dec" in str(exc_info.value)
        
        with pytest.raises(InvalidCoordinatesError) as exc_info:
            goto_service._validate_coordinates(180.0, 91.0)
        assert "Invalid Dec" in str(exc_info.value)
    
    def test_validate_coordinates_invalid_both(self, goto_service):
        """Test coordinate validation with both invalid"""
        with pytest.raises(InvalidCoordinatesError) as exc_info:
            goto_service._validate_coordinates(400.0, 100.0)
        assert "Invalid RA" in str(exc_info.value)
        assert "Invalid Dec" in str(exc_info.value)
    
    def test_update_progress(self, goto_service):
        """Test progress update"""
        goto_service._update_progress(
            status=GotoStatus.IN_PROGRESS,
            progress_percent=50.0,
            message="Halfway there"
        )
        
        assert goto_service._current_progress.status == GotoStatus.IN_PROGRESS
        assert goto_service._current_progress.progress_percent == 50.0
        assert goto_service._current_progress.message == "Halfway there"
    
    def test_update_progress_with_elapsed_time(self, goto_service):
        """Test progress update with elapsed time calculation"""
        # Set start time
        goto_service._current_progress.start_time = datetime.now(timezone.utc)
        
        # Update progress
        goto_service._update_progress(
            status=GotoStatus.IN_PROGRESS,
            progress_percent=25.0
        )
        
        # Should have calculated elapsed time
        assert goto_service._current_progress.elapsed_seconds is not None
        assert goto_service._current_progress.elapsed_seconds >= 0
    
    @pytest.mark.asyncio
    async def test_goto_success(self, goto_service, mock_telescope, mock_coordinate_service):
        """Test successful goto operation"""
        # Mock successful command response
        mock_telescope.send_command.return_value = {
            "result": "ok",
            "code": 200
        }
        
        # Mock monitoring to complete immediately
        with patch.object(goto_service, '_monitor_goto_progress', new_callable=AsyncMock) as mock_monitor:
            mock_monitor.return_value = None
            
            result = await goto_service.goto(
                ra=83.822,
                dec=-5.391,
                target_name="M42 Orion Nebula"
            )
        
        # Check result
        assert result["success"] is True
        assert result["message"] == "Goto completed successfully"
        assert result["converted_coordinates"]["ra"] == 84.0
        assert result["converted_coordinates"]["dec"] == -5.0
        
        # Check coordinate conversion was called
        mock_coordinate_service.j2000_to_current.assert_called_once()
        
        # Check command was sent
        mock_telescope.send_command.assert_called_once()
        command = mock_telescope.send_command.call_args[0][0]
        assert command.method == "target_goto_target"
    
    @pytest.mark.asyncio
    async def test_goto_invalid_coordinates(self, goto_service):
        """Test goto with invalid coordinates"""
        result = await goto_service.goto(
            ra=400.0,  # Invalid RA
            dec=-5.0,
            target_name="Invalid Target"
        )
        
        assert result["success"] is False
        assert "Invalid RA" in result["message"]
        assert goto_service._current_progress.status == GotoStatus.FAILED
    
    @pytest.mark.asyncio
    async def test_goto_coordinate_conversion_error(self, goto_service, mock_coordinate_service):
        """Test goto when coordinate conversion fails"""
        # Make coordinate conversion raise exception
        mock_coordinate_service.j2000_to_current.side_effect = Exception("Conversion error")
        
        result = await goto_service.goto(ra=83.822, dec=-5.391)
        
        assert result["success"] is False
        assert "coordinate conversion failed" in result["message"]
        assert goto_service._current_progress.status == GotoStatus.FAILED
    
    @pytest.mark.asyncio
    async def test_goto_command_error(self, goto_service, mock_telescope):
        """Test goto when command fails"""
        # Mock command failure
        mock_telescope.send_command.return_value = {
            "result": "fail",
            "code": 400,
            "message": "Telescope is parked"
        }
        
        result = await goto_service.goto(ra=83.822, dec=-5.391)
        
        assert result["success"] is False
        assert "Command failed" in result["message"]
        assert "Telescope is parked" in result["message"]
    
    @pytest.mark.asyncio
    async def test_goto_telescope_exception(self, goto_service, mock_telescope):
        """Test goto when telescope raises exception"""
        # Mock telescope exception
        mock_telescope.send_command.side_effect = TelescopeError("Connection lost")
        
        result = await goto_service.goto(ra=83.822, dec=-5.391)
        
        assert result["success"] is False
        assert "Telescope error" in result["message"]
        assert "Connection lost" in result["message"]
    
    @pytest.mark.asyncio
    async def test_cancel_goto(self, goto_service, mock_telescope):
        """Test cancelling a goto operation"""
        # Start a goto that will be cancelled
        mock_telescope.send_command.return_value = {"result": "ok", "code": 200}
        
        # Create a task that will be cancelled
        async def slow_monitor():
            await asyncio.sleep(10)  # Long sleep to ensure cancellation
        
        with patch.object(goto_service, '_monitor_goto_progress', side_effect=slow_monitor):
            # Start goto
            goto_task = asyncio.create_task(
                goto_service.goto(ra=83.822, dec=-5.391)
            )
            
            # Give it time to start
            await asyncio.sleep(0.1)
            
            # Cancel it
            result = await goto_service.cancel_current_goto()
            
            assert result["success"] is True
            assert "cancelled" in result["message"]
            
            # Original task should complete with cancellation
            goto_result = await goto_task
            assert goto_result["success"] is False
            assert "cancelled" in goto_result["message"].lower()
    
    @pytest.mark.asyncio
    async def test_cancel_goto_no_active(self, goto_service):
        """Test cancelling when no goto is active"""
        result = await goto_service.cancel_current_goto()
        
        assert result["success"] is False
        assert "No active goto" in result["message"]
    
    def test_get_progress(self, goto_service):
        """Test getting current progress"""
        # Set some progress
        goto_service._update_progress(
            status=GotoStatus.IN_PROGRESS,
            progress_percent=75.0,
            message="Almost there"
        )
        
        progress = goto_service.get_progress()
        
        assert isinstance(progress, dict)
        assert progress["status"] == "in_progress"
        assert progress["progress_percent"] == 75.0
        assert progress["message"] == "Almost there"
    
    @pytest.mark.asyncio
    async def test_monitor_goto_progress(self, goto_service, mock_telescope):
        """Test goto progress monitoring"""
        # Mock event sequence
        events = [
            {"Event": "GotoStart", "data": {}},
            {"Event": "GotoProgress", "data": {"progress": 50}},
            {"Event": "GotoComplete", "data": {}}
        ]
        
        # Create async generator for events
        async def event_generator():
            for event in events:
                yield event
                await asyncio.sleep(0.01)
        
        mock_telescope.events = event_generator()
        
        # Monitor progress
        with patch('services.goto_service.logger'):
            await goto_service._monitor_goto_progress()
        
        # Should have updated progress
        assert goto_service._current_progress.status == GotoStatus.COMPLETED
        assert goto_service._current_progress.progress_percent == 100.0
    
    @pytest.mark.asyncio
    async def test_monitor_goto_timeout(self, goto_service, mock_telescope):
        """Test goto monitoring timeout"""
        # Create generator that never completes
        async def slow_generator():
            while True:
                yield {"Event": "GotoProgress", "data": {"progress": 10}}
                await asyncio.sleep(0.1)
        
        mock_telescope.events = slow_generator()
        
        # Set short timeout
        goto_service.GOTO_TIMEOUT = 0.2
        
        with pytest.raises(TelescopeTimeoutError):
            await goto_service._monitor_goto_progress()
    
    @pytest.mark.asyncio
    async def test_concurrent_goto_rejection(self, goto_service, mock_telescope):
        """Test that concurrent goto operations are rejected"""
        # Mock successful but slow operation
        mock_telescope.send_command.return_value = {"result": "ok", "code": 200}
        
        async def slow_monitor():
            await asyncio.sleep(0.5)
        
        with patch.object(goto_service, '_monitor_goto_progress', side_effect=slow_monitor):
            # Start first goto
            task1 = asyncio.create_task(
                goto_service.goto(ra=100.0, dec=20.0)
            )
            
            # Try to start second goto
            await asyncio.sleep(0.1)  # Ensure first has started
            result2 = await goto_service.goto(ra=200.0, dec=30.0)
            
            # Second should be rejected
            assert result2["success"] is False
            assert "already in progress" in result2["message"]
            
            # Clean up
            await task1


class TestEnhancedGotoServiceIntegration:
    """Integration tests for goto service"""
    
    @pytest.mark.asyncio
    async def test_full_goto_cycle(self):
        """Test complete goto cycle with real coordinate conversion"""
        from services.coordinate_service import CoordinateTransformationService
        
        # Create real services
        telescope = MagicMock()
        telescope.send_command = AsyncMock(return_value={"result": "ok", "code": 200})
        telescope.cancel_goto = AsyncMock()
        telescope.connected = True
        
        # Mock events
        async def event_sequence():
            yield {"Event": "GotoStart", "data": {}}
            await asyncio.sleep(0.01)
            yield {"Event": "GotoProgress", "data": {"progress": 25}}
            await asyncio.sleep(0.01)
            yield {"Event": "GotoProgress", "data": {"progress": 75}}
            await asyncio.sleep(0.01)
            yield {"Event": "GotoComplete", "data": {}}
        
        telescope.events = event_sequence()
        
        # Create service with real coordinate service
        with patch('services.goto_service.get_coordinate_service', return_value=CoordinateTransformationService()):
            service = EnhancedGotoService(telescope)
        
        # Perform goto
        result = await service.goto(
            ra=83.822,  # M42 coordinates
            dec=-5.391,
            target_name="M42"
        )
        
        assert result["success"] is True
        assert result["target_name"] == "M42"
        
        # Converted coordinates should be slightly different
        assert result["converted_coordinates"]["ra"] != 83.822
        assert abs(result["converted_coordinates"]["ra"] - 83.822) < 1.0  # Small change
    
    @pytest.mark.asyncio
    async def test_error_recovery(self):
        """Test error recovery in goto operations"""
        telescope = MagicMock()
        telescope.connected = True
        
        # First command fails, second succeeds
        telescope.send_command = AsyncMock(side_effect=[
            TelescopeError("Temporary error"),
            {"result": "ok", "code": 200}
        ])
        
        with patch('services.goto_service.get_coordinate_service'):
            service = EnhancedGotoService(telescope)
        
        # First attempt should fail
        result1 = await service.goto(ra=100.0, dec=20.0)
        assert result1["success"] is False
        
        # Service should recover for second attempt
        result2 = await service.goto(ra=100.0, dec=20.0)
        assert result2["success"] is True