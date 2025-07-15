"""
Comprehensive tests for database operations to boost coverage.
"""

import pytest
import tempfile
import os
from unittest.mock import AsyncMock, MagicMock, patch

# Test database operations
try:
    from database import TelescopeDatabase

    DATABASE_AVAILABLE = True
except ImportError:
    DATABASE_AVAILABLE = False


@pytest.mark.skipif(not DATABASE_AVAILABLE, reason="Database not available")
class TestDatabaseOperationsComprehensive:
    """Comprehensive database operations testing."""

    @pytest.fixture
    async def db(self):
        """Create a database instance with temporary file."""
        # Create temporary database file
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".db")
        temp_file.close()

        try:
            database = TelescopeDatabase(db_path=temp_file.name)
            yield database
        finally:
            # Clean up
            if os.path.exists(temp_file.name):
                os.unlink(temp_file.name)

    @pytest.mark.asyncio
    async def test_save_telescope_success(self, db):
        """Test saving telescope to database successfully."""
        telescope_data = {
            "host": "192.168.1.100",
            "port": 4700,
            "serial_number": "SN123456",
            "product_model": "Seestar S50",
            "ssid": "Seestar-123",
            "location": "Test Location",
            "discovery_method": "manual",
        }

        success = await db.save_telescope(telescope_data)
        assert success is True

        # Verify it was saved by loading it back
        telescopes = await db.load_telescopes()
        assert len(telescopes) == 1
        assert telescopes[0]["serial_number"] == "SN123456"
        assert telescopes[0]["host"] == "192.168.1.100"

    @pytest.mark.asyncio
    async def test_save_telescope_duplicate(self, db):
        """Test saving duplicate telescope (should update)."""
        telescope_data = {
            "host": "192.168.1.100",
            "port": 4700,
            "serial_number": "SN123456",
            "product_model": "Seestar S50",
            "location": "Original Location",
            "discovery_method": "manual",
        }

        # Save first time
        success1 = await db.save_telescope(telescope_data)
        assert success1 is True

        # Save with updated location
        telescope_data["location"] = "Updated Location"
        telescope_data["discovery_method"] = "manual"  # Keep manual for database save
        success2 = await db.save_telescope(telescope_data)
        assert success2 is True

        # Should still only have one telescope with updated location
        telescopes = await db.load_telescopes()
        assert len(telescopes) == 1
        assert telescopes[0]["location"] == "Updated Location"

    @pytest.mark.asyncio
    async def test_save_telescope_auto_discovered_skip(self, db):
        """Test that auto-discovered telescopes are skipped when they exist."""
        # First save a manual telescope
        manual_telescope = {
            "host": "192.168.1.100",
            "port": 4700,
            "serial_number": "SN123456",
            "discovery_method": "manual",
        }
        await db.save_telescope(manual_telescope)

        # Try to save auto-discovered version of same telescope
        auto_telescope = {
            "host": "192.168.1.100",
            "port": 4700,
            "serial_number": "SN123456",
            "discovery_method": "auto_discovery",
        }
        success = await db.save_telescope(auto_telescope)

        # Should return False because auto-discovered are not saved
        assert success is False
        telescopes = await db.load_telescopes()
        assert len(telescopes) == 1
        assert telescopes[0]["discovery_method"] == "manual"

    @pytest.mark.asyncio
    async def test_load_telescopes_empty(self, db):
        """Test loading telescopes from empty database."""
        telescopes = await db.load_telescopes()
        assert telescopes == []

    @pytest.mark.asyncio
    async def test_load_telescopes_multiple(self, db):
        """Test loading multiple telescopes."""
        # Save multiple telescopes
        telescope1 = {
            "host": "192.168.1.100",
            "port": 4700,
            "serial_number": "SN123456",
            "product_model": "Seestar S50",
            "discovery_method": "manual",
        }
        telescope2 = {
            "host": "192.168.1.101",
            "port": 4700,
            "serial_number": "SN789012",
            "product_model": "Seestar S50",
            "discovery_method": "manual",
        }

        await db.save_telescope(telescope1)
        await db.save_telescope(telescope2)

        telescopes = await db.load_telescopes()
        assert len(telescopes) == 2

        # Check both telescopes are present
        serial_numbers = [t["serial_number"] for t in telescopes]
        assert "SN123456" in serial_numbers
        assert "SN789012" in serial_numbers

    @pytest.mark.asyncio
    async def test_telescope_exists(self, db):
        """Test checking if telescope exists."""
        # Initially should not exist
        exists = await db.telescope_exists("192.168.1.100", 4700)
        assert exists is False

        # Save telescope
        telescope_data = {
            "host": "192.168.1.100",
            "port": 4700,
            "serial_number": "SN123456",
            "discovery_method": "manual",
        }
        success = await db.save_telescope(telescope_data)
        assert success is True

        # Now should exist
        exists = await db.telescope_exists("192.168.1.100", 4700)
        assert exists is True

        # Different host should not exist
        exists_other = await db.telescope_exists("192.168.1.101", 4700)
        assert exists_other is False

    @pytest.mark.asyncio
    async def test_delete_telescope(self, db):
        """Test deleting telescope by host and port."""
        # Save telescope first
        telescope_data = {
            "host": "192.168.1.100",
            "port": 4700,
            "serial_number": "SN123456",
            "discovery_method": "manual",
        }
        await db.save_telescope(telescope_data)

        # Verify it exists
        telescopes = await db.load_telescopes()
        assert len(telescopes) == 1

        # Delete it
        success = await db.delete_telescope("192.168.1.100", 4700)
        assert success is True

        # Verify it's gone
        telescopes = await db.load_telescopes()
        assert len(telescopes) == 0

    @pytest.mark.asyncio
    async def test_delete_telescope_by_name(self, db):
        """Test deleting telescope by name/serial number."""
        # Save telescope first
        telescope_data = {
            "host": "192.168.1.100",
            "port": 4700,
            "serial_number": "SN123456",
            "discovery_method": "manual",
        }
        await db.save_telescope(telescope_data)

        # Delete by serial number
        success = await db.delete_telescope_by_name("SN123456")
        assert success is True

        # Verify it's gone
        telescopes = await db.load_telescopes()
        assert len(telescopes) == 0

    @pytest.mark.asyncio
    async def test_delete_nonexistent_telescope(self, db):
        """Test deleting non-existent telescope."""
        success = await db.delete_telescope("192.168.1.999", 4700)
        assert success is False  # Returns False when not found

        success_by_name = await db.delete_telescope_by_name("NONEXISTENT")
        assert success_by_name is False  # Returns False when not found

    @pytest.mark.asyncio
    async def test_save_configuration_success(self, db):
        """Test saving configuration to database."""
        config_data = {
            "setting1": "value1",
            "setting2": 42,
            "setting3": {"nested": "data"},
        }

        import json

        success = await db.save_configuration(
            name="test_config",
            description="Test configuration",
            config_data=json.dumps(config_data),
        )
        assert success is True

        # Verify it was saved
        configs = await db.list_configurations()
        assert len(configs) == 1
        assert configs[0]["name"] == "test_config"
        assert configs[0]["description"] == "Test configuration"

        # Load the full configuration to check config_data
        full_config = await db.load_configuration("test_config")
        assert full_config is not None
        assert json.loads(full_config["config_data"]) == config_data

    @pytest.mark.asyncio
    async def test_save_configuration_duplicate_name(self, db):
        """Test saving configuration with duplicate name (should update)."""
        import json

        # Save first configuration
        await db.save_configuration(
            name="duplicate_config",
            description="Original description",
            config_data=json.dumps({"version": 1}),
        )

        # Save with same name but different data
        success = await db.save_configuration(
            name="duplicate_config",
            description="Updated description",
            config_data=json.dumps({"version": 2}),
        )
        assert success is True

        # Should have only one configuration with updated data
        configs = await db.list_configurations()
        assert len(configs) == 1
        assert configs[0]["description"] == "Updated description"

        # Load full config to check data
        full_config = await db.load_configuration("duplicate_config")
        assert json.loads(full_config["config_data"])["version"] == 2

    @pytest.mark.asyncio
    async def test_load_configurations_empty(self, db):
        """Test loading configurations from empty database."""
        configs = await db.list_configurations()
        assert configs == []

    @pytest.mark.asyncio
    async def test_load_configurations_multiple(self, db):
        """Test loading multiple configurations."""
        import json

        # Save multiple configurations
        await db.save_configuration("config1", "First config", json.dumps({"id": 1}))
        await db.save_configuration("config2", "Second config", json.dumps({"id": 2}))

        configs = await db.list_configurations()
        assert len(configs) == 2

        # Check both configurations are present
        names = [c["name"] for c in configs]
        assert "config1" in names
        assert "config2" in names

    @pytest.mark.asyncio
    async def test_delete_configuration(self, db):
        """Test deleting configuration."""
        import json

        # Save configuration first
        await db.save_configuration(
            "delete_me", "To be deleted", json.dumps({"data": "test"})
        )

        # Verify it exists
        configs = await db.list_configurations()
        assert len(configs) == 1

        # Delete it
        success = await db.delete_configuration("delete_me")
        assert success is True

        # Verify it's gone
        configs = await db.list_configurations()
        assert len(configs) == 0

    @pytest.mark.asyncio
    async def test_delete_nonexistent_configuration(self, db):
        """Test deleting non-existent configuration."""
        success = await db.delete_configuration("nonexistent")
        assert success is False  # Returns False when not found

    @pytest.mark.asyncio
    async def test_save_remote_controller(self, db):
        """Test saving remote controller."""
        controller_data = {
            "host": "controller.example.com",
            "port": 8000,
            "name": "Test Controller",
            "description": "Test remote controller",
            "status": "connected",
        }

        success = await db.save_remote_controller(controller_data)
        assert success is True

        # Verify it was saved
        controllers = await db.load_remote_controllers()
        assert len(controllers) == 1
        assert controllers[0]["host"] == "controller.example.com"
        assert controllers[0]["name"] == "Test Controller"

    @pytest.mark.asyncio
    async def test_load_remote_controllers_empty(self, db):
        """Test loading remote controllers from empty database."""
        controllers = await db.load_remote_controllers()
        assert controllers == []

    @pytest.mark.asyncio
    async def test_load_remote_controllers_multiple(self, db):
        """Test loading multiple remote controllers."""
        controller1 = {
            "host": "controller1.com",
            "port": 8000,
            "name": "Controller 1",
            "status": "connected",
        }
        controller2 = {
            "host": "controller2.com",
            "port": 8001,
            "name": "Controller 2",
            "status": "disconnected",
        }

        await db.save_remote_controller(controller1)
        await db.save_remote_controller(controller2)

        controllers = await db.load_remote_controllers()
        assert len(controllers) == 2

        hosts = [c["host"] for c in controllers]
        assert "controller1.com" in hosts
        assert "controller2.com" in hosts

    @pytest.mark.asyncio
    async def test_update_remote_controller_status(self, db):
        """Test updating remote controller status."""
        # Save controller first
        controller_data = {
            "host": "controller.com",
            "port": 8000,
            "name": "Test Controller",
            "status": "connected",
        }
        await db.save_remote_controller(controller_data)

        # Update status
        await db.update_remote_controller_status("controller.com", 8000, "disconnected")

        # Verify status was updated
        controllers = await db.load_remote_controllers()
        assert len(controllers) == 1
        assert controllers[0]["status"] == "disconnected"

    @pytest.mark.asyncio
    async def test_delete_remote_controller(self, db):
        """Test deleting remote controller."""
        # Save controller first
        controller_data = {
            "host": "delete-me.com",
            "port": 8000,
            "name": "Delete Me",
            "status": "connected",
        }
        await db.save_remote_controller(controller_data)

        # Verify it exists
        controllers = await db.load_remote_controllers()
        assert len(controllers) == 1

        # Delete it
        success = await db.delete_remote_controller("delete-me.com", 8000)
        assert success is True

        # Verify it's gone
        controllers = await db.load_remote_controllers()
        assert len(controllers) == 0

    @pytest.mark.asyncio
    async def test_database_error_handling(self, db):
        """Test database error handling."""
        # Test with invalid data types
        try:
            # This might cause an error depending on the database schema
            await db.save_telescope({"invalid": "structure"})
        except Exception:
            # Error handling should prevent crashes
            pass

        # Database should still be functional
        telescopes = await db.load_telescopes()
        assert isinstance(telescopes, list)

    def test_database_path_configuration(self):
        """Test database path configuration."""
        # Test with custom path
        custom_path = "/tmp/test_telescope.db"
        db = TelescopeDatabase(db_path=custom_path)
        assert str(db.db_path) == custom_path

        # Test with default path
        default_db = TelescopeDatabase()
        assert default_db.db_path is not None
        assert str(default_db.db_path).endswith(".db")


@pytest.mark.skipif(not DATABASE_AVAILABLE, reason="Database not available")
class TestDatabaseConnectionHandling:
    """Test database connection and transaction handling."""

    @pytest.fixture
    async def db(self):
        """Create a database instance."""
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".db")
        temp_file.close()

        try:
            database = TelescopeDatabase(db_path=temp_file.name)
            yield database
        finally:
            if os.path.exists(temp_file.name):
                os.unlink(temp_file.name)

    @pytest.mark.asyncio
    async def test_concurrent_operations(self, db):
        """Test concurrent database operations."""
        import asyncio

        # Create multiple concurrent operations
        async def save_telescope(i):
            telescope_data = {
                "host": f"192.168.1.{100 + i}",
                "port": 4700,
                "serial_number": f"SN{i:06d}",
                "product_model": "Seestar S50",
                "discovery_method": "manual",
            }
            return await db.save_telescope(telescope_data)

        # Run 5 concurrent saves
        tasks = [save_telescope(i) for i in range(5)]
        results = await asyncio.gather(*tasks)

        # All should succeed
        assert all(results)

        # All should be saved
        telescopes = await db.load_telescopes()
        assert len(telescopes) == 5

    @pytest.mark.asyncio
    async def test_transaction_rollback_simulation(self, db):
        """Test transaction handling (simulated)."""
        # Save some initial data
        await db.save_telescope(
            {
                "host": "192.168.1.100",
                "port": 4700,
                "serial_number": "SN123456",
                "discovery_method": "manual",
            }
        )

        # Verify it was saved
        telescopes = await db.load_telescopes()
        assert len(telescopes) == 1

        # Even if subsequent operations fail, the database should remain consistent
        try:
            await db.save_telescope({"invalid": "data"})
        except Exception:
            pass

        # Original data should still be there
        telescopes = await db.load_telescopes()
        assert len(telescopes) >= 1  # At least the original one
        assert any(t["serial_number"] == "SN123456" for t in telescopes)


@pytest.mark.skipif(not DATABASE_AVAILABLE, reason="Database not available")
class TestDatabaseSchemaValidation:
    """Test database schema and validation."""

    @pytest.fixture
    async def db(self):
        """Create a database instance."""
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".db")
        temp_file.close()

        try:
            database = TelescopeDatabase(db_path=temp_file.name)
            yield database
        finally:
            if os.path.exists(temp_file.name):
                os.unlink(temp_file.name)

    @pytest.mark.asyncio
    async def test_telescope_schema_validation(self, db):
        """Test telescope data schema validation."""
        # Test with minimal required fields
        minimal_data = {
            "host": "192.168.1.100",
            "port": 4700,
            "discovery_method": "manual",
        }
        success = await db.save_telescope(minimal_data)
        assert success is True

        # Test with all fields
        complete_data = {
            "host": "192.168.1.101",
            "port": 4700,
            "serial_number": "SN123456",
            "product_model": "Seestar S50",
            "ssid": "Seestar-123",
            "location": "Test Location",
            "discovery_method": "manual",
        }
        success = await db.save_telescope(complete_data)
        assert success is True

        # Verify both were saved
        telescopes = await db.load_telescopes()
        assert len(telescopes) == 2

    @pytest.mark.asyncio
    async def test_configuration_schema_validation(self, db):
        """Test configuration data schema validation."""
        import json

        # Test with simple config data
        simple_config = {"setting": "value"}
        success = await db.save_configuration(
            "simple", "Simple config", json.dumps(simple_config)
        )
        assert success is True

        # Test with complex nested config data
        complex_config = {
            "general": {"setting1": "value1", "setting2": 42},
            "telescope": {
                "model": "Seestar S50",
                "settings": ["setting1", "setting2", "setting3"],
            },
        }
        success = await db.save_configuration(
            "complex", "Complex config", json.dumps(complex_config)
        )
        assert success is True

        # Verify both were saved with correct structure
        configs = await db.list_configurations()
        assert len(configs) == 2

        # Find and verify complex config
        complex_saved = await db.load_configuration("complex")
        complex_data = json.loads(complex_saved["config_data"])
        assert complex_data["general"]["setting2"] == 42
        assert len(complex_data["telescope"]["settings"]) == 3
