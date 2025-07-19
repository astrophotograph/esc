"""API routes for sky map tile generation."""

import os
import math
import hashlib
import tempfile
import asyncio
import functools
import threading
from typing import Dict, Any, Optional
from pathlib import Path
from datetime import datetime
from PIL import Image

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from loguru import logger as logging
from pydantic import BaseModel
from services.async_image_processing import get_cpu_executor

# Import starplot for sky map generation
try:
    from starplot import MapPlot, Projection, _
    from starplot.styles import PlotStyle, extensions

    import matplotlib.pyplot as plt
    import numpy as np
    STARPLOT_AVAILABLE = True
except ImportError:
    STARPLOT_AVAILABLE = False
    logging.warning("Starplot not available - sky map tiles will not work")

router = APIRouter(prefix="/api/skymap", tags=["skymap"])

# Create cache directory for tiles
TILE_CACHE_DIR = Path("sky_tiles")
TILE_CACHE_DIR.mkdir(exist_ok=True)

# Constants for sky tiling
TILE_WIDTH = 512   # pixels
TILE_HEIGHT = 256  # pixels (2:1 aspect ratio for full sky)
MAX_ZOOM_LEVEL = 4  # From 0 (single tile) to 4 (16x16 grid)

# Thread-local storage for starplot initialization
_thread_local = threading.local()

# Global lock for starplot database operations to prevent SQLite conflicts
_starplot_lock = threading.Lock()


class TileRequest(BaseModel):
    """Request model for sky tile generation."""
    x: int
    y: int
    z: int  # zoom level
    projection: str = "stereographic"
    style: str = "default"
    time: Optional[str] = None  # ISO format datetime
    latitude: float = 40.0  # Default observer latitude
    longitude: float = -74.0  # Default observer longitude


class SkyTileSystem:
    """Sky tile coordinate system for astronomical mapping."""
    
    def __init__(self):
        self.tile_width = TILE_WIDTH
        self.tile_height = TILE_HEIGHT
        
    def get_sky_bounds(self, x: int, y: int, z: int) -> Dict[str, float]:
        """
        Calculate sky coordinates for a given tile.
        
        For astronomical purposes, we map the entire celestial sphere:
        - RA: 0 to 360 degrees (Right Ascension)
        - Dec: -90 to +90 degrees (Declination)
        
        Args:
            x: Tile X coordinate
            y: Tile Y coordinate 
            z: Zoom level (0 = single tile covering entire sky)
            
        Returns:
            Dictionary with ra_min, ra_max, dec_min, dec_max in degrees
        """
        # Number of tiles per axis at this zoom level
        n_tiles = 2 ** z
        
        # RA spans 360 degrees, Dec spans 180 degrees
        ra_per_tile = 360.0 / n_tiles
        dec_per_tile = 180.0 / n_tiles
        
        # Calculate bounds
        ra_min = x * ra_per_tile
        ra_max = (x + 1) * ra_per_tile
        
        # Dec goes from +90 at y=0 to -90 at y=n_tiles
        dec_max = 90.0 - (y * dec_per_tile)
        dec_min = 90.0 - ((y + 1) * dec_per_tile)
        
        return {
            "ra_min": ra_min,
            "ra_max": ra_max,
            "dec_min": dec_min,
            "dec_max": dec_max
        }
    
    def get_tile_center(self, x: int, y: int, z: int) -> Dict[str, float]:
        """Get the center coordinates of a tile."""
        bounds = self.get_sky_bounds(x, y, z)
        return {
            "ra": (bounds["ra_min"] + bounds["ra_max"]) / 2,
            "dec": (bounds["dec_min"] + bounds["dec_max"]) / 2
        }
    
    def get_angular_size(self, z: int) -> float:
        """Get the angular size (field of view) for a zoom level in degrees."""
        n_tiles = 2 ** z
        # Each tile covers part of the 360x180 degree sky
        # We use the smaller dimension (declination) for field of view
        return 180.0 / n_tiles


tile_system = SkyTileSystem()


def _ensure_starplot_initialized():
    """
    Ensure starplot is properly initialized for the current thread.
    Uses thread-local storage and a global lock to prevent SQLite conflicts.
    """
    # Check if already initialized for this thread
    if hasattr(_thread_local, 'starplot_initialized') and _thread_local.starplot_initialized:
        return True
    
    thread_id = threading.current_thread().ident
    
    # Use a lock to prevent concurrent database initialization
    with _starplot_lock:
        try:
            if not STARPLOT_AVAILABLE:
                logging.warning(f"Starplot not available in thread {thread_id}")
                return False
            
            # Set matplotlib backend for thread safety
            import matplotlib
            matplotlib.use('Agg')
            
            # Initialize starplot components in a controlled manner
            from starplot import MapPlot, Projection
            from starplot.styles import PlotStyle, extensions
            
            # Create a minimal plot to trigger database initialization
            # This forces starplot to set up its internal database connections
            style = PlotStyle().extend(extensions.BLUE_GOLD, extensions.MAP)
            
            # Use a small but valid coordinate range to avoid NaN/Inf axis limits
            # Ensure we have a proper date/time for the plot
            from datetime import datetime, timezone as dt_timezone
            temp_plot = MapPlot(
                projection=Projection.STEREOGRAPHIC,
                ra_min=0, ra_max=10, dec_min=0, dec_max=10,  # Small valid range
                lat=40.0, lon=-74.0,  # Valid observer location
                dt=datetime.now(dt_timezone.utc),  # Current time
                style=style,
                figure_size=(2, 2)  # Small but reasonable size
            )
            
            # Mark as initialized for this thread
            _thread_local.starplot_initialized = True
            logging.info(f"Successfully initialized starplot for thread {thread_id}")
            return True
            
        except Exception as e:
            logging.error(f"Failed to initialize starplot for thread {thread_id}: {e}")
            _thread_local.starplot_initialized = False
            return False


def generate_tile_cache_key(x: int, y: int, z: int, projection: str, style: str, 
                          time: Optional[str] = None, latitude: float = 40.0, 
                          longitude: float = -74.0) -> str:
    """Generate a cache key for a tile."""
    # Create hash from parameters
    params = f"{x}_{y}_{z}_{projection}_{style}_{time}_{latitude}_{longitude}"
    return hashlib.md5(params.encode()).hexdigest()


def _generate_full_sky_image_sync(z: int, projection: str, style: str, time: Optional[str], 
                                 latitude: float, longitude: float) -> np.ndarray:
    """
    Generate a full sky image at high resolution for tiling (runs in worker thread).
    
    Args:
        z: Zoom level 
        projection: Map projection type
        style: Visual style for the map
        time: Observation time (ISO format)
        latitude, longitude: Observer location
        
    Returns:
        High-resolution image as numpy array
    """
    # Ensure starplot is properly initialized for this thread
    if not _ensure_starplot_initialized():
        raise Exception("Failed to initialize starplot for this thread")
        
    logging.info(f"Generating full sky image for zoom {z} in thread: {threading.current_thread().name}")
    
    try:
        # Parse observation time with timezone
        from datetime import timezone as dt_timezone
        if time:
            obs_time = datetime.fromisoformat(time.replace('Z', '+00:00'))
        else:
            obs_time = datetime.now(dt_timezone.utc)
        
        # Import starplot components needed for this function
        from starplot import _
        
        # Set up projection
        proj_mapping = {
            "stereographic": Projection.STEREOGRAPHIC,
            "orthographic": Projection.ORTHOGRAPHIC,
            "lambert": Projection.LAMBERT_AZ_EQ_AREA,
            "miller": Projection.MILLER,
            "mollweide": Projection.MOLLWEIDE,
            "robinson": Projection.ROBINSON,
            "mercator": Projection.MERCATOR
        }
        proj = proj_mapping.get(projection, Projection.STEREOGRAPHIC)

        plot_style = PlotStyle().extend(
            extensions.BLUE_GOLD,
            extensions.MAP,
        )

        # Calculate resolution based on zoom level
        # Higher zoom = higher resolution for better tile quality
        tiles_per_axis = 2 ** z
        target_width = TILE_WIDTH * tiles_per_axis
        target_height = TILE_HEIGHT * tiles_per_axis
        
        logging.info(f"Target image size: {target_width}x{target_height} for zoom {z}")
        
        # Use DPI scaling to control exact pixel dimensions
        # Set DPI high enough to get target resolution with reasonable figure size
        dpi = 100
        fig_width = target_width / dpi
        fig_height = target_height / dpi
        
        logging.info(f"Figure size: {fig_width:.2f}x{fig_height:.2f} inches at {dpi} DPI")
        
        # Use lock around all starplot operations to prevent SQLite conflicts
        with _starplot_lock:
            plot = MapPlot(
                projection=proj,
                ra_min=0,    # Full sky coverage
                ra_max=360,
                dec_min=-90,
                dec_max=90,
                lat=latitude,
                lon=longitude,
                dt=obs_time,
                style=plot_style,
                figure_size=(fig_width, fig_height),
                auto_scale=False,  # Disable auto-scaling to maintain aspect ratio
            )

            # Add astronomical objects with zoom-appropriate detail
            base_mag = min(8, z * 2)  # Limit maximum magnitude
            plot.gridlines()
            plot.constellations()
            plot.constellation_borders()
            plot.stars(
                where=[_.magnitude < base_mag], 
                bayer_labels=(z >= 2), 
                flamsteed_labels=(z >= 3)
            )

            if z >= 1:
                plot.galaxies(where=[_.magnitude < base_mag + 4.5], true_size=True)
                plot.nebula(where=[(_.magnitude < base_mag + 2) | (_.magnitude.isnull())])
                plot.open_clusters(
                    where=[(_.magnitude < base_mag + 1) | (_.magnitude.isnull())], 
                    where_labels=False
                )

            plot.milky_way()
            plot.ecliptic()
            
            if z >= 2:
                plot.constellation_labels()

            # Export to temporary file and load as image array
            with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as tmp_file:
                plot.export(tmp_file.name)

        # Process the exported file outside the lock
        # Load image and resize to web-friendly dimensions while preserving aspect ratio
        pil_image = Image.open(tmp_file.name)
        
        logging.info(f"Full sky image native size: {pil_image.size}")
        
        # Calculate target size based on zoom level but preserve starplot's natural aspect ratio
        native_width, native_height = pil_image.size
        native_aspect = native_width / native_height
        
        # For full sky images, scale down to reasonable web size while preserving aspect ratio
        final_width = target_width  # Use our target width
        final_height = int(final_width / native_aspect)  # Preserve starplot's aspect ratio
        
        logging.info(f"Resizing full sky image to: {final_width}x{final_height} (aspect: {native_aspect:.3f})")
        pil_image = pil_image.resize((final_width, final_height), Image.Resampling.LANCZOS)
        
        image_array = np.array(pil_image)
        
        # Clean up temp file
        os.unlink(tmp_file.name)
            
        logging.info(f"Generated full sky image: {image_array.shape}")
        return image_array
        
    except Exception as e:
        logging.error(f"Failed to generate full sky image: {e}")
        raise


def _extract_tile_from_image_sync(image_array: np.ndarray, x: int, y: int, z: int) -> bytes:
    """
    Extract a tile from a high-resolution image (runs in worker thread).
    
    Args:
        image_array: Full sky image array
        x, y, z: Tile coordinates
        
    Returns:
        PNG bytes for the tile
    """
    import threading
    logging.info(f"Extracting tile {x},{y} from full image in thread: {threading.current_thread().name}")
    
    try:
        tiles_per_axis = 2 ** z
        height, width = image_array.shape[:2]
        
        # Calculate tile boundaries
        tile_width = width // tiles_per_axis
        tile_height = height // tiles_per_axis
        
        # Extract tile region
        start_x = x * tile_width
        end_x = min(start_x + tile_width, width)
        start_y = y * tile_height
        end_y = min(start_y + tile_height, height)
        
        tile_array = image_array[start_y:end_y, start_x:end_x]
        
        # Convert to PNG bytes
        pil_image = Image.fromarray(tile_array)
        
        import io
        output_buffer = io.BytesIO()
        pil_image.save(output_buffer, format='PNG')
        return output_buffer.getvalue()
        
    except Exception as e:
        logging.error(f"Failed to extract tile {x},{y}: {e}")
        raise


async def generate_sky_tile_async(x: int, y: int, z: int, projection: str = "mercator",
                                 style: str = "default", time: Optional[str] = None,
                                 latitude: float = 40.0, longitude: float = -74.0) -> Path:
    """
    Generate a sky tile asynchronously using worker threads.
    
    For zoom level 0: Generate individual tile
    For zoom level >= 1: Generate full high-res image and extract tile
    """
    if not STARPLOT_AVAILABLE:
        raise HTTPException(status_code=500, detail="Starplot not available")
    
    # Generate cache key and check if tile exists
    cache_key = generate_tile_cache_key(x, y, z, projection, style, time, latitude, longitude)
    cache_path = TILE_CACHE_DIR / f"{cache_key}.png"
    
    if cache_path.exists():
        logging.info(f"Returning cached tile: {cache_path}")
        return cache_path
    
    loop = asyncio.get_event_loop()
    executor = get_cpu_executor()
    
    try:
        if z == 0:
            # For zoom 0, generate single tile directly
            logging.info(f"Generating individual tile {x},{y} at zoom {z}")
            
            # Generate bounds for this specific tile
            bounds = tile_system.get_sky_bounds(x, y, z)
            
            # Run in thread pool
            image_array = await loop.run_in_executor(
                executor,
                functools.partial(
                    _generate_individual_tile_sync,
                    bounds, projection, style, time, latitude, longitude, z
                )
            )
            
            # Convert to PNG bytes
            tile_bytes = await loop.run_in_executor(
                executor,
                functools.partial(_array_to_png_bytes, image_array)
            )
            
        else:
            # For zoom >= 1, generate full image and extract tile
            logging.info(f"Generating full sky image for zoom {z}, then extracting tile {x},{y}")
            
            # Check if we have a cached full image for this zoom level
            full_image_cache_key = f"fullsky_{z}_{projection}_{style}_{time}_{latitude}_{longitude}"
            full_image_cache_key = hashlib.md5(full_image_cache_key.encode()).hexdigest()
            full_image_cache_path = TILE_CACHE_DIR / f"{full_image_cache_key}.npy"
            
            if full_image_cache_path.exists():
                # Load cached full image
                logging.info(f"Loading cached full sky image for zoom {z}")
                image_array = await loop.run_in_executor(
                    executor,
                    functools.partial(np.load, str(full_image_cache_path))
                )
            else:
                # Generate new full image
                image_array = await loop.run_in_executor(
                    executor,
                    functools.partial(
                        _generate_full_sky_image_sync,
                        z, projection, style, time, latitude, longitude
                    )
                )
                
                # Cache the full image for future tile extractions
                await loop.run_in_executor(
                    executor,
                    functools.partial(np.save, str(full_image_cache_path), image_array)
                )
                logging.info(f"Cached full sky image for zoom {z}")
            
            # Extract the specific tile
            tile_bytes = await loop.run_in_executor(
                executor,
                functools.partial(_extract_tile_from_image_sync, image_array, x, y, z)
            )
        
        # Save tile to cache
        with open(cache_path, "wb") as f:
            f.write(tile_bytes)
        
        logging.info(f"Generated and cached sky tile: {cache_path}")
        return cache_path
        
    except Exception as e:
        logging.error(f"Failed to generate sky tile {x},{y},{z}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate tile: {str(e)}")


def _generate_individual_tile_sync(bounds: Dict[str, float], projection: str, style: str, 
                                  time: Optional[str], latitude: float, longitude: float, 
                                  z: int) -> np.ndarray:
    """Generate a single tile for zoom level 0."""
    # Ensure starplot is properly initialized for this thread
    if not _ensure_starplot_initialized():
        raise Exception("Failed to initialize starplot for this thread")
    
    logging.info(f"Generating individual tile in thread: {threading.current_thread().name}")
    
    try:
        # Parse observation time with timezone  
        from datetime import timezone as dt_timezone
        if time:
            obs_time = datetime.fromisoformat(time.replace('Z', '+00:00'))
        else:
            obs_time = datetime.now(dt_timezone.utc)
        
        # Import starplot components needed for this function
        from starplot import _
        
        # Set up projection
        proj_mapping = {
            "stereographic": Projection.STEREOGRAPHIC,
            "orthographic": Projection.ORTHOGRAPHIC,
            "lambert": Projection.LAMBERT_AZ_EQ_AREA,
            "miller": Projection.MILLER,
            "mollweide": Projection.MOLLWEIDE,
            "robinson": Projection.ROBINSON,
            "mercator": Projection.MERCATOR
        }
        proj = proj_mapping.get(projection, Projection.STEREOGRAPHIC)

        plot_style = PlotStyle().extend(
            extensions.BLUE_GOLD,
            extensions.MAP,
        )

        # Calculate proper figure size with exact pixel control
        ra_range = bounds["ra_max"] - bounds["ra_min"]
        dec_range = bounds["dec_max"] - bounds["dec_min"]
        
        if ra_range == 360 and dec_range == 180:
            # Full sky - use exact 2:1 aspect ratio (512x256)
            target_width = TILE_WIDTH
            target_height = TILE_HEIGHT
        else:
            # For partial sky, maintain sky coordinate aspect ratio
            coord_aspect_ratio = ra_range / dec_range
            if coord_aspect_ratio >= 2.0:
                # Wide tile - fit to width
                target_width = TILE_WIDTH
                target_height = int(TILE_WIDTH / coord_aspect_ratio)
            else:
                # Tall tile - fit to height  
                target_height = TILE_HEIGHT
                target_width = int(TILE_HEIGHT * coord_aspect_ratio)
        
        # Use DPI scaling for exact dimensions
        dpi = 100
        fig_width = target_width / dpi
        fig_height = target_height / dpi
        
        # Use lock around all starplot operations to prevent SQLite conflicts
        with _starplot_lock:
            plot = MapPlot(
                projection=proj,
                ra_min=bounds["ra_min"],
                ra_max=bounds["ra_max"],
                dec_min=bounds["dec_min"],
                dec_max=bounds["dec_max"],
                lat=latitude,
                lon=longitude,
                dt=obs_time,
                style=plot_style,
                figure_size=(fig_width, fig_height),
                auto_scale=False,  # Disable auto-scaling to maintain aspect ratio
            )

            # Add astronomical objects
            base_mag = z * 2
            plot.gridlines()
            plot.constellations()
            plot.constellation_borders()
            plot.stars(where=[_.magnitude < base_mag], bayer_labels=True, flamsteed_labels=True)
            plot.galaxies(where=[_.magnitude < base_mag + 4.5], true_size=True)
            plot.nebula(where=[(_.magnitude < base_mag + 2) | (_.magnitude.isnull())])
            plot.open_clusters(
                where=[(_.magnitude < base_mag + 1) | (_.magnitude.isnull())], where_labels=False
            )
            plot.milky_way()
            plot.ecliptic()
            plot.constellation_labels()

            # Export to temporary file and load as array
            with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as tmp_file:
                plot.export(tmp_file.name)

        # Process the exported file outside the lock
        pil_image = Image.open(tmp_file.name)
        
        logging.info(f"Individual tile native size: {pil_image.size}")
        
        # Resize to web-friendly dimensions while preserving starplot's natural aspect ratio
        native_width, native_height = pil_image.size
        native_aspect = native_width / native_height
        
        # Scale to target width and adjust height to preserve aspect ratio
        final_width = target_width
        final_height = int(final_width / native_aspect)
        
        logging.info(f"Resizing individual tile to: {final_width}x{final_height} (aspect: {native_aspect:.3f})")
        pil_image = pil_image.resize((final_width, final_height), Image.Resampling.LANCZOS)
        
        image_array = np.array(pil_image)
        os.unlink(tmp_file.name)
            
        return image_array
        
    except Exception as e:
        logging.error(f"Failed to generate individual tile: {e}")
        raise


def _array_to_png_bytes(image_array: np.ndarray) -> bytes:
    """Convert numpy array to PNG bytes."""
    pil_image = Image.fromarray(image_array)
    import io
    output_buffer = io.BytesIO()
    pil_image.save(output_buffer, format='PNG')
    return output_buffer.getvalue()


@router.get("/tile/{z}/{x}/{y}")
async def get_sky_tile(
    x: int,
    y: int, 
    z: int,
    projection: str = Query("stereographic", description="Map projection"),
    style: str = Query("default", description="Visual style"),
    time: Optional[str] = Query(None, description="Observation time (ISO format)"),
    latitude: float = Query(40.0, description="Observer latitude"),
    longitude: float = Query(-74.0, description="Observer longitude")
):
    """
    Get a sky map tile for the specified coordinates and zoom level.
    
    Tile coordinate system:
    - z=0: Single tile covering entire sky (360° RA × 180° Dec)
    - z=1: 2×2 grid (4 tiles)
    - z=2: 4×4 grid (16 tiles)
    - z=3: 8×8 grid (64 tiles)
    - z=4: 16×16 grid (256 tiles)
    """
    # Validate zoom level
    if z < 0 or z > MAX_ZOOM_LEVEL:
        raise HTTPException(
            status_code=400, 
            detail=f"Zoom level must be between 0 and {MAX_ZOOM_LEVEL}"
        )
    
    # Validate tile coordinates for this zoom level
    max_coord = (2 ** z) - 1
    if x < 0 or x > max_coord or y < 0 or y > max_coord:
        raise HTTPException(
            status_code=400,
            detail=f"Tile coordinates must be between 0 and {max_coord} for zoom level {z}"
        )
    
    try:
        # Generate the tile asynchronously using worker threads
        tile_path = await generate_sky_tile_async(x, y, z, projection, style, time, latitude, longitude)
        
        # Return the tile image
        return FileResponse(
            tile_path,
            media_type="image/png",
            headers={
                "Cache-Control": "public, max-age=3600",  # Cache for 1 hour
                "X-Tile-Coords": f"{x},{y},{z}",
                "X-Sky-Bounds": f"RA:{tile_system.get_sky_bounds(x,y,z)['ra_min']:.1f}-{tile_system.get_sky_bounds(x,y,z)['ra_max']:.1f},Dec:{tile_system.get_sky_bounds(x,y,z)['dec_min']:.1f}-{tile_system.get_sky_bounds(x,y,z)['dec_max']:.1f}"
            }
        )
        
    except Exception as e:
        logging.error(f"Failed to serve sky tile {x}/{y}/{z}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/info")
async def get_skymap_info():
    """Get information about the sky map tile system."""
    return {
        "tile_width": TILE_WIDTH,
        "tile_height": TILE_HEIGHT,
        "max_zoom_level": MAX_ZOOM_LEVEL,
        "total_tiles_at_max_zoom": (2 ** MAX_ZOOM_LEVEL) ** 2,
        "angular_coverage": {
            f"zoom_{z}": {
                "tiles_per_axis": 2 ** z,
                "total_tiles": (2 ** z) ** 2,
                "degrees_per_tile": tile_system.get_angular_size(z),
                "ra_range": "0-360°",
                "dec_range": "-90° to +90°"
            }
            for z in range(MAX_ZOOM_LEVEL + 1)
        },
        "supported_projections": ["stereographic", "orthographic", "lambert", "miller", "mollweide", "robinson", "mercator"],
        "cache_directory": str(TILE_CACHE_DIR),
        "starplot_available": STARPLOT_AVAILABLE
    }


@router.delete("/cache")
async def clear_tile_cache():
    """Clear the sky tile cache."""
    try:
        deleted_count = 0
        for tile_file in TILE_CACHE_DIR.glob("*.png"):
            tile_file.unlink()
            deleted_count += 1
        
        return {
            "success": True,
            "message": f"Cleared {deleted_count} cached tiles"
        }
    except Exception as e:
        logging.error(f"Failed to clear tile cache: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/cache/stats")
async def get_cache_stats():
    """Get statistics about the tile cache."""
    try:
        tile_files = list(TILE_CACHE_DIR.glob("*.png"))
        total_size = sum(f.stat().st_size for f in tile_files)
        
        return {
            "cached_tiles": len(tile_files),
            "total_size_bytes": total_size,
            "total_size_mb": round(total_size / (1024 * 1024), 2),
            "cache_directory": str(TILE_CACHE_DIR)
        }
    except Exception as e:
        logging.error(f"Failed to get cache stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))