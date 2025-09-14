"""
Stream Manager for tracking active telescope image streams.

This module tracks which telescope streams have active clients and
provides a grace period before cleaning up stream metadata when clients
disconnect. Each client still maintains its own connection to the telescope.
"""

import asyncio
import time
from typing import Dict, Optional, Set, AsyncGenerator
from dataclasses import dataclass, field
from loguru import logger
import weakref


@dataclass
class StreamInfo:
    """Information about an active stream."""
    telescope_id: str
    camera_id: int
    stream_task: Optional[asyncio.Task] = None
    last_client_disconnect: Optional[float] = None
    active_clients: Set[str] = field(default_factory=set)
    # Removed shared buffer - it was causing conflicts between multiple clients
    # Each client will now get frames directly from the telescope stream

    @property
    def is_active(self) -> bool:
        """Check if stream has active clients."""
        return len(self.active_clients) > 0

    @property
    def time_since_disconnect(self) -> float:
        """Time in seconds since last client disconnected."""
        if self.last_client_disconnect is None:
            return 0.0
        return time.time() - self.last_client_disconnect


class StreamManager:
    """Manages persistent telescope image streams."""

    # Time to keep stream alive after last client disconnects (seconds)
    STREAM_KEEPALIVE_TIMEOUT = 60.0  # Increased to 60 seconds for better stability

    # Time between cleanup checks (seconds)
    CLEANUP_INTERVAL = 10.0  # Increased to reduce overhead

    def __init__(self):
        self.streams: Dict[str, StreamInfo] = {}
        self.cleanup_task: Optional[asyncio.Task] = None
        self._lock = asyncio.Lock()
        self._client_generators = weakref.WeakSet()

    async def start(self):
        """Start the stream manager and cleanup task."""
        if self.cleanup_task is None or self.cleanup_task.done():
            self.cleanup_task = asyncio.create_task(self._cleanup_loop())
            logger.info("Stream manager started")

    async def stop(self):
        """Stop the stream manager and all active streams."""
        if self.cleanup_task and not self.cleanup_task.done():
            self.cleanup_task.cancel()
            try:
                await self.cleanup_task
            except asyncio.CancelledError:
                pass

        # Cancel all active streams
        async with self._lock:
            for stream_key, stream_info in self.streams.items():
                if stream_info.stream_task and not stream_info.stream_task.done():
                    stream_info.stream_task.cancel()
                    try:
                        await stream_info.stream_task
                    except asyncio.CancelledError:
                        pass
            self.streams.clear()

        logger.info("Stream manager stopped")

    async def _cleanup_loop(self):
        """Periodically clean up inactive streams."""
        while True:
            try:
                await asyncio.sleep(self.CLEANUP_INTERVAL)
                await self._cleanup_inactive_streams()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in cleanup loop: {e}")

    async def _cleanup_inactive_streams(self):
        """Remove streams that have been inactive for too long."""
        async with self._lock:
            to_remove = []

            for stream_key, stream_info in self.streams.items():
                # Check if stream should be cleaned up
                if (not stream_info.is_active and
                    stream_info.time_since_disconnect > self.STREAM_KEEPALIVE_TIMEOUT):

                    logger.info(f"Cleaning up inactive stream: {stream_key}")

                    # Cancel the stream task
                    if stream_info.stream_task and not stream_info.stream_task.done():
                        stream_info.stream_task.cancel()
                        try:
                            await stream_info.stream_task
                        except asyncio.CancelledError:
                            pass

                    to_remove.append(stream_key)

            # Remove cleaned up streams
            for key in to_remove:
                del self.streams[key]
                logger.debug(f"Removed stream: {key}")

    def get_stream_key(self, telescope_id: str, camera_id: int) -> str:
        """Generate a unique key for a stream."""
        return f"{telescope_id}:{camera_id}"

    async def register_client(self, telescope_id: str, camera_id: int, client_id: str) -> StreamInfo:
        """Register a new client for a stream."""
        stream_key = self.get_stream_key(telescope_id, camera_id)

        async with self._lock:
            if stream_key not in self.streams:
                # Create new stream info
                stream_info = StreamInfo(
                    telescope_id=telescope_id,
                    camera_id=camera_id
                )
                self.streams[stream_key] = stream_info
                logger.info(f"Created new stream: {stream_key}")
            else:
                stream_info = self.streams[stream_key]

            # Add client
            stream_info.active_clients.add(client_id)
            stream_info.last_client_disconnect = None  # Reset disconnect timer

            logger.debug(f"Client {client_id} registered for stream {stream_key}. "
                        f"Active clients: {len(stream_info.active_clients)}")

            return stream_info

    async def unregister_client(self, telescope_id: str, camera_id: int, client_id: str):
        """Unregister a client from a stream."""
        stream_key = self.get_stream_key(telescope_id, camera_id)

        async with self._lock:
            if stream_key in self.streams:
                stream_info = self.streams[stream_key]
                stream_info.active_clients.discard(client_id)

                if not stream_info.is_active:
                    stream_info.last_client_disconnect = time.time()
                    logger.info(f"Stream {stream_key} has no active clients. "
                              f"Will keep alive for {self.STREAM_KEEPALIVE_TIMEOUT} seconds")

                logger.debug(f"Client {client_id} unregistered from stream {stream_key}. "
                           f"Active clients: {len(stream_info.active_clients)}")

    async def get_or_create_stream(self, telescope_id: str, camera_id: int,
                                  image_generator_factory) -> AsyncGenerator:
        """
        Get an existing stream or create a new one.

        Args:
            telescope_id: ID of the telescope
            camera_id: Camera ID
            image_generator_factory: Callable that returns an async generator for images

        Returns:
            Async generator that yields image frames
        """
        stream_key = self.get_stream_key(telescope_id, camera_id)

        async with self._lock:
            if stream_key not in self.streams:
                stream_info = StreamInfo(
                    telescope_id=telescope_id,
                    camera_id=camera_id
                )
                self.streams[stream_key] = stream_info
            else:
                stream_info = self.streams[stream_key]

            # Start the telescope stream if not already running
            if stream_info.stream_task is None or stream_info.stream_task.done():
                stream_info.stream_task = asyncio.create_task(
                    self._telescope_stream_loop(stream_key, image_generator_factory)
                )
                logger.info(f"Started telescope stream for {stream_key}")

        return stream_info

    async def _telescope_stream_loop(self, stream_key: str, image_generator_factory):
        """Monitor loop that tracks when to clean up inactive streams."""
        logger.info(f"Stream monitor started for {stream_key}")

        try:
            # This loop just monitors the stream status, it doesn't consume frames
            # The actual frames are consumed by clients directly
            while stream_key in self.streams:
                stream_info = self.streams[stream_key]

                # Check if we should stop monitoring this stream
                if not stream_info.is_active and stream_info.time_since_disconnect > self.STREAM_KEEPALIVE_TIMEOUT:
                    logger.info(f"Stream {stream_key} exceeded keepalive timeout, removing from manager")
                    async with self._lock:
                        if stream_key in self.streams:
                            del self.streams[stream_key]
                    break

                # Check periodically
                await asyncio.sleep(1.0)

        except asyncio.CancelledError:
            logger.info(f"Stream monitor cancelled for {stream_key}")
            raise
        except Exception as e:
            logger.error(f"Error in stream monitor for {stream_key}: {e}")
        finally:
            logger.info(f"Stream monitor ended for {stream_key}")

    def get_stream_info(self, telescope_id: str, camera_id: int) -> Optional[StreamInfo]:
        """Get information about a stream."""
        stream_key = self.get_stream_key(telescope_id, camera_id)
        return self.streams.get(stream_key)

    def get_active_streams(self) -> Dict[str, dict]:
        """Get information about all active streams."""
        result = {}
        for key, info in self.streams.items():
            result[key] = {
                'telescope_id': info.telescope_id,
                'camera_id': info.camera_id,
                'active_clients': len(info.active_clients),
                'is_active': info.is_active,
                'time_since_disconnect': info.time_since_disconnect if not info.is_active else 0
            }
        return result


# Global stream manager instance
_stream_manager: Optional[StreamManager] = None


def get_stream_manager() -> StreamManager:
    """Get the global stream manager instance."""
    global _stream_manager
    if _stream_manager is None:
        _stream_manager = StreamManager()
    return _stream_manager