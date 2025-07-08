"""
WebSocket router for FastAPI integration.

This module provides the FastAPI WebSocket endpoints and integrates
with the WebSocket manager for telescope control.
"""

import asyncio
import uuid
from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Query
from loguru import logger

from websocket_manager import websocket_manager


router = APIRouter()


async def get_websocket_manager():
    """Dependency to get the WebSocket manager."""
    return websocket_manager


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    telescope_id: Optional[str] = Query(None, description="Specific telescope to connect to"),
    client_id: Optional[str] = Query(None, description="Client identifier for reconnection"),
    manager=Depends(get_websocket_manager)
):
    """
    General WebSocket endpoint for telescope communication.
    
    Query parameters:
    - telescope_id: Optional specific telescope to connect to
    - client_id: Optional client identifier for connection tracking
    """
    await _handle_websocket_connection(websocket, telescope_id, client_id, manager)


@router.websocket("/ws/{telescope_id}")
async def websocket_telescope_endpoint(
    websocket: WebSocket,
    telescope_id: str,
    client_id: Optional[str] = Query(None, description="Client identifier for reconnection"),
    manager=Depends(get_websocket_manager)
):
    """
    Telescope-specific WebSocket endpoint.
    
    Path parameters:
    - telescope_id: Specific telescope to connect to
    
    Query parameters:
    - client_id: Optional client identifier for connection tracking
    """
    await _handle_websocket_connection(websocket, telescope_id, client_id, manager)


async def _handle_websocket_connection(
    websocket: WebSocket,
    telescope_id: Optional[str],
    client_id: Optional[str],
    manager
):
    """
    Handle WebSocket connection for telescope communication.
    
    Parameters:
    - telescope_id: Optional specific telescope to connect to
    - client_id: Optional client identifier for connection tracking
    """
    # Generate connection ID
    connection_id = client_id or f"client-{uuid.uuid4().hex[:8]}"
    
    # Log the connection attempt with telescope ID
    if telescope_id:
        logger.info(f"WebSocket connection attempt for telescope {telescope_id}, client: {connection_id}")
    else:
        logger.info(f"WebSocket connection attempt (no telescope specified), client: {connection_id}")
    
    # Accept the WebSocket connection first
    try:
        await websocket.accept()
        logger.info(f"WebSocket accepted: {connection_id}")
    except Exception as e:
        logger.error(f"Failed to accept WebSocket for {connection_id}: {e}")
        return
    
    # Use manager to create connection but skip the accept step
    try:
        connection = await manager.connect(websocket, connection_id, skip_accept=True)
    except Exception as e:
        logger.error(f"Failed to create connection for {connection_id}: {e}")
        return
    
    try:
        logger.info(f"WebSocket client connected: {connection_id}")
        if telescope_id:
            logger.info(f"Client {connection_id} targeting telescope: {telescope_id}")
        
        # Note: Initial heartbeat is handled by the manager
        
        # Main message handling loop
        while True:
            try:
                # Wait for incoming message
                message = await websocket.receive_text()
                logger.info(f"Received message on {connection_id}: {message[:200]}...")
                
                # Check if connection is still alive before handling message
                if not connection.is_alive:
                    logger.warning(f"Received message on dead connection {connection_id}, breaking")
                    break
                
                await manager.handle_message(connection_id, message)
                
            except WebSocketDisconnect:
                logger.info(f"WebSocket client disconnected normally: {connection_id}")
                break
            except Exception as e:
                logger.error(f"Error handling message from {connection_id}: {e}")
                # Don't try to send error messages - just log and break
                logger.debug(f"Breaking connection loop for {connection_id} due to error")
                break
    
    except WebSocketDisconnect:
        logger.info(f"WebSocket client disconnected during handshake: {connection_id}")
    except Exception as e:
        logger.error(f"WebSocket connection error for {connection_id}: {e}")
    finally:
        # Clean up connection
        await manager.disconnect(connection_id)


# Note: startup/shutdown events moved to main.py for proper initialization


# Health check endpoint for WebSocket status
@router.get("/ws/health")
async def websocket_health(manager=Depends(get_websocket_manager)):
    """Get WebSocket manager health status."""
    return {
        "status": "healthy" if manager._running else "stopped",
        "active_connections": len(manager.connections),
        "registered_telescopes": len(manager.telescope_clients),
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


# Endpoint to broadcast a test message (for development/testing)
@router.post("/ws/test/broadcast")
async def test_broadcast(
    telescope_id: str,
    message: str,
    manager=Depends(get_websocket_manager)
):
    """Send a test message to all connections subscribed to a telescope."""
    test_status = {
        "test_message": message,
        "timestamp": "2024-01-01T00:00:00Z"
    }
    
    await manager.broadcast_status_update(telescope_id, test_status)
    
    return {
        "status": "sent",
        "telescope_id": telescope_id,
        "message": message,
        "recipients": len([
            conn for conn in manager.connections.values()
            if conn.is_subscribed_to(telescope_id, "status")
        ])
    }