"""SSH tunnel manager for remote Seestar connections.

Opens an SSH connection and forwards the Seestar's TCP ports (4700 command,
4800 imaging) through the tunnel so the local bridge can connect via localhost.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from typing import Any

import asyncssh

logger = logging.getLogger(__name__)

# The two TCP ports the Seestar exposes.
SEESTAR_PORTS = (4700, 4800)


@dataclass
class SSHTunnelConfig:
    """Configuration for an SSH tunnel to a remote Seestar."""

    ssh_host: str
    ssh_user: str
    remote_host: str
    ssh_port: int = 22
    key_path: str | None = None  # None = use default agent / ~/.ssh/id_rsa


@dataclass
class SSHTunnelManager:
    """Manages an SSH connection with local port forwards to a remote Seestar."""

    config: SSHTunnelConfig
    _conn: asyncssh.SSHClientConnection | None = field(default=None, init=False, repr=False)
    _listeners: list[Any] = field(default_factory=list, init=False, repr=False)
    local_ports: dict[int, int] = field(default_factory=dict, init=False)

    async def connect(self) -> dict[int, int]:
        """Open the SSH connection and forward Seestar ports.

        Returns a mapping of ``{remote_port: local_port}`` so the caller
        knows which localhost ports to connect the bridge to.
        """
        if self._conn is not None:
            await self.disconnect()

        cfg = self.config

        connect_kwargs: dict[str, Any] = {
            "host": cfg.ssh_host,
            "port": cfg.ssh_port,
            "username": cfg.ssh_user,
            "known_hosts": None,  # accept any host key (typical for Pi on LAN)
        }
        if cfg.key_path:
            connect_kwargs["client_keys"] = [cfg.key_path]

        logger.info(
            "SSH: connecting to %s@%s:%d",
            cfg.ssh_user,
            cfg.ssh_host,
            cfg.ssh_port,
        )
        self._conn = await asyncssh.connect(**connect_kwargs)

        self.local_ports = {}
        for remote_port in SEESTAR_PORTS:
            listener = await self._conn.forward_local_port(
                "",  # bind to localhost
                0,  # OS picks a free port
                cfg.remote_host,
                remote_port,
            )
            local_port = listener.get_port()
            self._listeners.append(listener)
            self.local_ports[remote_port] = local_port
            logger.info(
                "SSH: forwarding localhost:%d -> %s:%d",
                local_port,
                cfg.remote_host,
                remote_port,
            )

        return dict(self.local_ports)

    async def disconnect(self) -> None:
        """Close all port-forward listeners and the SSH connection."""
        for listener in self._listeners:
            listener.close()
        self._listeners.clear()

        if self._conn is not None:
            self._conn.close()
            await asyncio.wait_for(self._conn.wait_closed(), timeout=5.0)
            self._conn = None

        self.local_ports.clear()
        logger.info("SSH: tunnel closed")

    async def is_alive(self) -> bool:
        """Return True if the SSH connection is still open."""
        if self._conn is None:
            return False
        transport = self._conn.get_extra_info("transport")
        if transport is None:
            return False
        return not self._conn.is_closed()
