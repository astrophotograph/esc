"""Establish connection with Seestar."""

import asyncio
from asyncio import StreamReader, StreamWriter, IncompleteReadError
from typing import Callable, Optional
from pydantic import BaseModel
from loguru import logger as logging
import random


class SeestarConnection(BaseModel, arbitrary_types_allowed=True):
    """Connection with Seestar."""

    reader: StreamReader | None = None
    writer: StreamWriter | None = None
    host: str
    port: int
    written_messages: int = 0
    read_messages: int = 0
    _is_connected: bool = False
    _reconnect_attempts: int = 0
    _max_reconnect_attempts: int = 5
    _base_reconnect_delay: float = 1.0
    _max_reconnect_delay: float = 60.0
    connection_timeout: float = 10.0
    read_timeout: float = 30.0
    write_timeout: float = 10.0
    _should_reconnect_callback: Optional[Callable[[], bool]] = None
    _last_reconnect_log: float = 0.0
    _reconnect_log_interval: float = 30.0
    _reboot_detected: bool = False
    _last_reboot_time: float = 0.0

    def __init__(
        self,
        host: str,
        port: int,
        connection_timeout: float = 10.0,
        read_timeout: float = 30.0,
        write_timeout: float = 10.0,
        should_reconnect_callback: Optional[Callable[[], bool]] = None,
        **kwargs,
    ):
        super().__init__(
            host=host,
            port=port,
            connection_timeout=connection_timeout,
            read_timeout=read_timeout,
            write_timeout=write_timeout,
            _should_reconnect_callback=should_reconnect_callback,
            **kwargs,
        )

    async def open(self):
        """Open connection with Seestar."""
        try:
            self.reader, self.writer = await asyncio.wait_for(
                asyncio.open_connection(self.host, self.port),
                timeout=self.connection_timeout,
            )
            self._is_connected = True
            self._reconnect_attempts = 0
            self._last_reconnect_log = 0.0
            logging.info(
                f"Successfully connected to Seestar at {self.host}:{self.port}"
            )
        except asyncio.TimeoutError:
            self._is_connected = False
            logging.error(
                f"Connection timeout after {self.connection_timeout}s to {self.host}:{self.port}"
            )
            raise
        except Exception as e:
            self._is_connected = False
            logging.error(f"Failed to connect to Seestar: {e}")
            raise
        self.written_messages = 0
        self.read_messages = 0

    async def close(self):
        """Close connection with Seestar."""
        self._is_connected = False
        if self.writer:
            self.writer.close()
            await self.writer.wait_closed()
        self.reader = None
        self.writer = None

    def is_connected(self) -> bool:
        """Check if connection is established."""
        return (
            self._is_connected and self.reader is not None and self.writer is not None
        )
    
    def get_connection_stats(self) -> dict:
        """Get connection statistics."""
        return {
            "is_connected": self.is_connected(),
            "reconnect_attempts": self._reconnect_attempts,
            "max_reconnect_attempts": self._max_reconnect_attempts,
            "written_messages": self.written_messages,
            "read_messages": self.read_messages,
            "host": self.host,
            "port": self.port
        }

    def _is_connection_reset_error(self, error: Exception) -> bool:
        """Check if the error indicates a connection reset."""
        return isinstance(
            error,
            (
                ConnectionResetError,
                ConnectionAbortedError,
                BrokenPipeError,
                IncompleteReadError,
                OSError,
                asyncio.TimeoutError,
            ),
        )

    async def _reconnect_with_backoff(self) -> bool:
        """Attempt to reconnect with exponential backoff."""
        import time
        current_time = time.time()
        
        # Check if reconnection is allowed via callback
        if self._should_reconnect_callback and not self._should_reconnect_callback():
            logging.debug(
                f"Reconnection skipped for {self.host}:{self.port} due to callback check"
            )
            return False

        self._reconnect_attempts += 1
        
        # Check if this looks like a reboot (multiple failures within a short time)
        if not self._reboot_detected and self._reconnect_attempts >= 3:
            if current_time - self._last_reboot_time > 300:  # 5 minutes since last reboot
                self._reboot_detected = True
                self._last_reboot_time = current_time
                logging.info(
                    f"Telescope at {self.host}:{self.port} appears to be rebooting. "
                    f"Will continue reconnection attempts with reduced logging."
                )
        
        # Use exponential backoff but cap at max delay, don't give up after max attempts
        # Reset attempts counter periodically to prevent overflow and allow fresh logging
        if self._reconnect_attempts > 50:  # Reset after many attempts to refresh logging
            self._reconnect_attempts = 10
            
        # Use longer delays if reboot detected
        if self._reboot_detected:
            delay = min(
                5.0 * (2 ** min(self._reconnect_attempts - 1, 3)),  # Start at 5s for reboots
                self._max_reconnect_delay
            ) + random.uniform(0, 2)
        else:
            delay = min(
                self._base_reconnect_delay * (2 ** min(self._reconnect_attempts - 1, 6)),  # Cap exponential growth
                self._max_reconnect_delay
            ) + random.uniform(0, 1)

        # Only log reconnection attempts periodically to avoid spam
        if current_time - self._last_reconnect_log > self._reconnect_log_interval:
            logging.info(
                f"Attempting reconnection #{self._reconnect_attempts} to {self.host}:{self.port} in {delay:.2f}s"
            )
            self._last_reconnect_log = current_time
        else:
            logging.debug(
                f"Reconnection attempt #{self._reconnect_attempts} to {self.host}:{self.port} in {delay:.2f}s"
            )
            
        await asyncio.sleep(delay)

        try:
            await self.close()  # Ensure clean state
            await self.open()
            
            # Log successful reconnection appropriately based on context
            if self._reboot_detected:
                logging.info(
                    f"Successfully reconnected to {self.host}:{self.port} after reboot "
                    f"(took {self._reconnect_attempts} attempts)"
                )
                self._reboot_detected = False  # Clear reboot flag
            else:
                logging.info(
                    f"Successfully reconnected to {self.host}:{self.port} "
                    f"(after {self._reconnect_attempts} attempts)"
                )
            
            self._last_reconnect_log = 0.0  # Reset log throttling on success
            self._reconnect_attempts = 0  # Reset attempts counter
            return True
        except Exception as e:
            # Only log detailed error every few attempts to avoid spam
            if self._reconnect_attempts <= 3 or self._reconnect_attempts % 5 == 0:
                logging.warning(
                    f"Reconnection attempt #{self._reconnect_attempts} failed: {e}"
                )
            else:
                logging.debug(
                    f"Reconnection attempt #{self._reconnect_attempts} failed: {e}"
                )
            return False

    async def write(self, data: str):
        """Write data to Seestar with automatic reconnection on connection reset."""
        try:
            if not self.is_connected():
                raise ConnectionError("Not connected to Seestar")

            logging.trace(f"Writing to {self}: {data}")
            data += "\r\n"
            self.writer.write(data.encode())
            await asyncio.wait_for(self.writer.drain(), timeout=self.write_timeout)
            self.written_messages += 1
        except Exception as e:
            if self._is_connection_reset_error(e):
                # Reduce log verbosity for expected reboot scenarios
                if "[Errno 54]" in str(e) or "Connection reset by peer" in str(e):
                    logging.info(
                        f"Connection to {self.host}:{self.port} lost (telescope may be rebooting)"
                    )
                else:
                    logging.warning(
                        f"Connection reset detected while writing to {self}: {e}"
                    )
                await self.close()

                # Attempt reconnection
                if await self._reconnect_with_backoff():
                    logging.debug("Reconnection successful, retrying write operation")
                    # Retry the write operation once after reconnection
                    logging.trace(f"Retrying write to {self}: {data.strip()}")
                    self.writer.write(data.encode())
                    await asyncio.wait_for(
                        self.writer.drain(), timeout=self.write_timeout
                    )
                    self.written_messages += 1
                else:
                    logging.error(
                        "Failed to reconnect after connection reset during write"
                    )
                    raise ConnectionError("Failed to reconnect after connection reset")
            else:
                logging.error(f"Unexpected error while writing to {self}: {e}")
                await self.close()
                raise

    async def read(self) -> str | None:
        """Read data from Seestar with automatic reconnection on connection reset."""
        try:
            if not self.is_connected():
                return None

            data = await asyncio.wait_for(
                self.reader.readuntil(), timeout=self.read_timeout
            )
            self.read_messages += 1
            return data.decode().strip()
        except Exception as e:
            if self._is_connection_reset_error(e):
                # Reduce log verbosity for expected reboot scenarios
                if "[Errno 54]" in str(e) or "Connection reset by peer" in str(e):
                    logging.info(
                        f"Connection to {self.host}:{self.port} lost during read (telescope may be rebooting)"
                    )
                else:
                    logging.warning(
                        f"Connection reset detected while reading from {self}: {e}"
                    )
                await self.close()

                # Attempt reconnection
                if await self._reconnect_with_backoff():
                    logging.debug("Reconnection successful after read failure")
                    # Don't retry the read here, let the caller handle it
                    return None
                else:
                    logging.debug("Failed to reconnect after connection reset")
                    return None
            else:
                logging.error(f"Unexpected error while reading from {self}: {e}")
                await self.close()
                return None

    async def read_exactly(self, n: int) -> bytes | None:
        """Read exactly N bytes from Seestar with automatic reconnection on connection reset."""
        try:
            if not self.is_connected():
                return None

            data = await asyncio.wait_for(
                self.reader.readexactly(n), timeout=self.read_timeout
            )
            self.read_messages += 1
            return data
        except Exception as e:
            if self._is_connection_reset_error(e):
                logging.warning(
                    f"Connection reset detected while reading exactly {n} bytes from {self}: {e}"
                )
                await self.close()

                # Attempt reconnection
                if await self._reconnect_with_backoff():
                    logging.debug(
                        "Reconnection successful after read_exactly failure"
                    )
                    # Don't retry the read here, let the caller handle it
                    return None
                else:
                    logging.debug("Failed to reconnect after connection reset")
                    return None
            else:
                logging.error(
                    f"Unexpected error while reading exactly {n} bytes from {self}: {e}"
                )
                await self.close()
                return None
