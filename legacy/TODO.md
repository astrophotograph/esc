# WebRTC Integration Plan for ALP Experimental

## Overview
This document outlines the plan for integrating WebRTC into the ALP Experimental telescope control application. The integration will be phased, starting with image streaming and eventually encompassing all frontend-telescope communication.

## Current Architecture Summary
- **Frontend → Backend**: HTTP REST API + Server-Sent Events (SSE)
- **Backend → Telescope**: TCP sockets (port 4700 for control, 4800 for imaging)
- **Image Streaming**: MJPEG over HTTP
- **Status Updates**: SSE for real-time telescope status

## Phase 1: WebRTC Image Streaming (MVP)

### Goals
- Replace MJPEG streaming with WebRTC video streaming
- Maintain existing control mechanisms (REST API)
- Reduce latency and improve image quality
- Enable adaptive bitrate based on network conditions

### Tasks
1. **Backend WebRTC Infrastructure**
   - [ ] Add WebRTC dependencies (aiortc or similar Python WebRTC library)
   - [ ] Create WebRTC signaling endpoint in FastAPI
   - [ ] Implement STUN/TURN server configuration
   - [ ] Create media pipeline: TCP imaging stream → WebRTC video track
   - [ ] Handle WebRTC peer connection lifecycle
   - [ ] Add ICE candidate exchange endpoints

2. **Frontend WebRTC Implementation**
   - [ ] Create WebRTC service module in `ui/services/`
   - [ ] Implement signaling client for WebRTC negotiation
   - [ ] Replace MJPEG `<img>` with WebRTC `<video>` element
   - [ ] Handle connection state management
   - [ ] Implement automatic reconnection logic
   - [ ] Add connection quality indicators

3. **Graceful Fallback**
   - [ ] Detect WebRTC support in browser
   - [ ] Maintain MJPEG as fallback option
   - [ ] Create feature flag for WebRTC enable/disable
   - [ ] Implement smooth switching between protocols

4. **Testing & Performance**
   - [ ] Compare latency: MJPEG vs WebRTC
   - [ ] Test across different network conditions
   - [ ] Verify mobile device compatibility
   - [ ] Load test with multiple concurrent streams

## Phase 2: Bidirectional Data Channel

### Goals
- Add WebRTC data channels for control commands
- Reduce latency for telescope control
- Enable real-time telemetry without SSE

### Tasks
1. **Data Channel Protocol**
   - [ ] Design message protocol for data channel
   - [ ] Create TypeScript/Python shared protocol definitions
   - [ ] Implement command serialization/deserialization
   - [ ] Add message acknowledgment system

2. **Backend Implementation**
   - [ ] Create data channel handler in backend
   - [ ] Route commands from data channel to telescope
   - [ ] Stream telemetry through data channel
   - [ ] Maintain REST API compatibility

3. **Frontend Migration**
   - [ ] Create data channel service layer
   - [ ] Migrate telescope commands to use data channel
   - [ ] Replace SSE with data channel for status updates
   - [ ] Implement queuing for offline commands

## Phase 3: Full WebRTC Migration

### Goals
- All communication through WebRTC
- Direct browser-to-telescope connection (where possible)
- Minimal backend involvement after connection establishment

### Tasks
1. **Architecture Redesign**
   - [ ] Design peer-to-peer connection flow
   - [ ] Implement NAT traversal strategies
   - [ ] Create relay server for restrictive networks
   - [ ] Design security/authentication for P2P

2. **Telescope Proxy Service**
   - [ ] Create lightweight proxy for TCP-to-WebRTC
   - [ ] Deploy on same network as telescope
   - [ ] Implement discovery mechanism
   - [ ] Add encryption for telescope commands

3. **Backend as Signaling Server**
   - [ ] Minimize backend to signaling only
   - [ ] Implement session management
   - [ ] Add access control for telescope connections
   - [ ] Create connection broker service

## Technical Considerations

### WebRTC Libraries
- **Backend**: aiortc (Python, asyncio-compatible)
- **Frontend**: Native WebRTC API with possible wrapper library
- **STUN/TURN**: Consider coturn or hosted solution

### Security
- Implement DTLS for data channels
- Use secure WebSocket (WSS) for signaling
- Add authentication tokens for connection establishment
- Rate limit connection attempts

### Network Requirements
- Document firewall requirements
- Test with various NAT types
- Provide diagnostic tools for connection issues
- Support both IPv4 and IPv6

### Monitoring & Debugging
- Add WebRTC statistics collection
- Create connection quality dashboard
- Log ICE connection states
- Implement debug mode with verbose logging

## Migration Strategy

1. **Parallel Development**: Build WebRTC alongside existing system
2. **Feature Flag Rollout**: Enable WebRTC per-user or per-deployment
3. **Gradual Migration**: Start with image streaming, then control
4. **Monitoring Period**: Run both systems in parallel initially
5. **Full Cutover**: Remove legacy code after stability confirmed

## Success Metrics
- Reduced image latency (<100ms vs current ~500ms)
- Improved image quality (no MJPEG compression artifacts)
- Lower bandwidth usage (adaptive bitrate)
- Better connection resilience
- Simplified architecture (fewer moving parts)

## Risks & Mitigations
- **Browser Compatibility**: Test across all major browsers
- **Network Restrictions**: Provide TURN relay fallback
- **Complexity**: Phase approach reduces risk
- **Performance**: Profile and optimize media pipeline
- **Debugging**: Comprehensive logging and monitoring

## Timeline Estimate
- Phase 1: 3-4 weeks
- Phase 2: 2-3 weeks
- Phase 3: 4-6 weeks
- Total: 9-13 weeks

## Next Steps
1. Research and select WebRTC libraries
2. Create proof-of-concept for image streaming
3. Design detailed signaling protocol
4. Set up development environment with STUN/TURN
5. Begin Phase 1 implementation