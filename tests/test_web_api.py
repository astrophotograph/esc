"""
Tests for web_api.py — utility functions and API endpoint handlers.

Uses FastAPI's TestClient (sync wrapper around the async app) with mocks
for all external dependencies (scopinator, SSH, astrometry.net).
"""
from __future__ import annotations

import json
import time
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

# Import via the 'python' package so relative imports in web_api.py resolve.
import python.web_api as web_api_module
from python.web_api import (
    _extract_telescope_id,
    _json_string_response,
    _looks_like_host,
    _parse_host_port,
    app,
)
from catalog.catalog_service import CatalogService


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def clear_telescopes_and_sessions():
    """Reset module-level state between tests."""
    web_api_module._telescopes.clear()
    web_api_module._sessions.clear()
    yield
    web_api_module._telescopes.clear()
    web_api_module._sessions.clear()


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


SMALL_CATALOG = {
    "objects": [
        {
            "id": "M042",
            "object_type": "Nebula",
            "catalog_ids": {"messier": "M42"},
            "names": {"proper": "Orion Nebula", "common": [], "other": []},
            "coordinates": {
                "ra_j2000": {"decimal": 83.82},
                "dec_j2000": {"decimal": -5.39},
                "constellation": "Ori",
            },
            "magnitudes": {"v": 4.0},
            "physical_properties": {},
            "description": "Test nebula.",
        }
    ]
}


@pytest.fixture(autouse=True)
def seed_catalog_cache():
    """Point CatalogService at an in-memory catalog to avoid file I/O."""
    original = CatalogService._catalog_cache
    original_time = CatalogService._cache_load_time
    CatalogService._catalog_cache = SMALL_CATALOG
    CatalogService._cache_load_time = time.time()
    yield
    CatalogService._catalog_cache = original
    CatalogService._cache_load_time = original_time


# ---------------------------------------------------------------------------
# Utility function unit tests (no HTTP involved)
# ---------------------------------------------------------------------------

class TestParseHostPort:
    def test_explicit_host_port(self) -> None:
        host, port = _parse_host_port("192.168.1.100:4700")
        assert host == "192.168.1.100"
        assert port == 4700

    def test_manual_id_format(self) -> None:
        host, port = _parse_host_port("manual-10.0.0.1:4700-1735123456789")
        assert host == "10.0.0.1"
        assert port == 4700

    def test_host_only_uses_default_port(self) -> None:
        host, port = _parse_host_port("192.168.1.1")
        assert host == "192.168.1.1"
        assert port == 4700

    def test_invalid_port_uses_default(self) -> None:
        host, port = _parse_host_port("hostname:notaport")
        assert host == "hostname:notaport"
        assert port == 4700

    def test_ipv6_style_colon(self) -> None:
        host, port = _parse_host_port("myhost:9000")
        assert host == "myhost"
        assert port == 9000


class TestLooksLikeHost:
    def test_ip_address(self) -> None:
        assert _looks_like_host("192.168.1.1") is True

    def test_hostname_with_dot(self) -> None:
        assert _looks_like_host("my.host.local") is True

    def test_host_with_port(self) -> None:
        assert _looks_like_host("host:4700") is True

    def test_plain_serial_number(self) -> None:
        assert _looks_like_host("SEESTAR12345") is False

    def test_empty_string(self) -> None:
        assert _looks_like_host("") is False


class TestExtractTelescopeId:
    def test_telescope_id_key(self) -> None:
        assert _extract_telescope_id({"telescopeId": "abc"}) == "abc"

    def test_snake_case_key(self) -> None:
        assert _extract_telescope_id({"telescope_id": "def"}) == "def"

    def test_id_key(self) -> None:
        assert _extract_telescope_id({"id": "ghi"}) == "ghi"

    def test_missing_returns_none(self) -> None:
        assert _extract_telescope_id({}) is None

    def test_telescope_id_takes_priority(self) -> None:
        result = _extract_telescope_id({"telescopeId": "first", "id": "second"})
        assert result == "first"


class TestJsonStringResponse:
    def test_returns_json_response(self) -> None:
        from fastapi.responses import JSONResponse
        resp = _json_string_response({"key": "value"})
        assert isinstance(resp, JSONResponse)

    def test_content_is_json_string(self) -> None:
        resp = _json_string_response({"x": 1})
        # The content should be a JSON-encoded string representation
        assert resp.body is not None


# ---------------------------------------------------------------------------
# API endpoint tests — discover_telescopes
# ---------------------------------------------------------------------------

class TestDiscoverTelescopes:
    def test_discover_returns_list(self, client: TestClient) -> None:
        mock_result = [{"host": "192.168.1.10", "port": 4700, "name": "Seestar S50"}]
        with patch("python.web_api.discover_telescopes", new=AsyncMock(return_value=mock_result)):
            resp = client.post("/api/discover_telescopes", json={})
        assert resp.status_code == 200

    def test_discover_empty_result(self, client: TestClient) -> None:
        with patch("python.web_api.discover_telescopes", new=AsyncMock(return_value=[])):
            resp = client.post("/api/discover_telescopes", json={})
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# API endpoint tests — add_telescope / remove_telescope
# ---------------------------------------------------------------------------

class TestAddRemoveTelescope:
    def test_add_telescope(self, client: TestClient) -> None:
        resp = client.post("/api/add_telescope", json={
            "config": {"host": "192.168.1.10", "port": 4700, "name": "Test"}
        })
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True
        assert "id" in body

    def test_remove_telescope(self, client: TestClient) -> None:
        # Add first
        client.post("/api/add_telescope", json={
            "config": {"host": "192.168.1.10", "port": 4700, "id": "test-scope"}
        })
        resp = client.post("/api/remove_telescope", json={"telescopeId": "test-scope"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True

    def test_remove_telescope_missing_id(self, client: TestClient) -> None:
        resp = client.post("/api/remove_telescope", json={})
        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# API endpoint tests — get_telescope_status
# ---------------------------------------------------------------------------

class TestGetTelescopeStatus:
    def test_no_telescopes_returns_not_connected(self, client: TestClient) -> None:
        resp = client.post("/api/get_telescope_status", json={})
        assert resp.status_code == 200
        assert resp.json()["connected"] is False

    def test_disconnected_telescope_returns_not_connected(self, client: TestClient) -> None:
        # Add but don't connect
        client.post("/api/add_telescope", json={
            "config": {"host": "192.168.1.10", "port": 4700, "id": "scope1"}
        })
        resp = client.post("/api/get_telescope_status", json={"telescopeId": "scope1"})
        assert resp.status_code == 200
        assert resp.json()["connected"] is False


# ---------------------------------------------------------------------------
# API endpoint tests — sessions
# ---------------------------------------------------------------------------

class TestSessions:
    def test_create_session(self, client: TestClient) -> None:
        resp = client.post("/api/planning_create_session", json={
            "params": {"name": "My Night Out"}
        })
        assert resp.status_code == 200
        # Response is a JSON-encoded string (double-encoded)
        body = json.loads(resp.json())
        assert body["name"] == "My Night Out"
        assert "id" in body

    def test_get_sessions_empty(self, client: TestClient) -> None:
        resp = client.post("/api/planning_get_sessions", json={})
        assert resp.status_code == 200
        sessions = json.loads(resp.json())
        assert sessions == []

    def test_create_then_get_sessions(self, client: TestClient) -> None:
        client.post("/api/planning_create_session", json={"params": {"name": "Night 1"}})
        resp = client.post("/api/planning_get_sessions", json={})
        sessions = json.loads(resp.json())
        assert len(sessions) == 1
        assert sessions[0]["name"] == "Night 1"

    def test_end_session(self, client: TestClient) -> None:
        create_resp = client.post("/api/planning_create_session", json={
            "params": {"name": "Test Session"}
        })
        session = json.loads(create_resp.json())
        session_id = session["id"]

        end_resp = client.post("/api/planning_end_session", json={"sessionId": session_id})
        assert end_resp.status_code == 200
        ended = json.loads(end_resp.json())
        assert ended["ended_at"] is not None

    def test_end_session_missing_id(self, client: TestClient) -> None:
        resp = client.post("/api/planning_end_session", json={})
        assert resp.status_code == 400

    def test_end_session_not_found(self, client: TestClient) -> None:
        resp = client.post("/api/planning_end_session", json={"sessionId": "nonexistent"})
        assert resp.status_code == 404

    def test_delete_session(self, client: TestClient) -> None:
        create_resp = client.post("/api/planning_create_session", json={
            "params": {"name": "To Delete"}
        })
        session = json.loads(create_resp.json())
        session_id = session["id"]

        del_resp = client.post("/api/planning_delete_session", json={"sessionId": session_id})
        assert del_resp.status_code == 200
        assert del_resp.json()["success"] is True

    def test_delete_session_missing_id(self, client: TestClient) -> None:
        resp = client.post("/api/planning_delete_session", json={})
        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# API endpoint tests — catalog commands
# ---------------------------------------------------------------------------

class TestCatalogCommands:
    def test_catalog_search(self, client: TestClient) -> None:
        resp = client.post("/api/catalog_search", json={"params": {"above_horizon_only": False}})
        assert resp.status_code == 200
        body = json.loads(resp.json())
        assert "objects" in body

    def test_catalog_quick_search_empty_query(self, client: TestClient) -> None:
        resp = client.post("/api/catalog_quick_search", json={})
        assert resp.status_code == 200
        body = json.loads(resp.json())
        assert body == {"suggestions": []}

    def test_catalog_quick_search_with_query(self, client: TestClient) -> None:
        resp = client.post("/api/catalog_quick_search", json={"query": "M42"})
        assert resp.status_code == 200
        body = json.loads(resp.json())
        assert "suggestions" in body

    def test_catalog_get_object_types(self, client: TestClient) -> None:
        resp = client.post("/api/catalog_get_object_types", json={})
        assert resp.status_code == 200
        body = json.loads(resp.json())
        assert "types" in body

    def test_catalog_get_solar_system(self, client: TestClient) -> None:
        resp = client.post("/api/catalog_get_solar_system", json={})
        assert resp.status_code == 200
        body = json.loads(resp.json())
        assert "objects" in body
        obj_ids = [o["id"] for o in body["objects"]]
        assert "sun" in obj_ids
        assert "moon" in obj_ids


# ---------------------------------------------------------------------------
# API endpoint tests — planning commands
# ---------------------------------------------------------------------------

class TestPlanningCommands:
    def test_planning_get_visibility(self, client: TestClient) -> None:
        resp = client.post("/api/planning_get_visibility", json={
            "target": {"name": "Polaris", "ra": 37.95, "dec": 89.26},
            "location": {"latitude": 45.0, "longitude": 0.0, "elevation": 0},
            "date": "2024-06-21",
        })
        assert resp.status_code == 200
        body = json.loads(resp.json())
        assert "target_name" in body
        assert "altitude" in body

    def test_planning_get_tonight_targets(self, client: TestClient) -> None:
        resp = client.post("/api/planning_get_tonight_targets", json={
            "location": {"latitude": 45.0, "longitude": 0.0, "elevation": 0},
            "limit": 5,
        })
        assert resp.status_code == 200
        # Returns a list (possibly empty depending on time of day/object altitude)
        body = json.loads(resp.json())
        assert isinstance(body, list)


# ---------------------------------------------------------------------------
# API endpoint tests — unknown command and stream endpoints
# ---------------------------------------------------------------------------

class TestMiscEndpoints:
    def test_unknown_command_returns_404(self, client: TestClient) -> None:
        resp = client.post("/api/nonexistent_command", json={})
        assert resp.status_code == 404

    def test_stream_unknown_telescope_404(self, client: TestClient) -> None:
        resp = client.get("/api/stream/UNKNOWNSERIAL123")
        assert resp.status_code == 404

    def test_stream_known_telescope_not_connected_503(self, client: TestClient) -> None:
        client.post("/api/add_telescope", json={
            "config": {"host": "192.168.1.10", "port": 4700, "id": "scope1"}
        })
        resp = client.get("/api/stream/scope1")
        assert resp.status_code == 503

    def test_snapshot_unknown_telescope_404(self, client: TestClient) -> None:
        resp = client.get("/api/snapshot/UNKNOWNSERIAL123")
        assert resp.status_code == 404

    def test_snapshot_known_telescope_not_connected_503(self, client: TestClient) -> None:
        client.post("/api/add_telescope", json={
            "config": {"host": "192.168.1.10", "port": 4700, "id": "scope2"}
        })
        resp = client.get("/api/snapshot/scope2")
        assert resp.status_code == 503

    def test_ssh_tunnel_status_missing_id(self, client: TestClient) -> None:
        resp = client.post("/api/ssh_tunnel_status", json={})
        assert resp.status_code == 400

    def test_ssh_tunnel_status_no_tunnel(self, client: TestClient) -> None:
        client.post("/api/add_telescope", json={
            "config": {"host": "192.168.1.10", "port": 4700, "id": "notunneled"}
        })
        resp = client.post("/api/ssh_tunnel_status", json={"telescopeId": "notunneled"})
        assert resp.status_code == 200
        assert resp.json()["active"] is False

    def test_frontend_not_built_returns_404(self, client: TestClient) -> None:
        resp = client.get("/nonexistent-page")
        assert resp.status_code == 404

    def test_get_ip_location_error_handled(self, client: TestClient) -> None:
        """get_ip_location should return success=False on network error."""
        import urllib.request
        with patch.object(urllib.request, "urlopen", side_effect=Exception("Network error")):
            resp = client.post("/api/get_ip_location", json={})
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is False


# ---------------------------------------------------------------------------
# Fixtures and helpers for connected-bridge tests
# ---------------------------------------------------------------------------

def _make_mock_bridge() -> MagicMock:
    """Return a mock SeestarBridge that appears connected."""
    bridge = MagicMock()
    bridge.client = MagicMock()  # Not None → _get_connected_bridge won't try to reconnect
    bridge.disconnect = AsyncMock(return_value={"success": True, "message": "Disconnected"})
    bridge.get_status = AsyncMock(return_value={"success": True, "state": {"battery": 85}})
    bridge.goto_target = AsyncMock(return_value={"success": True})
    bridge.park = AsyncMock(return_value={"success": True})
    bridge.move = AsyncMock(return_value={"success": True})
    bridge.stop_move = AsyncMock(return_value={"success": True})
    bridge.set_view_mode = AsyncMock(return_value={"success": True})
    bridge.focus = AsyncMock(return_value={"success": True})
    bridge.focus_increment = AsyncMock(return_value={"success": True})
    bridge.auto_focus = AsyncMock(return_value={"success": True})
    bridge.get_focuser_position = AsyncMock(return_value={"success": True, "position": 5000})
    bridge.set_gain = AsyncMock(return_value={"success": True})
    bridge.set_exposure = AsyncMock(return_value={"success": True})
    bridge.stop_goto = AsyncMock(return_value={"success": True})
    bridge.start_imaging = AsyncMock(return_value={"success": True})
    bridge.stop_imaging = AsyncMock(return_value={"success": True})
    return bridge


@pytest.fixture
def connected_client():
    """TestClient with a pre-connected telescope entry (mocked bridge)."""
    from python.web_api import TelescopeEntry
    bridge = _make_mock_bridge()
    entry = TelescopeEntry(id="scope1", host="192.168.1.10", port=4700, name="Test Scope")
    entry.bridge = bridge
    entry.connected = True
    web_api_module._telescopes["scope1"] = entry

    with TestClient(app) as c:
        yield c, bridge

    web_api_module._telescopes.clear()
    web_api_module._sessions.clear()


# ---------------------------------------------------------------------------
# Telescope operation tests (require connected bridge)
# ---------------------------------------------------------------------------

class TestTelescopeOperations:
    def test_disconnect_telescope(self, connected_client) -> None:
        client, bridge = connected_client
        resp = client.post("/api/disconnect_telescope", json={"telescopeId": "scope1"})
        assert resp.status_code == 200
        bridge.disconnect.assert_called_once()

    def test_disconnect_telescope_missing_id(self, connected_client) -> None:
        client, _ = connected_client
        resp = client.post("/api/disconnect_telescope", json={})
        assert resp.status_code == 400

    def test_get_telescope_status_connected(self, connected_client) -> None:
        client, bridge = connected_client
        resp = client.post("/api/get_telescope_status", json={"telescopeId": "scope1"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["connected"] is True
        assert body["batteryPercent"] == 85

    def test_get_telescope_status_failed_status_returns_not_connected(
        self, connected_client
    ) -> None:
        client, bridge = connected_client
        bridge.get_status = AsyncMock(return_value={"success": False})
        # After failed status, _get_connected_bridge is called for retry
        # Bridge.client is not None so it won't reconnect, just return the second status
        bridge.get_status = AsyncMock(side_effect=[
            {"success": False},  # first call
            {"success": False},  # retry call
        ])
        resp = client.post("/api/get_telescope_status", json={"telescopeId": "scope1"})
        assert resp.status_code == 200
        assert resp.json()["connected"] is False

    def test_goto_target(self, connected_client) -> None:
        client, bridge = connected_client
        resp = client.post("/api/goto_target", json={
            "telescopeId": "scope1",
            "targetName": "Orion Nebula",
            "ra": 83.82,
            "dec": -5.39,
        })
        assert resp.status_code == 200
        assert resp.json()["success"] is True

    def test_park_telescope(self, connected_client) -> None:
        client, bridge = connected_client
        resp = client.post("/api/park_telescope", json={"telescopeId": "scope1"})
        assert resp.status_code == 200
        assert resp.json()["success"] is True

    def test_telescope_move(self, connected_client) -> None:
        client, bridge = connected_client
        resp = client.post("/api/telescope_move", json={
            "telescopeId": "scope1", "direction": "n"
        })
        assert resp.status_code == 200
        assert resp.json()["success"] is True

    def test_telescope_stop_move(self, connected_client) -> None:
        client, bridge = connected_client
        resp = client.post("/api/telescope_stop_move", json={"telescopeId": "scope1"})
        assert resp.status_code == 200

    def test_telescope_set_view_mode(self, connected_client) -> None:
        client, bridge = connected_client
        resp = client.post("/api/telescope_set_view_mode", json={
            "telescopeId": "scope1", "mode": "star"
        })
        assert resp.status_code == 200

    def test_telescope_focus(self, connected_client) -> None:
        client, bridge = connected_client
        resp = client.post("/api/telescope_focus", json={
            "telescopeId": "scope1", "position": 5000
        })
        assert resp.status_code == 200

    def test_telescope_focus_increment(self, connected_client) -> None:
        client, bridge = connected_client
        resp = client.post("/api/telescope_focus_increment", json={
            "telescopeId": "scope1", "steps": 100
        })
        assert resp.status_code == 200

    def test_telescope_auto_focus(self, connected_client) -> None:
        client, bridge = connected_client
        resp = client.post("/api/telescope_auto_focus", json={"telescopeId": "scope1"})
        assert resp.status_code == 200

    def test_telescope_get_focuser_position(self, connected_client) -> None:
        client, bridge = connected_client
        resp = client.post("/api/telescope_get_focuser_position", json={"telescopeId": "scope1"})
        assert resp.status_code == 200
        assert resp.json()["position"] == 5000

    def test_telescope_set_gain(self, connected_client) -> None:
        client, bridge = connected_client
        resp = client.post("/api/telescope_set_gain", json={"telescopeId": "scope1", "gain": 80})
        assert resp.status_code == 200

    def test_telescope_set_exposure(self, connected_client) -> None:
        client, bridge = connected_client
        resp = client.post("/api/telescope_set_exposure", json={
            "telescopeId": "scope1", "exposureMs": 5000
        })
        assert resp.status_code == 200

    def test_telescope_stop_goto(self, connected_client) -> None:
        client, bridge = connected_client
        resp = client.post("/api/telescope_stop_goto", json={"telescopeId": "scope1"})
        assert resp.status_code == 200

    def test_imaging_start(self, connected_client) -> None:
        client, bridge = connected_client
        resp = client.post("/api/imaging_start", json={
            "telescopeId": "scope1", "exposureMs": 10000, "gain": 80
        })
        assert resp.status_code == 200

    def test_imaging_stop(self, connected_client) -> None:
        client, bridge = connected_client
        resp = client.post("/api/imaging_stop", json={"telescopeId": "scope1"})
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Imaging commands — mock processing functions
# ---------------------------------------------------------------------------

class TestImagingCommands:
    def test_imaging_get_stretch_modes(self, client: TestClient) -> None:
        with patch("python.web_api.get_stretch_modes", return_value=["linear", "asinh"]):
            resp = client.post("/api/imaging_get_stretch_modes", json={})
        assert resp.status_code == 200
        body = json.loads(resp.json())
        assert "linear" in body

    def test_imaging_get_enhancement_methods(self, client: TestClient) -> None:
        with patch("python.web_api.get_enhancement_methods", return_value=["sharpen", "denoise"]):
            resp = client.post("/api/imaging_get_enhancement_methods", json={})
        assert resp.status_code == 200

    def test_imaging_process_fits(self, client: TestClient) -> None:
        mock_result = {"image_id": "abc", "jpeg_b64": "..."}
        with patch("python.web_api.process_fits", return_value=mock_result):
            resp = client.post("/api/imaging_process_fits", json={"params": {}})
        assert resp.status_code == 200

    def test_imaging_enhance(self, client: TestClient) -> None:
        mock_result = {"image_id": "abc", "jpeg_b64": "enhanced..."}
        with patch("python.web_api.enhance_image", return_value=mock_result):
            resp = client.post("/api/imaging_enhance", json={"params": {}})
        assert resp.status_code == 200

    def test_imaging_cleanup(self, client: TestClient) -> None:
        with patch("python.web_api.cleanup_image", return_value={"success": True}):
            resp = client.post("/api/imaging_cleanup", json={"imageId": "abc123"})
        assert resp.status_code == 200

    def test_imaging_cleanup_missing_id(self, client: TestClient) -> None:
        resp = client.post("/api/imaging_cleanup", json={})
        assert resp.status_code == 400

    def test_imaging_plate_solve_base64(self, client: TestClient) -> None:
        mock_result = {"status": "success", "ra": 83.8}
        with patch("python.web_api.solve_image_base64", return_value=mock_result):
            resp = client.post("/api/imaging_plate_solve", json={
                "params": {"image_base64": "dGVzdA=="}
            })
        assert resp.status_code == 200

    def test_imaging_plate_solve_file(self, client: TestClient) -> None:
        mock_result = {"status": "failed", "error": "no solution"}
        with patch("python.web_api.solve_image_sync", return_value=mock_result):
            resp = client.post("/api/imaging_plate_solve", json={
                "params": {"image_path": "/tmp/test.fits"}
            })
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# connect_telescope with a mocked bridge
# ---------------------------------------------------------------------------

class TestConnectTelescope:
    def test_connect_telescope_success(self, client: TestClient) -> None:
        """connect_telescope creates bridge and connects."""
        mock_bridge = _make_mock_bridge()
        mock_bridge.client = None  # Force connect path
        mock_bridge.connect = AsyncMock(return_value={"success": True})
        mock_bridge.client = MagicMock()  # After connect, client is set

        with patch("python.web_api.SeestarBridge", return_value=mock_bridge):
            resp = client.post("/api/connect_telescope", json={
                "telescopeId": "192.168.1.10:4700",
            })
        assert resp.status_code == 200

    def test_connect_telescope_missing_id(self, client: TestClient) -> None:
        resp = client.post("/api/connect_telescope", json={})
        assert resp.status_code == 400

    def test_disconnect_already_disconnected(self, client: TestClient) -> None:
        """disconnect_telescope with no bridge returns success."""
        client.post("/api/add_telescope", json={
            "config": {"host": "192.168.1.10", "port": 4700, "id": "scope-dc"}
        })
        resp = client.post("/api/disconnect_telescope", json={"telescopeId": "scope-dc"})
        assert resp.status_code == 200
        assert resp.json()["success"] is True


# ---------------------------------------------------------------------------
# _get_or_create_entry edge cases
# ---------------------------------------------------------------------------

class TestGetOrCreateEntry:
    def test_update_host_on_existing_entry(self, connected_client) -> None:
        """If host differs from stored entry, bridge is cleared."""
        client, bridge = connected_client
        # Connect with a different host
        resp = client.post("/api/add_telescope", json={
            "config": {"id": "scope1", "host": "10.0.0.99", "port": 4700}
        })
        assert resp.status_code == 200

    def test_unknown_non_host_id_returns_400(self, client: TestClient) -> None:
        """A plain non-host ID that was never discovered should return 400."""
        resp = client.post("/api/get_telescope_status", json={"telescopeId": "SERIALNUM123"})
        assert resp.status_code == 400

    def test_auto_parse_ip_as_id(self, client: TestClient) -> None:
        """An IP:port string as telescope_id should be auto-parsed."""
        resp = client.post("/api/get_telescope_status", json={"telescopeId": "192.168.1.1:4700"})
        # Not connected (no bridge), but entry should be created
        assert resp.status_code == 200
        assert resp.json()["connected"] is False
