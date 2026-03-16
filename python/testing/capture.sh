#!/usr/bin/env bash
#
# capture.sh — Capture Seestar telescope traffic with tshark (Wireshark CLI).
#
# Captures TCP traffic on ports 4700 (command/control) and 4800 (imaging)
# between your machine and a Seestar smart telescope.
#
# Usage:
#   ./capture.sh                          # Capture on all interfaces, 5 min, auto-named file
#   ./capture.sh -i en0 -d 600            # Capture on en0 for 10 minutes
#   ./capture.sh -o my_session.pcap       # Custom output filename
#   ./capture.sh -t 10.0.0.1             # Filter to specific telescope IP
#   ./capture.sh -l                       # List available network interfaces
#   ./capture.sh -h                       # Show help
#
set -euo pipefail

# Defaults
INTERFACE=""
DURATION=300
OUTPUT=""
TELESCOPE_IP=""
LIST_INTERFACES=false

usage() {
    cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Capture Seestar telescope traffic (ports 4700 + 4800) using tshark.

Options:
  -i INTERFACE   Network interface to capture on (default: all interfaces)
  -d DURATION    Capture duration in seconds (default: 300 = 5 minutes)
  -o FILE        Output pcap file (default: seestar_<timestamp>.pcap)
  -t IP          Telescope IP address to filter on (optional, captures all by default)
  -l             List available network interfaces and exit
  -h             Show this help message

Examples:
  # Quick capture on Wi-Fi for 2 minutes
  $(basename "$0") -i en0 -d 120

  # Capture traffic to a specific Seestar
  $(basename "$0") -t 10.0.0.1 -d 600

  # Just list interfaces to find the right one
  $(basename "$0") -l

Prerequisites:
  - tshark (Wireshark CLI) must be installed
    macOS:   brew install wireshark
    Linux:   sudo apt install tshark
  - May require sudo/root for live capture on some systems

Workflow:
  1. Start this capture script
  2. Use the Seestar app (or ESC) to control the telescope
  3. Stop capture (Ctrl+C or wait for duration)
  4. Parse the pcap into a session:
     python -m python.testing.pcap_parser --pcap <file>.pcap --output sessions/my_session/
  5. Run the mock telescope:
     python -m python.testing.mock_telescope --session sessions/my_session/
EOF
}

list_interfaces() {
    echo "Available network interfaces:"
    echo ""
    if command -v tshark &>/dev/null; then
        tshark -D 2>&1
    else
        echo "  tshark not found. Install Wireshark:"
        echo "    macOS:  brew install wireshark"
        echo "    Linux:  sudo apt install tshark"
        exit 1
    fi
}

while getopts "i:d:o:t:lh" opt; do
    case $opt in
        i) INTERFACE="$OPTARG" ;;
        d) DURATION="$OPTARG" ;;
        o) OUTPUT="$OPTARG" ;;
        t) TELESCOPE_IP="$OPTARG" ;;
        l) LIST_INTERFACES=true ;;
        h) usage; exit 0 ;;
        *) usage; exit 1 ;;
    esac
done

if $LIST_INTERFACES; then
    list_interfaces
    exit 0
fi

# Check tshark is installed
if ! command -v tshark &>/dev/null; then
    echo "Error: tshark not found. Install Wireshark:"
    echo "  macOS:  brew install wireshark"
    echo "  Linux:  sudo apt install tshark"
    exit 1
fi

# Generate default output filename
if [ -z "$OUTPUT" ]; then
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    OUTPUT="seestar_${TIMESTAMP}.pcap"
fi

# Build capture filter
FILTER="tcp port 4700 or tcp port 4800"
if [ -n "$TELESCOPE_IP" ]; then
    FILTER="host $TELESCOPE_IP and ($FILTER)"
fi

# Build tshark command
CMD=(tshark)

if [ -n "$INTERFACE" ]; then
    CMD+=(-i "$INTERFACE")
fi

CMD+=(-a "duration:$DURATION")
CMD+=(-w "$OUTPUT")
CMD+=(-f "$FILTER")

# Summary
echo "Seestar Traffic Capture"
echo "======================="
echo "  Interface:  ${INTERFACE:-all}"
echo "  Duration:   ${DURATION}s"
echo "  Output:     $OUTPUT"
echo "  Filter:     $FILTER"
if [ -n "$TELESCOPE_IP" ]; then
    echo "  Telescope:  $TELESCOPE_IP"
fi
echo ""
echo "Starting capture... (Ctrl+C to stop early)"
echo ""

# Run tshark
"${CMD[@]}"

echo ""
echo "Capture complete: $OUTPUT"
echo ""
echo "Next steps:"
echo "  # Parse into a session"
echo "  python -m python.testing.pcap_parser --pcap $OUTPUT --output sessions/$(basename "$OUTPUT" .pcap)/"
