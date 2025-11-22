# Camera and Live View

Master the camera controls to capture the best views through your telescope.

## Live View Modes

### WebRTC (Recommended)
- **Ultra-low latency** (<100ms typical)
- **High quality** video streaming
- **Automatic quality adjustment** based on network
- **Real-time** response to control changes

### MJPEG Fallback
- **Reliable** connection method
- **Higher latency** (200-500ms)
- **Fixed quality** settings
- **Better compatibility** with older systems

### Connection Status
The current connection type is shown in the camera view header:
- 🟢 **WebRTC Connected**: Optimal performance
- 🟡 **MJPEG Active**: Fallback mode
- 🔴 **Disconnected**: No video feed

## Camera Settings

### Exposure Control
Adjust the exposure time to control image brightness:

- **Range**: 0.1s to 10s (varies by mode)
- **Auto-exposure**: Available in some modes
- **Live preview**: See changes in real-time
- **Keyboard**: Use `[` and `]` to decrease/increase

**Tips:**
- Start with shorter exposures for bright objects
- Increase exposure for faint deep-sky objects
- Watch the histogram to avoid overexposure

### Gain Settings
Control the camera's sensitivity:

- **Range**: 0-100 (unitless)
- **Low gain** (0-30): Less noise, better for bright objects
- **Medium gain** (30-70): Balanced performance
- **High gain** (70-100): More sensitive, more noise

**Best Practices:**
- Use lowest gain that gives acceptable brightness
- Increase gain before extending exposure time
- High gain useful for finding/centering objects

### Brightness & Contrast
Fine-tune the image appearance:

- **Brightness**: -100 to +100 (default: 0)
- **Contrast**: 0 to 200 (default: 100)
- **Real-time adjustment**: Changes apply immediately
- **Non-destructive**: Only affects display, not saved images

### Focus Control
Achieve sharp images with precise focus adjustment:

- **Fine adjustment**: ±10 steps
- **Medium adjustment**: ±50 steps  
- **Coarse adjustment**: ±100 steps
- **Position indicator**: Shows current focus position
- **Keyboard shortcuts**: `F` and `G` for in/out

**Focusing Tips:**
1. Use a bright star for initial focus
2. Enable zoom (2x/4x) for fine adjustment
3. Watch for diffraction spikes or Airy disk
4. Note focus positions for different temperatures

## Picture-in-Picture (PIP) Window

### Overview
Monitor multiple camera feeds simultaneously:

- **Draggable window**: Position anywhere on screen
- **Resizable**: Small, Medium, Large, Extra-Large
- **Multiple sources**: All-sky, guide, finder cameras
- **Persistent position**: Remembers location between sessions

### PIP Controls

1. **Camera Selection**:
   - All-Sky: Wide-field environmental camera
   - Guide: Tracking/guiding camera
   - Finder: Wide-field finder scope

2. **Size Options**:
   - **S (Small)**: 200x150px - Minimal screen usage
   - **M (Medium)**: 320x240px - Good balance
   - **L (Large)**: 480x360px - Detailed view
   - **XL (Extra-Large)**: 640x480px - Maximum detail

3. **Window Controls**:
   - **Minimize/Maximize**: Collapse to header only
   - **Fullscreen**: Expand to fill entire screen
   - **Close**: Hide PIP window
   - **Settings**: Configure overlays

### PIP Overlays
Enhance the PIP view with overlays:

- **Crosshairs**: Center reference
- **Grid**: Alignment assistance  
- **Measurements**: Scale indicators
- **Compass**: Directional reference

## Starmap Window

### Features
Real-time sky chart showing telescope position:

- **Current pointing**: Marked with crosshairs
- **Constellation lines**: Visual reference
- **Star magnitudes**: Sized by brightness
- **Coordinate grid**: RA/Dec reference
- **Auto-update**: Follows telescope movement

### Starmap Controls

1. **Window Management**:
   - **Draggable**: Click and drag header
   - **Resizable**: S/M/L/XL options
   - **Persistent position**: Saves location
   - **Minimize/Maximize**: Collapse when not needed

2. **Display Options**:
   - Updates every 2 seconds during movement
   - Only loads when coordinates change
   - Fullscreen mode available
   - Toggle with Map button in camera header

### Using the Starmap
- **Orientation**: Matches telescope view
- **Planning**: See nearby objects
- **Verification**: Confirm pointing accuracy
- **Navigation**: Plan star-hopping routes

## Annotation System

### Overview
Intelligent object identification in your field of view:

- **Automatic detection**: Identifies known objects
- **Real-time updates**: Follows telescope movement
- **Customizable display**: Control what you see
- **Performance optimized**: Minimal impact on viewing

### Annotation Types

1. **Stars**:
   - Named stars (Vega, Sirius, etc.)
   - Magnitude information
   - Spectral class indicators

2. **Deep Sky Objects**:
   - Galaxies (M31, NGC numbers)
   - Nebulae (emission, planetary)
   - Clusters (open, globular)

3. **Solar System**:
   - Planets and moons
   - Asteroids (if configured)
   - Comets (when available)

### Annotation Settings

Access via the Settings button in camera view:

1. **Display Options**:
   - Show/hide labels
   - Show magnitudes
   - Show constellation lines
   - Adjust label size

2. **Filtering**:
   - Minimum/maximum magnitude
   - Object type selection
   - Density control

3. **Appearance**:
   - Circle color and opacity
   - Label color and opacity
   - Line thickness
   - Font size

## Zoom Controls

### Digital Zoom
Magnify the view without changing telescope settings:

- **2x Zoom**: Good for centering
- **4x Zoom**: Fine focus adjustment
- **8x Zoom**: Detailed inspection
- **Keyboard**: `+` and `-` to zoom

### Zoom Tips
- Use for precise GoTo alignment
- Helpful for focusing on stars
- Check collimation with star test
- Inspect tracking accuracy

## Image Statistics

### Live Histogram
Monitor exposure quality in real-time:

- **RGB channels**: Individual color response
- **Peak detection**: Avoid clipping
- **Dynamic range**: Use full sensor capability
- **Update rate**: Every frame

### Statistical Data
- **Mean**: Average pixel value
- **Std Dev**: Image contrast indicator
- **Min/Max**: Dynamic range usage
- **Peak**: Most common value

## Overlay Controls

### Available Overlays
Toggle various information displays:

1. **Crosshairs**: Centering aid
2. **Grid**: Composition helper
3. **Compass**: Orientation indicator
4. **Scale**: Field of view reference
5. **Info**: Coordinates and time

### Customization
- Adjust overlay opacity
- Change colors for visibility
- Enable/disable individually
- Save preferred configurations

## Performance Optimization

### For Best Results

1. **Network**:
   - Use 5GHz Wi-Fi when possible
   - Minimize distance to router
   - Avoid interference sources

2. **Browser**:
   - Close unnecessary tabs
   - Use hardware acceleration
   - Keep browser updated

3. **Display**:
   - Disable unused overlays
   - Reduce PIP window size if needed
   - Use appropriate zoom level

### Troubleshooting Video Issues

1. **Frozen Frame**:
   - Check connection status
   - Try switching video modes
   - Refresh the page

2. **Poor Quality**:
   - Verify network speed
   - Check gain/exposure settings
   - Clean optical surfaces

3. **High Latency**:
   - Switch to WebRTC if using MJPEG
   - Check network congestion
   - Reduce other network usage

## Advanced Features

### Multi-Monitor Support
- Drag PIP to second monitor
- Fullscreen on any display
- Remember positions per monitor

### Custom Overlays
- Import custom markers
- Create observation notes
- Save annotated views

### Integration Features
- Sync with planning software
- Export view coordinates
- Share live views (if configured)

---

Next: Learn about [Telescope Control](./telescope-control.md) →