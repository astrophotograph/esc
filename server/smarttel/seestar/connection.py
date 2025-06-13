"""Establish connection with Seestar."""
import asyncio
from asyncio import StreamReader, StreamWriter, IncompleteReadError
from pydantic import BaseModel

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
        self.reader, self.writer = await asyncio.open_connection(self.host, self.port)
        self.written_messages = 0
        self.read_messages = 0


    async def close(self):
        """Close connection with Seestar."""
        self.writer.close()
        await self.writer.wait_closed()

    async def write(self, data: str):
        """Write data to Seestar."""
        data += "\n"
        self.writer.write(data.encode())
        await self.writer.drain()

    async def read(self) -> str | None:
        """Read data from Seestar."""
        try:
            data = await self.reader.readuntil()
            return data.decode().strip()
        except IncompleteReadError as e:
            print(f"Error while reading from {self}: {e}")
            await self.close()