"""WebRTC service for handling video streaming from telescopes."""

import asyncio
import json
from typing import Dict, Optional, Any, Callable
from uuid import uuid4

from aiortc import RTCPeerConnection, RTCSessionDescription, RTCIceCandidate, RTCConfiguration, RTCIceServer
from aiortc.contrib.media import MediaPlayer, MediaRelay
from loguru import logger
from pydantic import BaseModel, Field

from webrtc_video_track import TelescopeVideoTrack, StackedImageVideoTrack


class WebRTCOffer(BaseModel):
    """WebRTC offer model."""
    sdp: str
    type: str = "offer"


class WebRTCAnswer(BaseModel):
    """WebRTC answer model."""
    sdp: str
    type: str = "answer"


class WebRTCIceCandidate(BaseModel):
    """WebRTC ICE candidate model."""
    candidate: str
    sdpMLineIndex: Optional[int] = None
    sdpMid: Optional[str] = None
    usernameFragment: Optional[str] = None


class WebRTCSession(BaseModel):
    """WebRTC session information."""
    session_id: str = Field(default_factory=lambda: str(uuid4()))
    telescope_name: str
    stream_type: str = "live"  # "live" or "stacked"
    peer_connection: Optional[Any] = Field(default=None, exclude=True)
    video_track: Optional[Any] = Field(default=None, exclude=True)
    ice_candidates: list[WebRTCIceCandidate] = Field(default_factory=list)
    state: str = "new"  # new, connecting, connected, failed, closed


class WebRTCService:
    """Service for managing WebRTC connections and media streaming."""
    
    def __init__(self, telescope_getter: Optional[Callable] = None):
        self.sessions: Dict[str, WebRTCSession] = {}
        self.media_relay = MediaRelay()
        self.stun_servers = [
            "stun:stun.l.google.com:19302",
            "stun:stun1.l.google.com:19302"
        ]
        self.ice_candidate_queues: Dict[str, asyncio.Queue] = {}
        self.telescope_getter = telescope_getter
        
    async def create_peer_connection(self, session_id: str) -> RTCPeerConnection:
        """Create a new RTCPeerConnection with configured ICE servers."""
        ice_servers = [RTCIceServer(urls=self.stun_servers)]
        configuration = RTCConfiguration(iceServers=ice_servers)
        pc = RTCPeerConnection(configuration=configuration)
        
        # Set up ICE candidate queue for this session
        self.ice_candidate_queues[session_id] = asyncio.Queue()
        
        @pc.on("icecandidate")
        async def on_ice_candidate(candidate):
            if candidate:
                ice_candidate = WebRTCIceCandidate(
                    candidate=candidate.candidate,
                    sdpMLineIndex=candidate.sdpMLineIndex,
                    sdpMid=candidate.sdpMid,
                    usernameFragment=candidate.usernameFragment
                )
                await self.ice_candidate_queues[session_id].put(ice_candidate)
                logger.debug(f"ICE candidate generated for session {session_id}: {candidate.candidate}")
        
        @pc.on("connectionstatechange")
        async def on_connection_state_change():
            logger.info(f"Connection state for session {session_id}: {pc.connectionState}")
            if session_id in self.sessions:
                self.sessions[session_id].state = pc.connectionState
            
            if pc.connectionState == "failed":
                await pc.close()
                await self.cleanup_session(session_id)
        
        return pc
    
    async def create_session(self, telescope_name: str, offer: WebRTCOffer, stream_type: str = "live") -> tuple[str, WebRTCAnswer]:
        """Create a new WebRTC session and process the offer."""
        session = WebRTCSession(telescope_name=telescope_name, stream_type=stream_type)
        session_id = session.session_id
        
        # Create peer connection
        pc = await self.create_peer_connection(session_id)
        session.peer_connection = pc
        
        # Store session
        self.sessions[session_id] = session
        
        # Set remote description (offer)
        await pc.setRemoteDescription(RTCSessionDescription(sdp=offer.sdp, type=offer.type))
        
        # Add video track if telescope is available
        if self.telescope_getter:
            try:
                video_track = await self.create_video_track(telescope_name, stream_type)
                if video_track:
                    pc.addTrack(video_track)
                    session.video_track = video_track
                    logger.info(f"Added {stream_type} video track for telescope {telescope_name}")
            except Exception as e:
                logger.error(f"Failed to create video track: {e}")
                # Continue without video track
        
        # Create answer
        answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        
        logger.info(f"Created WebRTC session {session_id} for telescope {telescope_name}")
        
        return session_id, WebRTCAnswer(sdp=answer.sdp, type=answer.type)
    
    async def create_video_track(self, telescope_name: str, stream_type: str = "live"):
        """Create a video track for the telescope stream."""
        if not self.telescope_getter:
            raise ValueError("No telescope getter configured")
        
        # Get the telescope instance
        telescope = self.telescope_getter(telescope_name)
        if not telescope:
            raise ValueError(f"Telescope {telescope_name} not found")
        
        # Get the imaging client
        imaging_client = getattr(telescope, 'imaging', None)
        if not imaging_client:
            raise ValueError(f"No imaging client for telescope {telescope_name}")
        
        # Ensure streaming is started
        if not imaging_client.status.is_streaming:
            logger.info(f"Starting imaging stream for telescope {telescope_name}")
            await imaging_client.start_streaming()
        
        # Create appropriate video track based on stream type
        if stream_type == "stacked":
            track = StackedImageVideoTrack(imaging_client)
        else:
            track = TelescopeVideoTrack(imaging_client)
        
        return track
    
    async def add_ice_candidate(self, session_id: str, candidate: WebRTCIceCandidate) -> bool:
        """Add an ICE candidate to a session."""
        session = self.sessions.get(session_id)
        if not session or not session.peer_connection:
            logger.error(f"Session {session_id} not found or no peer connection")
            return False
        
        try:
            rtc_candidate = RTCIceCandidate(
                candidate=candidate.candidate,
                sdpMLineIndex=candidate.sdpMLineIndex,
                sdpMid=candidate.sdpMid,
                usernameFragment=candidate.usernameFragment
            )
            await session.peer_connection.addIceCandidate(rtc_candidate)
            session.ice_candidates.append(candidate)
            logger.debug(f"Added ICE candidate to session {session_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to add ICE candidate to session {session_id}: {e}")
            return False
    
    async def get_ice_candidates_stream(self, session_id: str):
        """Stream ICE candidates as they are generated."""
        if session_id not in self.ice_candidate_queues:
            logger.error(f"No ICE candidate queue for session {session_id}")
            return
        
        queue = self.ice_candidate_queues[session_id]
        
        try:
            while session_id in self.sessions:
                try:
                    candidate = await asyncio.wait_for(queue.get(), timeout=1.0)
                    yield f"data: {candidate.model_dump_json()}\n\n"
                except asyncio.TimeoutError:
                    # Send keepalive
                    yield f"data: {json.dumps({'type': 'keepalive'})}\n\n"
        finally:
            logger.debug(f"Stopped streaming ICE candidates for session {session_id}")
    
    async def cleanup_session(self, session_id: str):
        """Clean up a WebRTC session."""
        session = self.sessions.get(session_id)
        if session:
            # Stop video track if present
            if session.video_track:
                try:
                    await session.video_track.stop()
                    # Stop telescope streaming if no other sessions are using it
                    if hasattr(session.video_track, 'imaging_client'):
                        # Check if any other sessions are using the same telescope
                        telescope_name = session.telescope_name
                        other_sessions = [s for sid, s in self.sessions.items() 
                                        if sid != session_id and s.telescope_name == telescope_name]
                        if not other_sessions:
                            # No other sessions, stop streaming
                            logger.info(f"Stopping imaging stream for telescope {telescope_name}")
                            await session.video_track.imaging_client.stop_streaming()
                except Exception as e:
                    logger.error(f"Error stopping video track: {e}")
            
            if session.peer_connection:
                await session.peer_connection.close()
            del self.sessions[session_id]
            
        if session_id in self.ice_candidate_queues:
            del self.ice_candidate_queues[session_id]
            
        logger.info(f"Cleaned up WebRTC session {session_id}")
    
    async def cleanup_all_sessions(self):
        """Clean up all WebRTC sessions."""
        session_ids = list(self.sessions.keys())
        for session_id in session_ids:
            await self.cleanup_session(session_id)
    
    def get_session(self, session_id: str) -> Optional[WebRTCSession]:
        """Get session information."""
        return self.sessions.get(session_id)
    
    def list_sessions(self) -> list[WebRTCSession]:
        """List all active sessions."""
        return list(self.sessions.values())