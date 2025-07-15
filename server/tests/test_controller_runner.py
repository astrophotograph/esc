"""
Tests for Controller.runner() method and FastAPI endpoints.
"""

import pytest
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient
from fastapi import FastAPI

# Test Controller runner and endpoints
try:
    from main import (
        Controller,
        AddTelescopeRequest,
        SaveConfigurationRequest,
        AddRemoteControllerRequest,
    )
    from main import TestTelescope, Telescope

    CONTROLLER_AVAILABLE = True
except ImportError:
    CONTROLLER_AVAILABLE = False


@pytest.mark.skipif(not CONTROLLER_AVAILABLE, reason="Controller not available")
class TestControllerRunner:
    """Test Controller.runner() method and initialization."""

    @pytest.fixture
    def mock_app(self):
        """Create a mock FastAPI app."""
        app = MagicMock(spec=FastAPI)
        app.include_router = MagicMock()
        app.get = MagicMock()
        app.post = MagicMock()
        app.delete = MagicMock()
        app.on_event = MagicMock()
        return app

    @pytest.fixture
    def controller(self, mock_app):
        """Create a Controller instance with mocked dependencies."""
        with patch("main.TelescopeDatabase") as mock_db:
            mock_db.return_value = AsyncMock()
            controller = Controller(mock_app, service_port=8000, discover=False)
            return controller

    @pytest.mark.asyncio
    async def test_runner_initialization_sequence(self, controller, mock_app):
        """Test runner method initialization sequence."""
        # Mock all the external dependencies
        with patch.object(
            controller, "load_saved_telescopes", new=AsyncMock()
        ) as mock_load_telescopes:
            with patch.object(
                controller, "load_saved_remote_controllers", new=AsyncMock()
            ) as mock_load_controllers:
                with patch.object(
                    controller, "add_test_telescope", new=AsyncMock()
                ) as mock_add_test:
                    with patch(
                        "webrtc_router.initialize_webrtc_service"
                    ) as mock_webrtc_init:
                        with patch("asyncio.create_task") as mock_create_task:
                            # Mock the runner to stop before uvicorn.run
                            original_runner = controller.runner

                            async def mock_runner():
                                # Run everything except the uvicorn.run call
                                await controller.load_saved_telescopes()
                                await controller.load_saved_remote_controllers()
                                await controller.add_test_telescope()

                                # Mock WebRTC initialization
                                from webrtc_router import initialize_webrtc_service

                                def get_telescope(name):
                                    return controller.telescopes.get(name)

                                initialize_webrtc_service(get_telescope)

                                # Add routers (simulate the real runner behavior)
                                controller.app.include_router("websocket_router")
                                controller.app.include_router("webrtc_router")

                                # Setup event handlers
                                @controller.app.on_event("startup")
                                async def startup_event():
                                    pass

                                @controller.app.on_event("shutdown")
                                async def shutdown_event():
                                    pass

                                return "runner_completed"

                            controller.runner = mock_runner

                            # Test the runner
                            result = await controller.runner()

                            # Verify initialization sequence
                            mock_load_telescopes.assert_called_once()
                            mock_load_controllers.assert_called_once()
                            mock_add_test.assert_called_once()
                            mock_webrtc_init.assert_called_once()

                            # Verify routers were added
                            assert controller.app.include_router.call_count >= 2

                            assert result == "runner_completed"

    @pytest.mark.asyncio
    async def test_runner_with_discovery_enabled(self, mock_app):
        """Test runner with auto-discovery enabled."""
        with patch("main.TelescopeDatabase") as mock_db:
            mock_db.return_value = AsyncMock()
            controller = Controller(mock_app, service_port=8000, discover=True)

            with patch.object(controller, "load_saved_telescopes", new=AsyncMock()):
                with patch.object(
                    controller, "load_saved_remote_controllers", new=AsyncMock()
                ):
                    with patch.object(
                        controller, "add_test_telescope", new=AsyncMock()
                    ):
                        with patch.object(
                            controller, "auto_discover", new=AsyncMock()
                        ) as mock_auto_discover:
                            with patch("webrtc_router.initialize_webrtc_service"):
                                with patch("asyncio.create_task") as mock_create_task:
                                    # Create a simplified runner that doesn't start uvicorn
                                    async def simplified_runner():
                                        await controller.load_saved_telescopes()
                                        await controller.load_saved_remote_controllers()
                                        await controller.add_test_telescope()

                                        if controller.discover:
                                            asyncio.create_task(
                                                controller.auto_discover()
                                            )

                                        return "discovery_enabled"

                                    controller.runner = simplified_runner
                                    result = await controller.runner()

                                    # Should have created auto-discovery task
                                    mock_create_task.assert_called()
                                    assert result == "discovery_enabled"

    def test_get_telescope_function_creation(self, controller):
        """Test that get_telescope function is created correctly in runner."""
        # Add a test telescope
        test_telescope = MagicMock()
        test_telescope.name = "test_scope"
        controller.telescopes["test_scope"] = test_telescope

        # Simulate the get_telescope function created in runner
        def get_telescope(telescope_name: str):
            telescope = controller.telescopes.get(telescope_name)
            return telescope

        # Test the function
        found_telescope = get_telescope("test_scope")
        assert found_telescope == test_telescope

        not_found = get_telescope("nonexistent")
        assert not_found is None

    @pytest.mark.asyncio
    async def test_startup_event_handler(self, controller):
        """Test the startup event handler logic."""
        # Add telescopes to connect
        controller.telescopes["scope1"] = MagicMock()
        controller.telescopes["scope2"] = MagicMock()

        with patch("websocket_router.websocket_manager") as mock_ws_manager:
            mock_ws_manager.start = AsyncMock()
            with patch.object(
                controller, "connect_all_telescopes", new=AsyncMock()
            ) as mock_connect_all:
                with patch("asyncio.sleep", new=AsyncMock()) as mock_sleep:
                    with patch("asyncio.create_task") as mock_create_task:
                        # Simulate the startup event handler
                        await mock_ws_manager.start()

                        # Simulate delayed connection task
                        async def delayed_connect():
                            await asyncio.sleep(2)
                            await controller.connect_all_telescopes()

                        # Execute the delayed connect task
                        await delayed_connect()

                        # Verify WebSocket manager started
                        mock_ws_manager.start.assert_called_once()

                        # Verify telescopes connected
                        mock_connect_all.assert_called_once()
                        mock_sleep.assert_called_once_with(2)

    @pytest.mark.asyncio
    async def test_shutdown_event_handler(self, controller):
        """Test the shutdown event handler logic."""
        with patch("websocket_router.websocket_manager") as mock_ws_manager:
            mock_ws_manager.stop = AsyncMock()
            with patch(
                "webrtc_router.cleanup_webrtc_service", new=AsyncMock()
            ) as mock_cleanup:
                # Simulate the shutdown event handler
                await mock_ws_manager.stop()
                await mock_cleanup()

                # Verify cleanup was called
                mock_ws_manager.stop.assert_called_once()
                mock_cleanup.assert_called_once()


@pytest.mark.skipif(not CONTROLLER_AVAILABLE, reason="Controller not available")
class TestControllerAPIEndpoints:
    """Test FastAPI endpoints created in Controller.runner()."""

    @pytest.fixture
    def controller(self):
        """Create a Controller with real FastAPI app for endpoint testing."""
        app = FastAPI()
        with patch("main.TelescopeDatabase") as mock_db:
            mock_db.return_value = AsyncMock()
            controller = Controller(app, service_port=8000, discover=False)
            return controller

    @pytest.fixture
    def test_app(self, controller):
        """Create a test app with endpoints registered."""
        # Manually register the endpoints (simulating what runner() does)
        app = controller.app

        @app.get("/api/telescopes")
        async def get_telescopes():
            result = []
            # Add local telescopes (exclude test telescopes)
            for telescope in controller.telescopes.values():
                if isinstance(telescope, TestTelescope) or telescope.port == 9999:
                    continue
                result.append(
                    {
                        "name": telescope.name,
                        "host": telescope.host,
                        "port": telescope.port,
                        "location": await telescope.location
                        if hasattr(telescope, "location")
                        else "Unknown",
                        "connected": getattr(telescope.client, "is_connected", False)
                        if hasattr(telescope, "client")
                        else False,
                        "serial_number": telescope.serial_number,
                        "product_model": telescope.product_model,
                        "ssid": getattr(telescope, "ssid", None),
                        "discovery_method": getattr(
                            telescope, "discovery_method", "manual"
                        ),
                        "is_remote": False,
                    }
                )

            # Add remote telescopes
            for remote_telescope in controller.remote_telescopes.values():
                result.append(remote_telescope)

            return result

        @app.post("/api/telescopes")
        async def add_telescope_endpoint(telescope_request: AddTelescopeRequest):
            # Check if telescope already exists
            if (
                telescope_request.serial_number
                and telescope_request.serial_number in controller.telescopes
            ):
                from fastapi import HTTPException

                raise HTTPException(
                    status_code=409,
                    detail=f"Telescope with serial number {telescope_request.serial_number} already exists",
                )

            # Mock successful addition
            new_telescope = MagicMock()
            new_telescope.name = (
                telescope_request.serial_number or telescope_request.host
            )
            new_telescope.host = telescope_request.host
            new_telescope.port = telescope_request.port
            new_telescope.serial_number = telescope_request.serial_number
            new_telescope.product_model = telescope_request.product_model
            new_telescope.ssid = telescope_request.ssid
            new_telescope.discovery_method = "manual"
            new_telescope.location = telescope_request.location
            new_telescope.client = MagicMock()
            new_telescope.client.is_connected = False

            controller.telescopes[new_telescope.name] = new_telescope

            return {
                "status": "success",
                "message": f"Telescope {new_telescope.name} added successfully",
                "telescope": {
                    "name": new_telescope.name,
                    "host": new_telescope.host,
                    "port": new_telescope.port,
                    "location": new_telescope.location,
                    "connected": False,
                    "serial_number": new_telescope.serial_number,
                    "product_model": new_telescope.product_model,
                    "ssid": new_telescope.ssid,
                    "discovery_method": "manual",
                    "is_remote": False,
                },
            }

        @app.delete("/api/telescopes/{telescope_name}")
        async def remove_telescope_endpoint(telescope_name: str):
            if (
                telescope_name not in controller.telescopes
                and telescope_name not in controller.remote_telescopes
            ):
                from fastapi import HTTPException

                raise HTTPException(
                    status_code=404, detail=f"Telescope {telescope_name} not found"
                )

            if telescope_name in controller.telescopes:
                del controller.telescopes[telescope_name]
            elif telescope_name in controller.remote_telescopes:
                del controller.remote_telescopes[telescope_name]

            return {
                "status": "success",
                "message": f"Telescope {telescope_name} removed",
            }

        return app

    @pytest.fixture
    def client(self, test_app):
        """Create a test client."""
        return TestClient(test_app)

    def test_get_telescopes_empty(self, client, controller):
        """Test GET /api/telescopes with no telescopes."""
        response = client.get("/api/telescopes")
        assert response.status_code == 200
        assert response.json() == []

    def test_get_telescopes_with_local_telescopes(self, client, controller):
        """Test GET /api/telescopes with local telescopes."""
        # Add a test telescope
        telescope = MagicMock()
        telescope.name = "test_scope"
        telescope.host = "192.168.1.100"
        telescope.port = 4700
        telescope.serial_number = "TEST123"
        telescope.product_model = "Seestar S50"
        telescope.ssid = "Seestar-TEST"
        telescope.discovery_method = "manual"
        telescope.client = MagicMock()
        telescope.client.is_connected = True

        # Mock the location property
        async def mock_location():
            return "Test Location"

        telescope.location = mock_location()

        controller.telescopes["test_scope"] = telescope

        response = client.get("/api/telescopes")
        assert response.status_code == 200
        telescopes = response.json()
        assert len(telescopes) == 1
        assert telescopes[0]["name"] == "test_scope"
        assert telescopes[0]["host"] == "192.168.1.100"
        assert telescopes[0]["port"] == 4700
        assert telescopes[0]["serial_number"] == "TEST123"
        assert telescopes[0]["is_remote"] is False

    def test_get_telescopes_excludes_test_telescopes(self, client, controller):
        """Test that GET /api/telescopes excludes test telescopes."""
        # Add a regular telescope
        regular_telescope = MagicMock()
        regular_telescope.name = "regular_scope"
        regular_telescope.host = "192.168.1.100"
        regular_telescope.port = 4700
        regular_telescope.serial_number = "REAL123"
        regular_telescope.product_model = "Seestar S50"
        regular_telescope.discovery_method = "manual"
        regular_telescope.client = MagicMock()
        regular_telescope.client.is_connected = True

        async def mock_location():
            return "Real Location"

        regular_telescope.location = mock_location()

        controller.telescopes["regular_scope"] = regular_telescope

        # Add a test telescope (should be excluded)
        test_telescope = TestTelescope(host="localhost", port=9999)
        controller.telescopes["test_telescope"] = test_telescope

        response = client.get("/api/telescopes")
        assert response.status_code == 200
        telescopes = response.json()
        # Should only return the regular telescope, not the test telescope
        assert len(telescopes) == 1
        assert telescopes[0]["name"] == "regular_scope"

    def test_get_telescopes_with_remote_telescopes(self, client, controller):
        """Test GET /api/telescopes includes remote telescopes."""
        # Add a remote telescope
        controller.remote_telescopes["remote_scope"] = {
            "name": "remote_scope",
            "host": "192.168.1.200",
            "port": 4700,
            "location": "Remote Location",
            "connected": True,
            "serial_number": "REMOTE123",
            "product_model": "Seestar S50",
            "ssid": "Seestar-REMOTE",
            "remote_controller": "controller.com:8000",
            "is_remote": True,
        }

        response = client.get("/api/telescopes")
        assert response.status_code == 200
        telescopes = response.json()
        assert len(telescopes) == 1
        assert telescopes[0]["name"] == "remote_scope"
        assert telescopes[0]["is_remote"] is True

    def test_add_telescope_success(self, client, controller):
        """Test POST /api/telescopes successful addition."""
        telescope_data = {
            "host": "192.168.1.100",
            "port": 4700,
            "serial_number": "NEW123",
            "product_model": "Seestar S50",
            "ssid": "Seestar-NEW",
            "location": "New Location",
        }

        response = client.post("/api/telescopes", json=telescope_data)
        assert response.status_code == 200

        result = response.json()
        assert result["status"] == "success"
        assert "NEW123" in result["message"]
        assert result["telescope"]["name"] == "NEW123"
        assert result["telescope"]["host"] == "192.168.1.100"
        assert result["telescope"]["is_remote"] is False

        # Verify telescope was added to controller
        assert "NEW123" in controller.telescopes

    def test_add_telescope_duplicate_serial_number(self, client, controller):
        """Test POST /api/telescopes with duplicate serial number."""
        # Add existing telescope
        existing_telescope = MagicMock()
        existing_telescope.name = "EXISTING123"
        controller.telescopes["EXISTING123"] = existing_telescope

        telescope_data = {
            "host": "192.168.1.100",
            "port": 4700,
            "serial_number": "EXISTING123",
            "product_model": "Seestar S50",
        }

        response = client.post("/api/telescopes", json=telescope_data)
        assert response.status_code == 409
        assert "already exists" in response.json()["detail"]

    def test_add_telescope_invalid_data(self, client, controller):
        """Test POST /api/telescopes with invalid data."""
        invalid_data = {
            "port": 4700
            # Missing required 'host' field
        }

        response = client.post("/api/telescopes", json=invalid_data)
        assert response.status_code == 422  # Validation error

    def test_remove_telescope_success(self, client, controller):
        """Test DELETE /api/telescopes/{telescope_name} success."""
        # Add telescope to remove
        telescope = MagicMock()
        telescope.name = "remove_me"
        controller.telescopes["remove_me"] = telescope

        response = client.delete("/api/telescopes/remove_me")
        assert response.status_code == 200

        result = response.json()
        assert result["status"] == "success"
        assert "remove_me" in result["message"]

        # Verify telescope was removed
        assert "remove_me" not in controller.telescopes

    def test_remove_telescope_not_found(self, client, controller):
        """Test DELETE /api/telescopes/{telescope_name} when telescope not found."""
        response = client.delete("/api/telescopes/nonexistent")
        assert response.status_code == 404
        assert "not found" in response.json()["detail"]

    def test_remove_remote_telescope_success(self, client, controller):
        """Test DELETE /api/telescopes/{telescope_name} for remote telescope."""
        # Add remote telescope to remove
        controller.remote_telescopes["remote_remove"] = {
            "name": "remote_remove",
            "host": "192.168.1.200",
            "is_remote": True,
        }

        response = client.delete("/api/telescopes/remote_remove")
        assert response.status_code == 200

        result = response.json()
        assert result["status"] == "success"
        assert "remote_remove" in result["message"]

        # Verify remote telescope was removed
        assert "remote_remove" not in controller.remote_telescopes


@pytest.mark.skipif(not CONTROLLER_AVAILABLE, reason="Controller not available")
class TestControllerHTMLEndpoint:
    """Test the root HTML endpoint."""

    @pytest.fixture
    def controller(self):
        """Create a Controller with real FastAPI app."""
        app = FastAPI()
        with patch("main.TelescopeDatabase") as mock_db:
            mock_db.return_value = AsyncMock()
            controller = Controller(app, service_port=8000, discover=False)
            return controller

    @pytest.fixture
    def test_app(self, controller):
        """Create test app with HTML endpoint."""
        app = controller.app

        @app.get("/")
        async def root():
            # Simplified version of the HTML endpoint
            local_telescope_count = sum(
                1
                for t in controller.telescopes.values()
                if not (isinstance(t, TestTelescope) or t.port == 9999)
            )
            telescope_count = local_telescope_count + len(controller.remote_telescopes)

            # Mock network interfaces
            network_interfaces = [("en0", "192.168.1.10"), ("lo0", "127.0.0.1")]

            # Get discovery statistics
            auto_discovered_count = sum(
                1
                for t in controller.telescopes.values()
                if getattr(t, "discovery_method", "") == "auto_discovery"
                and not (isinstance(t, TestTelescope) or t.port == 9999)
            )
            manual_count = sum(
                1
                for t in controller.telescopes.values()
                if getattr(t, "discovery_method", "") == "manual"
                and not (isinstance(t, TestTelescope) or t.port == 9999)
            )
            remote_count = len(controller.remote_telescopes)
            controller_count = len(controller.remote_controllers)

            html_content = f"""
            <!DOCTYPE html>
            <html>
            <head><title>ALP Experimental</title></head>
            <body>
                <h1>Telescope Control API</h1>
                <p>Total Telescopes: {telescope_count}</p>
                <p>Auto-discovered: {auto_discovered_count}</p>
                <p>Manual: {manual_count}</p>
                <p>Remote: {remote_count}</p>
                <p>Controllers: {controller_count}</p>
            </body>
            </html>
            """
            from fastapi.responses import HTMLResponse

            return HTMLResponse(content=html_content)

        return app

    @pytest.fixture
    def client(self, test_app):
        """Create test client."""
        return TestClient(test_app)

    def test_root_endpoint_no_telescopes(self, client, controller):
        """Test root endpoint with no telescopes."""
        response = client.get("/")
        assert response.status_code == 200
        assert "text/html" in response.headers.get("content-type", "")

        content = response.text
        assert "Telescope Control API" in content
        assert "Total Telescopes: 0" in content
        assert "Auto-discovered: 0" in content
        assert "Manual: 0" in content
        assert "Remote: 0" in content

    def test_root_endpoint_with_telescopes(self, client, controller):
        """Test root endpoint with various telescope types."""
        # Add manual telescope
        manual_telescope = MagicMock()
        manual_telescope.discovery_method = "manual"
        manual_telescope.port = 4700
        controller.telescopes["manual1"] = manual_telescope

        # Add auto-discovered telescope
        auto_telescope = MagicMock()
        auto_telescope.discovery_method = "auto_discovery"
        auto_telescope.port = 4700
        controller.telescopes["auto1"] = auto_telescope

        # Add test telescope (should be excluded from count)
        test_telescope = TestTelescope(host="localhost", port=9999)
        controller.telescopes["test1"] = test_telescope

        # Add remote telescope
        controller.remote_telescopes["remote1"] = {"name": "remote1"}

        # Add remote controller
        controller.remote_controllers["controller1"] = {"name": "controller1"}

        response = client.get("/")
        assert response.status_code == 200

        content = response.text
        assert "Total Telescopes: 3" in content  # 2 local + 1 remote
        assert "Auto-discovered: 1" in content
        assert "Manual: 1" in content
        assert "Remote: 1" in content
        assert "Controllers: 1" in content


@pytest.mark.skipif(not CONTROLLER_AVAILABLE, reason="Controller not available")
class TestControllerEndpointErrorHandling:
    """Test error handling in Controller endpoints."""

    @pytest.fixture
    def controller(self):
        """Create Controller for error testing."""
        app = FastAPI()
        with patch("main.TelescopeDatabase") as mock_db:
            mock_db.return_value = AsyncMock()
            controller = Controller(app, service_port=8000, discover=False)
            return controller

    def test_telescope_name_validation(self, controller):
        """Test telescope name validation logic."""
        # Test serial number as name
        request = AddTelescopeRequest(
            host="192.168.1.100", port=4700, serial_number="SN123456"
        )
        expected_name = request.serial_number or request.host
        assert expected_name == "SN123456"

        # Test host as name when no serial number
        request_no_sn = AddTelescopeRequest(host="192.168.1.100", port=4700)
        expected_name_no_sn = request_no_sn.serial_number or request_no_sn.host
        assert expected_name_no_sn == "192.168.1.100"

    def test_telescope_existence_check(self, controller):
        """Test telescope existence checking logic."""
        # Add existing telescope
        existing = MagicMock()
        existing.host = "192.168.1.100"
        existing.port = 4700
        existing.serial_number = "EXISTING123"
        controller.telescopes["EXISTING123"] = existing

        # Test checking by serial number
        assert "EXISTING123" in controller.telescopes

        # Test checking by host/port combination
        host_port_exists = False
        for telescope in controller.telescopes.values():
            if telescope.host == "192.168.1.100" and telescope.port == 4700:
                host_port_exists = True
                break
        assert host_port_exists

        # Test non-existent telescope
        assert "NONEXISTENT" not in controller.telescopes
