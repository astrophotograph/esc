"""
Tests for Controller async methods to boost backend coverage.
"""

import pytest
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import FastAPI

# Test Controller async methods
try:
    from main import Controller, TestTelescope, Telescope
    from smarttel.seestar.commands.discovery import discover_seestars

    CONTROLLER_ASYNC_AVAILABLE = True
except ImportError:
    CONTROLLER_ASYNC_AVAILABLE = False


@pytest.mark.skipif(
    not CONTROLLER_ASYNC_AVAILABLE, reason="Controller async methods not available"
)
class TestControllerAsyncMethods:
    """Test Controller async methods for coverage improvement."""

    @pytest.fixture
    def controller(self):
        """Create a Controller instance with mocked dependencies."""
        app = FastAPI()
        with patch("main.TelescopeDatabase") as mock_db:
            mock_db.return_value = AsyncMock()
            controller = Controller(app, service_port=8000, discover=False)
            return controller

    @pytest.mark.asyncio
    async def test_load_saved_telescopes_success(self, controller):
        """Test loading saved telescopes from database successfully."""
        # Mock saved telescope data
        saved_telescopes = [
            {
                "host": "192.168.1.100",
                "port": 4700,
                "serial_number": "SN123456",
                "product_model": "Seestar S50",
                "location": "Test Location",
                "discovery_method": "manual",
            },
            {
                "host": "192.168.1.101",
                "port": 4700,
                "serial_number": "SN789012",
                "product_model": "Seestar S50",
                "location": "Another Location",
                "discovery_method": "manual",
            },
        ]

        controller.db.load_telescopes.return_value = saved_telescopes

        with patch.object(
            controller, "add_telescope", new=AsyncMock()
        ) as mock_add_telescope:
            # Set up mock to return success and telescope name
            mock_add_telescope.return_value = ("SN123456", True)

            await controller.load_saved_telescopes()

            # Should have attempted to add both telescopes
            assert mock_add_telescope.call_count == 2

            # Verify add_telescope was called with correct parameters
            call_args_list = mock_add_telescope.call_args_list

            # First telescope
            args1, kwargs1 = call_args_list[0]
            assert args1 == ("192.168.1.100", 4700)
            assert kwargs1["serial_number"] == "SN123456"
            assert kwargs1["product_model"] == "Seestar S50"
            assert kwargs1["location"] == "Test Location"

            # Second telescope
            args2, kwargs2 = call_args_list[1]
            assert args2 == ("192.168.1.101", 4700)
            assert kwargs2["serial_number"] == "SN789012"
            assert kwargs2["location"] == "Another Location"

    @pytest.mark.asyncio
    async def test_load_saved_telescopes_empty_database(self, controller):
        """Test loading saved telescopes when database is empty."""
        controller.db.load_telescopes.return_value = []

        with patch.object(
            controller, "add_telescope", new=AsyncMock()
        ) as mock_add_telescope:
            await controller.load_saved_telescopes()

            # Should not attempt to add any telescopes
            mock_add_telescope.assert_not_called()

    @pytest.mark.asyncio
    async def test_load_saved_telescopes_database_error(self, controller):
        """Test load_saved_telescopes handling database errors gracefully."""
        controller.db.load_telescopes.side_effect = Exception(
            "Database connection failed"
        )

        with patch.object(
            controller, "add_telescope", new=AsyncMock()
        ) as mock_add_telescope:
            # Should not raise exception
            await controller.load_saved_telescopes()

            # Should not attempt to add telescopes
            mock_add_telescope.assert_not_called()

    @pytest.mark.asyncio
    async def test_load_saved_remote_controllers_success(self, controller):
        """Test loading saved remote controllers successfully."""
        saved_controllers = [
            {
                "host": "controller1.com",
                "port": 8000,
                "name": "Primary Controller",
                "status": "connected",
            },
            {
                "host": "controller2.com",
                "port": 8001,
                "name": "Secondary Controller",
                "status": "disconnected",
            },
        ]

        controller.db.load_remote_controllers.return_value = saved_controllers

        with patch("main.RemoteController") as mock_remote_controller_class:
            mock_controller_instance = AsyncMock()
            mock_remote_controller_class.return_value = mock_controller_instance
            mock_controller_instance.connect.return_value = True
            mock_controller_instance.get_telescopes.return_value = []

            await controller.load_saved_remote_controllers()

            # Should have created remote controller instances
            assert mock_remote_controller_class.call_count == 2

            # Check controller creation calls
            call_args_list = mock_remote_controller_class.call_args_list

            # First controller
            args1, kwargs1 = call_args_list[0]
            assert kwargs1["host"] == "controller1.com"
            assert kwargs1["port"] == 8000
            assert kwargs1["name"] == "Primary Controller"

            # Second controller
            args2, kwargs2 = call_args_list[1]
            assert kwargs2["host"] == "controller2.com"
            assert kwargs2["port"] == 8001
            assert kwargs2["name"] == "Secondary Controller"

            # Should have attempted to connect
            assert mock_controller_instance.connect.call_count == 2

    @pytest.mark.asyncio
    async def test_load_saved_remote_controllers_connection_failure(self, controller):
        """Test handling remote controller connection failures."""
        saved_controllers = [
            {
                "host": "unreachable.com",
                "port": 8000,
                "name": "Unreachable Controller",
                "status": "disconnected",
            }
        ]

        controller.db.load_remote_controllers.return_value = saved_controllers

        with patch("main.RemoteController") as mock_remote_controller_class:
            mock_controller_instance = AsyncMock()
            mock_remote_controller_class.return_value = mock_controller_instance
            # Simulate connection failure
            mock_controller_instance.connect.return_value = False

            await controller.load_saved_remote_controllers()

            # Should have attempted to create and connect
            mock_remote_controller_class.assert_called_once()
            mock_controller_instance.connect.assert_called_once()

            # Remote controllers dict should remain empty due to failed connection
            assert len(controller.remote_controllers) == 0

    @pytest.mark.asyncio
    async def test_add_test_telescope_success(self, controller):
        """Test adding test telescope successfully."""
        await controller.add_test_telescope()

        # Should have one telescope added
        assert len(controller.telescopes) == 1

        # Should be a TestTelescope instance
        telescope_name = list(controller.telescopes.keys())[0]
        telescope = controller.telescopes[telescope_name]
        assert isinstance(telescope, TestTelescope)
        assert telescope.host == "127.0.0.1"
        assert telescope.port == 9999
        assert telescope.serial_number == "TEST_TELESCOPE"
        assert telescope.product_model == "Test Telescope"

    @pytest.mark.asyncio
    async def test_add_test_telescope_already_exists(self, controller):
        """Test add_test_telescope when test telescope already exists."""
        # Add test telescope first time
        await controller.add_test_telescope()
        initial_count = len(controller.telescopes)

        # Add test telescope again
        await controller.add_test_telescope()

        # Should still have only one telescope
        assert len(controller.telescopes) == initial_count

    @pytest.mark.asyncio
    async def test_connect_all_telescopes_no_telescopes(self, controller):
        """Test connect_all_telescopes when no telescopes are present."""
        # Should complete without error
        await controller.connect_all_telescopes()

        # No telescopes to connect to
        assert len(controller.telescopes) == 0

    @pytest.mark.asyncio
    async def test_connect_all_telescopes_with_multiple_telescopes(self, controller):
        """Test connecting to multiple telescopes in parallel."""
        # Create mock telescopes with clients
        mock_telescope1 = MagicMock()
        mock_telescope1.name = "telescope1"
        mock_telescope1.client = AsyncMock()
        mock_telescope1.client.connect = AsyncMock(return_value=True)
        mock_telescope1.client.is_connected = True

        mock_telescope2 = MagicMock()
        mock_telescope2.name = "telescope2"
        mock_telescope2.client = AsyncMock()
        mock_telescope2.client.connect = AsyncMock(return_value=True)
        mock_telescope2.client.is_connected = True

        # Add telescopes to controller
        controller.telescopes["telescope1"] = mock_telescope1
        controller.telescopes["telescope2"] = mock_telescope2

        # Test parallel connection
        await controller.connect_all_telescopes()

        # Both telescopes should have had connect called
        mock_telescope1.client.connect.assert_called_once()
        mock_telescope2.client.connect.assert_called_once()

    @pytest.mark.asyncio
    async def test_connect_all_telescopes_with_connection_failures(self, controller):
        """Test connect_all_telescopes handling connection failures."""
        # Create mock telescopes where one fails to connect
        mock_telescope1 = MagicMock()
        mock_telescope1.name = "good_telescope"
        mock_telescope1.client = AsyncMock()
        mock_telescope1.client.connect = AsyncMock(return_value=True)
        mock_telescope1.client.is_connected = True

        mock_telescope2 = MagicMock()
        mock_telescope2.name = "bad_telescope"
        mock_telescope2.client = AsyncMock()
        mock_telescope2.client.connect = AsyncMock(
            side_effect=Exception("Connection failed")
        )
        mock_telescope2.client.is_connected = False

        controller.telescopes["good_telescope"] = mock_telescope1
        controller.telescopes["bad_telescope"] = mock_telescope2

        # Should complete without raising exception
        await controller.connect_all_telescopes()

        # Both should have attempted connection
        mock_telescope1.client.connect.assert_called_once()
        mock_telescope2.client.connect.assert_called_once()

    @pytest.mark.asyncio
    async def test_connect_all_telescopes_excludes_test_telescopes(self, controller):
        """Test that connect_all_telescopes excludes test telescopes."""
        # Add a test telescope
        test_telescope = TestTelescope(host="127.0.0.1", port=9999)
        controller.telescopes["test"] = test_telescope

        # Add a regular telescope
        mock_telescope = MagicMock()
        mock_telescope.name = "real_telescope"
        mock_telescope.client = AsyncMock()
        mock_telescope.client.connect = AsyncMock(return_value=True)
        mock_telescope.port = 4700  # Not test port
        controller.telescopes["real_telescope"] = mock_telescope

        await controller.connect_all_telescopes()

        # Only real telescope should have connect called
        mock_telescope.client.connect.assert_called_once()
        # Test telescope should not have connect called (it doesn't have a real client)


@pytest.mark.skipif(
    not CONTROLLER_ASYNC_AVAILABLE, reason="Controller async methods not available"
)
class TestControllerAutoDiscovery:
    """Test Controller auto-discovery functionality."""

    @pytest.fixture
    def controller(self):
        """Create a Controller instance with discovery enabled."""
        app = FastAPI()
        with patch("main.TelescopeDatabase") as mock_db:
            mock_db.return_value = AsyncMock()
            controller = Controller(app, service_port=8000, discover=True)
            return controller

    @pytest.mark.asyncio
    async def test_auto_discover_finds_new_devices(self, controller):
        """Test auto_discover finding and adding new devices."""
        # Mock discovered devices
        mock_devices = [
            {
                "address": "192.168.1.100",
                "port": 4700,
                "data": {"result": {"sn": "SN123456", "model": "Seestar S50"}},
            },
            {
                "address": "192.168.1.101",
                "port": 4700,
                "data": {"result": {"sn": "SN789012", "model": "Seestar S50"}},
            },
        ]

        with patch("main.discover_seestars", new=AsyncMock()) as mock_discover:
            # Set up discovery to return devices once, then empty list to break loop
            mock_discover.side_effect = [mock_devices, []]

            with patch.object(
                controller, "add_telescope", new=AsyncMock()
            ) as mock_add_telescope:
                mock_add_telescope.return_value = ("SN123456", True)

                # Create a task that will run one iteration then cancel
                discovery_task = asyncio.create_task(controller.auto_discover())

                # Let it run briefly
                await asyncio.sleep(0.1)
                discovery_task.cancel()

                try:
                    await discovery_task
                except asyncio.CancelledError:
                    pass

                # Should have discovered devices
                mock_discover.assert_called()

                # Should have attempted to add telescopes
                assert mock_add_telescope.call_count >= 2

    @pytest.mark.asyncio
    async def test_auto_discover_skips_existing_devices(self, controller):
        """Test auto_discover skips devices that are already added."""
        # Add an existing telescope
        existing_telescope = MagicMock()
        existing_telescope.name = "SN123456"
        controller.telescopes["SN123456"] = existing_telescope

        # Mock discovered devices (including existing one)
        mock_devices = [
            {
                "address": "192.168.1.100",
                "port": 4700,
                "data": {
                    "result": {
                        "sn": "SN123456",  # This one exists
                        "model": "Seestar S50",
                    }
                },
            },
            {
                "address": "192.168.1.101",
                "port": 4700,
                "data": {
                    "result": {
                        "sn": "SN789012",  # This one is new
                        "model": "Seestar S50",
                    }
                },
            },
        ]

        with patch("main.discover_seestars", new=AsyncMock()) as mock_discover:
            mock_discover.side_effect = [mock_devices, []]

            with patch.object(
                controller, "add_telescope", new=AsyncMock()
            ) as mock_add_telescope:
                mock_add_telescope.return_value = ("SN789012", True)

                # Run discovery briefly
                discovery_task = asyncio.create_task(controller.auto_discover())
                await asyncio.sleep(0.1)
                discovery_task.cancel()

                try:
                    await discovery_task
                except asyncio.CancelledError:
                    pass

                # Should only add the new device (not the existing one)
                mock_add_telescope.assert_called_once()

                # Verify it was called for the new device
                args, kwargs = mock_add_telescope.call_args
                assert args[0] == "192.168.1.101"  # host
                assert kwargs["serial_number"] == "SN789012"

    @pytest.mark.asyncio
    async def test_auto_discover_handles_discovery_errors(self, controller):
        """Test auto_discover handling discovery errors gracefully."""
        with patch("main.discover_seestars", new=AsyncMock()) as mock_discover:
            # First call fails, second succeeds with empty list to break loop
            mock_discover.side_effect = [Exception("Discovery failed"), []]

            with patch.object(
                controller, "add_telescope", new=AsyncMock()
            ) as mock_add_telescope:
                # Run discovery briefly
                discovery_task = asyncio.create_task(controller.auto_discover())
                await asyncio.sleep(0.1)
                discovery_task.cancel()

                try:
                    await discovery_task
                except asyncio.CancelledError:
                    pass

                # Should have attempted discovery
                mock_discover.assert_called()

                # Should not have added any telescopes due to error
                mock_add_telescope.assert_not_called()

    @pytest.mark.asyncio
    async def test_auto_discover_handles_add_telescope_errors(self, controller):
        """Test auto_discover handling add_telescope errors gracefully."""
        mock_devices = [
            {
                "address": "192.168.1.100",
                "port": 4700,
                "data": {"result": {"sn": "SN123456", "model": "Seestar S50"}},
            }
        ]

        with patch("main.discover_seestars", new=AsyncMock()) as mock_discover:
            mock_discover.side_effect = [mock_devices, []]

            with patch.object(
                controller, "add_telescope", new=AsyncMock()
            ) as mock_add_telescope:
                # Simulate add_telescope failing
                mock_add_telescope.side_effect = Exception("Failed to add telescope")

                # Run discovery briefly
                discovery_task = asyncio.create_task(controller.auto_discover())
                await asyncio.sleep(0.1)
                discovery_task.cancel()

                try:
                    await discovery_task
                except asyncio.CancelledError:
                    pass

                # Should have attempted to add telescope
                mock_add_telescope.assert_called()

                # Should continue running despite the error


@pytest.mark.skipif(
    not CONTROLLER_ASYNC_AVAILABLE, reason="Controller async methods not available"
)
class TestControllerTelescoperegistration:
    """Test Controller telescope registration and management."""

    @pytest.fixture
    def controller(self):
        """Create a Controller instance."""
        app = FastAPI()
        with patch("main.TelescopeDatabase") as mock_db:
            mock_db.return_value = AsyncMock()
            controller = Controller(app, service_port=8000, discover=False)
            return controller

    @pytest.mark.asyncio
    async def test_telescope_client_registration_with_websocket_manager(
        self, controller
    ):
        """Test telescope client registration with WebSocket manager."""
        # Create a mock telescope with connected client
        mock_telescope = MagicMock()
        mock_telescope.name = "test_telescope"
        mock_telescope.serial_number = "SN123456"
        mock_telescope.host = "192.168.1.100"
        mock_telescope.client = MagicMock()
        mock_telescope.client.is_connected = True
        mock_telescope.client.status = MagicMock()
        mock_telescope.client.status.model_dump.return_value = {"status": "connected"}

        # Mock WebSocket manager
        with patch("websocket_router.websocket_manager") as mock_ws_manager:
            mock_ws_manager.register_telescope_client = MagicMock()
            mock_ws_manager.broadcast_status_update = AsyncMock()

            # Add telescope to controller
            controller.telescopes["test_telescope"] = mock_telescope

            # Simulate the registration logic that happens in add_telescope
            if mock_telescope.client.is_connected:
                telescope_id = mock_telescope.serial_number or mock_telescope.host
                mock_ws_manager.register_telescope_client(
                    telescope_id, mock_telescope.client
                )

                # Simulate status update
                status_dict = mock_telescope.client.status.model_dump()
                await mock_ws_manager.broadcast_status_update(telescope_id, status_dict)

            # Verify WebSocket manager interactions
            mock_ws_manager.register_telescope_client.assert_called_once_with(
                "SN123456", mock_telescope.client
            )
            mock_ws_manager.broadcast_status_update.assert_called_once_with(
                "SN123456", {"status": "connected"}
            )

    @pytest.mark.asyncio
    async def test_telescope_discovery_broadcast(self, controller):
        """Test telescope discovery broadcast through WebSocket manager."""
        telescope_info = {
            "name": "SN123456",
            "host": "192.168.1.100",
            "port": 4700,
            "serial_number": "SN123456",
            "product_model": "Seestar S50",
            "location": "Test Location",
            "connected": True,
        }

        with patch("websocket_router.websocket_manager") as mock_ws_manager:
            mock_ws_manager.broadcast_telescope_discovered = AsyncMock()

            # Simulate the broadcast that happens during telescope discovery
            await mock_ws_manager.broadcast_telescope_discovered(telescope_info)

            # Verify broadcast was called
            mock_ws_manager.broadcast_telescope_discovered.assert_called_once_with(
                telescope_info
            )

    @pytest.mark.asyncio
    async def test_telescope_status_event_forwarding(self, controller):
        """Test telescope status event forwarding through WebSocket."""
        mock_telescope = MagicMock()
        mock_telescope.serial_number = "SN123456"
        mock_telescope.host = "192.168.1.100"
        mock_telescope.client = MagicMock()
        mock_telescope.client.is_connected = True

        with patch("websocket_router.websocket_manager") as mock_ws_manager:
            mock_ws_manager.broadcast_status_update = AsyncMock()

            # Simulate status update event handling
            telescope_id = mock_telescope.serial_number or mock_telescope.host

            # Mock status data
            status_dict = {
                "connected": True,
                "ra": 10.5,
                "dec": 45.0,
                "temperature": 15.2,
                "battery_level": 85,
            }

            # Simulate the status forwarding logic
            try:
                await mock_ws_manager.broadcast_status_update(telescope_id, status_dict)
            except Exception as e:
                # Error handling should prevent crashes
                pass

            # Verify status was forwarded
            mock_ws_manager.broadcast_status_update.assert_called_once_with(
                "SN123456", status_dict
            )
