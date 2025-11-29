# Getting Started

This guide will help you set up and connect to your Seestar telescope for the first time.

## System Requirements

### Minimum Requirements
- Modern web browser (Chrome, Firefox, Safari, Edge)
- Network connection (same network as telescope)
- Screen resolution: 1280x720 or higher

### Recommended
- Chrome or Edge for best WebRTC performance
- Stable Wi-Fi connection
- Screen resolution: 1920x1080 or higher
- Keyboard for shortcuts

## Initial Setup

### 1. Network Configuration

Ensure your telescope and computer are on the same network:

1. **Station Mode** (Recommended):
   - Connect your Seestar to your home Wi-Fi network
   - Connect your computer to the same network
   - The app will automatically discover your telescope

2. **Access Point Mode**:
   - Connect directly to the Seestar's Wi-Fi network
   - Network name: `Seestar_XXXX` (where XXXX is your device ID)
   - Default password: Check your telescope documentation

### 2. Accessing the Application

1. Open your web browser
2. Navigate to the application URL (typically `http://localhost:3000` for development)
3. The application will automatically start searching for telescopes

## Telescope Discovery and Connection

### Automatic Discovery

The application automatically discovers Seestar telescopes on your network:

1. **Discovery Process**:
   - Takes 2-5 seconds typically
   - Shows "Searching for telescopes..." status
   - Lists all found telescopes with their names and status

2. **Connection Status Indicators**:
   - 🟢 **Connected**: Telescope is online and ready
   - 🟡 **Connecting**: Establishing connection
   - 🔴 **Disconnected**: Telescope is offline or unreachable
   - 🟠 **Error**: Connection issue (check troubleshooting)

### Manual Connection

If automatic discovery fails:

1. Click the **"Manage Telescopes"** button in the header
2. Select **"Add Telescope Manually"**
3. Enter telescope details:
   - **IP Address**: e.g., `192.168.1.100`
   - **Port**: Default is `4700`
   - **Name**: Custom name for identification

### Selecting a Telescope

1. Use the telescope selector dropdown in the header
2. Click on the telescope you want to control
3. The camera view will automatically connect
4. Connection status appears in the header

## First Time Connection

### What Happens on Connection

1. **Camera Feed Initialization**:
   - WebRTC connection established (low latency)
   - Falls back to MJPEG if WebRTC fails
   - Live view appears in main window

2. **Status Synchronization**:
   - Current telescope position (RA/Dec)
   - Temperature and battery status
   - Tracking and parking state
   - Current camera settings

3. **Control Panel Activation**:
   - All controls become active
   - Current values populated
   - Ready for operation

### Initial Camera View

The camera view shows:
- Live feed from the telescope
- Connection type indicator (WebRTC/MJPEG)
- Stream statistics (FPS, resolution)
- Overlay controls (zoom, annotations, starmap)

## Basic Navigation

### Main Interface Areas

1. **Header Bar**:
   - Telescope selector
   - Connection status
   - Quick action buttons
   - Settings access

2. **Camera View** (Center):
   - Live telescope feed
   - Overlay controls
   - PIP and starmap toggles

3. **Control Panel** (Right):
   - Tabbed interface
   - Telescope controls
   - Session management
   - Settings

4. **Optional Panels**:
   - Stats panel (system metrics)
   - Log panel (activity log)
   - Imaging metrics

### Essential Controls

1. **Camera Controls**:
   - Exposure slider
   - Gain adjustment
   - Brightness/Contrast
   - Focus controls

2. **Movement**:
   - Directional pad
   - Speed selector
   - GoTo input
   - Park button

3. **View Options**:
   - Fullscreen toggle
   - PIP window
   - Starmap overlay
   - Annotations

## Quick Start Checklist

- [ ] Telescope powered on
- [ ] Connected to same network
- [ ] Application loaded in browser
- [ ] Telescope discovered and selected
- [ ] Live view displayed
- [ ] Controls responsive

## Next Steps

- Learn about [Camera Controls](./camera-controls.md)
- Explore [Telescope Movement](./telescope-control.md)
- Start your first [Observation Session](./observation-management.md)

## Troubleshooting Connection Issues

### Telescope Not Found

1. Verify network connection
2. Check telescope is powered on
3. Ensure on same network subnet
4. Try manual connection
5. Check firewall settings

### Connection Drops

1. Check Wi-Fi signal strength
2. Verify network stability
3. Consider switching to MJPEG mode
4. Check telescope battery level

### Slow Performance

1. Close unnecessary browser tabs
2. Check network bandwidth
3. Reduce camera resolution
4. Disable unused overlays

## Tips for Best Experience

1. **Use Keyboard Shortcuts**: Press `?` to see all shortcuts
2. **Customize Layout**: Collapse panels you don't need
3. **Save Equipment Sets**: Pre-configure your common setups
4. **Enable Notifications**: Get alerts for important events
5. **Regular Saves**: Session data auto-saves every 5 minutes

---

Ready to start observing? Continue to [Camera Controls](./camera-controls.md) →