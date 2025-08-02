# Network Simulation for Testing

This implementation adds network simulation capabilities to the server to test how the telescope application behaves under slow or unreliable network conditions using actual telescope images.

## Command Line Usage

### Start Server with Network Simulation

You can enable network simulation directly when starting the server using command line switches:

```bash
# Start with a preset
uv run python main.py server --network-sim slow_3g

# Start with custom parameters
uv run python main.py server \
  --network-sim-delay 500 \
  --network-sim-packet-loss 0.05 \
  --network-sim-bandwidth 100

# Combine preset with custom overrides
uv run python main.py server \
  --network-sim slow_3g \
  --network-sim-bandwidth 50  # Override just the bandwidth

# Available presets
--network-sim slow_3g        # 300ms delay, 2% loss, 200 KB/s
--network-sim slow_4g        # 150ms delay, 1% loss, 1000 KB/s
--network-sim unstable_wifi  # 50ms delay ±200ms, 5% loss, 5000 KB/s
--network-sim satellite      # 600ms delay, 3% loss, 1000 KB/s
--network-sim dial_up        # 200ms delay, 1% loss, 56 KB/s
--network-sim extreme_poor   # 1000ms delay, 10% loss, 50 KB/s
--network-sim intermittent   # 100ms delay ±300ms, 15% loss, 500 KB/s

# Custom parameters
--network-sim-delay FLOAT         # Base delay in milliseconds
--network-sim-packet-loss FLOAT   # Packet loss rate (0.0-1.0)
--network-sim-bandwidth FLOAT     # Bandwidth limit in KB/s
```

### Examples

```bash
# Simulate a poor mobile connection for telescope in the field
uv run python main.py server --seestar-host 192.168.1.100 --network-sim slow_3g

# Test with extreme network conditions
uv run python main.py server --network-sim extreme_poor

# Custom simulation for specific testing
uv run python main.py server \
  --network-sim-delay 200 \
  --network-sim-packet-loss 0.02 \
  --network-sim-bandwidth 500
```

## Features

### Network Conditions Simulation
- **Latency simulation** with configurable base delay and jitter
- **Packet loss simulation** with configurable drop rates
- **Bandwidth throttling** with configurable limits
- **Connection drops** and timeouts
- **Path-specific application** (applies only to image-related endpoints)

### Built-in Presets
- `slow_3g` - Slow 3G mobile connection (300ms delay, 2% packet loss, 200 KB/s)
- `slow_4g` - Slower 4G connection (150ms delay, 1% packet loss, 1000 KB/s)
- `unstable_wifi` - Unstable WiFi (50ms delay ±200ms jitter, 5% packet loss, 5000 KB/s)
- `satellite` - Satellite internet (600ms delay, 3% packet loss, 1000 KB/s)
- `dial_up` - Dial-up connection (200ms delay, 1% packet loss, 56 KB/s)
- `extreme_poor` - Extremely poor conditions (1000ms delay, 10% packet loss, 50 KB/s)
- `intermittent` - Intermittent connectivity (100ms delay ±300ms jitter, 15% packet loss)

### Telescope-Specific Scenarios
- `telescope-imaging` - Optimized for testing telescope imaging workflows
- `fits-processing` - Optimized for testing FITS file processing with large files

## API Endpoints

### Get Status
```bash
GET /api/network-simulation/status
```
Returns current simulation configuration and statistics.

### Enable/Disable
```bash
POST /api/network-simulation/enable   # Enable with current config
POST /api/network-simulation/disable  # Disable simulation
```

### Apply Presets
```bash
POST /api/network-simulation/presets/{preset_name}
```
Available presets: `slow_3g`, `slow_4g`, `unstable_wifi`, `satellite`, `dial_up`, `extreme_poor`, `intermittent`

### Custom Configuration
```bash
PUT /api/network-simulation/config
Content-Type: application/json

{
  "base_delay_ms": 300,
  "delay_variation_ms": 100,
  "packet_loss_rate": 0.02,
  "bandwidth_limit_kbps": 200,
  "connection_drop_rate": 0.01,
  "timeout_rate": 0.005,
  "enabled": true
}
```

### Telescope Scenarios
```bash
POST /api/network-simulation/scenarios/telescope-imaging
POST /api/network-simulation/scenarios/fits-processing
```

### Reset Statistics
```bash
POST /api/network-simulation/reset-stats
```

## Usage Examples

### Quick Test with Preset
```bash
# Apply slow 3G simulation
curl -X POST http://localhost:8000/api/network-simulation/presets/slow_3g

# Test image download
curl -o test.png http://localhost:8000/processed/2556120a-2a28-44ae-83e4-359c5c1e9e1d.png

# Check statistics
curl http://localhost:8000/api/network-simulation/status

# Disable simulation
curl -X POST http://localhost:8000/api/network-simulation/disable
```

### Using the Test Script
```bash
# Test baseline vs slow connection
python test_network_simulation.py

# Test specific preset
python test_network_simulation.py --preset slow_3g

# Test all presets
python test_network_simulation.py --all-presets

# Test specific images
python test_network_simulation.py --preset unstable_wifi --images \
  "processed/telescope_image_1.png" \
  "uploads/observation_data.fit"
```

### Testing Telescope Workflows

1. **Image Processing Testing**:
   ```bash
   curl -X POST http://localhost:8000/api/network-simulation/scenarios/fits-processing
   # Now upload and process FITS files through the UI
   ```

2. **Live Imaging Testing**:
   ```bash
   curl -X POST http://localhost:8000/api/network-simulation/scenarios/telescope-imaging
   # Now test live image streaming and capture
   ```

## Implementation Details

### Middleware Integration
The network simulation is implemented as FastAPI middleware that intercepts requests to image-related endpoints:
- `/api/processing/*` - Image processing endpoints
- `/processed/*` - Processed telescope images
- `/uploads/*` - Uploaded FITS files
- Files with extensions: `.png`, `.jpg`, `.jpeg`, `.fit`, `.fits`

### Actual Telescope Images
The simulation works with real telescope images stored in:
- `processed/` - Enhanced and processed telescope images (PNG format)
- `uploads/` - Original FITS files from telescope captures

These are actual astronomical images captured by Seestar telescopes, ranging from a few hundred KB to several MB in size.

### Statistics Tracking
The simulation tracks:
- Total requests processed
- Requests delayed, dropped, or timed out
- Average delay times
- Bytes throttled
- Uptime and requests per second

### Health Endpoint Integration
The `/health` endpoint includes network simulation status:
```json
{
  "status": "ok",
  "network_simulation": {
    "enabled": true,
    "requests_processed": 15,
    "requests_delayed": 12,
    "requests_dropped": 1
  }
}
```

## Testing Real-World Scenarios

### Scenario 1: Poor WiFi Connection
Simulate a user with unstable WiFi trying to process large FITS files:
```bash
curl -X POST http://localhost:8000/api/network-simulation/presets/unstable_wifi
# Upload a large FITS file through the processing UI
# Observe loading states, retry behavior, and error handling
```

### Scenario 2: Mobile Data Connection
Test the mobile experience with limited bandwidth:
```bash
curl -X POST http://localhost:8000/api/network-simulation/presets/slow_4g
# Access the telescope interface from mobile
# Test image loading, progress indicators, and fallback behavior
```

### Scenario 3: Remote Observatory
Simulate accessing a remote telescope over satellite internet:
```bash
curl -X POST http://localhost:8000/api/network-simulation/presets/satellite
# Test live streaming, command responsiveness, and timeout handling
```

## Best Practices

1. **Always test with real telescope data** - The simulation uses actual FITS files and processed images
2. **Test the complete workflow** - Enable simulation, perform telescope operations, check results
3. **Monitor the enhanced image components** - Verify retry logic, error boundaries, and loading states work correctly
4. **Reset statistics between tests** - Use the reset endpoint for clean metrics
5. **Disable simulation after testing** - Ensure normal operation when testing is complete

## Troubleshooting

### Simulation Not Working
- Check that the middleware is loaded (look for startup logs)
- Verify the request path matches the configured patterns
- Ensure simulation is enabled via the status endpoint

### Images Not Loading
- Check static file mounting (`/processed/` and `/uploads/` endpoints)
- Verify image files exist in the directories
- Test without simulation first to isolate issues

### Performance Issues
- Monitor statistics via the status endpoint
- Adjust bandwidth limits for reasonable test times
- Use shorter timeouts for faster iteration during development