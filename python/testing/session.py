"""Session file format for captured Seestar telescope interactions.

A session directory contains:
  manifest.json   — metadata (capture date, frame count, etc.)
  control.jsonl   — port 4700 messages (one JSON object per line)
  frames/         — binary frame files from port 4800
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field


class SessionManifest(BaseModel):
    """Metadata for a captured session."""

    capture_date: str
    telescope_model: str | None = None
    firmware_version: str | None = None
    frame_count: int = 0
    preview_frame_count: int = 0
    stack_frame_count: int = 0
    control_message_count: int = 0
    duration_seconds: float = 0.0
    source_pcap: str | None = None


class ControlEntry(BaseModel):
    """Single line in control.jsonl."""

    timestamp: float
    direction: Literal["client", "telescope"]
    raw: str  # Original JSON string

    @property
    def parsed(self) -> dict:
        """Lazily parse the raw JSON."""
        return json.loads(self.raw)

    @property
    def method(self) -> str | None:
        d = self.parsed
        return d.get("method")

    @property
    def msg_id(self) -> int | None:
        d = self.parsed
        val = d.get("id")
        return int(val) if val is not None else None

    @property
    def is_event(self) -> bool:
        return "Event" in self.parsed

    @property
    def is_response(self) -> bool:
        d = self.parsed
        return "code" in d or "result" in d

    @property
    def is_request(self) -> bool:
        d = self.parsed
        return "method" in d and not self.is_response and not self.is_event


class Session:
    """Load and manage a captured telescope session."""

    def __init__(self, session_dir: Path) -> None:
        self.session_dir = Path(session_dir)
        self.manifest: SessionManifest
        self._control_messages: list[ControlEntry] = []
        self._frame_paths: list[Path] = []

    @classmethod
    def load(cls, session_dir: Path) -> Session:
        """Load session from directory."""
        session = cls(session_dir)

        manifest_path = session.session_dir / "manifest.json"
        if not manifest_path.exists():
            raise FileNotFoundError(f"No manifest.json in {session_dir}")
        session.manifest = SessionManifest.model_validate_json(manifest_path.read_text())

        control_path = session.session_dir / "control.jsonl"
        if control_path.exists():
            for line in control_path.read_text().splitlines():
                line = line.strip()
                if line:
                    session._control_messages.append(ControlEntry.model_validate_json(line))

        frames_dir = session.session_dir / "frames"
        if frames_dir.is_dir():
            session._frame_paths = sorted(frames_dir.glob("*.bin"))

        return session

    @classmethod
    def create(
        cls,
        session_dir: Path,
        manifest: SessionManifest,
        control_messages: list[ControlEntry],
        frames: list[tuple[bytes, bytes, int]],  # (header, payload, frame_id)
    ) -> Session:
        """Create a new session directory with data."""
        session_dir = Path(session_dir)
        session_dir.mkdir(parents=True, exist_ok=True)

        # Write manifest
        (session_dir / "manifest.json").write_text(
            manifest.model_dump_json(indent=2)
        )

        # Write control messages
        with open(session_dir / "control.jsonl", "w") as f:
            for msg in control_messages:
                f.write(msg.model_dump_json() + "\n")

        # Write frames
        frames_dir = session_dir / "frames"
        frames_dir.mkdir(exist_ok=True)
        for i, (header, payload, frame_id) in enumerate(frames):
            kind = "stack" if frame_id == 23 else "preview"
            path = frames_dir / f"frame_{i:04d}_{kind}.bin"
            path.write_bytes(header + payload)

        session = cls(session_dir)
        session.manifest = manifest
        session._control_messages = control_messages
        session._frame_paths = sorted(frames_dir.glob("*.bin"))
        return session

    def get_control_messages(self) -> list[ControlEntry]:
        """Return all control messages in order."""
        return list(self._control_messages)

    def get_requests(self) -> list[ControlEntry]:
        """Return only client-to-telescope requests."""
        return [m for m in self._control_messages if m.direction == "client" and m.is_request]

    def get_responses(self) -> list[ControlEntry]:
        """Return only telescope-to-client responses (not events)."""
        return [m for m in self._control_messages if m.direction == "telescope" and m.is_response]

    def get_events(self) -> list[ControlEntry]:
        """Return only async events from the telescope."""
        return [m for m in self._control_messages if m.is_event]

    def get_responses_for_method(self, method: str) -> list[ControlEntry]:
        """Find all responses matching a method name."""
        return [
            m
            for m in self._control_messages
            if m.direction == "telescope" and m.is_response and m.method == method
        ]

    def get_events_by_type(self, event_type: str) -> list[ControlEntry]:
        """Get all async events of a given type (e.g., 'PiStatus')."""
        return [
            m
            for m in self._control_messages
            if m.is_event and m.parsed.get("Event") == event_type
        ]

    def get_frame_paths(self, kind: str | None = None) -> list[Path]:
        """Return paths to binary frame files, optionally filtered by kind."""
        if kind is None:
            return list(self._frame_paths)
        return [p for p in self._frame_paths if f"_{kind}" in p.stem]

    def read_frame(self, path: Path) -> tuple[bytes, bytes]:
        """Read frame file, returning (header_80_bytes, payload)."""
        data = path.read_bytes()
        return data[:80], data[80:]

    def get_session_start_time(self) -> float:
        """Return the timestamp of the first message."""
        if self._control_messages:
            return self._control_messages[0].timestamp
        return 0.0
