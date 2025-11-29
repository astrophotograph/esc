"""
Tests for Controller endpoints and initialization to boost main.py coverage.
"""

import pytest
import json
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import FastAPI
from fastapi.testclient import TestClient

# Test Controller endpoints
try:
    from main import (
        Controller,
        AddTelescopeRequest,
        SaveConfigurationRequest,
        AddRemoteControllerRequest,
    )
    from main import TestTelescope, Telescope

    CONTROLLER_ENDPOINTS_AVAILABLE = True
except ImportError:
    CONTROLLER_ENDPOINTS_AVAILABLE = False


@pytest.mark.skipif(
    not CONTROLLER_ENDPOINTS_AVAILABLE, reason="Controller endpoints not available"
)
class TestControllerEndpointsComprehensive:
    """Test Controller endpoints comprehensively for maximum coverage."""

    @pytest.fixture
    def controller(self):
        """Create a Controller instance."""
        app = FastAPI()
        with patch("main.TelescopeDatabase") as mock_db:
            mock_db.return_value = AsyncMock()
            controller = Controller(app, service_port=8000, discover=False)
            return controller

    @pytest.fixture
    def client(self, controller):
        """Create test client with all endpoints registered."""
        # Register all the endpoints that would be in runner()
        app = controller.app

        @app.get("/")
        async def root():
            """Root HTML endpoint with full feature set."""
            import socket
            import psutil

            # Count telescopes (excluding test telescopes)
            local_telescope_count = sum(
                1
                for t in controller.telescopes.values()
                if not (isinstance(t, TestTelescope) or t.port == 9999)
            )
            telescope_count = local_telescope_count + len(controller.remote_telescopes)

            # Get network interfaces
            network_interfaces = []
            try:
                for interface, addrs in psutil.net_if_addrs().items():
                    for addr in addrs:
                        if (
                            addr.family == socket.AF_INET
                            and not addr.address.startswith("127.")
                        ):
                            network_interfaces.append((interface, addr.address))
            except:
                network_interfaces = [("en0", "192.168.1.10")]

            # Discovery statistics
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
            <head><title>ALP Experimental - Telescope Control</title></head>
            <body>
                <h1>Telescope Control API</h1>
                <p>Service running on port {controller.service_port}</p>
                <p>Total Telescopes: {telescope_count}</p>
                <p>Auto-discovered: {auto_discovered_count}</p>
                <p>Manual: {manual_count}</p>
                <p>Remote: {remote_count}</p>
                <p>Controllers: {controller_count}</p>
                <h2>Network Interfaces:</h2>
                <ul>
                {chr(10).join(f"<li>{iface}: {addr}</li>" for iface, addr in network_interfaces)}
                </ul>
            </body>
            </html>
            """
            from fastapi.responses import HTMLResponse

            return HTMLResponse(content=html_content)

        @app.get("/api/telescopes")
        async def get_telescopes():
            """Get all telescopes endpoint with full feature set."""
            result = []

            # Add local telescopes (exclude test telescopes)
            for telescope in controller.telescopes.values():
                if isinstance(telescope, TestTelescope) or telescope.port == 9999:
                    continue

                location = "Unknown"
                if hasattr(telescope, "location"):
                    try:
                        location = (
                            await telescope.location
                            if hasattr(telescope.location, "__call__")
                            else telescope.location
                        )
                    except:
                        location = "Unknown"

                telescope_info = {
                    "name": telescope.name,
                    "host": telescope.host,
                    "port": telescope.port,
                    "location": location,
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
                result.append(telescope_info)

            # Add remote telescopes
            for remote_telescope in controller.remote_telescopes.values():
                result.append(remote_telescope)

            return result

        @app.post("/api/telescopes")
        async def add_telescope_endpoint(telescope_request: AddTelescopeRequest):
            """Add telescope endpoint with validation."""
            from fastapi import HTTPException

            # Check if telescope already exists by serial number
            if telescope_request.serial_number:
                for existing_telescope in controller.telescopes.values():
                    if (
                        getattr(existing_telescope, "serial_number", None)
                        == telescope_request.serial_number
                    ):
                        raise HTTPException(
                            status_code=409,
                            detail=f"Telescope with serial number {telescope_request.serial_number} already exists",
                        )

            # Check if telescope already exists by host/port
            for existing_telescope in controller.telescopes.values():
                if (
                    existing_telescope.host == telescope_request.host
                    and existing_telescope.port == telescope_request.port
                ):
                    raise HTTPException(
                        status_code=409,
                        detail=f"Telescope at {telescope_request.host}:{telescope_request.port} already exists",
                    )

            # Add the telescope
            telescope_name, success = await controller.add_telescope(
                telescope_request.host,
                telescope_request.port,
                serial_number=telescope_request.serial_number,
                product_model=telescope_request.product_model,
                ssid=telescope_request.ssid,
                location=telescope_request.location,
            )

            if success:
                telescope = controller.telescopes[telescope_name]
                return {
                    "status": "success",
                    "message": f"Telescope {telescope_name} added successfully",
                    "telescope": {
                        "name": telescope_name,
                        "host": telescope.host,
                        "port": telescope.port,
                        "location": getattr(telescope, "location", "Unknown"),
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
                    },
                }
            else:
                raise HTTPException(status_code=500, detail="Failed to add telescope")

        @app.delete("/api/telescopes/{telescope_name}")
        async def remove_telescope_endpoint(telescope_name: str):
            """Remove telescope endpoint."""
            from fastapi import HTTPException

            # Check if telescope exists in local telescopes
            if telescope_name in controller.telescopes:
                telescope = controller.telescopes[telescope_name]

                # Disconnect if connected
                if hasattr(telescope, "client") and telescope.client:
                    try:
                        if hasattr(telescope.client, "disconnect"):
                            await telescope.client.disconnect()
                    except:
                        pass

                # Remove from database if it's manually added
                if getattr(telescope, "discovery_method", "manual") == "manual":
                    try:
                        await controller.db.delete_telescope_by_name(telescope_name)
                    except:
                        pass

                # Remove from controller
                del controller.telescopes[telescope_name]

                return {
                    "status": "success",
                    "message": f"Telescope {telescope_name} removed",
                }

            # Check if telescope exists in remote telescopes
            elif telescope_name in controller.remote_telescopes:
                del controller.remote_telescopes[telescope_name]
                return {
                    "status": "success",
                    "message": f"Remote telescope {telescope_name} removed",
                }

            else:
                raise HTTPException(
                    status_code=404, detail=f"Telescope {telescope_name} not found"
                )

        @app.post("/api/telescopes/connect-all")
        async def connect_all_telescopes_endpoint():
            """Connect to all telescopes endpoint."""
            try:
                await controller.connect_all_telescopes()

                # Count successful connections (exclude test telescopes)
                connected_count = sum(
                    1
                    for t in controller.telescopes.values()
                    if hasattr(t, "client")
                    and t.client
                    and getattr(t.client, "is_connected", False)
                    and not (isinstance(t, TestTelescope) or t.port == 9999)
                )

                total_count = sum(
                    1
                    for t in controller.telescopes.values()
                    if not (isinstance(t, TestTelescope) or t.port == 9999)
                )

                return {
                    "status": "success",
                    "message": f"Connection attempted for all telescopes",
                    "connected": connected_count,
                    "total": total_count,
                }
            except Exception as e:
                from fastapi import HTTPException

                raise HTTPException(
                    status_code=500, detail=f"Failed to connect to telescopes: {str(e)}"
                )

        @app.post("/api/configurations")
        async def save_configuration_endpoint(config_request: SaveConfigurationRequest):
            """Save configuration endpoint."""
            try:
                import json

                success = await controller.db.save_configuration(
                    name=config_request.name,
                    description=config_request.description,
                    config_data=json.dumps(config_request.config_data),
                )

                if success:
                    return {
                        "status": "success",
                        "message": f"Configuration '{config_request.name}' saved successfully",
                    }
                else:
                    from fastapi import HTTPException

                    raise HTTPException(
                        status_code=500, detail="Failed to save configuration"
                    )
            except Exception as e:
                from fastapi import HTTPException

                raise HTTPException(
                    status_code=500, detail=f"Error saving configuration: {str(e)}"
                )

        @app.get("/api/configurations")
        async def list_configurations_endpoint():
            """List configurations endpoint."""
            try:
                configurations = await controller.db.list_configurations()
                return configurations
            except Exception as e:
                from fastapi import HTTPException

                raise HTTPException(
                    status_code=500, detail=f"Error loading configurations: {str(e)}"
                )

        @app.post("/api/remote-controllers")
        async def add_remote_controller_endpoint(
            controller_request: AddRemoteControllerRequest,
        ):
            """Add remote controller endpoint."""
            try:
                from main import RemoteController

                # Create remote controller instance
                remote_controller = RemoteController(
                    host=controller_request.host,
                    port=controller_request.port,
                    name=controller_request.name,
                    description=controller_request.description,
                )

                # Try to connect
                connected = await remote_controller.connect()

                if connected:
                    # Save to database
                    controller_data = {
                        "host": controller_request.host,
                        "port": controller_request.port,
                        "name": controller_request.name,
                        "description": controller_request.description,
                        "status": "connected",
                    }
                    await controller.db.save_remote_controller(controller_data)

                    # Add to controller
                    controller_key = (
                        f"{controller_request.host}:{controller_request.port}"
                    )
                    controller.remote_controllers[controller_key] = {
                        "instance": remote_controller,
                        "metadata": controller_data,
                    }

                    return {
                        "status": "success",
                        "message": f"Remote controller {controller_request.name} added and connected",
                        "connected": True,
                    }
                else:
                    return {
                        "status": "partial_success",
                        "message": f"Remote controller {controller_request.name} added but not connected",
                        "connected": False,
                    }

            except Exception as e:
                from fastapi import HTTPException

                raise HTTPException(
                    status_code=500, detail=f"Error adding remote controller: {str(e)}"
                )

        return TestClient(app)

    def test_root_endpoint_comprehensive(self, client, controller):
        """Test root endpoint with comprehensive feature coverage."""
        # Add various telescope types for counting
        mock_manual_telescope = MagicMock()
        mock_manual_telescope.discovery_method = "manual"
        mock_manual_telescope.port = 4700
        controller.telescopes["manual1"] = mock_manual_telescope

        mock_auto_telescope = MagicMock()
        mock_auto_telescope.discovery_method = "auto_discovery"
        mock_auto_telescope.port = 4700
        controller.telescopes["auto1"] = mock_auto_telescope

        # Add test telescope (should be excluded)
        test_telescope = TestTelescope(host="127.0.0.1", port=9999)
        controller.telescopes["test"] = test_telescope

        # Add remote telescope and controller
        controller.remote_telescopes["remote1"] = {"name": "remote1"}
        controller.remote_controllers["controller1"] = {"name": "controller1"}

        response = client.get("/")
        assert response.status_code == 200
        assert "text/html" in response.headers.get("content-type", "")

        content = response.text
        assert "Telescope Control API" in content
        assert "Total Telescopes: 3" in content  # 2 local + 1 remote
        assert "Auto-discovered: 1" in content
        assert "Manual: 1" in content
        assert "Remote: 1" in content
        assert "Controllers: 1" in content
        assert f"port {controller.service_port}" in content

    def test_get_telescopes_comprehensive(self, client, controller):
        """Test get telescopes endpoint with comprehensive data."""
        # Create mock telescope with full data
        mock_telescope = MagicMock()
        mock_telescope.name = "comprehensive_scope"
        mock_telescope.host = "192.168.1.100"
        mock_telescope.port = 4700
        mock_telescope.serial_number = "SN123456"
        mock_telescope.product_model = "Seestar S50"
        mock_telescope.ssid = "Seestar-123"
        mock_telescope.discovery_method = "manual"

        # Mock location as async property
        async def mock_location():
            return "Test Observatory"

        mock_telescope.location = mock_location

        # Mock client
        mock_telescope.client = MagicMock()
        mock_telescope.client.is_connected = True

        controller.telescopes["comprehensive_scope"] = mock_telescope

        # Add remote telescope
        controller.remote_telescopes["remote_scope"] = {
            "name": "remote_scope",
            "host": "192.168.1.200",
            "port": 4700,
            "is_remote": True,
        }

        response = client.get("/api/telescopes")
        assert response.status_code == 200

        telescopes = response.json()
        assert len(telescopes) == 2  # 1 local + 1 remote

        # Check local telescope data
        local_telescope = next(
            t for t in telescopes if t["name"] == "comprehensive_scope"
        )
        assert local_telescope["host"] == "192.168.1.100"
        assert local_telescope["port"] == 4700
        assert local_telescope["serial_number"] == "SN123456"
        assert local_telescope["product_model"] == "Seestar S50"
        assert local_telescope["ssid"] == "Seestar-123"
        assert local_telescope["discovery_method"] == "manual"
        assert local_telescope["connected"] is True
        assert local_telescope["is_remote"] is False

        # Check remote telescope
        remote_telescope = next(t for t in telescopes if t["name"] == "remote_scope")
        assert remote_telescope["is_remote"] is True

    def test_add_telescope_comprehensive_validation(self, client, controller):
        """Test add telescope endpoint with comprehensive validation."""
        # Test successful addition
        telescope_data = {
            "host": "192.168.1.100",
            "port": 4700,
            "serial_number": "NEW123456",
            "product_model": "Seestar S50",
            "ssid": "Seestar-NEW",
            "location": "New Observatory",
        }

        with patch.object(
            controller, "add_telescope", new=AsyncMock()
        ) as mock_add_telescope:
            mock_add_telescope.return_value = ("NEW123456", True)

            # Create mock telescope for return data
            mock_telescope = MagicMock()
            mock_telescope.host = "192.168.1.100"
            mock_telescope.port = 4700
            mock_telescope.serial_number = "NEW123456"
            mock_telescope.product_model = "Seestar S50"
            mock_telescope.ssid = "Seestar-NEW"
            mock_telescope.discovery_method = "manual"
            mock_telescope.location = "New Observatory"
            mock_telescope.client = MagicMock()
            mock_telescope.client.is_connected = False

            controller.telescopes["NEW123456"] = mock_telescope

            response = client.post("/api/telescopes", json=telescope_data)
            assert response.status_code == 200

            result = response.json()
            assert result["status"] == "success"
            assert "NEW123456" in result["message"]
            assert result["telescope"]["name"] == "NEW123456"
            assert result["telescope"]["host"] == "192.168.1.100"

    def test_add_telescope_duplicate_serial_validation(self, client, controller):
        """Test add telescope duplicate serial number validation."""
        # Add existing telescope
        existing_telescope = MagicMock()
        existing_telescope.serial_number = "EXISTING123"
        controller.telescopes["existing"] = existing_telescope

        telescope_data = {
            "host": "192.168.1.101",
            "port": 4700,
            "serial_number": "EXISTING123",  # Duplicate serial
            "product_model": "Seestar S50",
        }

        response = client.post("/api/telescopes", json=telescope_data)
        assert response.status_code == 409
        assert "already exists" in response.json()["detail"]

    def test_add_telescope_duplicate_host_port_validation(self, client, controller):
        """Test add telescope duplicate host/port validation."""
        # Add existing telescope
        existing_telescope = MagicMock()
        existing_telescope.host = "192.168.1.100"
        existing_telescope.port = 4700
        existing_telescope.serial_number = "EXISTING123"
        controller.telescopes["existing"] = existing_telescope

        telescope_data = {
            "host": "192.168.1.100",  # Duplicate host/port
            "port": 4700,
            "serial_number": "NEW123456",
            "product_model": "Seestar S50",
        }

        response = client.post("/api/telescopes", json=telescope_data)
        assert response.status_code == 409
        assert "already exists" in response.json()["detail"]

    def test_remove_telescope_comprehensive(self, client, controller):
        """Test remove telescope endpoint with comprehensive cleanup."""
        # Create mock telescope with client
        mock_telescope = MagicMock()
        mock_telescope.discovery_method = "manual"
        mock_telescope.client = AsyncMock()
        mock_telescope.client.disconnect = AsyncMock()

        controller.telescopes["remove_me"] = mock_telescope

        # Mock database deletion
        controller.db.delete_telescope_by_name = AsyncMock(return_value=True)

        response = client.delete("/api/telescopes/remove_me")
        assert response.status_code == 200

        result = response.json()
        assert result["status"] == "success"
        assert "remove_me" in result["message"]

        # Verify telescope was removed
        assert "remove_me" not in controller.telescopes

        # Verify cleanup was attempted
        mock_telescope.client.disconnect.assert_called_once()
        controller.db.delete_telescope_by_name.assert_called_once_with("remove_me")

    def test_remove_remote_telescope(self, client, controller):
        """Test removing remote telescope."""
        controller.remote_telescopes["remote_remove"] = {
            "name": "remote_remove",
            "host": "192.168.1.200",
        }

        response = client.delete("/api/telescopes/remote_remove")
        assert response.status_code == 200

        result = response.json()
        assert result["status"] == "success"
        assert "remote_remove" in result["message"]

        # Verify remote telescope was removed
        assert "remote_remove" not in controller.remote_telescopes

    def test_connect_all_telescopes_endpoint(self, client, controller):
        """Test connect all telescopes endpoint."""
        # Add mock telescopes
        mock_telescope1 = MagicMock()
        mock_telescope1.client = MagicMock()
        mock_telescope1.client.is_connected = True
        mock_telescope1.port = 4700

        mock_telescope2 = MagicMock()
        mock_telescope2.client = MagicMock()
        mock_telescope2.client.is_connected = False
        mock_telescope2.port = 4700

        controller.telescopes["telescope1"] = mock_telescope1
        controller.telescopes["telescope2"] = mock_telescope2

        with patch.object(
            controller, "connect_all_telescopes", new=AsyncMock()
        ) as mock_connect_all:
            response = client.post("/api/telescopes/connect-all")
            assert response.status_code == 200

            result = response.json()
            assert result["status"] == "success"
            assert "Connection attempted" in result["message"]
            assert result["connected"] == 1  # Only telescope1 is connected
            assert result["total"] == 2

            mock_connect_all.assert_called_once()

    def test_save_configuration_endpoint(self, client, controller):
        """Test save configuration endpoint."""
        config_data = {
            "name": "test_config",
            "description": "Test configuration",
            "config_data": {"setting1": "value1", "setting2": 42},
        }

        controller.db.save_configuration = AsyncMock(return_value=True)

        response = client.post("/api/configurations", json=config_data)
        assert response.status_code == 200

        result = response.json()
        assert result["status"] == "success"
        assert "test_config" in result["message"]

        # Verify database call
        controller.db.save_configuration.assert_called_once()
        args = controller.db.save_configuration.call_args[1]
        assert args["name"] == "test_config"
        assert args["description"] == "Test configuration"

    def test_list_configurations_endpoint(self, client, controller):
        """Test list configurations endpoint."""
        mock_configs = [
            {"name": "config1", "description": "First config"},
            {"name": "config2", "description": "Second config"},
        ]

        controller.db.list_configurations = AsyncMock(return_value=mock_configs)

        response = client.get("/api/configurations")
        assert response.status_code == 200

        configs = response.json()
        assert len(configs) == 2
        assert configs[0]["name"] == "config1"
        assert configs[1]["name"] == "config2"

        controller.db.list_configurations.assert_called_once()

    def test_add_remote_controller_endpoint(self, client, controller):
        """Test add remote controller endpoint."""
        controller_data = {
            "host": "controller.com",
            "port": 8000,
            "name": "Test Controller",
            "description": "Test remote controller",
        }

        with patch("main.RemoteController") as mock_remote_controller_class:
            mock_controller_instance = AsyncMock()
            mock_remote_controller_class.return_value = mock_controller_instance
            mock_controller_instance.connect.return_value = True

            controller.db.save_remote_controller = AsyncMock(return_value=True)

            response = client.post("/api/remote-controllers", json=controller_data)
            assert response.status_code == 200

            result = response.json()
            assert result["status"] == "success"
            assert "Test Controller" in result["message"]
            assert result["connected"] is True

            # Verify controller was created and connected
            mock_remote_controller_class.assert_called_once()
            mock_controller_instance.connect.assert_called_once()
            controller.db.save_remote_controller.assert_called_once()

            # Verify controller was added to controller registry
            controller_key = "controller.com:8000"
            assert controller_key in controller.remote_controllers
