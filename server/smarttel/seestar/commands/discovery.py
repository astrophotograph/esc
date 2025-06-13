"""Seestar discovery commands."""
import asyncio
import json
import socket
import sys
from contextlib import suppress
import click
from textual.app import App, ComposeResult
from textual.containers import VerticalScroll
from textual.widgets import Header, Footer, Static, Button, DataTable

from cli.ui import CombinedSeestarUI
from smarttel.seestar.client import SeestarClient


def get_network_info():
    """Get local IP and broadcast IP address."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # Doesn't have to be reachable
        s.connect(('10.255.255.255', 1))
        local_ip = s.getsockname()[0]
    except Exception:
        local_ip = '127.0.0.1'
    finally:
        s.close()
    
    # Create broadcast IP based on local IP (simple approach)
    ip_parts = local_ip.split('.')
    broadcast_ip = f"{ip_parts[0]}.{ip_parts[1]}.{ip_parts[2]}.255"
    
    return local_ip, broadcast_ip


async def discover_seestars(timeout=10):
    """Discover Seestars using asyncio for asynchronous UDP broadcasting."""
    # Broadcast message to send to Seestar

    local_ip, broadcast_ip = get_network_info()
    broadcast_message = json.dumps({"id": 201, "method": "scan_iscope", "name": "iphone", "ip": local_ip}) + "\r\n"
    discovered_devices = []

    # Convert the message to JSON string and then to bytes
    message = broadcast_message.encode('utf-8')

    # Create a UDP socket for broadcasting
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)

    try:
        # Bind to a local address to receive responses
        sock.bind(('0.0.0.0', 0))

        # Create a transport for the socket
        loop = asyncio.get_event_loop()

        # Protocol to handle responses
        class DiscoveryProtocol(asyncio.DatagramProtocol):
            def connection_made(self, transport):
                self.transport = transport

            def datagram_received(self, data, addr):
                print(f"Received response from {addr}")
                try:
                    response = json.loads(data.decode('utf-8'))
                    discovered_devices.append({
                        'address': addr[0],
                        'data': response
                    })
                except json.JSONDecodeError:
                    print(f"Received non-JSON response from {addr}: {data}")

        # Create the protocol and get the transport
        transport, protocol = await loop.create_datagram_endpoint(
            DiscoveryProtocol,
            sock=sock
        )

        port = 4720
        transport.sendto(message, (broadcast_ip, port))
        print(f"Sent discovery message to broadcast:{port}")

        # Wait for responses
        await asyncio.sleep(timeout)  # Listen for specified seconds

        # Close the transport
        transport.close()

    except Exception as e:
        print(f"Error during discovery: {e}")
        sock.close()

    print(f"Discovery complete. Found {len(discovered_devices)} devices.")
    return discovered_devices


async def select_device_and_connect(host=None, port=None):
    """Discover devices and either connect directly or show a picker UI."""
    app = CombinedSeestarUI(host, port)
    
    if not host or not port:
        # Discover devices
        print("Discovering Seestar devices...")
        devices = await discover_seestars(timeout=3)
        
        if not devices:
            print("No Seestar devices found. Exiting.")
            return
        
        # Set up the device picker in the app
        app.set_device_picker(devices)

    # Run the combined app - it will handle both device picking and connection
    await app.run_async()


@click.command()
@click.option("--host", help="Seestar host address")
@click.option("--port", type=int, default=4700, help="Seestar port (default: 4700)")
def main(host, port):
    """Connect to a Seestar device, with optional device discovery."""
    asyncio.run(select_device_and_connect(host, port))


if __name__ == "__main__":
    main()