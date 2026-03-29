"""
Tests for SSHTunnelManager — mocks asyncssh to avoid real SSH connections.
"""
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from networking.ssh_tunnel import SSHTunnelConfig, SSHTunnelManager


def _run(coro):
    return asyncio.run(coro)


def _make_config(ssh_host: str = "pi.local") -> SSHTunnelConfig:
    return SSHTunnelConfig(
        ssh_host=ssh_host,
        ssh_user="pi",
        remote_host="192.168.1.10",
        ssh_port=22,
    )


def _make_mock_connection(local_4700: int = 12001, local_4800: int = 12002) -> MagicMock:
    """Return a mock asyncssh connection that behaves like a real one."""
    listener_4700 = MagicMock()
    listener_4700.get_port.return_value = local_4700
    listener_4700.close = MagicMock()

    listener_4800 = MagicMock()
    listener_4800.get_port.return_value = local_4800
    listener_4800.close = MagicMock()

    conn = AsyncMock()
    conn.forward_local_port = AsyncMock(side_effect=[listener_4700, listener_4800])
    conn.close = MagicMock()
    conn.wait_closed = AsyncMock()
    conn.is_closed = MagicMock(return_value=False)
    conn.get_extra_info = MagicMock(return_value=MagicMock())  # transport not None
    return conn


# ---------------------------------------------------------------------------
# connect
# ---------------------------------------------------------------------------

class TestConnect:
    def test_connect_returns_port_mapping(self) -> None:
        config = _make_config()
        manager = SSHTunnelManager(config=config)
        mock_conn = _make_mock_connection(12001, 12002)

        with patch("networking.ssh_tunnel.asyncssh.connect", AsyncMock(return_value=mock_conn)):
            ports = _run(manager.connect())

        assert ports[4700] == 12001
        assert ports[4800] == 12002

    def test_connect_stores_local_ports(self) -> None:
        config = _make_config()
        manager = SSHTunnelManager(config=config)
        mock_conn = _make_mock_connection(13001, 13002)

        with patch("networking.ssh_tunnel.asyncssh.connect", AsyncMock(return_value=mock_conn)):
            _run(manager.connect())

        assert manager.local_ports[4700] == 13001
        assert manager.local_ports[4800] == 13002

    def test_connect_with_key_path(self) -> None:
        config = SSHTunnelConfig(
            ssh_host="pi.local", ssh_user="pi", remote_host="192.168.1.10",
            key_path="/home/user/.ssh/id_rsa"
        )
        manager = SSHTunnelManager(config=config)
        mock_conn = _make_mock_connection()
        mock_asyncssh_connect = AsyncMock(return_value=mock_conn)

        with patch("networking.ssh_tunnel.asyncssh.connect", mock_asyncssh_connect):
            _run(manager.connect())

        # Verify key_path was passed
        call_kwargs = mock_asyncssh_connect.call_args[1]
        assert "client_keys" in call_kwargs
        assert "/home/user/.ssh/id_rsa" in call_kwargs["client_keys"]

    def test_reconnect_disconnects_first(self) -> None:
        config = _make_config()
        manager = SSHTunnelManager(config=config)
        mock_conn = _make_mock_connection()

        with patch("networking.ssh_tunnel.asyncssh.connect", AsyncMock(return_value=mock_conn)):
            _run(manager.connect())
            # Inject existing connection
            manager._conn = mock_conn
            manager._listeners = [MagicMock()]
            # Connect again — should disconnect first
            mock_conn2 = _make_mock_connection(14001, 14002)
            with patch("networking.ssh_tunnel.asyncssh.connect", AsyncMock(return_value=mock_conn2)):
                ports = _run(manager.connect())
        assert ports[4700] == 14001


# ---------------------------------------------------------------------------
# disconnect
# ---------------------------------------------------------------------------

class TestDisconnect:
    def test_disconnect_clears_connection(self) -> None:
        config = _make_config()
        manager = SSHTunnelManager(config=config)
        mock_conn = _make_mock_connection()

        with patch("networking.ssh_tunnel.asyncssh.connect", AsyncMock(return_value=mock_conn)):
            _run(manager.connect())

        _run(manager.disconnect())

        assert manager._conn is None
        assert manager.local_ports == {}
        assert manager._listeners == []

    def test_disconnect_noop_when_not_connected(self) -> None:
        manager = SSHTunnelManager(config=_make_config())
        _run(manager.disconnect())  # Should not raise
        assert manager._conn is None

    def test_disconnect_closes_listeners(self) -> None:
        config = _make_config()
        manager = SSHTunnelManager(config=config)
        mock_conn = _make_mock_connection()

        with patch("networking.ssh_tunnel.asyncssh.connect", AsyncMock(return_value=mock_conn)):
            _run(manager.connect())

        # Capture the listeners before disconnect
        listener_mocks = list(manager._listeners)
        _run(manager.disconnect())

        for listener in listener_mocks:
            listener.close.assert_called_once()


# ---------------------------------------------------------------------------
# is_alive
# ---------------------------------------------------------------------------

class TestIsAlive:
    def test_is_alive_returns_false_when_not_connected(self) -> None:
        manager = SSHTunnelManager(config=_make_config())
        result = _run(manager.is_alive())
        assert result is False

    def test_is_alive_returns_true_when_connected_and_open(self) -> None:
        config = _make_config()
        manager = SSHTunnelManager(config=config)
        mock_conn = _make_mock_connection()

        with patch("networking.ssh_tunnel.asyncssh.connect", AsyncMock(return_value=mock_conn)):
            _run(manager.connect())

        result = _run(manager.is_alive())
        assert result is True  # is_closed() returns False → alive

    def test_is_alive_returns_false_when_transport_is_none(self) -> None:
        manager = SSHTunnelManager(config=_make_config())
        mock_conn = AsyncMock()
        mock_conn.get_extra_info = MagicMock(return_value=None)  # No transport
        mock_conn.is_closed = MagicMock(return_value=False)
        manager._conn = mock_conn

        result = _run(manager.is_alive())
        assert result is False

    def test_is_alive_returns_false_when_closed(self) -> None:
        manager = SSHTunnelManager(config=_make_config())
        mock_conn = AsyncMock()
        mock_conn.get_extra_info = MagicMock(return_value=MagicMock())
        mock_conn.is_closed = MagicMock(return_value=True)
        manager._conn = mock_conn

        result = _run(manager.is_alive())
        assert result is False
