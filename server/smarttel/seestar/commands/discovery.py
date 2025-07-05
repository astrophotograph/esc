"""Seestar discovery commands."""
import asyncio
import json
import socket
import ipaddress
from typing import List, Tuple
from loguru import logger as logging


def get_all_network_interfaces() -> List[Tuple[str, str]]:
    """Get all network interfaces with their local IP and broadcast addresses, excluding localhost."""
    interfaces = []
    
    # Try to get all network interfaces
    try:
        import netifaces
        for interface in netifaces.interfaces():
            addrs = netifaces.ifaddresses(interface)
            if netifaces.AF_INET in addrs:
                for addr in addrs[netifaces.AF_INET]:
                    ip = addr.get('addr')
                    netmask = addr.get('netmask')
                    if ip and netmask and not ip.startswith('127.'):
                        # Calculate broadcast address
                        network = ipaddress.IPv4Network(f"{ip}/{netmask}", strict=False)
                        broadcast = str(network.broadcast_address)
                        interfaces.append((ip, broadcast))
    except ImportError:
        # Fallback if netifaces is not available
        hostname = socket.gethostname()
        for addr_info in socket.getaddrinfo(hostname, None, socket.AF_INET):
            ip = addr_info[4][0]
            if not ip.startswith('127.'):
                # Simple broadcast calculation
                ip_parts = ip.split('.')
                broadcast = f"{ip_parts[0]}.{ip_parts[1]}.{ip_parts[2]}.255"
                interfaces.append((ip, broadcast))
    
    # If no interfaces found, use the old method
    if not interfaces:
        local_ip, broadcast_ip = get_network_info()
        if not local_ip.startswith('127.'):
            interfaces.append((local_ip, broadcast_ip))
    
    return interfaces


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
    """Discover Seestars using asyncio for asynchronous UDP broadcasting on all network interfaces."""
    discovered_devices = []
    discovered_ips = set()  # Track unique device IPs
    
    # Get all network interfaces
    interfaces = get_all_network_interfaces()
    
    if not interfaces:
        logging.warning("No network interfaces found for discovery")
        return discovered_devices
    
    logging.info(f"Discovering on {len(interfaces)} network interface(s)")
    
    # Create tasks for parallel discovery on all interfaces
    tasks = []
    for local_ip, broadcast_ip in interfaces:
        task = discover_on_interface(local_ip, broadcast_ip, timeout, discovered_devices, discovered_ips)
        tasks.append(task)
    
    # Run all discoveries in parallel
    await asyncio.gather(*tasks, return_exceptions=True)
    
    logging.info(f"Discovery complete. Found {len(discovered_devices)} unique device(s)")
    return discovered_devices


async def discover_on_interface(local_ip: str, broadcast_ip: str, timeout: int, 
                               discovered_devices: list, discovered_ips: set):
    """Discover Seestars on a specific network interface."""
    logging.debug(f"Discovering on interface {local_ip} -> {broadcast_ip}")
    
    broadcast_message = json.dumps({"id": 201, "method": "scan_iscope", "name": "iphone", "ip": local_ip}) + "\r\n"
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
                device_ip = addr[0]
                logging.trace(f"Received response from {addr}: {data.decode('utf-8')}")
                try:
                    response = json.loads(data.decode('utf-8'))
                    # Only add if we haven't seen this device before
                    if device_ip not in discovered_ips:
                        discovered_ips.add(device_ip)
                        discovered_devices.append({
                            'address': device_ip,
                            'data': response,
                            'discovered_via': local_ip
                        })
                        logging.info(f"Found new device at {device_ip} via interface {local_ip}")
                except json.JSONDecodeError:
                    logging.error(f"Received non-JSON response from {addr}: {data}")

        # Create the protocol and get the transport
        transport, protocol = await loop.create_datagram_endpoint(
            DiscoveryProtocol,
            sock=sock
        )

        port = 4720
        transport.sendto(message, (broadcast_ip, port))
        logging.debug(f"Sent discovery message from {local_ip} to {broadcast_ip}:{port}")

        # Wait for responses
        await asyncio.sleep(timeout)

        # Close the transport
        transport.close()

    except Exception as e:
        logging.error(f"Error during discovery on interface {local_ip}: {e}")
        sock.close()
