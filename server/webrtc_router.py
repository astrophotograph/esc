"""WebRTC API router for handling signaling and session management."""

from fastapi import APIRouter, HTTPException, Response, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional

from webrtc_service import (
    WebRTCService, 
    WebRTCOffer, 
    WebRTCAnswer,
    WebRTCIceCandidate,
    WebRTCSession
)
from loguru import logger


router = APIRouter(prefix="/api/webrtc", tags=["webrtc"])


class WebRTCCreateSessionRequest(BaseModel):
    """Request model for creating a WebRTC session."""
    telescope_name: str
    offer: WebRTCOffer
    stream_type: str = "live"  # "live" or "stacked"


class WebRTCCreateSessionResponse(BaseModel):
    """Response model for creating a WebRTC session."""
    session_id: str
    answer: WebRTCAnswer


# Global WebRTC service instance - will be initialized with telescope getter
webrtc_service: Optional[WebRTCService] = None


def initialize_webrtc_service(telescope_getter):
    """Initialize the WebRTC service with a telescope getter function."""
    global webrtc_service
    webrtc_service = WebRTCService(telescope_getter)
    logger.info("WebRTC service initialized with telescope getter")


@router.post("/sessions", response_model=WebRTCCreateSessionResponse)
async def create_webrtc_session(request: WebRTCCreateSessionRequest) -> WebRTCCreateSessionResponse:
    """
    Create a new WebRTC session.
    
    This endpoint handles the initial WebRTC offer/answer exchange to establish
    a peer connection for streaming telescope video.
    """
    if webrtc_service is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="WebRTC service not initialized"
        )
    
    logger.info(f"Creating WebRTC session for telescope: {request.telescope_name}, stream type: {request.stream_type}")
    
    try:
        session_id, answer = await webrtc_service.create_session(
            telescope_name=request.telescope_name,
            offer=request.offer,
            stream_type=request.stream_type
        )
        logger.info(f"Successfully created WebRTC session {session_id} for telescope {request.telescope_name}")
        return WebRTCCreateSessionResponse(session_id=session_id, answer=answer)
    except Exception as e:
        logger.error(f"Failed to create WebRTC session for telescope {request.telescope_name}: {e}")
        import traceback
        logger.error(f"WebRTC session creation traceback: {traceback.format_exc()}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create WebRTC session: {str(e)}"
        )


@router.get("/sessions", response_model=list[WebRTCSession])
async def list_webrtc_sessions() -> list[WebRTCSession]:
    """List all active WebRTC sessions."""
    if webrtc_service is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="WebRTC service not initialized"
        )
    return webrtc_service.list_sessions()


@router.get("/sessions/{session_id}", response_model=WebRTCSession)
async def get_webrtc_session(session_id: str) -> WebRTCSession:
    """Get information about a specific WebRTC session."""
    if webrtc_service is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="WebRTC service not initialized"
        )
    
    session = webrtc_service.get_session(session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session {session_id} not found"
        )
    return session


@router.post("/sessions/{session_id}/ice-candidates")
async def add_ice_candidate(session_id: str, candidate: WebRTCIceCandidate) -> dict:
    """
    Add an ICE candidate to an existing WebRTC session.
    
    This endpoint is used during the ICE gathering process to exchange
    network connectivity information between peers.
    """
    if webrtc_service is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="WebRTC service not initialized"
        )
    
    success = await webrtc_service.add_ice_candidate(session_id, candidate)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session {session_id} not found or failed to add candidate"
        )
    return {"success": True}


@router.get("/sessions/{session_id}/ice-candidates/stream")
async def stream_ice_candidates(session_id: str):
    """
    Stream ICE candidates as they are generated.
    
    This endpoint uses Server-Sent Events to stream ICE candidates
    to the client as they become available during the connection process.
    """
    if webrtc_service is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="WebRTC service not initialized"
        )
    
    session = webrtc_service.get_session(session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session {session_id} not found"
        )
    
    return StreamingResponse(
        webrtc_service.get_ice_candidates_stream(session_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable Nginx buffering
        }
    )


@router.delete("/sessions/{session_id}")
async def close_webrtc_session(session_id: str) -> dict:
    """Close and clean up a WebRTC session."""
    if webrtc_service is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="WebRTC service not initialized"
        )
    
    session = webrtc_service.get_session(session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session {session_id} not found"
        )
    
    await webrtc_service.cleanup_session(session_id)
    return {"success": True, "message": f"Session {session_id} closed"}


@router.get("/config")
async def get_webrtc_config() -> dict:
    """
    Get WebRTC configuration including STUN/TURN servers.
    
    This endpoint provides the client with necessary configuration
    for establishing WebRTC connections.
    """
    if webrtc_service is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="WebRTC service not initialized"
        )
    
    return {
        "iceServers": [
            {"urls": webrtc_service.stun_servers}
        ]
    }


# Cleanup on shutdown
async def cleanup_webrtc_service():
    """Cleanup function to be called on application shutdown."""
    if webrtc_service:
        await webrtc_service.cleanup_all_sessions()
        logger.info("WebRTC service cleaned up")