"""Entry point for python -m python.testing (shows help)."""

print("""Seestar Mock Telescope Testing Tools
=====================================

Available commands:

  Capture traffic (tshark wrapper):
    ./python/testing/capture.sh -i en0 -d 300

  Parse pcap to session:
    python -m python.testing.pcap_parser --pcap capture.pcap --output sessions/my_session/

  Run mock telescope:
    python -m python.testing.mock_telescope --session sessions/my_session/

Workflow:
  1. Run capture.sh while using the Seestar app (or ESC) with a real telescope
  2. Parse the pcap into a session directory
  3. Run the mock telescope server
  4. Point ESC at localhost to test without hardware
""")
