# Server Restart Capability

The ALP Experimental server now includes built-in restart and shutdown capabilities through a REST API.

## Features

### 1. Manual Restart via API

**Endpoint:** `POST /api/system/restart`

**Headers:**
- `X-Admin-Token`: Admin authentication token (required)
- `Content-Type: application/json`

**Request Body:**
```json
{
  "delay_seconds": 2,
  "reason": "Manual restart requested"
}
```

**Example:**
```bash
curl -X POST http://localhost:8000/api/system/restart \
  -H "X-Admin-Token: admin-secret-token" \
  -H "Content-Type: application/json" \
  -d '{"delay_seconds": 3, "reason": "Applying configuration changes"}'
```

### 2. Server Status Check

**Endpoint:** `GET /api/system/status`

Returns current server status including uptime, Python version, and process ID.

### 3. Health Check

**Endpoint:** `GET /api/system/health`

Simple health check endpoint for monitoring.

### 4. Shutdown

**Endpoint:** `POST /api/system/shutdown`

Gracefully shuts down the server (requires manual restart).

## Configuration

### Admin Token

Set the admin token via environment variable:
```bash
export ADMIN_TOKEN="your-secure-token"
```

Default token if not set: `admin-secret-token` (change this in production!)

### Auto-Restart Script

Use the provided `start_with_restart.sh` script to enable automatic restarts:

```bash
./start_with_restart.sh
```

This script will:
- Start the server
- Automatically restart if the server exits with code 1
- Stop if the server exits with code 0
- Retry with delay on other error codes

### With Arguments

Pass arguments to the restart script:
```bash
./start_with_restart.sh --seestar-host 192.168.1.100
```

## UI Integration

Access the restart functionality from the UI:
1. Click on the user menu (top right)
2. Select "System Admin"
3. Enter admin token
4. Click "Restart Server"

## Security Considerations

1. **Change the default admin token** in production
2. Use HTTPS in production to protect the token
3. Consider implementing proper authentication/authorization
4. Limit access to the system endpoints via firewall rules

## Implementation Details

- Restart is implemented using `signal.SIGTERM` for graceful shutdown
- The server exits with code 1 to trigger auto-restart
- A delay is implemented to allow current requests to complete
- All telescope connections are properly closed during shutdown