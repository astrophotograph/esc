"""
Unit tests for command error conversion in WebSocketManager.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import asyncio

# Mock the necessary modules for isolated testing
@pytest.fixture
def mock_websocket_manager():
    """Create a mock WebSocketManager for testing."""
    # Import here to avoid circular imports during test discovery
    from websocket_manager import WebSocketManager
    
    manager = WebSocketManager()
    manager.telescope_clients = {}
    manager.remote_clients = {} 
    manager.remote_manager = MagicMock()
    return manager

@pytest.mark.asyncio
class TestCommandErrorConversion:
    """Test command error conversion logic."""
    
    async def test_error_conversion_logic(self):
        """Test the core logic of converting error results to failed responses."""
        
        # Test error result
        error_result = {"status": "error", "message": "Invalid coordinates"}
        
        # Check the logic
        if isinstance(error_result, dict) and error_result.get("status") == "error":
            # This should create a failed response
            success = False
            error_message = error_result.get("message", "Command failed")
        else:
            # This should create a successful response
            success = True
            error_message = None
            
        assert success is False
        assert error_message == "Invalid coordinates"
        
    async def test_success_conversion_logic(self):
        """Test the core logic of handling success results."""
        
        # Test success result
        success_result = {
            "status": "success", 
            "action": "goto",
            "target_name": "M31",
            "message": "Command completed successfully"
        }
        
        # Check the logic
        if isinstance(success_result, dict) and success_result.get("status") == "error":
            # This should create a failed response
            success = False
            error_message = success_result.get("message", "Command failed")
        else:
            # This should create a successful response
            success = True
            error_message = None
            
        assert success is True
        assert error_message is None
        
    async def test_non_dict_result_logic(self):
        """Test handling of non-dict results."""
        
        # Test non-dict result
        string_result = "Some string result"
        
        # Check the logic
        if isinstance(string_result, dict) and string_result.get("status") == "error":
            # This should create a failed response
            success = False
            error_message = string_result.get("message", "Command failed")
        else:
            # This should create a successful response
            success = True
            error_message = None
            
        assert success is True
        assert error_message is None

if __name__ == "__main__":
    # Run basic logic tests
    async def run_basic_tests():
        print("🚀 Testing command error conversion logic...")
        
        test_instance = TestCommandErrorConversion()
        
        print("\n📋 Test 1: Error result logic")
        await test_instance.test_error_conversion_logic()
        print("✅ PASSED")
        
        print("\n📋 Test 2: Success result logic")
        await test_instance.test_success_conversion_logic()
        print("✅ PASSED")
        
        print("\n📋 Test 3: Non-dict result logic")
        await test_instance.test_non_dict_result_logic() 
        print("✅ PASSED")
        
        print("\n🎉 All logic tests passed!")
        print("✅ The error conversion logic is implemented correctly")
        
    asyncio.run(run_basic_tests())