#!/usr/bin/env python3
"""Test script for network simulation with actual telescope images."""

import asyncio
import aiohttp
import time
import argparse
from pathlib import Path

async def test_image_download(base_url: str, image_path: str, simulation_name: str = ""):
    """Test downloading an image and measure timing."""
    start_time = time.time()
    
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{base_url}/{image_path}") as response:
                if response.status == 200:
                    content = await response.read()
                    end_time = time.time()
                    
                    duration = end_time - start_time
                    size_mb = len(content) / (1024 * 1024)
                    speed_mbps = (size_mb * 8) / duration  # Convert to Mbps
                    
                    status = f"✅ SUCCESS"
                    if simulation_name:
                        status += f" ({simulation_name})"
                    
                    print(f"{status}")
                    print(f"   File: {image_path}")
                    print(f"   Size: {size_mb:.2f} MB")
                    print(f"   Duration: {duration:.2f}s")
                    print(f"   Speed: {speed_mbps:.2f} Mbps")
                    print()
                    
                    return True, duration, size_mb
                else:
                    print(f"❌ FAILED: HTTP {response.status} - {image_path}")
                    return False, 0, 0
                    
    except Exception as e:
        end_time = time.time()
        duration = end_time - start_time
        print(f"❌ ERROR: {e} - {image_path} (after {duration:.2f}s)")
        return False, duration, 0


async def apply_simulation_preset(base_url: str, preset: str):
    """Apply a network simulation preset."""
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(f"{base_url}/api/network-simulation/presets/{preset}") as response:
                if response.status == 200:
                    result = await response.json()
                    print(f"🔧 Applied simulation preset: {preset}")
                    print(f"   Description: {result.get('description', 'N/A')}")
                    print()
                    return True
                else:
                    print(f"❌ Failed to apply preset {preset}: HTTP {response.status}")
                    return False
    except Exception as e:
        print(f"❌ Error applying preset {preset}: {e}")
        return False


async def disable_simulation(base_url: str):
    """Disable network simulation."""
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(f"{base_url}/api/network-simulation/disable") as response:
                if response.status == 200:
                    print("🔧 Network simulation disabled")
                    print()
                    return True
                else:
                    print(f"❌ Failed to disable simulation: HTTP {response.status}")
                    return False
    except Exception as e:
        print(f"❌ Error disabling simulation: {e}")
        return False


async def get_simulation_status(base_url: str):
    """Get current simulation status."""
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{base_url}/api/network-simulation/status") as response:
                if response.status == 200:
                    status = await response.json()
                    config = status["config"]
                    stats = status["stats"]
                    
                    print("📊 Network Simulation Status:")
                    print(f"   Enabled: {config['enabled']}")
                    if config['enabled']:
                        print(f"   Base Delay: {config['base_delay_ms']}ms")
                        print(f"   Packet Loss: {config['packet_loss_rate']*100:.1f}%")
                        print(f"   Bandwidth Limit: {config['bandwidth_limit_kbps']} KB/s")
                        print(f"   Requests Processed: {stats['requests_processed']}")
                        print(f"   Requests Delayed: {stats['requests_delayed']}")
                        print(f"   Requests Dropped: {stats['requests_dropped']}")
                        print(f"   Average Delay: {stats['average_delay_ms']:.1f}ms")
                    print()
                    return status
                else:
                    print(f"❌ Failed to get simulation status: HTTP {response.status}")
                    return None
    except Exception as e:
        print(f"❌ Error getting simulation status: {e}")
        return None


async def main():
    parser = argparse.ArgumentParser(description="Test network simulation with telescope images")
    parser.add_argument("--server", default="http://localhost:8000", help="Server base URL")
    parser.add_argument("--preset", help="Simulation preset to test (slow_3g, unstable_wifi, etc.)")
    parser.add_argument("--all-presets", action="store_true", help="Test all presets")
    parser.add_argument("--images", nargs="*", help="Specific image paths to test")
    
    args = parser.parse_args()
    
    # Sample telescope images to test with
    test_images = args.images or [
        "processed/2556120a-2a28-44ae-83e4-359c5c1e9e1d.png",
        "processed/2556120a-2a28-44ae-83e4-359c5c1e9e1d_enhanced_016a2a08.png",
        "uploads/2556120a-2a28-44ae-83e4-359c5c1e9e1d.fit"
    ]
    
    print("🔭 Network Simulation Test with Telescope Images")
    print("=" * 60)
    print()
    
    # Get initial status
    await get_simulation_status(args.server)
    
    if args.all_presets:
        # Test all presets
        presets = ["slow_3g", "slow_4g", "unstable_wifi", "satellite", "dial_up"]
        
        for preset in presets:
            print(f"🧪 Testing preset: {preset}")
            print("-" * 40)
            
            # Apply preset
            if await apply_simulation_preset(args.server, preset):
                # Test images with this preset
                for image_path in test_images:
                    await test_image_download(args.server, image_path, preset)
                    await asyncio.sleep(0.5)  # Small delay between tests
                
                # Get stats after testing
                await get_simulation_status(args.server)
            
            print()
    
    elif args.preset:
        # Test specific preset
        print(f"🧪 Testing preset: {args.preset}")
        print("-" * 40)
        
        if await apply_simulation_preset(args.server, args.preset):
            for image_path in test_images:
                await test_image_download(args.server, image_path, args.preset)
                await asyncio.sleep(0.5)
        
        await get_simulation_status(args.server)
    
    else:
        # Test without simulation (baseline)
        print("🧪 Baseline test (no simulation)")
        print("-" * 40)
        
        # Ensure simulation is disabled
        await disable_simulation(args.server)
        
        baseline_results = []
        for image_path in test_images:
            success, duration, size = await test_image_download(args.server, image_path, "baseline")
            if success:
                baseline_results.append((image_path, duration, size))
            await asyncio.sleep(0.5)
        
        # Now test with slow connection simulation
        print("🧪 Testing with slow connection simulation")
        print("-" * 40)
        
        if await apply_simulation_preset(args.server, "slow_3g"):
            slow_results = []
            for image_path in test_images:
                success, duration, size = await test_image_download(args.server, image_path, "slow_3g")
                if success:
                    slow_results.append((image_path, duration, size))
                await asyncio.sleep(0.5)
            
            # Compare results
            print("📈 Performance Comparison:")
            print("-" * 40)
            for i, (baseline, slow) in enumerate(zip(baseline_results, slow_results)):
                baseline_path, baseline_time, baseline_size = baseline
                slow_path, slow_time, slow_size = slow
                
                slowdown = slow_time / baseline_time if baseline_time > 0 else 0
                print(f"   {Path(baseline_path).name}:")
                print(f"     Baseline: {baseline_time:.2f}s")
                print(f"     Slow 3G:  {slow_time:.2f}s ({slowdown:.1f}x slower)")
                print()
    
    # Clean up - disable simulation
    await disable_simulation(args.server)
    
    print("✅ Test completed!")


if __name__ == "__main__":
    asyncio.run(main())