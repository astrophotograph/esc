"""Establish connection with Seestar."""
import asyncio
from asyncio import StreamReader, StreamWriter, IncompleteReadError
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


    async def open(self):
        """Open connection with Seestar."""
        try:
            self.reader, self.writer = await asyncio.open_connection(self.host, self.port)
            self._is_connected = True
            self._reconnect_attempts = 0
            logging.info(f"Successfully connected to Seestar at {self.host}:{self.port}")
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
        return self._is_connected and self.reader is not None and self.writer is not None

    def _is_connection_reset_error(self, error: Exception) -> bool:
        """Check if the error indicates a connection reset."""
        return isinstance(error, (
            ConnectionResetError,
            ConnectionAbortedError,
            BrokenPipeError,
            IncompleteReadError,
            OSError
        ))

    async def _reconnect_with_backoff(self) -> bool:
        """Attempt to reconnect with exponential backoff."""
        if self._reconnect_attempts >= self._max_reconnect_attempts:
            logging.error(f"Max reconnection attempts ({self._max_reconnect_attempts}) reached for {self.host}:{self.port}")
            return False

        self._reconnect_attempts += 1
        delay = self._base_reconnect_delay * (2 ** (self._reconnect_attempts - 1)) + random.uniform(0, 1)
        
        logging.info(f"Attempting reconnection {self._reconnect_attempts}/{self._max_reconnect_attempts} to {self.host}:{self.port} in {delay:.2f}s")
        await asyncio.sleep(delay)
        
        try:
            await self.close()  # Ensure clean state
            await self.open()
            logging.info(f"Successfully reconnected to {self.host}:{self.port}")
            return True
        except Exception as e:
            logging.error(f"Reconnection attempt {self._reconnect_attempts} failed: {e}")
            return False

    async def write(self, data: str):
        """Write data to Seestar with automatic reconnection on connection reset."""
        try:
            if not self.is_connected():
                raise ConnectionError("Not connected to Seestar")
                
            logging.trace(f"Writing to {self}: {data}")
            data += "\r\n"
            self.writer.write(data.encode())
            await self.writer.drain()
            self.written_messages += 1
        except Exception as e:
            if self._is_connection_reset_error(e):
                logging.warning(f"Connection reset detected while writing to {self}: {e}")
                await self.close()
                
                # Attempt reconnection
                if await self._reconnect_with_backoff():
                    logging.info(f"Reconnection successful, retrying write operation")
                    # Retry the write operation once after reconnection
                    logging.trace(f"Retrying write to {self}: {data.strip()}")
                    data += "\r\n"
                    self.writer.write(data.encode())
                    await self.writer.drain()
                    self.written_messages += 1
                else:
                    logging.error(f"Failed to reconnect after connection reset during write")
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
                
            data = await self.reader.readuntil()
            self.read_messages += 1
            return data.decode().strip()
        except Exception as e:
            if self._is_connection_reset_error(e):
                logging.warning(f"Connection reset detected while reading from {self}: {e}")
                await self.close()
                
                # Attempt reconnection
                if await self._reconnect_with_backoff():
                    logging.info(f"Reconnection successful, retrying read operation")
                    # Don't retry the read here, let the caller handle it
                    return None
                else:
                    logging.error(f"Failed to reconnect after connection reset")
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
                
            data = await self.reader.readexactly(n)
            self.read_messages += 1
            return data
        except Exception as e:
            if self._is_connection_reset_error(e):
                logging.warning(f"Connection reset detected while reading exactly {n} bytes from {self}: {e}")
                await self.close()
                
                # Attempt reconnection
                if await self._reconnect_with_backoff():
                    logging.info(f"Reconnection successful, retrying read_exactly operation")
                    # Don't retry the read here, let the caller handle it
                    return None
                else:
                    logging.error(f"Failed to reconnect after connection reset")
                    return None
            else:
                logging.error(f"Unexpected error while reading exactly {n} bytes from {self}: {e}")
                await self.close()
                return None