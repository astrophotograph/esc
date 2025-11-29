"""
Integration tests for telescope connection and imaging.

These tests require a real telescope to be available on the network.
Run with: uv run pytest tests/test_telescope_integration.py -v

Configure telescope IP via:
  - Environment: TELESCOPE_HOST=192.168.42.41
  - Command line: --telescope-host=192.168.42.41
"""
import asyncio
import sys
import time
from pathlib import Path

import pytest

# Add the Python modules to path
sys.path.insert(0, str(Path(__file__).parent.parent / "src-tauri" / "python"))


class TestTelescopeDiscovery:
    """Test telescope discovery functionality."""

    @pytest.mark.asyncio
    async def test_discover_telescopes(self):
        """Test that we can discover telescopes on the network."""
        from telescope.seestar_bridge import discover_telescopes

        telescopes = await discover_telescopes()
        
        print(f"\nDiscovered {len(telescopes)} telescope(s):")
        for t in telescopes:
            print(f"  - {t}")
        
        # We should find at least one telescope
        assert len(telescopes) >= 1, "No telescopes discovered on the network"
        
        # Check the structure of discovered telescope
        first = telescopes[0]
        assert "host" in first, "Discovered telescope should have 'host'"
        assert "port" in first, "Discovered telescope should have 'port'"
        assert first["host"], "Host should not be empty"
        assert first["port"] > 0, "Port should be positive"

    @pytest.mark.asyncio
    async def test_discover_specific_telescope(self, telescope_host: str):
        """Test that we can discover the specific test telescope."""
        from telescope.seestar_bridge import discover_telescopes

        telescopes = await discover_telescopes()
        
        # Check if our test telescope is in the list
        hosts = [t["host"] for t in telescopes]
        print(f"\nLooking for {telescope_host} in discovered hosts: {hosts}")
        
        assert telescope_host in hosts, f"Expected telescope {telescope_host} not found in discovered hosts: {hosts}"


class TestTelescopeBridge:
    """Test TelescopeBridge connection and basic operations."""

    def test_create_bridge(self, telescope_host: str, telescope_port: int):
        """Test creating a telescope bridge instance."""
        from telescope.seestar_bridge import create_bridge
        
        bridge = create_bridge(telescope_host, telescope_port)
        
        assert bridge is not None
        assert bridge.host == telescope_host
        assert bridge.port == telescope_port
        assert bridge.client is None  # Not connected yet

    def test_connect_to_telescope(self, telescope_host: str, telescope_port: int):
        """Test connecting to a real telescope."""
        from telescope.seestar_bridge import create_bridge
        
        bridge = create_bridge(telescope_host, telescope_port)
        
        print(f"\nConnecting to telescope at {telescope_host}:{telescope_port}...")
        result = bridge.connect()
        
        print(f"Connection result: {result}")
        
        assert result["success"], f"Failed to connect: {result.get('error', 'unknown error')}"
        assert "message" in result
        
        # Client should be initialized after connection
        assert bridge.client is not None, "Client should be initialized after connect()"
        
        # Clean up
        disconnect_result = bridge.disconnect()
        print(f"Disconnect result: {disconnect_result}")

    def test_get_status_after_connect(self, telescope_host: str, telescope_port: int):
        """Test getting telescope status after connection."""
        from telescope.seestar_bridge import create_bridge
        
        bridge = create_bridge(telescope_host, telescope_port)
        
        # Connect first
        connect_result = bridge.connect()
        assert connect_result["success"], f"Failed to connect: {connect_result.get('error')}"
        
        try:
            # Get status
            status = bridge.get_status()
            print(f"\nTelescope status: {status}")
            
            assert status["success"], f"Failed to get status: {status.get('error')}"
            assert "state" in status, "Status should contain 'state'"
            
            state = status["state"]
            print(f"State details:")
            print(f"  - battery: {state.get('battery')}")
            print(f"  - cur_temp: {state.get('cur_temp')}")
            print(f"  - ra: {state.get('ra')}")
            print(f"  - dec: {state.get('dec')}")
            print(f"  - is_tracking: {state.get('is_tracking')}")
            print(f"  - view: {state.get('view')}")
            
        finally:
            bridge.disconnect()

    def test_connect_disconnect_cycle(self, telescope_host: str, telescope_port: int):
        """Test multiple connect/disconnect cycles."""
        from telescope.seestar_bridge import create_bridge
        
        bridge = create_bridge(telescope_host, telescope_port)
        
        for i in range(3):
            print(f"\nCycle {i + 1}/3:")
            
            # Connect
            result = bridge.connect()
            assert result["success"], f"Connect failed on cycle {i + 1}: {result.get('error')}"
            print(f"  Connected: {result['message']}")
            
            # Brief pause
            time.sleep(0.5)
            
            # Disconnect
            result = bridge.disconnect()
            assert result["success"], f"Disconnect failed on cycle {i + 1}: {result.get('error')}"
            print(f"  Disconnected: {result['message']}")
            
            time.sleep(0.5)


class TestTelescopeImaging:
    """Test telescope imaging functionality."""

    def test_imaging_client_initialized(self, telescope_host: str, telescope_port: int):
        """Test that imaging client is initialized after connection."""
        from telescope.seestar_bridge import create_bridge
        
        bridge = create_bridge(telescope_host, telescope_port)
        
        result = bridge.connect()
        assert result["success"], f"Failed to connect: {result.get('error')}"
        
        try:
            # Check that imaging client was created
            assert bridge.imaging_client is not None, "Imaging client should be initialized"
            print(f"\nImaging client: {bridge.imaging_client}")
            print(f"Imaging client type: {type(bridge.imaging_client)}")
            
        finally:
            bridge.disconnect()

    def test_get_single_frame(self, telescope_host: str, telescope_port: int):
        """Test getting a single frame from the telescope."""
        from telescope.seestar_bridge import create_bridge
        
        bridge = create_bridge(telescope_host, telescope_port)
        
        result = bridge.connect()
        assert result["success"], f"Failed to connect: {result.get('error')}"
        
        try:
            print("\nWaiting for imaging to initialize...")
            time.sleep(2)  # Give the telescope time to start streaming
            
            # Try to get a frame
            frame = bridge.get_next_frame()
            
            if frame is None:
                # Try a few more times with delays
                for attempt in range(5):
                    print(f"  Attempt {attempt + 1}: No frame yet, waiting...")
                    time.sleep(1)
                    frame = bridge.get_next_frame()
                    if frame is not None:
                        break
            
            assert frame is not None, "Failed to get a frame from the telescope"
            
            print(f"\nReceived frame:")
            print(f"  - Size: {len(frame)} bytes")
            print(f"  - First bytes: {frame[:20].hex()}")
            
            # Check it's valid JPEG (starts with FFD8)
            assert frame[:2] == b'\xff\xd8', "Frame should be JPEG (start with FFD8)"
            
            # Check it ends with JPEG marker (FFD9)
            assert frame[-2:] == b'\xff\xd9', "Frame should be JPEG (end with FFD9)"
            
            print(f"  - Valid JPEG: Yes")
            
        finally:
            bridge.disconnect()

    def test_get_multiple_frames(self, telescope_host: str, telescope_port: int):
        """Test getting multiple frames to verify streaming."""
        from telescope.seestar_bridge import create_bridge
        
        bridge = create_bridge(telescope_host, telescope_port)
        
        result = bridge.connect()
        assert result["success"], f"Failed to connect: {result.get('error')}"
        
        try:
            print("\nWaiting for streaming to start...")
            time.sleep(2)
            
            frames_received = 0
            frame_sizes = []
            max_attempts = 20
            
            for attempt in range(max_attempts):
                frame = bridge.get_next_frame()
                if frame is not None and len(frame) > 0:
                    frames_received += 1
                    frame_sizes.append(len(frame))
                    print(f"  Frame {frames_received}: {len(frame)} bytes")
                    
                    if frames_received >= 5:
                        break
                
                time.sleep(0.2)
            
            print(f"\nReceived {frames_received} frames in {max_attempts} attempts")
            
            assert frames_received >= 3, f"Expected at least 3 frames, got {frames_received}"
            
            # Check frame sizes are reasonable (should be tens of KB for JPEG)
            avg_size = sum(frame_sizes) / len(frame_sizes)
            print(f"Average frame size: {avg_size:.0f} bytes ({avg_size/1024:.1f} KB)")
            
            assert avg_size > 1000, f"Frames too small: {avg_size} bytes average"
            
        finally:
            bridge.disconnect()

    def test_save_frame_to_file(self, telescope_host: str, telescope_port: int, tmp_path: Path):
        """Test saving a frame to a file to verify image quality."""
        from telescope.seestar_bridge import create_bridge
        
        bridge = create_bridge(telescope_host, telescope_port)
        
        result = bridge.connect()
        assert result["success"], f"Failed to connect: {result.get('error')}"
        
        try:
            print("\nWaiting for frame...")
            time.sleep(2)
            
            frame = None
            for attempt in range(10):
                frame = bridge.get_next_frame()
                if frame is not None:
                    break
                time.sleep(0.5)
            
            assert frame is not None, "Could not get a frame"
            
            # Save to temp file
            output_file = tmp_path / "telescope_frame.jpg"
            output_file.write_bytes(frame)
            
            print(f"\nSaved frame to: {output_file}")
            print(f"File size: {output_file.stat().st_size} bytes")
            
            # Verify we can open it with PIL
            from PIL import Image
            img = Image.open(output_file)
            print(f"Image size: {img.size}")
            print(f"Image mode: {img.mode}")
            
            assert img.size[0] > 0 and img.size[1] > 0, "Image should have valid dimensions"
            
        finally:
            bridge.disconnect()


class TestRunAsyncHelper:
    """Test the _run_async helper function used by Rust."""

    def test_run_async_sync_method(self, telescope_host: str, telescope_port: int):
        """Test calling a sync method through _run_async."""
        from telescope.seestar_bridge import create_bridge, _run_async
        
        bridge = create_bridge(telescope_host, telescope_port)
        
        # Call connect through _run_async (this is how Rust calls it)
        result = _run_async(bridge, "connect")
        
        print(f"\nResult from _run_async('connect'): {result}")
        
        assert result["success"], f"Failed: {result.get('error')}"
        
        # Clean up
        _run_async(bridge, "disconnect")

    def test_run_async_get_next_frame(self, telescope_host: str, telescope_port: int):
        """Test calling get_next_frame through _run_async."""
        from telescope.seestar_bridge import create_bridge, _run_async
        
        bridge = create_bridge(telescope_host, telescope_port)
        
        # Connect
        result = _run_async(bridge, "connect")
        assert result["success"], f"Connect failed: {result.get('error')}"
        
        try:
            print("\nWaiting for streaming...")
            time.sleep(2)
            
            # Get frame through _run_async (this is how Rust calls it)
            frame = _run_async(bridge, "get_next_frame")
            
            # May need a few attempts
            for attempt in range(10):
                if frame is not None:
                    break
                time.sleep(0.5)
                frame = _run_async(bridge, "get_next_frame")
            
            print(f"Frame received: {frame is not None}")
            if frame:
                print(f"Frame size: {len(frame)} bytes")
            
            assert frame is not None, "Could not get frame through _run_async"
            
        finally:
            _run_async(bridge, "disconnect")
