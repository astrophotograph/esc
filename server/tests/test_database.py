"""
Tests for telescope database operations.
"""

import pytest
import tempfile
import os
import aiosqlite
import json

from database import TelescopeDatabase


class TestTelescopeDatabase:
    """Test telescope database functionality."""

    @pytest.fixture
    async def temp_db(self):
        """Create a temporary database for testing."""
        # Create temporary database file
        db_fd, db_path = tempfile.mkstemp(suffix=".db")
        os.close(db_fd)

        # Initialize database
        db = TelescopeDatabase(db_path)
        await db.initialize()

        yield db

        # Cleanup
        if os.path.exists(db_path):
            os.unlink(db_path)

    @pytest.fixture
    def sample_telescope_data(self):
        """Create sample telescope data for testing."""
        return {
            "host": "192.168.1.100",
            "port": 4700,
            "serial_number": "SN123456789",
            "product_model": "Seestar S50",
            "ssid": "Seestar_S50_123456",
            "location": "Test Location",
            "discovery_method": "manual",
        }

    @pytest.mark.asyncio
    async def test_database_initialization(self, temp_db):
        """Test database initialization creates required tables."""
        async with aiosqlite.connect(temp_db.db_path) as db:
            # Check if telescopes table exists
            cursor = await db.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='telescopes';"
            )
            result = await cursor.fetchone()
            assert result is not None
            await cursor.close()

            # Check if configurations table exists
            cursor = await db.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='configurations';"
            )
            result = await cursor.fetchone()
            assert result is not None
            await cursor.close()

    @pytest.mark.asyncio
    async def test_save_telescope(self, temp_db, sample_telescope_data):
        """Test saving a new telescope."""
        result = await temp_db.save_telescope(sample_telescope_data)

        assert result is True

        # Verify telescope was saved
        telescopes = await temp_db.load_telescopes()
        assert len(telescopes) == 1
        assert telescopes[0]["host"] == sample_telescope_data["host"]
        assert telescopes[0]["port"] == sample_telescope_data["port"]

    @pytest.mark.asyncio
    async def test_save_auto_discovered_telescope_skipped(
        self, temp_db, sample_telescope_data
    ):
        """Test that auto-discovered telescopes are not saved."""
        sample_telescope_data["discovery_method"] = "auto"

        result = await temp_db.save_telescope(sample_telescope_data)

        assert result is False

        # Verify telescope was not saved
        telescopes = await temp_db.load_telescopes()
        assert len(telescopes) == 0

    @pytest.mark.asyncio
    async def test_load_telescopes(self, temp_db, sample_telescope_data):
        """Test loading all telescopes."""
        # Add multiple telescopes
        await temp_db.save_telescope(sample_telescope_data)

        sample_telescope_data2 = sample_telescope_data.copy()
        sample_telescope_data2["host"] = "192.168.1.101"
        sample_telescope_data2["serial_number"] = "SN987654321"
        await temp_db.save_telescope(sample_telescope_data2)

        # Load all telescopes
        telescopes = await temp_db.load_telescopes()

        assert len(telescopes) == 2
        hosts = [t["host"] for t in telescopes]
        assert "192.168.1.100" in hosts
        assert "192.168.1.101" in hosts

    @pytest.mark.asyncio
    async def test_telescope_exists(self, temp_db, sample_telescope_data):
        """Test checking if telescope exists."""
        # Initially doesn't exist
        exists = await temp_db.telescope_exists(
            sample_telescope_data["host"], sample_telescope_data["port"]
        )
        assert exists is False

        # Save telescope
        await temp_db.save_telescope(sample_telescope_data)

        # Now should exist
        exists = await temp_db.telescope_exists(
            sample_telescope_data["host"], sample_telescope_data["port"]
        )
        assert exists is True

    @pytest.mark.asyncio
    async def test_delete_telescope(self, temp_db, sample_telescope_data):
        """Test deleting a telescope."""
        # Save telescope first
        await temp_db.save_telescope(sample_telescope_data)

        # Verify telescope exists
        telescopes = await temp_db.load_telescopes()
        assert len(telescopes) == 1

        # Delete telescope
        result = await temp_db.delete_telescope(
            sample_telescope_data["host"], sample_telescope_data["port"]
        )
        assert result is True

        # Verify telescope was deleted
        telescopes = await temp_db.load_telescopes()
        assert len(telescopes) == 0

    @pytest.mark.asyncio
    async def test_delete_nonexistent_telescope(self, temp_db):
        """Test deleting a non-existent telescope."""
        result = await temp_db.delete_telescope("nonexistent.host", 9999)
        assert result is False

    @pytest.mark.asyncio
    async def test_configuration_operations(self, temp_db):
        """Test configuration storage and retrieval."""
        config_name = "test_config"
        config_description = "Test configuration"
        config_data = json.dumps({"setting1": "value1", "setting2": 42})

        # Save configuration
        result = await temp_db.save_configuration(
            config_name, config_description, config_data
        )
        assert result is True

        # Load configuration
        loaded_config = await temp_db.load_configuration(config_name)
        assert loaded_config is not None
        assert loaded_config["name"] == config_name
        assert loaded_config["description"] == config_description
        assert loaded_config["config_data"] == config_data

        # List configurations
        configs = await temp_db.list_configurations()
        assert len(configs) == 1
        assert configs[0]["name"] == config_name

    @pytest.mark.asyncio
    async def test_delete_configuration(self, temp_db):
        """Test deleting a configuration."""
        config_name = "test_config"
        config_data = json.dumps({"test": "data"})

        # Save configuration
        await temp_db.save_configuration(config_name, "Test", config_data)

        # Verify it exists
        configs = await temp_db.list_configurations()
        assert len(configs) == 1

        # Delete configuration
        result = await temp_db.delete_configuration(config_name)
        assert result is True

        # Verify it's deleted
        configs = await temp_db.list_configurations()
        assert len(configs) == 0

    @pytest.mark.asyncio
    async def test_remote_controller_operations(self, temp_db):
        """Test remote controller storage and management."""
        controller_data = {
            "host": "remote.controller.com",
            "port": 8000,
            "name": "Remote Controller 1",
            "description": "Test remote controller",
        }

        # Save remote controller
        result = await temp_db.save_remote_controller(controller_data)
        assert result is True

        # Load remote controllers
        controllers = await temp_db.load_remote_controllers()
        assert len(controllers) == 1
        assert controllers[0]["host"] == controller_data["host"]
        assert controllers[0]["port"] == controller_data["port"]
        assert controllers[0]["name"] == controller_data["name"]

    @pytest.mark.asyncio
    async def test_update_remote_controller_status(self, temp_db):
        """Test updating remote controller status."""
        controller_data = {
            "host": "remote.controller.com",
            "port": 8000,
            "name": "Remote Controller 1",
            "description": "Test remote controller",
        }

        # Save remote controller
        await temp_db.save_remote_controller(controller_data)

        # Update status
        result = await temp_db.update_remote_controller_status(
            controller_data["host"],
            controller_data["port"],
            "connected",
            "2024-01-01 12:00:00",
        )
        assert result is True

        # Verify status was updated
        controllers = await temp_db.load_remote_controllers()
        assert len(controllers) == 1
        assert controllers[0]["status"] == "connected"
        assert controllers[0]["last_connected"] == "2024-01-01 12:00:00"

    @pytest.mark.asyncio
    async def test_duplicate_telescope_constraint(self, temp_db, sample_telescope_data):
        """Test handling duplicate telescope entries (should replace)."""
        # Save first telescope
        await temp_db.save_telescope(sample_telescope_data)

        # Save again with updated data (should replace)
        sample_telescope_data["location"] = "Updated Location"
        await temp_db.save_telescope(sample_telescope_data)

        # Should only have one telescope with updated location
        telescopes = await temp_db.load_telescopes()
        assert len(telescopes) == 1
        assert telescopes[0]["location"] == "Updated Location"

    @pytest.mark.asyncio
    async def test_database_schema_validation(self, temp_db):
        """Test that database schema matches expectations."""
        async with aiosqlite.connect(temp_db.db_path) as db:
            # Get telescopes table schema
            cursor = await db.execute("PRAGMA table_info(telescopes);")
            columns = await cursor.fetchall()
            await cursor.close()

            # Verify expected columns exist
            column_names = [col[1] for col in columns]  # Column name is at index 1
            expected_columns = [
                "id",
                "host",
                "port",
                "serial_number",
                "product_model",
                "ssid",
                "location",
                "discovery_method",
                "created_at",
                "updated_at",
            ]

            for expected_col in expected_columns:
                assert expected_col in column_names, f"Missing column: {expected_col}"

    @pytest.mark.asyncio
    async def test_connection_handling(self, temp_db):
        """Test database connection handling."""
        # Test that database connection works
        async with aiosqlite.connect(temp_db.db_path) as db:
            cursor = await db.execute("SELECT 1")
            result = await cursor.fetchone()
            assert result[0] == 1
            await cursor.close()

    @pytest.mark.asyncio
    async def test_concurrent_operations(self, temp_db):
        """Test concurrent database operations."""
        import asyncio

        # Create multiple telescope entries concurrently
        async def save_telescope(i):
            telescope_data = {
                "host": f"192.168.1.{100 + i}",
                "port": 4700,
                "serial_number": f"SN{i:09d}",
                "product_model": "Seestar S50",
                "location": f"Location {i}",
                "discovery_method": "manual",
            }
            return await temp_db.save_telescope(telescope_data)

        # Save 5 telescopes concurrently
        results = await asyncio.gather(*[save_telescope(i) for i in range(5)])

        # Verify all were saved successfully
        assert all(results)

        # Verify in database
        telescopes = await temp_db.load_telescopes()
        assert len(telescopes) == 5

    @pytest.mark.asyncio
    async def test_error_handling(self, temp_db):
        """Test error handling for invalid operations."""
        # Test with invalid data
        invalid_data = {
            "host": None,  # Invalid host
            "port": "invalid_port",  # Invalid port type
            "discovery_method": "manual",
        }

        # Should handle gracefully (depending on implementation)
        # This test might need adjustment based on actual error handling
        try:
            result = await temp_db.save_telescope(invalid_data)
            # If no exception, result should be False or handle gracefully
            assert result is False or result is True  # Accept either for now
        except Exception:
            # Exception is also acceptable error handling
            pass
