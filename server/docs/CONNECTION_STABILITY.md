# Telescope Connection Stability Issues and Solutions

## Problem Description

After running for extended periods, the server experiences connection stability issues with telescopes:

```
2025-08-31 12:15:59.152 | DEBUG    | connection:read:277 | Reconnection successful after read failure
2025-08-31 12:16:14.226 | INFO     | connection:read:266 | Connection to 192.168.42.41:4700 lost during read (telescope may be rebooting)
2025-08-31 12:16:14.226 | ERROR    | client:_reader:230 | Unexpected error in reader task for 192.168.42.41:4700: [Errno 54] Connection reset by peer
```

The telescope closes the TCP connection (likely due to timeout or resource management), but the server doesn't properly clean up and re-establish the connection, leading to repeated errors until the server is restarted.

## Root Causes

1. **Long-lived TCP connections**: Telescopes may close idle or long-lived connections to free resources
2. **Missing health checks**: No periodic health checks to detect stale connections
3. **Incomplete error recovery**: Connection reset errors are logged but not properly handled
4. **No connection lifecycle management**: Connections aren't monitored for staleness or cleaned up

## Solutions Implemented

### 1. Connection Health Monitor (`services/connection_health_monitor.py`)

Monitors all telescope connections and detects stale or unhealthy connections:

- Periodic health checks every 30 seconds
- Tracks last activity time for each connection
- Detects idle connections (> 5 minutes by default)
- Identifies connections with repeated failures
- Triggers reconnection for unhealthy connections

### 2. Connection Recovery Service (`services/connection_recovery.py`)

Handles automatic recovery of failed connections:

- Manages reconnection attempts with exponential backoff
- Tracks connection reset counts
- Prevents reconnection storms
- Provides recovery state tracking
- Implements jittered retry delays

## Integration Guide

### Basic Usage

```python
from services.connection_health_monitor import get_health_monitor, start_health_monitoring
from services.connection_recovery import get_recovery_service

# Start health monitoring on server startup
async def startup_event():
    await start_health_monitoring()
    
# Register a telescope connection
health_monitor = get_health_monitor()
health_monitor.register_connection(telescope_id, connection_object)

# Register recovery callback
recovery_service = get_recovery_service()
recovery_service.register_reconnect_callback(
    telescope_id, 
    async_reconnect_function
)

# Update activity on successful operations
health_monitor.update_activity(telescope_id)

# Handle connection errors
try:
    # ... telescope operation ...
except Exception as e:
    if await recovery_service.handle_connection_error(telescope_id, e):
        # Recovery initiated, skip normal error handling
        pass
```

### Integration with Main Controller

The main controller should be updated to:

1. Register connections with the health monitor when established
2. Update activity timestamps on successful operations
3. Use the recovery service for connection errors
4. Implement a proper reconnection callback

Example modification for `main_controller.py`:

```python
# In the connection establishment section
health_monitor = get_health_monitor()
health_monitor.register_connection(telescope_id, telescope_client)

recovery_service = get_recovery_service()
recovery_service.register_reconnect_callback(
    telescope_id,
    lambda tid: reconnect_telescope(tid)
)

# In the error handling section (lines 1039-1052)
except (ConnectionResetError, BrokenPipeError, OSError) as e:
    # Let recovery service handle it
    if await recovery_service.handle_connection_error(telescope_id, e):
        # Recovery initiated, wait for it to complete
        await asyncio.sleep(10)
        continue
    else:
        # Normal error handling
        logging.warning(f"Connection issue with {telescope_id}: {e}")
        await asyncio.sleep(5)
```

## Configuration

### Health Monitor Settings

- `check_interval`: Seconds between health checks (default: 30)
- `max_idle_time`: Maximum idle seconds before reconnection (default: 300)

### Recovery Service Settings

- `max_attempts`: Maximum reconnection attempts (default: 5)
- `base_delay`: Initial retry delay in seconds (default: 5)

## Monitoring

Check connection health status:

```python
# Get current connection state
state = recovery_service.get_connection_state(telescope_id)
if state:
    print(f"Connection resets: {state.connection_resets}")
    print(f"Recovery attempts: {state.recovery_attempts}")
    print(f"Is recovering: {state.is_recovering}")
```

## Best Practices

1. **Always update activity**: Call `update_activity()` after successful operations
2. **Register callbacks early**: Set up recovery callbacks when connections are created
3. **Monitor logs**: Watch for repeated "Connection reset" messages as an indicator
4. **Graceful shutdown**: Stop health monitoring on server shutdown
5. **Test recovery**: Simulate connection failures to verify recovery works

## Troubleshooting

If connections still fail after implementing these services:

1. Check that health monitoring is started on server startup
2. Verify connections are registered with both services
3. Ensure reconnection callbacks are properly implemented
4. Check logs for recovery attempt messages
5. Verify the telescope isn't actively refusing connections
6. Consider adjusting `max_idle_time` if connections drop too frequently

## Future Improvements

1. Add connection pooling for multiple telescopes
2. Implement connection warm-up (periodic keepalive messages)
3. Add metrics/monitoring dashboard for connection health
4. Implement circuit breaker pattern for failing telescopes
5. Add connection state persistence across server restarts