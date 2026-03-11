"""
Tests for telescope discovery — mocks scopinator's discover_seestars.
"""
import asyncio
from unittest.mock import AsyncMock, patch

import pytest

from telescope.discovery import discover_telescopes, discover_telescopes_sync


def _run(coro):
    return asyncio.run(coro)


def _make_device(address: str = "192.168.1.50", sn: str = "SN001") -> dict:
    return {
        "address": address,
        "data": {
            "result": {
                "sn": sn,
                "product_model": "Seestar S50",
                "ssid": "Seestar_S50_SN001",
            }
        },
    }


class TestDiscoverTelescopes:
    def test_returns_discovered_devices(self):
        mock_devices = [_make_device("192.168.1.50", "SN001")]

        with patch(
            "telescope.discovery.discover_seestars",
            AsyncMock(return_value=mock_devices),
        ):
            result = _run(discover_telescopes(timeout=1.0))

        assert len(result) == 1
        assert result[0]["host"] == "192.168.1.50"
        assert result[0]["port"] == 4700
        assert result[0]["serial_number"] == "SN001"
        assert result[0]["product_model"] == "Seestar S50"
        assert result[0]["ssid"] == "Seestar_S50_SN001"
        assert result[0]["discovery_method"] == "auto_discovery"

    def test_multiple_devices_returned(self):
        mock_devices = [
            _make_device("192.168.1.50", "SN001"),
            _make_device("192.168.1.51", "SN002"),
        ]

        with patch(
            "telescope.discovery.discover_seestars",
            AsyncMock(return_value=mock_devices),
        ):
            result = _run(discover_telescopes())

        assert len(result) == 2

    def test_excludes_device_without_host(self):
        """Devices with empty address should be filtered out."""
        mock_devices = [
            {"address": "", "data": {"result": {"sn": "NOHOST"}}},
            _make_device("192.168.1.50", "SN001"),
        ]

        with patch(
            "telescope.discovery.discover_seestars",
            AsyncMock(return_value=mock_devices),
        ):
            result = _run(discover_telescopes())

        assert len(result) == 1
        assert result[0]["host"] == "192.168.1.50"

    def test_exception_returns_empty_list(self):
        """Any exception from discover_seestars should return an empty list."""
        with patch(
            "telescope.discovery.discover_seestars",
            AsyncMock(side_effect=OSError("Network error")),
        ):
            result = _run(discover_telescopes())

        assert result == []

    def test_empty_response_returns_empty_list(self):
        with patch(
            "telescope.discovery.discover_seestars",
            AsyncMock(return_value=[]),
        ):
            result = _run(discover_telescopes())

        assert result == []

    def test_device_with_missing_data_fields(self):
        """Device missing nested data fields should not crash."""
        mock_devices = [{"address": "192.168.1.50", "data": {}}]

        with patch(
            "telescope.discovery.discover_seestars",
            AsyncMock(return_value=mock_devices),
        ):
            result = _run(discover_telescopes())

        assert len(result) == 1
        assert result[0]["serial_number"] == ""
        assert result[0]["product_model"] == ""


class TestDiscoverTelescopesSync:
    def test_sync_wrapper_returns_same_as_async(self):
        mock_devices = [_make_device("192.168.1.50", "SN001")]

        with patch(
            "telescope.discovery.discover_seestars",
            AsyncMock(return_value=mock_devices),
        ):
            result = discover_telescopes_sync(timeout=1.0)

        assert len(result) == 1
        assert result[0]["host"] == "192.168.1.50"
