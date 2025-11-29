"""
Pytest configuration and fixtures for telescope integration tests.
"""
import os
import pytest

# Default telescope IP for integration tests
TELESCOPE_HOST = os.environ.get("TELESCOPE_HOST", "192.168.42.41")
TELESCOPE_PORT = int(os.environ.get("TELESCOPE_PORT", "4700"))


def pytest_addoption(parser):
    """Add command line options for integration tests."""
    parser.addoption(
        "--telescope-host",
        action="store",
        default=TELESCOPE_HOST,
        help="Telescope IP address (default: 192.168.42.41)",
    )
    parser.addoption(
        "--telescope-port",
        action="store",
        default=TELESCOPE_PORT,
        type=int,
        help="Telescope port (default: 4700)",
    )


@pytest.fixture
def telescope_host(request) -> str:
    """Get telescope host from command line or environment."""
    return request.config.getoption("--telescope-host")


@pytest.fixture
def telescope_port(request) -> int:
    """Get telescope port from command line or environment."""
    return request.config.getoption("--telescope-port")
