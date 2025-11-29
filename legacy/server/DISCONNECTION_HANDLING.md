# Telescope Disconnection Handling

## Overview

When a telescope loses connection for more than a few seconds, the server sends WebSocket notifications to the frontend, which should trigger the display of a test pattern.

## Server-Side Implementation

The server monitors telescope connections through the `ConnectionHealthMonitor` service:

1. **Health Monitoring**: Checks connection health every 30 seconds
2. **Disconnection Detection**: Marks telescope as disconnected after:
   - No activity for configured idle time (default: 300 seconds)
   - 3 consecutive health check failures
3. **Notification Delay**: Waits 3 seconds after disconnection before sending notification
4. **WebSocket Messages**: Sends two types of notifications

## WebSocket Message Format

### 1. `telescope_lost` Message
```json
{
  "type": "telescope_lost",
  "telescope_id": "telescope_serial_number",
  "payload": {
    "reason": "Connection lost - no response for X.X seconds",
    "show_test_pattern": true
  }
}
```

### 2. `connection_lost` Event (Detailed)
```json
{
  "type": "event",
  "telescope_id": "telescope_serial_number",
  "payload": {
    "event_type": "connection_lost",
    "disconnect_duration": 5.2,
    "reason": "Connection lost - no response for 5.2 seconds",
    "timestamp": 1234567890.123,
    "health_check_failures": 3,
    "show_test_pattern": true
  }
}
```

## Client-Side Implementation

The client should handle these messages as follows:

### React/TypeScript Example

```typescript
// In your WebSocket message handler
const handleWebSocketMessage = (message: any) => {
  // Handle telescope_lost message
  if (message.type === 'telescope_lost') {
    const { telescope_id, payload } = message;
    const showTestPattern = payload?.show_test_pattern !== false;
    
    if (showTestPattern && telescope_id === currentTelescopeId) {
      // Trigger test pattern display
      setConnectionLost(true);
      setDisconnectionReason(payload.reason);
    }
  }
  
  // Handle detailed connection_lost event
  if (message.type === 'event' && message.payload?.event_type === 'connection_lost') {
    const { telescope_id, payload } = message;
    const showTestPattern = payload.show_test_pattern !== false;
    
    if (showTestPattern && telescope_id === currentTelescopeId) {
      // Trigger test pattern with detailed info
      setConnectionLost(true);
      setDisconnectionInfo({
        reason: payload.reason,
        duration: payload.disconnect_duration,
        failures: payload.health_check_failures
      });
    }
  }
};
```

### Test Pattern Display

When `show_test_pattern` is `true`, the client should:

1. **Hide the live telescope feed**
2. **Display a test pattern** (e.g., `ConnectionLostTestPattern` component)
3. **Show disconnection information**:
   - Telescope ID
   - Disconnection reason
   - Duration of disconnection
   - Timestamp
4. **Indicate reconnection attempts**

### Reconnection Handling

When the telescope reconnects:
1. Server sends a `status_update` message
2. Client should hide the test pattern
3. Resume showing the live telescope feed

## Testing

To test the disconnection handling:

1. **Start the server**: `uv run python main.py server`
2. **Run the test monitor**: `./test_disconnect_notification.py`
3. **Simulate disconnection**:
   - Disconnect telescope network
   - Power off telescope
   - Block network traffic
4. **Observe**: After ~3 seconds, you should see:
   - Server sends `telescope_lost` message with `show_test_pattern: true`
   - Client displays test pattern
   - Test monitor logs the notification

## Configuration

The health monitor can be configured with:

- `check_interval`: How often to check health (default: 30s)
- `max_idle_time`: Maximum idle time before reconnection (default: 300s)
- `disconnect_notification_delay`: Delay before sending notification (default: 3s)

## Implementation Files

- **Server**: 
  - `services/connection_health_monitor.py` - Health monitoring and notifications
  - `websocket_manager.py` - WebSocket message broadcasting
  
- **Client**:
  - `components/telescope/ConnectionLostTestPattern.tsx` - Test pattern component
  - `components/telescope/CameraView.tsx` - Main view handling connection state
  - `context/TelescopeContext.tsx` - WebSocket message handling