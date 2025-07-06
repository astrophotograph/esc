#!/usr/bin/env python3
"""
Simple WebRTC test to debug ICE candidate generation issues.
This bypasses our complex setup to test aiortc basics.
"""

import asyncio
import logging
from aiortc import RTCPeerConnection, RTCConfiguration, RTCIceServer
from dummy_video_track import DummyVideoTrack

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def test_webrtc_basic():
    """Test basic WebRTC functionality."""
    logger.info("=== Basic WebRTC Test ===")
    
    # Test 1: Create peer connection with default config
    logger.info("Test 1: Default configuration")
    pc1 = RTCPeerConnection()
    
    candidate_count = 0
    
    @pc1.on("icecandidate")
    async def on_candidate(candidate):
        nonlocal candidate_count
        if candidate:
            candidate_count += 1
            logger.info(f"Candidate #{candidate_count}: {candidate.candidate}")
        else:
            logger.info(f"ICE gathering complete. Total: {candidate_count}")
    
    # Add a dummy track
    track = DummyVideoTrack()
    pc1.addTrack(track)
    
    # Create offer
    offer = await pc1.createOffer()
    await pc1.setLocalDescription(offer)
    
    # Wait for ICE gathering
    for i in range(10):
        await asyncio.sleep(0.5)
        state = pc1.iceGatheringState
        logger.info(f"Check #{i+1}: ICE state = {state}, candidates = {candidate_count}")
        if state == "complete":
            break
    
    await pc1.close()
    
    if candidate_count == 0:
        logger.error("FAILED: No ICE candidates generated with default config")
        
        # Test 2: Try with STUN servers
        logger.info("Test 2: With STUN servers")
        ice_servers = [RTCIceServer(urls=["stun:stun.l.google.com:19302"])]
        config = RTCConfiguration(iceServers=ice_servers)
        pc2 = RTCPeerConnection(config)
        
        candidate_count2 = 0
        
        @pc2.on("icecandidate")
        async def on_candidate2(candidate):
            nonlocal candidate_count2
            if candidate:
                candidate_count2 += 1
                logger.info(f"STUN Candidate #{candidate_count2}: {candidate.candidate}")
            else:
                logger.info(f"STUN ICE gathering complete. Total: {candidate_count2}")
        
        track2 = DummyVideoTrack()
        pc2.addTrack(track2)
        
        offer2 = await pc2.createOffer()
        await pc2.setLocalDescription(offer2)
        
        for i in range(10):
            await asyncio.sleep(0.5)
            state = pc2.iceGatheringState
            logger.info(f"STUN Check #{i+1}: ICE state = {state}, candidates = {candidate_count2}")
            if state == "complete":
                break
        
        await pc2.close()
        
        if candidate_count2 == 0:
            logger.error("FAILED: No ICE candidates even with STUN servers!")
            logger.error("This indicates a system-level networking issue.")
            return False
    
    logger.info("SUCCESS: ICE candidates generated successfully")
    return True

async def test_network_interfaces():
    """Test network interface availability."""
    logger.info("=== Network Interface Test ===")
    
    try:
        import netifaces
        interfaces = netifaces.interfaces()
        logger.info(f"Available interfaces: {interfaces}")
        
        valid_ips = []
        for interface in interfaces:
            try:
                addrs = netifaces.ifaddresses(interface)
                if netifaces.AF_INET in addrs:
                    for addr_info in addrs[netifaces.AF_INET]:
                        ip = addr_info['addr']
                        logger.info(f"Interface {interface}: {ip}")
                        if not ip.startswith('127.'):
                            valid_ips.append(ip)
            except Exception as e:
                logger.warning(f"Error checking interface {interface}: {e}")
        
        if not valid_ips:
            logger.error("No valid non-loopback IP addresses found!")
            logger.error("This will prevent WebRTC from working.")
            return False
        else:
            logger.info(f"Valid IPs for WebRTC: {valid_ips}")
            return True
            
    except ImportError:
        logger.error("netifaces not available - install with: pip install netifaces")
        return False

if __name__ == "__main__":
    async def main():
        network_ok = await test_network_interfaces()
        webrtc_ok = await test_webrtc_basic()
        
        if network_ok and webrtc_ok:
            logger.info("✅ All tests passed - WebRTC should work")
        else:
            logger.error("❌ Tests failed - WebRTC will not work")
            logger.error("Check network configuration and aiortc installation")
    
    asyncio.run(main())