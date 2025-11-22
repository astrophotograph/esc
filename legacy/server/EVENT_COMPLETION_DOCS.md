# Event Completion Function

## Overview

The `wait_for_event_completion()` function has been added to the `SeestarClient` class to provide a convenient way to wait for telescope operations to complete based on event state changes.

## Function Signature

```python
async def wait_for_event_completion(self, event_type: str, timeout: float = 60.0) -> bool
```

## Parameters

- **`event_type`** (str): The type of event to listen for (e.g., "AutoGoto", "FocuserMove", "RTSP")
- **`timeout`** (float): Maximum time to wait in seconds (default: 60.0)

## Returns

- **`bool`**: 
  - `True` if the event state reaches "complete" (success)
  - `False` if the event state reaches "cancel" or "fail" (failure)

## Raises

- **`asyncio.TimeoutError`**: If the timeout is reached without a terminal state
- **`ValueError`**: If no event bus is available on the client

## Supported Event Types

All events that have a `state` field with terminal states:

| Event Type | Description | Typical Use Case |
|------------|-------------|------------------|
| `AutoGoto` | Telescope slewing to target | After `goto()` command |
| `AutoGotoStep` | Individual goto steps | Monitoring goto progress |
| `FocuserMove` | Focuser position changes | After focus commands |
| `ContinuousExposure` | Imaging sessions | Starting/stopping imaging |
| `RTSP` | Video streaming | Video mode operations |
| `ScopeMoveToHorizon` | Horizon alignment | Parking operations |
| `ScopeHome` | Homing operations | Initial setup |
| `Stack` | Image stacking | Stacking operations |

## State Values

The function monitors the `state` field of events for these terminal values:

- **`"complete"`** → Returns `True` (success)
- **`"cancel"`** → Returns `False` (cancelled)
- **`"fail"`** → Returns `False` (failed)

Other states like `"start"`, `"working"` are considered in-progress and do not trigger completion.

## Usage Examples

### Basic Usage

```python
# Wait for a goto operation to complete
success = await client.wait_for_event_completion("AutoGoto")
if success:
    print("Goto completed successfully")
else:
    print("Goto failed or was cancelled")
```

### With Custom Timeout

```python
# Wait up to 2 minutes for a complex operation
try:
    success = await client.wait_for_event_completion("AutoGoto", timeout=120.0)
    print(f"Operation {'succeeded' if success else 'failed'}")
except asyncio.TimeoutError:
    print("Operation timed out")
```

### Error Handling

```python
try:
    success = await client.wait_for_event_completion("FocuserMove", timeout=30.0)
    if success:
        print("Focus adjustment completed")
    else:
        print("Focus adjustment failed")
except asyncio.TimeoutError:
    print("Focus adjustment timed out")
except ValueError as e:
    print(f"Configuration error: {e}")
```

### Practical Telescope Operations

```python
async def perform_goto_and_focus(client, target_name, ra, dec):
    """Example: Goto target and fine-tune focus."""
    
    # Start goto operation
    client.goto(target_name, ra, dec)
    
    # Wait for goto to complete
    goto_success = await client.wait_for_event_completion("AutoGoto", timeout=120.0)
    if not goto_success:
        raise RuntimeError("Goto operation failed")
    
    # Perform focus adjustment
    client.send_command(ScopeFocusIn(params=100))
    
    # Wait for focus to complete
    focus_success = await client.wait_for_event_completion("FocuserMove", timeout=30.0)
    if not focus_success:
        raise RuntimeError("Focus adjustment failed")
    
    print(f"Successfully positioned telescope at {target_name}")
```

### Sequential Operations

```python
async def automated_sequence(client):
    """Example: Automated observation sequence."""
    
    operations = [
        ("AutoGoto", lambda: client.goto("M31", 10.6847, 41.2691)),
        ("FocuserMove", lambda: client.send_command(ScopeFocusIn(params=50))),
        ("RTSP", lambda: client.send_command(StartRTSP())),
    ]
    
    for event_type, operation in operations:
        # Start operation
        operation()
        
        # Wait for completion
        success = await client.wait_for_event_completion(event_type)
        if not success:
            print(f"{event_type} operation failed")
            return False
        
        print(f"{event_type} completed successfully")
    
    return True
```

## Implementation Details

### Event Subscription

The function temporarily subscribes to the specified event type on the client's event bus and automatically unsubscribes when complete (including on timeout or error).

### Thread Safety

The function is fully async and thread-safe. Multiple calls can be made concurrently for different event types.

### Memory Management

Event listeners are automatically cleaned up in the `finally` block to prevent memory leaks.

### Logging

The function provides trace-level logging for event monitoring and info-level logging for completion states.

## Best Practices

### 1. Use Appropriate Timeouts

Different operations have different expected durations:

```python
# Quick operations
await client.wait_for_event_completion("FocuserMove", timeout=30.0)

# Moderate operations  
await client.wait_for_event_completion("AutoGoto", timeout=120.0)

# Long operations
await client.wait_for_event_completion("Stack", timeout=300.0)
```

### 2. Handle All Possible Outcomes

```python
try:
    success = await client.wait_for_event_completion("AutoGoto")
    if success:
        # Handle success
        proceed_with_observation()
    else:
        # Handle failure/cancellation
        log_operation_failure()
except asyncio.TimeoutError:
    # Handle timeout
    cancel_operation()
```

### 3. Use with Context Managers

```python
async def safe_operation(client, event_type, operation):
    """Safely perform operation with cleanup."""
    try:
        operation()
        return await client.wait_for_event_completion(event_type)
    except Exception:
        # Cleanup on any error
        client.send_command(StopAll())
        raise
```

## Limitations

1. **Single Event Type**: Each call monitors only one event type
2. **State-based Only**: Only works with events that have a `state` field
3. **Terminal States**: Only recognizes "complete", "cancel", and "fail" as terminal
4. **Event Bus Required**: Requires an active event bus connection

## Integration with Existing Code

This function integrates seamlessly with existing telescope operations:

```python
# Before: Fire and forget
client.goto("M31", 10.6847, 41.2691)
# Hope it works...

# After: Wait for completion
client.goto("M31", 10.6847, 41.2691)
success = await client.wait_for_event_completion("AutoGoto")
if success:
    # Continue with confidence
    start_imaging()
```

## Future Enhancements

Potential improvements could include:

1. **Multiple Event Types**: Wait for any of several event types
2. **Progress Callbacks**: Optional progress callback functions
3. **Partial State Matching**: Custom state matching beyond terminal states
4. **Event Filtering**: Additional filtering criteria beyond event type