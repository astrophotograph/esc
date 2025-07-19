#!/usr/bin/env python3
"""
Sky Map Tile Pre-generation Script

This script pre-generates all sky map tiles up to zoom level 2 and places them
in the correct cache location for faster initial loading of the sky map interface.

Usage:
    python pregenerate_sky_tiles.py [--max-zoom LEVEL] [--projection PROJ] [--style STYLE]

Example:
    python pregenerate_sky_tiles.py --max-zoom 2 --projection mercator --style default
"""

import asyncio
import argparse
import time
from pathlib import Path
from typing import List, Tuple
import numpy as np
from PIL import Image

# Import our sky map generation functions
from api.routers.skymap import generate_sky_tile_async, TILE_CACHE_DIR, MAX_ZOOM_LEVEL


def calculate_total_tiles(max_zoom: int) -> int:
    """Calculate total number of tiles to generate across all zoom levels."""
    total = 0
    for z in range(max_zoom + 1):
        tiles_per_axis = 2 ** z
        total += tiles_per_axis * tiles_per_axis
    return total


def get_tile_coordinates(max_zoom: int) -> List[Tuple[int, int, int]]:
    """Generate all tile coordinates (x, y, z) up to max_zoom level."""
    coordinates = []
    
    for z in range(max_zoom + 1):
        tiles_per_axis = 2 ** z
        for y in range(tiles_per_axis):
            for x in range(tiles_per_axis):
                coordinates.append((x, y, z))
    
    return coordinates


def create_composite_sky_image(zoom_level: int, projection: str = "mercator", 
                              style: str = "default", latitude: float = 40.0, 
                              longitude: float = -74.0) -> Path:
    """
    Create a composite PNG image of the entire sky at a specific zoom level.
    
    Args:
        zoom_level: The zoom level to composite
        projection: Map projection type
        style: Visual style
        latitude: Observer latitude
        longitude: Observer longitude
        
    Returns:
        Path to the saved composite image
    """
    print(f"\n🖼️ Creating composite sky image for zoom level {zoom_level}...")
    
    tiles_per_axis = 2 ** zoom_level
    
    # First, we need to determine the tile size by loading one tile
    sample_tile_path = None
    tile_width = tile_height = 512  # Default fallback
    
    # Find a sample tile to get dimensions
    for y in range(tiles_per_axis):
        for x in range(tiles_per_axis):
            # Generate cache key to find the tile file
            from api.routers.skymap import generate_tile_cache_key
            cache_key = generate_tile_cache_key(x, y, zoom_level, projection, style, None, latitude, longitude)
            tile_path = TILE_CACHE_DIR / f"{cache_key}.png"
            
            if tile_path.exists():
                sample_tile_path = tile_path
                break
        if sample_tile_path:
            break
    
    if sample_tile_path:
        sample_tile = Image.open(sample_tile_path)
        tile_width, tile_height = sample_tile.size
        print(f"   Detected tile size: {tile_width}×{tile_height}")
    else:
        print(f"   Warning: No tiles found, using default size: {tile_width}×{tile_height}")
    
    # Create composite image
    composite_width = tile_width * tiles_per_axis
    composite_height = tile_height * tiles_per_axis
    
    print(f"   Creating composite image: {composite_width}×{composite_height}")
    
    # Create a new image with a black background
    composite = Image.new('RGB', (composite_width, composite_height), color=(0, 0, 0))
    
    tiles_found = 0
    tiles_missing = 0
    
    # Place each tile in the composite
    for y in range(tiles_per_axis):
        for x in range(tiles_per_axis):
            # Generate cache key to find the tile file
            from api.routers.skymap import generate_tile_cache_key
            cache_key = generate_tile_cache_key(x, y, zoom_level, projection, style, None, latitude, longitude)
            tile_path = TILE_CACHE_DIR / f"{cache_key}.png"
            
            if tile_path.exists():
                try:
                    tile_image = Image.open(tile_path)
                    # Convert to RGB if necessary
                    if tile_image.mode != 'RGB':
                        tile_image = tile_image.convert('RGB')
                    
                    # Calculate position in composite
                    pos_x = x * tile_width
                    pos_y = y * tile_height
                    
                    # Paste the tile into the composite
                    composite.paste(tile_image, (pos_x, pos_y))
                    tiles_found += 1
                    
                except Exception as e:
                    print(f"   Warning: Failed to load tile {x},{y}: {e}")
                    tiles_missing += 1
            else:
                tiles_missing += 1
    
    # Save the composite image
    composite_filename = f"sky_composite_zoom{zoom_level}_{projection}_{style}_{latitude}N_{longitude}E.png"
    composite_path = TILE_CACHE_DIR / composite_filename
    
    composite.save(composite_path, 'PNG', optimize=True)
    
    # Get file size
    file_size_mb = composite_path.stat().st_size / (1024 * 1024)
    
    print(f"   ✅ Composite saved: {composite_filename}")
    print(f"   📊 Tiles used: {tiles_found}/{tiles_found + tiles_missing}")
    print(f"   💾 File size: {file_size_mb:.1f} MB")
    
    return composite_path


async def generate_tile_batch(coordinates: List[Tuple[int, int, int]], 
                            projection: str, style: str, 
                            latitude: float, longitude: float,
                            batch_size: int = 4) -> None:
    """Generate tiles in batches to avoid overwhelming the system."""
    
    print(f"Processing {len(coordinates)} tiles in batches of {batch_size}")
    
    for i in range(0, len(coordinates), batch_size):
        batch = coordinates[i:i + batch_size]
        
        # Create tasks for this batch
        tasks = []
        for x, y, z in batch:
            task = generate_sky_tile_async(
                x=x, y=y, z=z,
                projection=projection,
                style=style,
                time=None,  # Use current time
                latitude=latitude,
                longitude=longitude
            )
            tasks.append((task, x, y, z))
        
        # Execute batch concurrently
        print(f"Generating batch {i//batch_size + 1}/{(len(coordinates) + batch_size - 1)//batch_size}: ", end="")
        
        batch_start = time.time()
        
        try:
            # Run all tasks in the batch
            results = await asyncio.gather(*[task for task, x, y, z in tasks], return_exceptions=True)
            
            # Check results and report
            for (_, x, y, z), result in zip(tasks, results):
                if isinstance(result, Exception):
                    print(f"❌ Failed tile {x},{y},{z}: {result}")
                else:
                    print(f"✅ {x},{y},{z} ", end="")
            
        except Exception as e:
            print(f"❌ Batch failed: {e}")
        
        batch_time = time.time() - batch_start
        print(f"(batch took {batch_time:.1f}s)")
        
        # Small delay between batches to prevent overwhelming the system
        if i + batch_size < len(coordinates):
            await asyncio.sleep(0.5)


async def pregenerate_tiles(max_zoom: int = 2, 
                          projection: str = "mercator",
                          style: str = "default",
                          latitude: float = 40.0,
                          longitude: float = -74.0,
                          batch_size: int = 4,
                          create_composites: bool = True) -> None:
    """
    Pre-generate all sky map tiles up to the specified zoom level.
    
    Args:
        max_zoom: Maximum zoom level to generate (0-4)
        projection: Map projection type
        style: Visual style for the map
        latitude: Observer latitude
        longitude: Observer longitude
        batch_size: Number of tiles to generate concurrently
    """
    
    print("🌟 Sky Map Tile Pre-generation Script")
    print("=" * 50)
    
    # Validate inputs
    if max_zoom < 0 or max_zoom > MAX_ZOOM_LEVEL:
        print(f"❌ Invalid zoom level: {max_zoom}. Must be 0-{MAX_ZOOM_LEVEL}")
        return
    
    # Calculate scope
    total_tiles = calculate_total_tiles(max_zoom)
    coordinates = get_tile_coordinates(max_zoom)
    
    print(f"📊 Generation Parameters:")
    print(f"   Max zoom level: {max_zoom}")
    print(f"   Projection: {projection}")
    print(f"   Style: {style}")
    print(f"   Observer: {latitude}°N, {longitude}°E")
    print(f"   Total tiles: {total_tiles}")
    print(f"   Batch size: {batch_size}")
    print(f"   Cache directory: {TILE_CACHE_DIR}")
    print()
    
    # Show breakdown by zoom level
    print("📋 Tiles by zoom level:")
    for z in range(max_zoom + 1):
        tiles_per_axis = 2 ** z
        tiles_at_level = tiles_per_axis * tiles_per_axis
        angular_size = 180.0 / tiles_per_axis
        print(f"   Zoom {z}: {tiles_per_axis}×{tiles_per_axis} = {tiles_at_level} tiles "
              f"({angular_size:.1f}° per tile)")
    print()
    
    # Ensure cache directory exists
    TILE_CACHE_DIR.mkdir(exist_ok=True)
    
    # Check existing cache
    existing_tiles = list(TILE_CACHE_DIR.glob("*.png"))
    existing_full_images = list(TILE_CACHE_DIR.glob("*.npy"))
    
    print(f"💾 Cache Status:")
    print(f"   Existing tiles: {len(existing_tiles)}")
    print(f"   Existing full images: {len(existing_full_images)}")
    print()
    
    # Confirm before starting
    print(f"🚀 Ready to generate {total_tiles} tiles...")
    
    # Start generation
    start_time = time.time()
    
    try:
        await generate_tile_batch(
            coordinates=coordinates,
            projection=projection,
            style=style,
            latitude=latitude,
            longitude=longitude,
            batch_size=batch_size
        )
        
        end_time = time.time()
        total_time = end_time - start_time
        
        print()
        print("🎉 Tile Pre-generation Complete!")
        print("=" * 50)
        print(f"✅ Generated {total_tiles} tiles in {total_time:.1f} seconds")
        print(f"⚡ Average: {total_time/total_tiles:.2f} seconds per tile")
        
        # Check final cache status
        final_tiles = list(TILE_CACHE_DIR.glob("*.png"))
        final_full_images = list(TILE_CACHE_DIR.glob("*.npy"))
        
        print(f"💾 Final Cache Status:")
        print(f"   Total tiles: {len(final_tiles)}")
        print(f"   Total full images: {len(final_full_images)}")
        
        # Create composite images for each zoom level
        composite_paths = []
        if create_composites:
            print(f"\n🖼️ Creating composite sky images...")
            
            for z in range(max_zoom + 1):
                try:
                    composite_path = create_composite_sky_image(
                        zoom_level=z,
                        projection=projection,
                        style=style,
                        latitude=latitude,
                        longitude=longitude
                    )
                    composite_paths.append(composite_path)
                except Exception as e:
                    print(f"   ❌ Failed to create composite for zoom {z}: {e}")
        else:
            print(f"\n⏭️ Skipping composite image creation")
        
        # Calculate final cache size including composites
        all_files = final_tiles + final_full_images + composite_paths
        total_size_mb = sum(f.stat().st_size for f in all_files if f.exists()) / (1024*1024)
        
        print(f"\n📊 Complete Cache Summary:")
        print(f"   Individual tiles: {len(final_tiles)}")
        print(f"   Full sky images: {len(final_full_images)}")
        print(f"   Composite images: {len(composite_paths)}")
        print(f"   Total cache size: {total_size_mb:.1f} MB")
        print()
        print(f"🌟 Sky map tiles and composite images are now cached and ready for fast loading!")
        
    except KeyboardInterrupt:
        print("\n⏹️ Generation interrupted by user")
        print(f"⏱️ Partial generation completed in {time.time() - start_time:.1f} seconds")
        
    except Exception as e:
        print(f"\n❌ Generation failed: {e}")
        import traceback
        traceback.print_exc()


def main():
    """Main entry point with command line argument parsing."""
    
    parser = argparse.ArgumentParser(
        description="Pre-generate sky map tiles for faster loading",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python pregenerate_sky_tiles.py
  python pregenerate_sky_tiles.py --max-zoom 3
  python pregenerate_sky_tiles.py --projection stereographic --style default
  python pregenerate_sky_tiles.py --latitude 51.5 --longitude -0.1 --max-zoom 2
        """
    )
    
    parser.add_argument(
        "--max-zoom", 
        type=int, 
        default=2, 
        help=f"Maximum zoom level to generate (0-{MAX_ZOOM_LEVEL}, default: 2)"
    )
    
    parser.add_argument(
        "--projection", 
        type=str, 
        default="mercator",
        choices=["stereographic", "orthographic", "lambert", "miller", "mollweide", "robinson", "mercator"],
        help="Map projection type (default: mercator)"
    )
    
    parser.add_argument(
        "--style", 
        type=str, 
        default="default",
        help="Visual style for the map (default: default)"
    )
    
    parser.add_argument(
        "--latitude", 
        type=float, 
        default=40.0,
        help="Observer latitude in degrees (default: 40.0)"
    )
    
    parser.add_argument(
        "--longitude", 
        type=float, 
        default=-74.0,
        help="Observer longitude in degrees (default: -74.0)"
    )
    
    parser.add_argument(
        "--batch-size", 
        type=int, 
        default=4,
        help="Number of tiles to generate concurrently (default: 4)"
    )
    
    parser.add_argument(
        "--clear-cache",
        action="store_true",
        help="Clear existing cache before generating new tiles"
    )
    
    parser.add_argument(
        "--no-composite",
        action="store_true",
        help="Skip creation of composite sky images"
    )
    
    args = parser.parse_args()
    
    # Clear cache if requested
    if args.clear_cache:
        print("🗑️ Clearing existing cache...")
        for file in TILE_CACHE_DIR.glob("*"):
            if file.is_file():
                file.unlink()
        print("✅ Cache cleared")
        print()
    
    # Run the async tile generation
    asyncio.run(pregenerate_tiles(
        max_zoom=args.max_zoom,
        projection=args.projection,
        style=args.style,
        latitude=args.latitude,
        longitude=args.longitude,
        batch_size=args.batch_size,
        create_composites=not args.no_composite
    ))


if __name__ == "__main__":
    main()