"""Establish connection with Seestar."""
import asyncio
from asyncio import StreamReader, StreamWriter, IncompleteReadError
from pydantic import BaseModel
from loguru import logger as logging

class SeestarConnection(BaseModel, arbitrary_types_allowed=True):
    """Connection with Seestar."""
    reader: StreamReader | None = None
    writer: StreamWriter | None = None
    host: str
    port: int
    written_messages: int = 0
    read_messages: int = 0


    async def open(self):
        """Open connection with Seestar."""
        try:
            self.reader, self.writer = await asyncio.open_connection(self.host, self.port)
        except Exception as e:
            logging.error(f"Failed to connect to Seestar: {e}")
        self.written_messages = 0
        self.read_messages = 0


    async def close(self):
        """Close connection with Seestar."""
        self.writer.close()
        await self.writer.wait_closed()

    async def write(self, data: str):
        """Write data to Seestar."""
        logging.trace(f"Writing to {self}: {data}")
        data += "\r\n"
        self.writer.write(data.encode())
        await self.writer.drain()

    async def read(self) -> str | None:
        """Read data from Seestar."""
        try:
            data = await self.reader.readuntil()
            return data.decode().strip()
        except IncompleteReadError as e:
            # hm... might have conflict with another coroutine...
            logging.error(f"Error while reading from {self}: {e}")
            await self.close()

    async def read_exactly(self, n: int) -> bytes | None:
        """Read exactly N bytes from Seestar as bytes."""
        try:
            return await self.reader.readexactly(n)
        except IncompleteReadError as e:
            # hm... might have conflict with another coroutine...
            logging.error(f"Error while reading from {self}: {e}")
            await self.close()
            return None