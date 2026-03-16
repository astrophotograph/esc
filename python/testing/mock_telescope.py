"""Mock Seestar telescope server that replays captured sessions.

Runs two TCP servers:
  - Port 4700: JSON-RPC command/control (text, \\r\\n delimited)
  - Port 4800: Binary imaging stream (80-byte header + payload)

Cross-port behavior: commands on 4700 (like begin_streaming) trigger
frame emission on 4800, matching real Seestar behavior.

Usage:
    python -m python.testing.mock_telescope --session path/to/session/
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import struct
from pathlib import Path
from typing import Any

from .session import ControlEntry, Session

logger = logging.getLogger(__name__)

# Methods that affect the imaging stream
STREAMING_START_METHODS = {"begin_streaming"}
STREAMING_STOP_METHODS = {"stop_streaming"}
STACKED_IMAGE_METHODS = {"get_stacked_img"}
GOTO_METHODS = {"iscope_start_view", "goto_target"}
GOTO_STOP_METHODS = {"stop_goto_target", "scope_park"}


class TelescopeState:
    """Cross-port state machine tracking telescope mode."""

    def __init__(self) -> None:
        self.is_streaming = False
        self.is_goto = False
        self.view_mode: str | None = None
        self.client_connected = False
        self.imaging_connected = False

    def __repr__(self) -> str:
        return (
            f"TelescopeState(streaming={self.is_streaming}, "
            f"goto={self.is_goto}, view={self.view_mode})"
        )


class ControlServer:
    """Port 4700 JSON-RPC server."""

    def __init__(
        self,
        session: Session,
        state: TelescopeState,
        stream_event: asyncio.Event,
        stack_event: asyncio.Event,
    ) -> None:
        self.session = session
        self.state = state
        self.stream_event = stream_event
        self.stack_event = stack_event
        self._response_map = self._build_response_map()
        self._response_cursors: dict[str, int] = {}
        self._event_schedule = self._build_event_schedule()
        self._server: asyncio.Server | None = None
        self._event_task: asyncio.Task[None] | None = None

    def _build_response_map(self) -> dict[str, list[dict]]:
        """Index captured responses by method name."""
        response_map: dict[str, list[dict]] = {}
        for msg in self.session.get_responses():
            method = msg.method
            if method:
                response_map.setdefault(method, []).append(msg.parsed)
        return response_map

    def _build_event_schedule(self) -> list[tuple[float, dict]]:
        """Extract async events with relative timestamps."""
        events = self.session.get_events()
        if not events:
            return []

        start_time = self.session.get_session_start_time()
        schedule = []
        for evt in events:
            relative_time = max(0.0, evt.timestamp - start_time)
            schedule.append((relative_time, evt.parsed))
        return schedule

    def _get_response(self, method: str, caller_id: int) -> dict | None:
        """Get the next captured response for a method, substituting the caller's id."""
        responses = self._response_map.get(method)
        if not responses:
            return None

        # Round-robin through captured responses
        cursor = self._response_cursors.get(method, 0)
        response = responses[cursor % len(responses)]
        self._response_cursors[method] = cursor + 1

        # Clone and substitute the caller's id
        result = dict(response)
        result["id"] = caller_id
        return result

    def _make_default_response(self, method: str, caller_id: int) -> dict:
        """Generate a default success response for unknown methods."""
        return {
            "id": caller_id,
            "jsonrpc": "2.0",
            "method": method,
            "code": 0,
            "result": None,
        }

    async def handle_client(
        self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter
    ) -> None:
        """Handle a single control client connection."""
        addr = writer.get_extra_info("peername")
        logger.info("Control client connected: %s", addr)
        self.state.client_connected = True

        # Start event emitter
        self._event_task = asyncio.create_task(self._emit_events(writer))

        try:
            while True:
                try:
                    line = await asyncio.wait_for(reader.readline(), timeout=60.0)
                except asyncio.TimeoutError:
                    continue

                if not line:
                    break

                text = line.decode("utf-8", errors="replace").strip()
                if not text:
                    continue

                try:
                    request = json.loads(text)
                except json.JSONDecodeError:
                    logger.warning("Invalid JSON from client: %s", text[:100])
                    continue

                response = self._handle_request(request)
                if response:
                    response_line = json.dumps(response) + "\r\n"
                    writer.write(response_line.encode("utf-8"))
                    await writer.drain()

        except (ConnectionResetError, BrokenPipeError):
            logger.info("Control client disconnected: %s", addr)
        except Exception:
            logger.exception("Error handling control client")
        finally:
            self.state.client_connected = False
            if self._event_task:
                self._event_task.cancel()
            writer.close()

    def _handle_request(self, request: dict) -> dict | None:
        """Process a JSON-RPC request and return response."""
        method = request.get("method")
        caller_id = request.get("id")

        if method is None or caller_id is None:
            return None

        logger.info("Control request: method=%s id=%s", method, caller_id)

        # Handle side effects
        method_lower = method.lower()
        if method_lower in STREAMING_START_METHODS or method == "begin_streaming":
            self.state.is_streaming = True
            self.stream_event.set()
            logger.info("Streaming started")
        elif method_lower in STREAMING_STOP_METHODS or method == "stop_streaming":
            self.state.is_streaming = False
            self.stream_event.clear()
            logger.info("Streaming stopped")
        elif method_lower in STACKED_IMAGE_METHODS:
            self.stack_event.set()
        elif method_lower in GOTO_METHODS:
            self.state.is_goto = True
            logger.info("GOTO started")
        elif method_lower in GOTO_STOP_METHODS:
            self.state.is_goto = False
            logger.info("GOTO stopped")

        # Look up captured response
        response = self._get_response(method, caller_id)
        if response is None:
            logger.debug("No captured response for method=%s, using default", method)
            response = self._make_default_response(method, caller_id)

        return response

    async def _emit_events(self, writer: asyncio.StreamWriter) -> None:
        """Background task: emit async events on captured timers."""
        if not self._event_schedule:
            # No events to emit — just emit PiStatus every 5 seconds
            while True:
                await asyncio.sleep(5.0)
                event = {
                    "Event": "PiStatus",
                    "Timestamp": "",
                    "temp": 35.0,
                    "battery_capacity": 80,
                    "charger_state": 0,
                }
                try:
                    writer.write((json.dumps(event) + "\r\n").encode("utf-8"))
                    await writer.drain()
                except (ConnectionResetError, BrokenPipeError):
                    return
            return

        # Replay captured events
        start = asyncio.get_event_loop().time()

        for relative_time, event_data in self._event_schedule:
            # Wait until the scheduled time
            now = asyncio.get_event_loop().time() - start
            delay = relative_time - now
            if delay > 0:
                await asyncio.sleep(delay)

            try:
                writer.write((json.dumps(event_data) + "\r\n").encode("utf-8"))
                await writer.drain()
            except (ConnectionResetError, BrokenPipeError):
                return

        # After replaying all events, loop PiStatus events
        pi_events = [
            evt for _, evt in self._event_schedule if evt.get("Event") == "PiStatus"
        ]
        if not pi_events:
            return

        while True:
            for evt in pi_events:
                await asyncio.sleep(5.0)
                try:
                    writer.write((json.dumps(evt) + "\r\n").encode("utf-8"))
                    await writer.drain()
                except (ConnectionResetError, BrokenPipeError):
                    return

    async def start(self, host: str, port: int) -> None:
        self._server = await asyncio.start_server(self.handle_client, host, port)
        logger.info("Control server listening on %s:%d", host, port)

    async def stop(self) -> None:
        if self._server:
            self._server.close()
            await self._server.wait_closed()


class ImagingServer:
    """Port 4800 binary imaging server."""

    def __init__(
        self,
        session: Session,
        state: TelescopeState,
        stream_event: asyncio.Event,
        stack_event: asyncio.Event,
    ) -> None:
        self.session = session
        self.state = state
        self.stream_event = stream_event
        self.stack_event = stack_event
        self._preview_frames = self._load_frames("preview")
        self._stack_frames = self._load_frames("stack")
        self._server: asyncio.Server | None = None

    def _load_frames(self, kind: str) -> list[tuple[bytes, bytes]]:
        """Load frame files of a given kind."""
        paths = self.session.get_frame_paths(kind=kind)
        frames = []
        for path in paths:
            header, payload = self.session.read_frame(path)
            frames.append((header, payload))
        return frames

    async def handle_client(
        self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter
    ) -> None:
        """Handle a single imaging client connection."""
        addr = writer.get_extra_info("peername")
        logger.info("Imaging client connected: %s", addr)
        self.state.imaging_connected = True

        preview_task = asyncio.create_task(self._serve_preview_loop(writer))
        stack_task = asyncio.create_task(self._serve_stack_on_demand(writer))

        try:
            # Keep connection alive until client disconnects
            while True:
                data = await reader.read(1024)
                if not data:
                    break
        except (ConnectionResetError, BrokenPipeError):
            pass
        finally:
            self.state.imaging_connected = False
            preview_task.cancel()
            stack_task.cancel()
            writer.close()
            logger.info("Imaging client disconnected: %s", addr)

    async def _serve_preview_loop(self, writer: asyncio.StreamWriter) -> None:
        """Emit preview frames in a loop while streaming is active."""
        while True:
            # Wait for streaming to be enabled
            await self.stream_event.wait()

            if not self._preview_frames:
                # No captured frames — generate a minimal dummy frame
                await asyncio.sleep(0.5)
                continue

            # Cycle through preview frames
            for header, payload in self._preview_frames:
                if not self.stream_event.is_set():
                    break
                try:
                    writer.write(header + payload)
                    await writer.drain()
                except (ConnectionResetError, BrokenPipeError):
                    return

                # ~2 FPS matches typical Seestar preview rate
                await asyncio.sleep(0.5)

    async def _serve_stack_on_demand(self, writer: asyncio.StreamWriter) -> None:
        """Send a stacked image frame when triggered."""
        while True:
            await self.stack_event.wait()
            self.stack_event.clear()

            if not self._stack_frames:
                logger.warning("Stack requested but no captured stack frames")
                continue

            # Send the first stack frame (or cycle through them)
            header, payload = self._stack_frames[0]
            try:
                writer.write(header + payload)
                await writer.drain()
                logger.info("Sent stacked image frame (%d bytes)", len(payload))
            except (ConnectionResetError, BrokenPipeError):
                return

    async def start(self, host: str, port: int) -> None:
        self._server = await asyncio.start_server(self.handle_client, host, port)
        logger.info("Imaging server listening on %s:%d", host, port)

    async def stop(self) -> None:
        if self._server:
            self._server.close()
            await self._server.wait_closed()


class MockTelescope:
    """Mock Seestar telescope that replays a captured session."""

    def __init__(
        self,
        session_dir: Path,
        host: str = "0.0.0.0",
        control_port: int = 4700,
        imaging_port: int = 4800,
    ) -> None:
        self.host = host
        self.control_port = control_port
        self.imaging_port = imaging_port

        self.session = Session.load(session_dir)
        self.state = TelescopeState()
        self.stream_event = asyncio.Event()
        self.stack_event = asyncio.Event()

        self.control_server = ControlServer(
            self.session, self.state, self.stream_event, self.stack_event
        )
        self.imaging_server = ImagingServer(
            self.session, self.state, self.stream_event, self.stack_event
        )

    async def start(self) -> None:
        """Start both TCP servers and run until interrupted."""
        await self.control_server.start(self.host, self.control_port)
        await self.imaging_server.start(self.host, self.imaging_port)

        manifest = self.session.manifest
        print(f"Mock Seestar Telescope")
        print(f"======================")
        print(f"  Control:  {self.host}:{self.control_port}")
        print(f"  Imaging:  {self.host}:{self.imaging_port}")
        print(f"  Session:  {self.session.session_dir}")
        if manifest.telescope_model:
            print(f"  Model:    {manifest.telescope_model}")
        if manifest.firmware_version:
            print(f"  Firmware: {manifest.firmware_version}")
        print(
            f"  Data:     {manifest.control_message_count} messages, "
            f"{manifest.frame_count} frames "
            f"({manifest.duration_seconds:.1f}s captured)"
        )
        print()
        print("Waiting for connections... (Ctrl+C to stop)")

        try:
            await asyncio.Future()  # Run forever
        except asyncio.CancelledError:
            pass

    async def stop(self) -> None:
        """Stop both servers."""
        await self.control_server.stop()
        await self.imaging_server.stop()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Mock Seestar telescope server — replays captured sessions."
    )
    parser.add_argument(
        "--session",
        type=Path,
        required=True,
        help="Path to session directory",
    )
    parser.add_argument("--host", default="0.0.0.0", help="Bind address (default: 0.0.0.0)")
    parser.add_argument(
        "--control-port", type=int, default=4700, help="Control port (default: 4700)"
    )
    parser.add_argument(
        "--imaging-port", type=int, default=4800, help="Imaging port (default: 4800)"
    )
    parser.add_argument("-v", "--verbose", action="store_true", help="Verbose logging")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s | %(levelname)-5s | %(message)s",
        datefmt="%H:%M:%S",
    )

    if not args.session.is_dir():
        print(f"Error: session directory not found: {args.session}")
        raise SystemExit(1)

    mock = MockTelescope(
        args.session,
        host=args.host,
        control_port=args.control_port,
        imaging_port=args.imaging_port,
    )

    try:
        asyncio.run(mock.start())
    except KeyboardInterrupt:
        print("\nShutting down mock telescope...")


if __name__ == "__main__":
    main()
