# WebSocket Migration Documentation

## Overview

This document outlines the WebSocket implementation added to the telescope control application. The WebSocket infrastructure enables real-time bidirectional communication between the frontend and backend, providing immediate updates and responsive control commands.

## Architecture

### Backend Components

#### 1. WebSocket Protocol (`server/websocket_protocol.py`)
- **Purpose**: Defines message types and data structures for WebSocket communication
- **Key Features**:
  - Strongly typed message system using Pydantic models
  - Support for status updates, control commands, and subscription management
  - Message factory for creating and parsing messages

#### 2. WebSocket Manager (`server/websocket_manager.py`)
- **Purpose**: Manages WebSocket connections and message routing
- **Key Features**:
  - Connection lifecycle management
  - Automatic heartbeat and health checking
  - Message broadcasting to subscribed clients
  - Command execution integration with telescope clients

#### 3. WebSocket Router (`server/websocket_router.py`)
- **Purpose**: FastAPI integration for WebSocket endpoints
- **Endpoints**:
  - `/api/ws` - General WebSocket connection
  - `/api/ws/{telescope_id}` - Telescope-specific connection
  - `/api/ws/health` - Health check endpoint

### Frontend Components

#### 1. WebSocket Service (`services/websocket-service.ts`)
- **Purpose**: Core WebSocket client with reconnection logic
- **Key Features**:
  - Automatic reconnection with exponential backoff
  - Command execution with Promise-based API
  - Message queuing for offline scenarios
  - Subscription management

#### 2. WebSocket Integration (`services/websocket-integration.ts`)
- **Purpose**: Bridge between WebSocket service and TelescopeContext
- **Key Features**:
  - Seamless integration with existing context
  - Feature flag support for gradual rollout
  - Callback-based event handling

#### 3. Feature Flags (`utils/feature-flags.ts`)
- **Purpose**: Control WebSocket feature rollout
- **Key Features**:
  - Granular feature control
  - Persistent flag storage
  - React hooks for components

#### 4. Debug Panel (`components/developer/WebSocketDebugPanel.tsx`)
- **Purpose**: Development tools for testing WebSocket features
- **Key Features**:
  - Connection testing
  - Command execution
  - Feature flag management
  - Real-time log viewing

## Message Protocol

### Message Types

```typescript
enum MessageType {
  STATUS_UPDATE = 'status_update',
  TELESCOPE_DISCOVERED = 'telescope_discovered',
  TELESCOPE_LOST = 'telescope_lost',
  CONTROL_COMMAND = 'control_command',
  COMMAND_RESPONSE = 'command_response',
  HEARTBEAT = 'heartbeat',
  ERROR = 'error',
  SUBSCRIBE = 'subscribe',
  UNSUBSCRIBE = 'unsubscribe'
}
```

### Example Messages

#### Status Update
```json
{
  "id": "1234567890",
  "type": "status_update",
  "telescope_id": "seestar-001",
  "timestamp": 1640995200000,
  "payload": {
    "status": {
      "battery_capacity": 85,
      "temp": 23.5,
      "gain": 100
    },
    "changes": ["battery_capacity", "temp"],
    "full_update": false
  }
}
```

#### Control Command
```json
{
  "id": "1234567891",
  "type": "control_command",
  "telescope_id": "seestar-001",
  "timestamp": 1640995200000,
  "payload": {
    "action": "move",
    "parameters": {
      "direction": "up",
      "duration": 1000
    },
    "response_expected": true
  }
}
```

#### Command Response
```json
{
  "id": "1234567892",
  "type": "command_response",
  "telescope_id": "seestar-001",
  "timestamp": 1640995200000,
  "payload": {
    "command_id": "1234567891",
    "success": true,
    "result": {
      "status": "movement_completed"
    }
  }
}
```

## Usage

### Feature Flags

WebSocket features are controlled by feature flags for safe rollout:

```typescript
// Check if WebSocket status updates are enabled
if (featureFlags.isEnabled('useWebSocketForStatusUpdates')) {
  // Use WebSocket for status updates
} else {
  // Fall back to HTTP/SSE
}

// Enable WebSocket features for testing
FeatureFlagDebug.enableWebSocketFeatures()
```

### Integration with TelescopeContext

The WebSocket integration is designed to be a drop-in replacement for HTTP/SSE:

```typescript
// Create WebSocket integration
const wsIntegration = createWebSocketIntegration({
  onStatusUpdate: (telescopeId, status, changes) => {
    // Handle status updates
  },
  onTelescopeDiscovered: (telescope) => {
    // Handle telescope discovery
  },
  onTelescopeLost: (telescopeId, reason) => {
    // Handle telescope loss
  },
  onConnectionStateChanged: (connected) => {
    // Handle connection changes
  },
  onError: (error) => {
    // Handle errors
  }
})

// Initialize connection
await wsIntegration.initialize(telescopeId)

// Send commands
const result = await wsIntegration.sendCommand(
  CommandAction.MOVE,
  { direction: 'up', duration: 1000 }
)
```

### Development and Testing

Use the WebSocket Debug Panel for development:

1. Navigate to the application with debug panel enabled
2. Open the WebSocket Debug Panel
3. Configure connection settings
4. Test commands and monitor real-time logs
5. Toggle feature flags for testing

## Migration Strategy

### Phase 1: Infrastructure (Completed)
- ✅ WebSocket protocol definition
- ✅ Backend WebSocket manager
- ✅ Frontend WebSocket service
- ✅ Feature flag system
- ✅ Debug tools

### Phase 2: Status Updates Migration
- Replace SSE with WebSocket for status streaming
- Implement selective update subscriptions
- Add error handling and fallback logic

### Phase 3: Control Commands Migration
- Replace HTTP POST with WebSocket commands
- Implement command acknowledgment system
- Add optimistic UI updates

### Phase 4: Advanced Features
- Real-time collaboration support
- Enhanced status filtering
- Performance optimizations

## Configuration

### Backend Configuration

WebSocket settings can be configured in the WebSocket manager:

```python
websocket_manager = WebSocketManager(
    heartbeat_interval=30,  # seconds
    max_connections=100,
    message_timeout=10000   # milliseconds
)
```

### Frontend Configuration

WebSocket service configuration:

```typescript
const wsService = new WebSocketService({
  baseUrl: 'ws://localhost:8000',
  reconnectAttempts: 10,
  reconnectDelayMs: 1000,
  maxReconnectDelayMs: 30000,
  heartbeatIntervalMs: 30000,
  commandTimeoutMs: 15000
})
```

## Monitoring and Debugging

### Connection Health

Monitor WebSocket connection health:

```typescript
// Check connection status
const status = wsIntegration.getConnectionStatus()
console.log('Connected:', status.connected)
console.log('State:', status.state)

// Listen for connection changes
wsService.on('connectionStateChanged', (state) => {
  console.log('Connection state:', state)
})
```

### Message Logging

Enable debug logging with feature flags:

```typescript
// Enable WebSocket debug logs
featureFlags.enable('enableWebSocketDebugLogs')

// View logs in debug panel or console
```

### Performance Metrics

Track WebSocket performance:

```typescript
// Enable performance metrics
featureFlags.enable('enablePerformanceMetrics')

// Monitor command execution times
const startTime = Date.now()
const result = await wsIntegration.sendCommand(action, params)
const duration = Date.now() - startTime
console.log(`Command executed in ${duration}ms`)
```

## Error Handling

### Connection Failures

WebSocket service handles connection failures gracefully:

- Automatic reconnection with exponential backoff
- Message queuing during disconnection
- Fallback to HTTP/SSE when WebSocket unavailable

### Command Timeouts

Commands have configurable timeouts:

```typescript
// Set command timeout
const wsService = new WebSocketService({
  commandTimeoutMs: 10000 // 10 seconds
})

// Handle timeout errors
try {
  const result = await wsService.sendCommand(action, params)
} catch (error) {
  if (error.message.includes('timeout')) {
    // Handle timeout
  }
}
```

### Error Recovery

The system provides multiple levels of error recovery:

1. **Connection Level**: Automatic reconnection
2. **Command Level**: Retry logic and fallback
3. **Application Level**: Graceful degradation to HTTP/SSE

## Security Considerations

### Authentication

WebSocket connections use the same authentication as HTTP endpoints:

- Session-based authentication
- CORS policies apply
- Rate limiting on connections and messages

### Message Validation

All WebSocket messages are validated:

- Pydantic model validation on backend
- TypeScript type checking on frontend
- Schema validation for all message types

### Connection Limits

Backend enforces connection limits:

- Maximum connections per client
- Rate limiting on message frequency
- Automatic cleanup of stale connections

## Performance

### Benchmarks

Expected performance improvements with WebSocket:

- **Latency**: < 100ms for control commands (vs 200-500ms HTTP)
- **Real-time Updates**: < 50ms for status delivery
- **Resource Usage**: 90% reduction in polling traffic
- **Scalability**: Support for 100+ concurrent connections

### Optimization

WebSocket implementation includes several optimizations:

- Message compression (deflate)
- Delta updates for status changes
- Connection pooling and reuse
- Selective subscription to reduce bandwidth

## Troubleshooting

### Common Issues

#### Connection Fails to Establish
- Check if backend WebSocket endpoint is running
- Verify feature flags are enabled
- Check browser WebSocket support

#### Messages Not Received
- Verify subscription to telescope updates
- Check feature flag configuration
- Monitor debug logs for errors

#### Commands Timeout
- Increase command timeout setting
- Check telescope connection status
- Verify command parameters

### Debug Commands

Use browser console for debugging:

```javascript
// Access feature flags
window.featureFlags.getFlags()

// Enable WebSocket features
window.FeatureFlagDebug.enableWebSocketFeatures()

// Check connection status
window.featureFlags.isEnabled('useWebSocketForStatusUpdates')
```

## Future Enhancements

### Planned Features

- **Message Compression**: Reduce bandwidth usage
- **Binary Protocol**: For high-frequency data
- **Message Persistence**: Queue messages during disconnection
- **Load Balancing**: Distribute connections across servers
- **Metrics Dashboard**: Real-time monitoring interface

### API Extensions

- **Bulk Commands**: Execute multiple commands atomically
- **Streaming Data**: Real-time image and telemetry streams
- **Event Filtering**: Server-side filtering for bandwidth optimization
- **Custom Subscriptions**: User-defined update criteria

## Conclusion

The WebSocket implementation provides a solid foundation for real-time telescope control. The feature flag system allows for safe gradual rollout, while the debug tools enable comprehensive testing and monitoring.

The system is designed to be:
- **Reliable**: Automatic reconnection and error handling
- **Scalable**: Support for multiple telescopes and clients
- **Maintainable**: Clean architecture and comprehensive logging
- **Testable**: Extensive debug tools and monitoring capabilities