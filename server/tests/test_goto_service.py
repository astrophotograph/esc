"""Tests for the enhanced goto service."""

import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timezone

from services.goto_service import EnhancedGotoService, GotoStatus
from smarttel.seestar.commands.parameterized import GotoTargetParameters
from exceptions.telescope_exceptions import (
    InvalidCoordinatesError,
    TelescopeCommandError,
    TelescopeTimeoutError
)


class TestEnhancedGotoService:
    """Test the enhanced goto service."""
    
    @pytest.fixture
    def mock_client(self):
        """Create a mock SeestarClient."""
        client = MagicMock()
        client.is_connected = True
        client.telescope_id = "TEST001"
        client.send_and_recv = AsyncMock()
        return client
    
    @pytest.fixture
    def goto_service(self, mock_client):
        """Create a goto service instance."""
        return EnhancedGotoService(mock_client)
    
    @pytest.mark.asyncio
    async def test_service_initialization(self, goto_service, mock_client):
        """Test service initialization."""
        assert goto_service.client == mock_client
        assert goto_service.coordinate_service is not None
        assert goto_service.current_operation is None
        assert goto_service.command_timeout == 30.0
    
    @pytest.mark.asyncio
    async def test_current_epoch_coordinates(self, goto_service, mock_client):
        """Test goto with current epoch coordinates (no conversion)."""
        # Mock successful telescope response
        mock_client.send_and_recv.return_value = {"result": "success", "id": 123}
        
        # Create goto parameters for current epoch
        goto_params = GotoTargetParameters(
            target_name="Test Target",
            is_j2000=False,
            ra=120.5,
            dec=45.2
        )
        
        # Execute goto
        result = await goto_service.goto_target(goto_params)
        
        # Verify results
        assert result["success"] is True
        assert result["target_name"] == "Test Target"
        assert result["coordinate_conversion_applied"] is False
        assert result["original_coordinates"]["ra"] == 120.5
        assert result["original_coordinates"]["dec"] == 45.2
        assert result["final_coordinates"]["ra"] == 120.5  # No conversion
        assert result["final_coordinates"]["dec"] == 45.2
        
        # Verify telescope was called with correct parameters
        mock_client.send_and_recv.assert_called_once()
        call_args = mock_client.send_and_recv.call_args[0][0]
        assert call_args.params["target_name"] == "Test Target"
        assert call_args.params["is_j2000"] is False
        assert call_args.params["ra"] == 120.5
        assert call_args.params["dec"] == 45.2
    
    @pytest.mark.asyncio
    async def test_j2000_coordinate_conversion(self, goto_service, mock_client):
        """Test goto with J2000 coordinates (conversion applied)."""
        # Mock successful telescope response
        mock_client.send_and_recv.return_value = {"result": "success", "id": 123}
        
        # Create goto parameters for J2000
        goto_params = GotoTargetParameters(
            target_name="Vega",
            is_j2000=True,
            ra=279.234734787,  # Vega J2000 RA
            dec=38.783688956    # Vega J2000 Dec
        )
        
        # Execute goto
        result = await goto_service.goto_target(goto_params)
        
        # Verify results
        assert result["success"] is True
        assert result["target_name"] == "Vega"
        assert result["coordinate_conversion_applied"] is True
        assert result["original_coordinates"]["ra"] == 279.234734787
        assert result["original_coordinates"]["is_j2000"] is True
        
        # Coordinates should be different after conversion
        final_ra = result["final_coordinates"]["ra"]
        final_dec = result["final_coordinates"]["dec"]
        assert abs(final_ra - 279.234734787) > 0.01  # Should show precession
        assert result["final_coordinates"]["epoch"] == "current"
        
        # Verify telescope was called with converted coordinates
        mock_client.send_and_recv.assert_called_once()
        call_args = mock_client.send_and_recv.call_args[0][0]
        assert call_args.params["is_j2000"] is False  # Always false after conversion
        assert abs(call_args.params["ra"] - final_ra) < 0.001
        assert abs(call_args.params["dec"] - final_dec) < 0.001
    
    @pytest.mark.asyncio
    async def test_invalid_coordinates_validation(self, goto_service):
        """Test validation of invalid coordinates."""
        # Test invalid RA
        with pytest.raises(InvalidCoordinatesError):
            invalid_params = GotoTargetParameters(
                target_name="Invalid",
                is_j2000=False,
                ra=370.0,  # Invalid RA
                dec=45.0
            )
            await goto_service.goto_target(invalid_params)
        
        # Test invalid Dec
        with pytest.raises(InvalidCoordinatesError):
            invalid_params = GotoTargetParameters(
                target_name="Invalid",
                is_j2000=False,
                ra=120.0,
                dec=95.0  # Invalid Dec
            )
            await goto_service.goto_target(invalid_params)
    
    @pytest.mark.asyncio
    async def test_telescope_disconnected_error(self, goto_service, mock_client):
        """Test error when telescope is disconnected."""
        # Simulate disconnected telescope
        mock_client.is_connected = False
        
        goto_params = GotoTargetParameters(
            target_name="Test",
            is_j2000=False,
            ra=120.0,
            dec=45.0
        )
        
        with pytest.raises(TelescopeCommandError) as exc_info:
            await goto_service.goto_target(goto_params)
        
        assert "not connected" in str(exc_info.value)
    
    @pytest.mark.asyncio
    async def test_telescope_command_timeout(self, goto_service, mock_client):
        """Test timeout handling."""
        # Mock timeout
        mock_client.send_and_recv.side_effect = asyncio.TimeoutError()
        
        goto_params = GotoTargetParameters(
            target_name="Test",
            is_j2000=False,
            ra=120.0,
            dec=45.0
        )
        
        with pytest.raises(TelescopeTimeoutError) as exc_info:
            await goto_service.goto_target(goto_params, timeout=5.0)
        
        assert "timed out" in str(exc_info.value)
        assert exc_info.value.timeout_seconds == 5.0
    
    @pytest.mark.asyncio
    async def test_telescope_command_error(self, goto_service, mock_client):
        """Test handling of telescope command errors."""
        # Mock command error
        mock_client.send_and_recv.side_effect = Exception("Telescope error")
        
        goto_params = GotoTargetParameters(
            target_name="Test",
            is_j2000=False,
            ra=120.0,
            dec=45.0
        )
        
        with pytest.raises(TelescopeCommandError) as exc_info:
            await goto_service.goto_target(goto_params)
        
        assert "Telescope error" in str(exc_info.value)
    
    @pytest.mark.asyncio
    async def test_progress_tracking(self, goto_service, mock_client):
        """Test progress tracking during goto operation."""
        # Mock successful response
        mock_client.send_and_recv.return_value = {"result": "success"}
        
        # Track progress updates
        progress_updates = []
        
        async def progress_callback(progress):
            progress_updates.append(progress.model_dump())
        
        goto_params = GotoTargetParameters(
            target_name="Test",
            is_j2000=False,
            ra=120.0,
            dec=45.0
        )
        
        # Execute with progress tracking
        result = await goto_service.goto_target(goto_params, progress_callback=progress_callback)
        
        # Verify progress was tracked
        assert len(progress_updates) > 0
        
        # Check progress stages
        statuses = [update["status"] for update in progress_updates]
        assert "validating" in statuses
        assert "sending_command" in statuses
        
        # Final operation should be completed
        final_op = goto_service.get_current_operation()
        assert final_op.status == GotoStatus.COMPLETED
        assert final_op.progress_percent == 100.0
        assert final_op.target_name == "Test"
    
    @pytest.mark.asyncio
    async def test_cancel_operation(self, goto_service, mock_client):
        """Test cancelling an ongoing operation."""
        # Mock a slow response to allow cancellation
        async def slow_response():
            await asyncio.sleep(2)
            return {"result": "success"}
        
        mock_client.send_and_recv = slow_response
        
        goto_params = GotoTargetParameters(
            target_name="Test",
            is_j2000=False,
            ra=120.0,
            dec=45.0
        )
        
        # Start goto operation
        goto_task = asyncio.create_task(goto_service.goto_target(goto_params))
        
        # Wait a bit then cancel
        await asyncio.sleep(0.1)
        cancelled = await goto_service.cancel_current_operation()
        
        # Should be able to cancel
        assert cancelled is True
        
        # Check operation status
        current_op = goto_service.get_current_operation()
        assert current_op.status == GotoStatus.CANCELLED
        
        # Clean up
        goto_task.cancel()
        try:
            await goto_task
        except asyncio.CancelledError:
            pass
    
    @pytest.mark.asyncio
    async def test_concurrent_operations_prevented(self, goto_service, mock_client):
        """Test that concurrent goto operations are prevented."""
        # Mock slow responses
        async def slow_response():
            await asyncio.sleep(1)
            return {"result": "success"}
        
        mock_client.send_and_recv = slow_response
        
        goto_params1 = GotoTargetParameters(
            target_name="Target1",
            is_j2000=False,
            ra=120.0,
            dec=45.0
        )
        
        goto_params2 = GotoTargetParameters(
            target_name="Target2",
            is_j2000=False,
            ra=130.0,
            dec=50.0
        )
        
        # Start first goto operation
        task1 = asyncio.create_task(goto_service.goto_target(goto_params1))
        
        # Wait a bit for it to start
        await asyncio.sleep(0.1)
        
        # Try to start second operation (should wait for first to complete)
        task2 = asyncio.create_task(goto_service.goto_target(goto_params2))
        
        # Wait for both to complete
        result1 = await task1
        result2 = await task2
        
        # Both should succeed but sequentially
        assert result1["success"] is True
        assert result1["target_name"] == "Target1"
        assert result2["success"] is True
        assert result2["target_name"] == "Target2"
    
    @pytest.mark.asyncio
    async def test_coordinate_precision(self, goto_service, mock_client):
        """Test coordinate precision in conversions."""
        mock_client.send_and_recv.return_value = {"result": "success"}
        
        # Use high precision coordinates
        goto_params = GotoTargetParameters(
            target_name="High Precision Test",
            is_j2000=True,
            ra=83.633210,  # M1 Crab Nebula
            dec=22.014460
        )
        
        result = await goto_service.goto_target(goto_params)
        
        # Verify precision is maintained
        assert result["success"] is True
        final_ra = result["final_coordinates"]["ra"]
        final_dec = result["final_coordinates"]["dec"]
        
        # Coordinates should be different but with good precision
        assert isinstance(final_ra, float)
        assert isinstance(final_dec, float)
        assert abs(final_ra - goto_params.ra) > 0.001  # Should show precession
        
        # Called coordinates should match final coordinates
        call_args = mock_client.send_and_recv.call_args[0][0]
        assert abs(call_args.params["ra"] - final_ra) < 0.000001
        assert abs(call_args.params["dec"] - final_dec) < 0.000001


class TestGotoServiceIntegration:
    """Integration tests for goto service."""
    
    @pytest.mark.asyncio
    async def test_messier_objects_goto(self):
        """Test goto with real Messier object coordinates."""
        mock_client = MagicMock()
        mock_client.is_connected = True
        mock_client.send_and_recv = AsyncMock(return_value={"result": "success"})
        
        goto_service = EnhancedGotoService(mock_client)
        
        # Test various Messier objects
        messier_objects = [
            ("M1", 83.633, 22.014),      # Crab Nebula
            ("M31", 10.685, 41.269),     # Andromeda Galaxy
            ("M42", 83.822, -5.391),     # Orion Nebula
            ("M57", 283.396, 33.029),    # Ring Nebula
        ]
        
        for name, ra, dec in messier_objects:
            goto_params = GotoTargetParameters(
                target_name=name,
                is_j2000=True,
                ra=ra,
                dec=dec
            )
            
            result = await goto_service.goto_target(goto_params)
            
            assert result["success"] is True
            assert result["target_name"] == name
            assert result["coordinate_conversion_applied"] is True
            
            # Coordinates should be converted
            final_ra = result["final_coordinates"]["ra"]
            final_dec = result["final_coordinates"]["dec"]
            
            # Should show measurable precession (varies by declination)
            assert abs(final_ra - ra) > 0.005  # At least 0.005 degrees
            
            print(f"{name}: J2000({ra:.3f}, {dec:.3f}) -> Current({final_ra:.3f}, {final_dec:.3f})")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])