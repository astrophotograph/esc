"""Parse Wireshark pcap files containing Seestar telescope traffic.

Extracts port 4700 (JSON-RPC control) and port 4800 (binary imaging) data
and writes them to a Session directory.

Usage:
    python -m python.testing.pcap_parser --pcap capture.pcap --output sessions/my_session/
"""

from __future__ import annotations

import argparse
import json
import struct
import sys
from datetime import datetime, timezone
from pathlib import Path

from .session import ControlEntry, Session, SessionManifest

# Port constants
CONTROL_PORT = 4700
IMAGING_PORT = 4800

# Binary frame header: first 20 bytes of the 80-byte header
HEADER_FMT = ">HHHIHHBBHH"
HEADER_SIZE = 80
HEADER_PARSED_SIZE = struct.calcsize(HEADER_FMT)  # 20 bytes


def _reassemble_tcp_streams(
    packets: list,
) -> dict[tuple[str, int, str, int], bytearray]:
    """Reassemble TCP payload bytes per connection 4-tuple.

    Returns a dict keyed by (src_ip, src_port, dst_ip, dst_port) with
    the concatenated payload bytes in sequence order.
    """
    from scapy.layers.inet import IP, TCP

    streams: dict[tuple[str, int, str, int], list[tuple[int, bytes]]] = {}

    for pkt in packets:
        if not pkt.haslayer(TCP) or not pkt.haslayer(IP):
            continue
        tcp = pkt[TCP]
        ip = pkt[IP]
        payload = bytes(tcp.payload)
        if not payload:
            continue

        key = (ip.src, tcp.sport, ip.dst, tcp.dport)
        streams.setdefault(key, []).append((tcp.seq, payload))

    # Sort by sequence number and concatenate (simple reassembly)
    result: dict[tuple[str, int, str, int], bytearray] = {}
    for key, segments in streams.items():
        segments.sort(key=lambda s: s[0])
        buf = bytearray()
        seen_seq = -1
        for seq, data in segments:
            if seq > seen_seq:
                buf.extend(data)
                seen_seq = seq + len(data) - 1
            elif seq + len(data) - 1 > seen_seq:
                # Partial overlap
                overlap = seen_seq - seq + 1
                buf.extend(data[overlap:])
                seen_seq = seq + len(data) - 1
        result[key] = buf

    return result


def _extract_control_messages(
    streams: dict[tuple[str, int, str, int], bytearray],
    packets: list,
) -> list[ControlEntry]:
    """Extract JSON-RPC messages from port 4700 streams."""
    from scapy.layers.inet import IP, TCP

    # Build a timestamp map: (src, sport, dst, dport, seq) -> timestamp
    ts_map: dict[tuple[str, int, str, int], float] = {}
    for pkt in packets:
        if not pkt.haslayer(TCP) or not pkt.haslayer(IP):
            continue
        tcp = pkt[TCP]
        ip = pkt[IP]
        if not bytes(tcp.payload):
            continue
        key = (ip.src, tcp.sport, ip.dst, tcp.dport)
        # Use the first packet timestamp for each stream direction
        if key not in ts_map:
            ts_map[key] = float(pkt.time)

    messages: list[ControlEntry] = []

    for key, data in streams.items():
        src_ip, src_port, dst_ip, dst_port = key

        # Determine if this is port 4700 traffic
        if src_port != CONTROL_PORT and dst_port != CONTROL_PORT:
            continue

        # Direction: client sends TO port 4700, telescope sends FROM port 4700
        direction = "client" if dst_port == CONTROL_PORT else "telescope"

        # Split on newlines (\r\n or \n) to get individual JSON messages
        text = data.decode("utf-8", errors="replace")
        lines = text.replace("\r\n", "\n").split("\n")

        base_ts = ts_map.get(key, 0.0)

        for line in lines:
            line = line.strip()
            if not line:
                continue
            try:
                json.loads(line)  # Validate it's JSON
                messages.append(
                    ControlEntry(
                        timestamp=base_ts,
                        direction=direction,
                        raw=line,
                    )
                )
            except json.JSONDecodeError:
                continue

    # Sort by timestamp
    messages.sort(key=lambda m: m.timestamp)
    return messages


def _refine_timestamps(
    messages: list[ControlEntry],
    packets: list,
) -> list[ControlEntry]:
    """Try to assign more accurate per-message timestamps from packet data.

    Walks through packets in time order and matches JSON payloads to messages.
    """
    from scapy.layers.inet import IP, TCP

    # Build ordered list of (timestamp, direction, payload_text)
    pkt_payloads: list[tuple[float, str, str]] = []
    for pkt in packets:
        if not pkt.haslayer(TCP) or not pkt.haslayer(IP):
            continue
        tcp = pkt[TCP]
        payload = bytes(tcp.payload)
        if not payload:
            continue
        src_port = tcp.sport
        dst_port = tcp.dport
        if src_port != CONTROL_PORT and dst_port != CONTROL_PORT:
            continue

        direction = "client" if dst_port == CONTROL_PORT else "telescope"
        text = payload.decode("utf-8", errors="replace")
        pkt_payloads.append((float(pkt.time), direction, text))

    pkt_payloads.sort(key=lambda x: x[0])

    # For each message, find the first packet that contains its raw JSON
    refined: list[ControlEntry] = []
    used_pkt_indices: set[int] = set()

    for msg in messages:
        best_ts = msg.timestamp
        for i, (ts, direction, text) in enumerate(pkt_payloads):
            if i in used_pkt_indices:
                continue
            if direction == msg.direction and msg.raw in text:
                best_ts = ts
                used_pkt_indices.add(i)
                break

        refined.append(
            ControlEntry(
                timestamp=best_ts,
                direction=msg.direction,
                raw=msg.raw,
            )
        )

    refined.sort(key=lambda m: m.timestamp)
    return refined


def _extract_binary_frames(
    streams: dict[tuple[str, int, str, int], bytearray],
) -> list[tuple[bytes, bytes, int, int, int]]:
    """Extract binary frames from port 4800 streams.

    Walks the stream using the Seestar binary protocol: each message is
    an 80-byte header followed by ``size`` bytes of payload.  The header
    format (big-endian) is ``>HHHIHHBBHH`` for the first 20 bytes, with
    60 bytes of padding.  Key fields: ``size`` (offset 6-9, payload
    length), ``id`` (offset 15, frame type), ``width``/``height``
    (offsets 16-19).

    Only image frames (width > 0, height > 0, size > 1000) are returned.
    Small control/handshake messages are skipped but still consumed to
    keep alignment.

    Returns list of (header_80, payload, frame_id, width, height).
    """
    frames: list[tuple[bytes, bytes, int, int, int]] = []

    for key, data in streams.items():
        src_ip, src_port, dst_ip, dst_port = key

        # Imaging data flows FROM port 4800 (telescope -> client)
        if src_port != IMAGING_PORT:
            continue

        offset = 0
        while offset + HEADER_SIZE <= len(data):
            header = bytes(data[offset : offset + HEADER_SIZE])
            try:
                _s1, _s2, _s3, size, _s5, _s6, code, frame_id, width, height = (
                    struct.unpack(HEADER_FMT, header[:HEADER_PARSED_SIZE])
                )
            except struct.error:
                break

            # Sanity: if size is unreasonably large, we're misaligned
            if size > 50_000_000:
                break

            payload_end = offset + HEADER_SIZE + size
            if payload_end > len(data):
                break  # Incomplete frame at end of stream

            # Only keep real image frames (skip handshakes and control messages)
            if width > 0 and height > 0 and size > 1000:
                payload = bytes(data[offset + HEADER_SIZE : payload_end])
                frames.append((header, payload, frame_id, width, height))

            # Always advance past the full frame to maintain alignment
            offset = payload_end

    return frames


def _detect_telescope_info(
    messages: list[ControlEntry],
) -> tuple[str | None, str | None]:
    """Try to extract telescope model and firmware from captured responses."""
    model = None
    firmware = None

    for msg in messages:
        if not msg.is_response:
            continue
        d = msg.parsed
        result = d.get("result")
        if not isinstance(result, dict):
            continue
        # get_device_state often includes device info
        if "device_name" in result:
            model = result["device_name"]
        if "firmware_ver_str" in result:
            firmware = result["firmware_ver_str"]
        if model and firmware:
            break

    return model, firmware


def parse_pcap(pcap_path: Path, output_dir: Path) -> Session:
    """Parse a pcap file and create a Session directory."""
    try:
        from scapy.all import rdpcap
    except ImportError:
        print(
            "Error: scapy is required for pcap parsing.\n"
            "Install it: uv add --dev scapy",
            file=sys.stderr,
        )
        sys.exit(1)

    print(f"Reading pcap: {pcap_path}")
    packets = rdpcap(str(pcap_path))
    print(f"  {len(packets)} packets")

    # Reassemble TCP streams
    streams = _reassemble_tcp_streams(packets)
    print(f"  {len(streams)} TCP streams")

    # Extract control messages (port 4700)
    messages = _extract_control_messages(streams, packets)
    messages = _refine_timestamps(messages, packets)
    print(f"  {len(messages)} control messages")

    # Extract binary frames (port 4800)
    raw_frames = _extract_binary_frames(streams)
    # id==23 is stacked image; anything else with image data is a preview
    stack_count = sum(1 for _, _, fid, _, _ in raw_frames if fid == 23)
    preview_count = len(raw_frames) - stack_count
    print(f"  {len(raw_frames)} binary frames ({preview_count} preview, {stack_count} stacked)")

    # Detect telescope info from responses
    model, firmware = _detect_telescope_info(messages)
    if model:
        print(f"  Telescope: {model}")
    if firmware:
        print(f"  Firmware: {firmware}")

    # Compute duration
    duration = 0.0
    if messages:
        duration = messages[-1].timestamp - messages[0].timestamp

    # Build manifest
    manifest = SessionManifest(
        capture_date=datetime.now(timezone.utc).isoformat(),
        telescope_model=model,
        firmware_version=firmware,
        frame_count=len(raw_frames),
        preview_frame_count=preview_count,
        stack_frame_count=stack_count,
        control_message_count=len(messages),
        duration_seconds=round(duration, 3),
        source_pcap=pcap_path.name,
    )

    # Create session
    frames_for_session = [(h, p, fid) for h, p, fid, _w, _h in raw_frames]
    session = Session.create(output_dir, manifest, messages, frames_for_session)

    print(f"\nSession written to: {output_dir}")
    print(f"  manifest.json:  {manifest.control_message_count} messages, {manifest.frame_count} frames")
    print(f"  control.jsonl:  {manifest.control_message_count} lines")
    print(f"  frames/:        {manifest.frame_count} files")

    return session


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Parse Wireshark pcap files containing Seestar telescope traffic."
    )
    parser.add_argument(
        "--pcap",
        type=Path,
        required=True,
        help="Path to the pcap capture file",
    )
    parser.add_argument(
        "--output",
        type=Path,
        required=True,
        help="Output session directory",
    )
    args = parser.parse_args()

    if not args.pcap.exists():
        print(f"Error: pcap file not found: {args.pcap}", file=sys.stderr)
        sys.exit(1)

    parse_pcap(args.pcap, args.output)


if __name__ == "__main__":
    main()
