#!/usr/bin/env python3
"""
Add a temporary debug endpoint to check WebSocket manager state.
This will help us verify if the remote telescope is properly registered.
"""

# We can temporarily add this to the websocket_router.py file
debug_endpoint_code = '''

# Temporary debug endpoint
@router.get("/ws/debug")
async def websocket_debug(manager=Depends(get_websocket_manager)):
    """Debug WebSocket manager internal state."""
    return {
        "status": "healthy" if manager._running else "stopped",
        "active_connections": len(manager.connections),
        "local_telescopes": list(manager.telescope_clients.keys()),
        "remote_telescopes": dict(manager.remote_clients),
        "total_registered": len(manager.telescope_clients) + len(manager.remote_clients),
        "connection_details": [
            {
                "connection_id": conn.connection_id,
                "subscriptions": {
                    telescope_id: list(subs) 
                    for telescope_id, subs in conn.subscriptions.items()
                },
                "is_alive": conn.is_alive
            }
            for conn in manager.connections.values()
        ]
    }
'''

print("Debug endpoint code to temporarily add to websocket_router.py:")
print("=" * 60)
print(debug_endpoint_code)
print("=" * 60)
print()
print("Or restart the server to pick up the bug fix!")
