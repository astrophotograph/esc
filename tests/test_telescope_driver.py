"""
Tests for the TelescopeDriver placeholder implementation.
"""
import pytest

from hardware.telescope_driver import TelescopeDriver, TelescopeProtocol, TelescopeStatus


class TestTelescopeDriver:
    def test_connect_returns_true(self) -> None:
        driver = TelescopeDriver(TelescopeProtocol.ALPACA, "device-1")
        assert driver.connect() is True
        assert driver._connected is True

    def test_disconnect_returns_true(self) -> None:
        driver = TelescopeDriver(TelescopeProtocol.ALPACA, "device-1")
        driver.connect()
        assert driver.disconnect() is True
        assert driver._connected is False

    def test_get_status_after_connect(self) -> None:
        driver = TelescopeDriver(TelescopeProtocol.INDI, "dev")
        driver.connect()
        status = driver.get_status()
        assert isinstance(status, TelescopeStatus)
        assert status.connected is True
        assert status.parked is True
        assert status.tracking is False

    def test_get_status_before_connect(self) -> None:
        driver = TelescopeDriver(TelescopeProtocol.ASCOM, "dev")
        status = driver.get_status()
        assert status.connected is False

    def test_slew_when_connected(self) -> None:
        driver = TelescopeDriver(TelescopeProtocol.ALPACA, "dev")
        driver.connect()
        assert driver.slew_to_coordinates(ra=83.82, dec=-5.39) is True

    def test_slew_when_disconnected_raises(self) -> None:
        driver = TelescopeDriver(TelescopeProtocol.ALPACA, "dev")
        with pytest.raises(RuntimeError, match="not connected"):
            driver.slew_to_coordinates(ra=0.0, dec=0.0)

    def test_park_when_connected(self) -> None:
        driver = TelescopeDriver(TelescopeProtocol.ALPACA, "dev")
        driver.connect()
        assert driver.park() is True

    def test_park_when_disconnected_raises(self) -> None:
        driver = TelescopeDriver(TelescopeProtocol.ALPACA, "dev")
        with pytest.raises(RuntimeError):
            driver.park()

    def test_start_tracking_when_connected(self) -> None:
        driver = TelescopeDriver(TelescopeProtocol.INDI, "dev")
        driver.connect()
        assert driver.start_tracking() is True

    def test_start_tracking_when_disconnected_raises(self) -> None:
        driver = TelescopeDriver(TelescopeProtocol.INDI, "dev")
        with pytest.raises(RuntimeError):
            driver.start_tracking()

    def test_stop_tracking_when_connected(self) -> None:
        driver = TelescopeDriver(TelescopeProtocol.ASCOM, "dev")
        driver.connect()
        assert driver.stop_tracking() is True

    def test_stop_tracking_when_disconnected_raises(self) -> None:
        driver = TelescopeDriver(TelescopeProtocol.ASCOM, "dev")
        with pytest.raises(RuntimeError):
            driver.stop_tracking()

    def test_all_protocols(self) -> None:
        for protocol in TelescopeProtocol:
            driver = TelescopeDriver(protocol, "test")
            assert driver.connect() is True
            assert driver._connected is True
