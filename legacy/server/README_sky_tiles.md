# Sky Map Tile Pre-generation

This directory contains tools for pre-generating sky map tiles to improve performance and reduce initial loading times.

## Pre-generation Script

### Usage

```bash
# Generate tiles up to zoom level 2 (default)
python pregenerate_sky_tiles.py

# Generate with specific parameters
python pregenerate_sky_tiles.py --max-zoom 3 --projection stereographic

# Clear cache and regenerate
python pregenerate_sky_tiles.py --clear-cache --max-zoom 2

# Generate for specific location (London)
python pregenerate_sky_tiles.py --latitude 51.5 --longitude -0.1
```

### Options

- `--max-zoom LEVEL`: Maximum zoom level (0-4, default: 2)
- `--projection PROJ`: Map projection (mercator, stereographic, etc.)
- `--style STYLE`: Visual style (default: default)
- `--latitude LAT`: Observer latitude in degrees (default: 40.0)
- `--longitude LON`: Observer longitude in degrees (default: -74.0)
- `--batch-size SIZE`: Concurrent tile generation (default: 4)
- `--clear-cache`: Clear existing cache before generating
- `--no-composite`: Skip creation of composite sky images

### Tile Count by Zoom Level

| Zoom | Grid Size | Total Tiles | Angular Size | Total (Cumulative) |
|------|-----------|-------------|--------------|-------------------|
| 0    | 1×1       | 1           | 180°         | 1                 |
| 1    | 2×2       | 4           | 90°          | 5                 |
| 2    | 4×4       | 16          | 45°          | 21                |
| 3    | 8×8       | 64          | 22.5°        | 85                |
| 4    | 16×16     | 256         | 11.25°       | 341               |

### Performance

- **Zoom 0-2**: ~21 tiles, ~20MB cache, ~71 seconds
- **Zoom 0-3**: ~85 tiles, ~80MB cache, ~5 minutes  
- **Zoom 0-4**: ~341 tiles, ~320MB cache, ~20 minutes

### Cache Location

Tiles are stored in `sky_tiles/` directory:
- `*.png` files: Individual tile images
- `*.npy` files: Full sky images for tile extraction

### Cache Structure

```
sky_tiles/
├── 4a90c4a4e0353ceb27bf3cdf1d086a77.png  # Individual tiles (512×439px)
├── a314d2172cbf6199dbaa3fd90ae69859.png  
├── 5f189b1753a4cb802a8410560572711a.npy  # Full sky images (zoom 1)
├── e4928d9393070da0db1dc16ba461a20f.npy  # Full sky images (zoom 2)
├── sky_composite_zoom0_mercator_default_40.0N_-74.0E.png  # Composite images
├── sky_composite_zoom1_mercator_default_40.0N_-74.0E.png  # (512×439px)
├── sky_composite_zoom2_mercator_default_40.0N_-74.0E.png  # (2048×1756px)
└── ...
```

### Composite Sky Images

The script automatically generates composite PNG images showing the complete sky at each zoom level:

| Zoom Level | Composite Size | Description | File Size |
|------------|----------------|-------------|-----------|
| 0 | 512×439px | Single tile view | ~0.2 MB |
| 1 | 1024×878px | 2×2 tile mosaic | ~0.4 MB |
| 2 | 2048×1756px | 4×4 tile mosaic | ~1.6 MB |
| 3 | 4096×3512px | 8×8 tile mosaic | ~6.4 MB |
| 4 | 8192×7024px | 16×16 tile mosaic | ~25.6 MB |

These composite images are useful for:
- **Quality verification**: Visual inspection of tile alignment and coverage
- **Documentation**: Overview images for presentations and documentation
- **Debugging**: Identifying gaps or issues in tile generation
- **Reference**: Complete sky maps for astronomical reference

## Benefits of Pre-generation

1. **Faster Initial Load**: No wait time for first tile requests
2. **Reduced Server Load**: Avoid computation during user interaction
3. **Predictable Performance**: Pre-computed tiles load consistently fast
4. **Better User Experience**: Smooth navigation without loading delays

## Recommended Strategy

For production deployment:

1. **Development**: Generate zoom 0-2 for testing (~20MB)
2. **Production**: Generate zoom 0-3 for full coverage (~80MB)
3. **High-traffic**: Generate zoom 0-4 for maximum performance (~320MB)

## Integration

The pre-generated tiles are automatically used by the sky map API endpoints. No additional configuration required - just run the script and the tiles will be served from cache.