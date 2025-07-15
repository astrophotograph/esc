import asyncio
import re
from asyncio.streams import StreamReader, StreamWriter
from contextlib import closing
from typing import Tuple, Optional

import async_timeout

StreamPair = Tuple[StreamReader, StreamWriter]


class RawHTTPParser:
    pattern = re.compile(
        rb"(?P<method>[a-zA-Z]+) (?P<uri>(\w+://)?(?P<host>[^\s\'\"<>\[\]{}|/:]+)(:(?P<port>\d+))?[^\s\'\"<>\[\]{}|]*) "
    )
    uri: Optional[str] = None
    host: Optional[str] = None
    port: Optional[int] = None
    method: Optional[str] = None
    is_parse_error: bool = False

    def __init__(self, raw: bytes):
        rex = self.pattern.match(raw)
        if rex:
            to_int = RawHTTPParser.to_int
            to_str = RawHTTPParser.to_str

            self.uri = to_str(rex.group("uri"))
            self.host = to_str(rex.group("host"))
            self.method = to_str(rex.group("method"))
            self.port = to_int(rex.group("port"))
        else:
            self.is_parse_error = True

    @staticmethod
    def to_str(item: Optional[bytes]) -> Optional[str]:
        if item:
            return item.decode("charmap")

    @staticmethod
    def to_int(item: Optional[bytes]) -> Optional[int]:
        if item:
            return int(item)

    def __str__(self):
        return str(
            dict(URI=self.uri, HOST=self.host, PORT=self.port, METHOD=self.method)
        )


async def forward_stream(
    reader: StreamReader, writer: StreamWriter, event: asyncio.Event
):
    while not event.is_set():
        try:
            data = await asyncio.wait_for(reader.read(1024), 1)
        except asyncio.TimeoutError:
            continue

        if data == b"":  # when it closed
            event.set()
            break

        writer.write(data)
        await writer.drain()


async def relay_stream(local_stream: StreamPair, remote_stream: StreamPair):
    local_reader, local_writer = local_stream
    remote_reader, remote_writer = remote_stream

    close_event = asyncio.Event()

    await asyncio.gather(
        forward_stream(local_reader, remote_writer, close_event),
        forward_stream(remote_reader, local_writer, close_event),
    )


async def http_handler(
    reader: StreamReader, writer: StreamWriter, host: str, port: int
):
    remote_reader, remote_writer = await asyncio.open_connection(host, port)

    with closing(remote_writer):
        writer.write(b"HTTP/1.1 200 Connection Established\r\n\r\n")
        await writer.drain()

        await relay_stream((reader, writer), (remote_reader, remote_writer))
