"""
Focused tests for database.py module - testing actual implementation.
Part of Phase 1: Critical Path Testing - improving database coverage from 10.45%
"""

import asyncio
import tempfile
import os
from unittest.mock import patch, AsyncMock
from pathlib import Path

import pytest

from database import TelescopeDatabase


class TestTelescopeDatabase:
    """Test TelescopeDatabase class functionality"""
    
    @pytest.fixture
    async def db(self):
        """Create a temporary database for testing"""
        with tempfile.NamedTemporaryFile(delete=False, suffix=".db") as tmp:
            tmp_path = tmp.name
        
        db = TelescopeDatabase(tmp_path)
        await db.initialize()
        yield db
        
        # Cleanup
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
    
    @pytest.mark.asyncio
    async def test_database_initialization(self):
        """Test database initialization"""
        with tempfile.NamedTemporaryFile(delete=False, suffix=".db") as tmp:
            tmp_path = tmp.name
        
        try:
            db = TelescopeDatabase(tmp_path)
            assert not db._initialized
            
            await db.initialize()
            assert db._initialized
            assert os.path.exists(tmp_path)
            
            # Test double initialization (should not fail)
            await db.initialize()
            assert db._initialized
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
    
    @pytest.mark.asyncio
    async def test_database_path_docker_volume(self):
        """Test database path selection with Docker volume"""
        with patch('pathlib.Path.exists') as mock_exists:
            with patch('pathlib.Path.is_dir') as mock_is_dir:
                with patch('pathlib.Path.mkdir') as mock_mkdir:
                    # Mock Docker volume exists
                    mock_exists.return_value = True
                    mock_is_dir.return_value = True
                    
                    db = TelescopeDatabase("test.db")
                    assert str(db.db_path) == "/app/data/test.db"
    
    @pytest.mark.asyncio
    async def test_database_path_local(self):
        """Test database path selection without Docker volume"""
        with patch('pathlib.Path.exists') as mock_exists:
            # Mock Docker volume doesn't exist
            mock_exists.return_value = False
            
            db = TelescopeDatabase("test.db")
            assert db.db_path == Path("test.db")
    
    @pytest.mark.asyncio
    async def test_save_telescope_manual(self, db):
        """Test saving a manual telescope"""
        telescope_data = {
            "host": "192.168.1.100",
            "port": 4700,
            "serial_number": "SN123456",
            "product_model": "Seestar S50",
            "ssid": "SEESTAR_123456",
            "location": "Test Observatory",
            "discovery_method": "manual"
        }
        
        result = await db.save_telescope(telescope_data)
        assert result is True
    
    @pytest.mark.asyncio
    async def test_save_telescope_auto_discovered_skipped(self, db):
        """Test that auto-discovered telescopes are not saved"""
        telescope_data = {
            "host": "192.168.1.100",
            "port": 4700,
            "serial_number": "SN123456",
            "discovery_method": "auto"  # Auto-discovered
        }
        
        result = await db.save_telescope(telescope_data)
        assert result is False
    
    @pytest.mark.asyncio
    async def test_save_telescope_no_discovery_method(self, db):
        """Test saving telescope without discovery method"""
        telescope_data = {
            "host": "192.168.1.100",
            "port": 4700,
            "serial_number": "SN123456"
            # No discovery_method - should default to not manual
        }
        
        result = await db.save_telescope(telescope_data)
        assert result is False
    
    @pytest.mark.asyncio
    async def test_load_telescopes_empty(self, db):
        """Test loading telescopes from empty database"""
        telescopes = await db.load_telescopes()
        assert telescopes == []
    
    @pytest.mark.asyncio
    async def test_load_telescopes_with_data(self, db):
        """Test loading telescopes after saving some"""
        telescope1 = {
            "host": "192.168.1.100",
            "port": 4700,
            "serial_number": "SN123456",
            "product_model": "Seestar S50",
            "discovery_method": "manual"
        }
        
        telescope2 = {
            "host": "192.168.1.101",
            "port": 4700,
            "serial_number": "SN789012",
            "product_model": "Seestar S50",
            "discovery_method": "manual"
        }
        
        await db.save_telescope(telescope1)
        await db.save_telescope(telescope2)
        
        telescopes = await db.load_telescopes()
        assert len(telescopes) == 2
        
        # Check that data is loaded correctly
        hosts = {t["host"] for t in telescopes}
        assert "192.168.1.100" in hosts
        assert "192.168.1.101" in hosts
    
    @pytest.mark.asyncio
    async def test_delete_telescope_by_host_port(self, db):
        """Test deleting telescope by host and port"""
        telescope_data = {
            "host": "192.168.1.100",
            "port": 4700,
            "serial_number": "SN123456",
            "discovery_method": "manual"
        }
        
        await db.save_telescope(telescope_data)
        telescopes = await db.load_telescopes()
        assert len(telescopes) == 1
        
        # Delete the telescope
        result = await db.delete_telescope("192.168.1.100", 4700)
        assert result is True
        
        telescopes = await db.load_telescopes()
        assert len(telescopes) == 0
    
    @pytest.mark.asyncio
    async def test_delete_telescope_not_found(self, db):
        """Test deleting non-existent telescope"""
        result = await db.delete_telescope("192.168.1.999", 4700)
        assert result is False
    
    @pytest.mark.asyncio
    async def test_delete_telescope_by_name_serial(self, db):
        """Test deleting telescope by serial number name"""
        telescope_data = {
            "host": "192.168.1.100",
            "port": 4700,
            "serial_number": "SN123456",
            "discovery_method": "manual"
        }
        
        await db.save_telescope(telescope_data)
        
        # Delete by serial number
        result = await db.delete_telescope_by_name("SN123456")
        assert result is True
        
        telescopes = await db.load_telescopes()
        assert len(telescopes) == 0
    
    @pytest.mark.asyncio
    async def test_delete_telescope_by_name_host(self, db):
        """Test deleting telescope by host name when no serial"""
        telescope_data = {
            "host": "192.168.1.100",
            "port": 4700,
            "serial_number": None,  # No serial number
            "discovery_method": "manual"
        }
        
        await db.save_telescope(telescope_data)
        
        # Delete by host
        result = await db.delete_telescope_by_name("192.168.1.100")
        assert result is True
        
        telescopes = await db.load_telescopes()
        assert len(telescopes) == 0
    
    @pytest.mark.asyncio
    async def test_delete_telescope_by_name_not_found(self, db):
        """Test deleting telescope by name that doesn't exist"""
        result = await db.delete_telescope_by_name("NONEXISTENT")
        assert result is False
    
    @pytest.mark.asyncio
    async def test_save_configuration(self, db):
        """Test saving configuration"""
        import json
        config_data = {"exposure": 10, "gain": 100, "binning": 1}
        config_json = json.dumps(config_data)
        
        result = await db.save_configuration("Test Config", "Test description", config_json)
        assert result is True
    
    @pytest.mark.asyncio
    async def test_save_configuration_duplicate(self, db):
        """Test saving configuration with duplicate name"""
        import json
        config_data1 = {"exposure": 10}
        config_data2 = {"exposure": 20}
        
        # Save first config
        result1 = await db.save_configuration("Test Config", None, json.dumps(config_data1))
        assert result1 is True
        
        # Try to save second with same name (should replace)
        result2 = await db.save_configuration("Test Config", None, json.dumps(config_data2))
        assert result2 is True
    
    @pytest.mark.asyncio
    async def test_list_configurations_empty(self, db):
        """Test listing configurations from empty database"""
        configs = await db.list_configurations()
        assert configs == []
    
    @pytest.mark.asyncio
    async def test_list_configurations_with_data(self, db):
        """Test listing configurations after saving some"""
        import json
        config1 = {"setting1": "value1"}
        config2 = {"setting2": "value2"}
        
        await db.save_configuration("Config 1", "Description 1", json.dumps(config1))
        await db.save_configuration("Config 2", "Description 2", json.dumps(config2))
        
        configs = await db.list_configurations()
        assert len(configs) == 2
        
        names = {c["name"] for c in configs}
        assert "Config 1" in names
        assert "Config 2" in names
    
    @pytest.mark.asyncio
    async def test_delete_configuration(self, db):
        """Test deleting configuration"""
        import json
        config_data = {"test": True}
        await db.save_configuration("Test Config", None, json.dumps(config_data))
        
        result = await db.delete_configuration("Test Config")
        assert result is True
        
        configs = await db.list_configurations()
        assert len(configs) == 0
    
    @pytest.mark.asyncio
    async def test_delete_configuration_not_found(self, db):
        """Test deleting non-existent configuration"""
        result = await db.delete_configuration("NONEXISTENT")
        assert result is False
    
    @pytest.mark.asyncio
    async def test_save_remote_controller(self, db):
        """Test saving remote controller"""
        controller_data = {
            "host": "192.168.1.200",
            "port": 8080,
            "name": "Remote Site",
            "description": "Remote observatory"
        }
        result = await db.save_remote_controller(controller_data)
        assert result is True
    
    @pytest.mark.asyncio
    async def test_save_remote_controller_duplicate(self, db):
        """Test saving duplicate remote controller (should replace)"""
        # Save first
        controller_data1 = {
            "host": "192.168.1.200",
            "port": 8080,
            "name": "Site 1"
        }
        result1 = await db.save_remote_controller(controller_data1)
        assert result1 is True
        
        # Save second with same host:port (should replace)
        controller_data2 = {
            "host": "192.168.1.200",
            "port": 8080,
            "name": "Site 2"
        }
        result2 = await db.save_remote_controller(controller_data2)
        assert result2 is True
    
    @pytest.mark.asyncio
    async def test_load_remote_controllers_empty(self, db):
        """Test loading remote controllers from empty database"""
        controllers = await db.load_remote_controllers()
        assert controllers == []
    
    @pytest.mark.asyncio
    async def test_load_remote_controllers_with_data(self, db):
        """Test loading remote controllers after saving some"""
        controller_data1 = {"host": "192.168.1.200", "port": 8080, "name": "Site 1"}
        controller_data2 = {"host": "192.168.1.201", "port": 8080, "name": "Site 2"}
        
        await db.save_remote_controller(controller_data1)
        await db.save_remote_controller(controller_data2)
        
        controllers = await db.load_remote_controllers()
        assert len(controllers) == 2
        
        hosts = {c["host"] for c in controllers}
        assert "192.168.1.200" in hosts
        assert "192.168.1.201" in hosts
    
    @pytest.mark.asyncio
    async def test_update_remote_controller_status_with_timestamp(self, db):
        """Test updating remote controller status with timestamp"""
        # Save a controller first
        controller_data = {"host": "192.168.1.200", "port": 8080, "name": "Test Site"}
        await db.save_remote_controller(controller_data)
        
        # Update status with timestamp
        from datetime import datetime
        timestamp = datetime.now().isoformat()
        result = await db.update_remote_controller_status(
            "192.168.1.200", 8080, "connected", timestamp
        )
        assert result is True
        
        # Verify update
        controllers = await db.load_remote_controllers()
        assert len(controllers) == 1
        assert controllers[0]["status"] == "connected"
    
    @pytest.mark.asyncio
    async def test_update_remote_controller_status_without_timestamp(self, db):
        """Test updating remote controller status without timestamp"""
        # Save a controller first
        controller_data = {"host": "192.168.1.200", "port": 8080, "name": "Test Site"}
        await db.save_remote_controller(controller_data)
        
        # Update status without timestamp
        result = await db.update_remote_controller_status(
            "192.168.1.200", 8080, "disconnected"
        )
        assert result is True
        
        # Verify update
        controllers = await db.load_remote_controllers()
        assert len(controllers) == 1
        assert controllers[0]["status"] == "disconnected"
    
    @pytest.mark.asyncio
    async def test_update_remote_controller_status_not_found(self, db):
        """Test updating status of non-existent remote controller"""
        result = await db.update_remote_controller_status(
            "192.168.1.999", 8080, "connected"
        )
        # Note: The actual implementation returns True even if controller doesn't exist
        # This is because UPDATE in SQLite always succeeds, even if no rows are affected
        assert result is True


class TestDatabaseErrorHandling:
    """Test database error handling"""
    
    @pytest.mark.asyncio
    async def test_save_telescope_database_error(self):
        """Test error handling when saving telescope fails"""
        with tempfile.NamedTemporaryFile(delete=False, suffix=".db") as tmp:
            tmp_path = tmp.name
        
        try:
            db = TelescopeDatabase(tmp_path)
            await db.initialize()
            
            telescope_data = {
                "host": "192.168.1.100",
                "port": 4700,
                "discovery_method": "manual"
            }
            
            # Mock aiosqlite.connect to raise an exception
            with patch('aiosqlite.connect', side_effect=Exception("Database error")):
                with patch('database.logging.error') as mock_log:
                    result = await db.save_telescope(telescope_data)
                    assert result is False
                    mock_log.assert_called()
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
    
    @pytest.mark.asyncio
    async def test_load_telescopes_database_error(self):
        """Test error handling when loading telescopes fails"""
        with tempfile.NamedTemporaryFile(delete=False, suffix=".db") as tmp:
            tmp_path = tmp.name
        
        try:
            db = TelescopeDatabase(tmp_path)
            await db.initialize()
            
            # Corrupt the database file
            with open(tmp_path, 'w') as f:
                f.write("invalid sqlite data")
            
            # Should handle error gracefully
            with patch('database.logging.error') as mock_log:
                telescopes = await db.load_telescopes()
                assert telescopes == []
                mock_log.assert_called()
        
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
    
    @pytest.mark.asyncio
    async def test_database_permission_error(self):
        """Test handling permission errors during initialization"""
        with patch('pathlib.Path.mkdir') as mock_mkdir:
            mock_mkdir.side_effect = PermissionError("Permission denied")
            
            # Should not raise exception
            db = TelescopeDatabase("test.db")
            assert db.db_path == Path("test.db")