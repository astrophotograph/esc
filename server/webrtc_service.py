"""WebRTC service for handling video streaming from telescopes."""

import asyncio
import json
from typing import Dict, Optional, Any, Callable
from uuid import uuid4

from aiortc import (
    RTCPeerConnection,
    RTCSessionDescription,
    RTCIceCandidate,
    RTCConfiguration,
    RTCIceServer,
)
from aiortc.contrib.media import MediaPlayer, MediaRelay
from loguru import logger
from pydantic import BaseModel, Field

from webrtc_video_track import TelescopeVideoTrack, StackedImageVideoTrack
from dummy_video_track import DummyVideoTrack, StaticTestVideoTrack


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
            "stun:stun1.l.google.com:19302",
            "stun:stun2.l.google.com:19302",
        ]
        # Note: In production, you may need TURN servers for better connectivity
        # self.turn_servers = [
        #     "turn:your-turn-server.com:3478"
        # ]
        self.ice_candidate_queues: Dict[str, asyncio.Queue] = {}
        self.telescope_getter = telescope_getter
        self.candidate_stats: Dict[str, Dict] = {}  # Track candidate stats per session

        # Log network info for debugging
        import socket
        import netifaces

        hostname = socket.gethostname()
        local_ip = socket.gethostbyname(hostname)
        logger.info(
            f"WebRTC service initialized - Hostname: {hostname}, Local IP: {local_ip}"
        )

        # List all network interfaces
        try:
            interfaces = netifaces.interfaces()
            logger.info(f"Available network interfaces: {interfaces}")
            valid_interfaces = []
            for interface in interfaces:
                addrs = netifaces.ifaddresses(interface)
                if netifaces.AF_INET in addrs:
                    ipv4_addrs = [addr["addr"] for addr in addrs[netifaces.AF_INET]]
                    logger.info(f"Interface {interface} IPv4: {ipv4_addrs}")
                    # Filter out loopback addresses for WebRTC viability
                    non_loopback = [
                        addr for addr in ipv4_addrs if not addr.startswith("127.")
                    ]
                    if non_loopback:
                        valid_interfaces.extend(non_loopback)

            if not valid_interfaces:
                logger.error(
                    "No valid non-loopback IPv4 interfaces found! This will prevent ICE candidate generation."
                )
                logger.error(
                    "aiortc needs at least one non-loopback network interface to generate candidates."
                )
            else:
                logger.info(f"Valid interfaces for WebRTC: {valid_interfaces}")

        except ImportError:
            logger.warning("netifaces not available, using basic socket info")
            logger.warning(
                "Install netifaces for detailed network debugging: pip install netifaces"
            )
        except Exception as e:
            logger.error(f"Error getting network interfaces: {e}")

    async def create_peer_connection(self, session_id: str) -> RTCPeerConnection:
        """Create a new RTCPeerConnection with configured ICE servers."""
        # Try adding STUN servers back to force ICE candidate generation
        ice_servers = [RTCIceServer(urls=self.stun_servers)]

        configuration = RTCConfiguration(iceServers=ice_servers)
        logger.info(
            f"Creating peer connection with {len(ice_servers)} ICE servers: {[server.urls for server in ice_servers]}"
        )
        pc = RTCPeerConnection(configuration)

        # Set up ICE candidate queue for this session
        self.ice_candidate_queues[session_id] = asyncio.Queue()
        self.candidate_stats[session_id] = {"local_generated": 0, "remote_added": 0}

        @pc.on("icecandidate")
        async def on_ice_candidate(candidate):
            if candidate:
                self.candidate_stats[session_id]["local_generated"] += 1
                logger.info(
                    f"Backend ICE candidate #{self.candidate_stats[session_id]['local_generated']} generated for session {session_id}: {candidate.candidate}"
                )

                ice_candidate = WebRTCIceCandidate(
                    candidate=candidate.candidate,
                    sdpMLineIndex=candidate.sdpMLineIndex,
                    sdpMid=candidate.sdpMid,
                    usernameFragment=candidate.usernameFragment,
                )

                # Check if queue exists before putting
                if session_id in self.ice_candidate_queues:
                    await self.ice_candidate_queues[session_id].put(ice_candidate)
                    logger.info(
                        f"Backend candidate #{self.candidate_stats[session_id]['local_generated']} queued for streaming"
                    )
                else:
                    logger.error(
                        f"No ICE candidate queue found for session {session_id}!"
                    )
            else:
                logger.info(
                    f"Backend ICE gathering complete for session {session_id}. Total local candidates: {self.candidate_stats[session_id]['local_generated']}"
                )

        @pc.on("icegatheringstatechange")
        async def on_ice_gathering_state_change():
            logger.info(
                f"ICE gathering state for session {session_id}: {pc.iceGatheringState}"
            )

        @pc.on("iceconnectionstatechange")
        async def on_ice_connection_state_change():
            state = pc.iceConnectionState
            stats = self.candidate_stats[session_id]
            logger.info(
                f"ICE connection state for session {session_id}: {state} (Local: {stats['local_generated']}, Remote: {stats['remote_added']} candidates)"
            )

            if state == "failed":
                logger.error(
                    f"ICE connection failed for session {session_id}! Candidate exchange summary:"
                )
                logger.error(
                    f"  - Local candidates generated: {stats['local_generated']}"
                )
                logger.error(f"  - Remote candidates received: {stats['remote_added']}")
                logger.error(
                    f"  - This usually indicates network connectivity issues between peers"
                )

        @pc.on("signalingstatechange")
        async def on_signaling_state_change():
            logger.info(
                f"Signaling state for session {session_id}: {pc.signalingState}"
            )

        @pc.on("connectionstatechange")
        async def on_connection_state_change():
            logger.info(
                f"Connection state for session {session_id}: {pc.connectionState}"
            )
            if session_id in self.sessions:
                self.sessions[session_id].state = pc.connectionState

                # Log track status when connected
                if pc.connectionState == "connected":
                    logger.info(f"Connection established for session {session_id}")
                    session = self.sessions.get(session_id)
                    if session and session.video_track:
                        logger.info(
                            f"Video track {id(session.video_track)} should now be active"
                        )
                        logger.info(
                            f"Video track started: {getattr(session.video_track, '_started', 'unknown')}"
                        )

            if pc.connectionState == "failed":
                await pc.close()
                await self.cleanup_session(session_id)

        return pc

    async def create_session(
        self, telescope_name: str, offer: WebRTCOffer, stream_type: str = "live"
    ) -> tuple[str, WebRTCAnswer]:
        """Create a new WebRTC session and process the offer."""
        session = WebRTCSession(telescope_name=telescope_name, stream_type=stream_type)
        session_id = session.session_id

        # Create peer connection
        pc = await self.create_peer_connection(session_id)
        session.peer_connection = pc

        # Store session
        self.sessions[session_id] = session

        # Set remote description (offer)
        logger.debug(f"Setting remote description (offer) for session {session_id}")
        logger.debug(f"Offer SDP preview: {offer.sdp[:200]}...")
        await pc.setRemoteDescription(
            RTCSessionDescription(sdp=offer.sdp, type=offer.type)
        )

        # Add video track AFTER setting remote description but BEFORE creating answer
        # Use dummy video track for test telescopes, real track for actual telescopes
        try:
            # Check if this is a test telescope (special name patterns)
            is_test_telescope = (
                telescope_name.lower() in ["test", "dummy", "simulation"]
                or telescope_name.startswith("test-")
                or telescope_name.startswith("dummy-")
                or telescope_name.startswith("sim-")
            )

            if is_test_telescope:
                logger.info(
                    f"Creating DUMMY video track for test telescope: {telescope_name}"
                )
                video_track = DummyVideoTrack(target_fps=30)

                if video_track:
                    # Log track details before adding
                    logger.info(
                        f"About to add DUMMY video track {id(video_track)} to peer connection"
                    )
                    sender = pc.addTrack(video_track)
                    logger.info(
                        f"Track added, sender: {sender}, track kind: {video_track.kind}"
                    )

                    # Explicitly start the track
                    try:
                        await video_track.start()
                        logger.info(
                            f"Dummy video track {id(video_track)} started explicitly"
                        )
                    except Exception as start_error:
                        logger.error(
                            f"Failed to start dummy video track: {start_error}"
                        )

                    session.video_track = video_track
                    logger.info(
                        f"Successfully added DUMMY video track for test telescope"
                    )
                else:
                    logger.error(f"Dummy video track creation returned None")
            else:
                logger.info(
                    f"Creating REAL telescope video track for: {telescope_name}"
                )
                video_track = await self.create_video_track(telescope_name, stream_type)

                if video_track:
                    # Log track details before adding
                    logger.info(
                        f"About to add REAL video track {id(video_track)} to peer connection"
                    )
                    sender = pc.addTrack(video_track)
                    logger.info(
                        f"Track added, sender: {sender}, track kind: {video_track.kind}"
                    )

                    # Explicitly start the track
                    try:
                        await video_track.start()
                        logger.info(
                            f"Real telescope video track {id(video_track)} started explicitly"
                        )
                    except Exception as start_error:
                        logger.error(
                            f"Failed to start real telescope video track: {start_error}"
                        )

                    session.video_track = video_track
                    logger.info(f"Successfully added REAL telescope video track")
                else:
                    logger.error(f"Real telescope video track creation returned None")

        except Exception as e:
            logger.error(f"Failed to create video track for {telescope_name}: {e}")
            import traceback

            logger.error(f"Video track creation traceback: {traceback.format_exc()}")
            # Continue without video track
            raise e

        # Create answer
        answer = await pc.createAnswer()
        logger.debug(f"Answer SDP preview: {answer.sdp[:200]}...")

        # Check if answer contains video
        if "m=video" in answer.sdp:
            logger.info(f"Answer contains video media section")
        else:
            logger.warning(f"Answer does NOT contain video media section!")

        await pc.setLocalDescription(answer)
        logger.info(f"Set local description for session {session_id}")

        # ICE gathering should start automatically after setLocalDescription
        # Give it more time and check multiple times
        for i in range(5):
            await asyncio.sleep(0.5)
            state = pc.iceGatheringState
            count = self.candidate_stats[session_id]["local_generated"]
            logger.info(
                f"ICE gathering check #{i + 1}: state={state}, candidates={count}"
            )

            if state == "complete" and count > 0:
                break
            elif state == "complete" and count == 0:
                logger.warning(
                    f"ICE gathering completed but no candidates generated! This indicates a network issue."
                )
                break

        logger.info(
            f"Created WebRTC session {session_id} for telescope {telescope_name}"
        )

        return session_id, WebRTCAnswer(sdp=answer.sdp, type=answer.type)

    async def create_video_track(self, telescope_name: str, stream_type: str = "live"):
        """Create a video track for the telescope stream."""
        if not self.telescope_getter:
            raise ValueError("No telescope getter configured")

        # Get the telescope instance
        telescope = self.telescope_getter(telescope_name)
        if not telescope:
            raise ValueError(f"Telescope {telescope_name} not found")

        logger.info(
            f"Creating video track for telescope {telescope_name}, type: {stream_type}"
        )

        # Get the imaging client
        imaging_client = telescope.imaging
        if not imaging_client:
            raise ValueError(f"No imaging client for telescope {telescope_name}")

        logger.info(
            f"Imaging client status - connected: {imaging_client.is_connected}, streaming: {imaging_client.status.is_streaming}"
        )

        # Ensure imaging client is connected
        if not imaging_client.is_connected:
            logger.info(
                f"Imaging client not connected for {telescope_name}, attempting to connect..."
            )
            try:
                await imaging_client.connect()
                logger.info(
                    f"Successfully connected imaging client for {telescope_name}"
                )
            except Exception as e:
                logger.error(
                    f"Failed to connect imaging client for {telescope_name}: {e}"
                )
                raise ValueError(
                    f"Cannot connect to imaging client for telescope {telescope_name}: {e}"
                )

        # Ensure streaming is started
        if not imaging_client.status.is_streaming:
            logger.info(f"Starting imaging stream for telescope {telescope_name}")
            await imaging_client.start_streaming()

            # Wait a bit for streaming to actually start
            await asyncio.sleep(1.0)

            if not imaging_client.status.is_streaming:
                logger.warning(
                    f"Imaging streaming may not have started properly for {telescope_name}"
                )
            else:
                logger.info(
                    f"Imaging streaming started successfully for {telescope_name}"
                )

        # Create appropriate video track based on stream type
        if stream_type == "stacked":
            track = StackedImageVideoTrack(imaging_client)
        else:
            track = TelescopeVideoTrack(imaging_client)

        logger.info(f"Created {type(track).__name__} for telescope {telescope_name}")
        return track

    async def add_ice_candidate(
        self, session_id: str, candidate: WebRTCIceCandidate
    ) -> bool:
        """Add an ICE candidate to a session."""
        session = self.sessions.get(session_id)
        if not session or not session.peer_connection:
            logger.error(f"Session {session_id} not found or no peer connection")
            return False

        try:
            self.candidate_stats[session_id]["remote_added"] += 1
            logger.info(
                f"Adding remote ICE candidate #{self.candidate_stats[session_id]['remote_added']} to session {session_id}: {candidate.candidate}"
            )
            rtc_candidate = RTCIceCandidate(
                candidate=candidate.candidate,
                sdpMLineIndex=candidate.sdpMLineIndex,
                sdpMid=candidate.sdpMid,
                usernameFragment=candidate.usernameFragment,
            )
            await session.peer_connection.addIceCandidate(rtc_candidate)
            session.ice_candidates.append(candidate)
            logger.info(
                f"Successfully added remote ICE candidate #{self.candidate_stats[session_id]['remote_added']} to session {session_id}"
            )
            return True
        except Exception as e:
            logger.error(f"Failed to add ICE candidate to session {session_id}: {e}")
            import traceback

            logger.error(f"ICE candidate error traceback: {traceback.format_exc()}")
            return False

    async def get_ice_candidates_stream(self, session_id: str):
        """Stream ICE candidates as they are generated."""
        if session_id not in self.ice_candidate_queues:
            logger.error(f"No ICE candidate queue for session {session_id}")
            return

        queue = self.ice_candidate_queues[session_id]
        logger.info(f"Starting ICE candidates stream for session {session_id}")

        try:
            streamed_count = 0
            while session_id in self.sessions:
                try:
                    candidate = await asyncio.wait_for(queue.get(), timeout=1.0)
                    streamed_count += 1
                    logger.info(
                        f"Streaming ICE candidate #{streamed_count} for session {session_id}: {candidate.candidate}"
                    )
                    yield f"data: {candidate.model_dump_json()}\n\n"
                except asyncio.TimeoutError:
                    # Send keepalive
                    logger.debug(f"Sending keepalive for session {session_id}")
                    yield f"data: {json.dumps({'type': 'keepalive'})}\n\n"
        finally:
            logger.info(
                f"Stopped streaming ICE candidates for session {session_id}. Total streamed: {streamed_count}"
            )

    async def cleanup_session(self, session_id: str):
        """Clean up a WebRTC session."""
        session = self.sessions.get(session_id)
        if session:
            # Stop video track if present
            if session.video_track:
                try:
                    await session.video_track.stop()
                    # Stop telescope streaming if no other sessions are using it
                    if hasattr(session.video_track, "imaging_client"):
                        # Check if any other sessions are using the same telescope
                        telescope_name = session.telescope_name
                        other_sessions = [
                            s
                            for sid, s in self.sessions.items()
                            if sid != session_id and s.telescope_name == telescope_name
                        ]
                        if not other_sessions:
                            # No other sessions, stop streaming
                            logger.info(
                                f"Stopping imaging stream for telescope {telescope_name}"
                            )
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
