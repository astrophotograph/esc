# WebSocket Test Utilities

This directory contains command-line utilities for testing and debugging WebSocket connections to telescopes.

## Test Scripts

### `test_websocket.py`
Basic WebSocket connectivity and subscription testing.

**Usage:**
```bash
# Test general WebSocket connection
uv run python test_websocket.py

# Test telescope-specific WebSocket connection
uv run python test_websocket.py 870c9918
```

**What it tests:**
- Server health check via `/api/ws/health`
- Telescope API availability via `/api/telescopes`
- WebSocket connection to `/api/ws` or `/api/ws/{telescope_id}`
- Subscription message sending
- Message listening for 10 seconds

### `test_telescope_control.py`
Advanced telescope control command testing.

**Usage:**
```bash
uv run python test_telescope_control.py <telescope_id>

# Example:
uv run python test_telescope_control.py 870c9918
```

**What it tests:**
- WebSocket connection establishment
- Subscription to telescope updates
- Control command sending (status requests)
- Command response handling
- Error detection and reporting

### `debug_websocket_state.py`
Comprehensive system state debugging.

**Usage:**
```bash
uv run python debug_websocket_state.py
```

**What it checks:**
- WebSocket manager health and status
- Active connections and subscriptions
- Telescope API status
- Remote controller configuration
- Specific telescope availability

### `debug_manager_state.py`
Direct WebSocket manager state inspection.

**Usage:**
```bash
uv run python debug_manager_state.py
```

**What it provides:**
- Direct command testing
- Error message analysis
- Registration status verification
- Troubleshooting guidance

## Common Issues & Solutions

### "Telescope not available" Error
This typically indicates:
1. Remote telescope not properly registered with WebSocket manager
2. Network connectivity issues to remote controller
3. Remote controller not responding

**Debug steps:**
1. Run `debug_websocket_state.py` to check overall system state
2. Verify remote controller is reachable: `curl http://{host}:{port}/api/telescopes`
3. Check WebSocket manager health: `curl http://localhost:8000/api/ws/health`

### WebSocket Connection Fails
Common causes:
1. Server not running on expected port (should be 8000)
2. Firewall blocking WebSocket connections
3. Network connectivity issues

**Debug steps:**
1. Verify server is running: `curl http://localhost:8000/api/telescopes`
2. Test WebSocket connectivity with `test_websocket.py`
3. Check server logs for connection errors

### Remote Controller Issues
If remote telescopes don't work:
1. Check remote controller status: `curl http://localhost:8000/api/remote-controllers`
2. Try reconnecting: `curl -X POST http://localhost:8000/api/remote-controllers/{host}/{port}/reconnect`
3. Remove and re-add remote controller if needed

## Example Output

### Successful WebSocket Test
```bash
$ uv run python test_websocket.py 870c9918
🎯 Testing with telescope ID: 870c9918
============================================================
🏥 Server health check: 200
✅ Found target telescope: {
  "name": "870c9918",
  "serial_number": "870c9918",
  "is_remote": true,
  "connected": true
}
✅ WebSocket connected successfully!
📤 Sending subscription...
📨 Received message: {"type": "status_update", ...}
```

### Failed Command Test
```bash
$ uv run python test_telescope_control.py 870c9918
❌ Command failed: Telescope 870c9918 not available
```

This indicates the telescope is not properly registered with the WebSocket manager.

## Development Tips

1. **Always test both local and remote telescopes** to ensure the system handles both correctly
2. **Check logs** - The test utilities provide detailed logging to help identify issues
3. **Use health endpoints** - The `/api/ws/health` endpoint provides valuable debugging information
4. **Test after configuration changes** - Run tests after adding/removing remote controllers

## Files Created

- `test_websocket.py` - Basic WebSocket testing
- `test_telescope_control.py` - Control command testing  
- `debug_websocket_state.py` - System state debugging
- `debug_manager_state.py` - Manager internals debugging
- `add_debug_endpoint.py` - Debug endpoint code generator

All utilities are designed to be run with `uv run python <script_name>` from the server directory.