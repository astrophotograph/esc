/**
 * WebRTC service for handling video streaming from telescopes
 */

import { EventEmitter } from 'events';

export interface WebRTCConfig {
  iceServers: RTCIceServer[];
}

export interface WebRTCOffer {
  sdp: string;
  type: 'offer';
}

export interface WebRTCAnswer {
  sdp: string;
  type: 'answer';
}

export interface WebRTCIceCandidate {
  candidate: string;
  sdpMLineIndex?: number | null;
  sdpMid?: string | null;
  usernameFragment?: string | null;
}

export interface CreateSessionRequest {
  telescope_name: string;
  offer: WebRTCOffer;
  stream_type?: 'live' | 'stacked';
}

export interface CreateSessionResponse {
  session_id: string;
  answer: WebRTCAnswer;
}

export interface WebRTCSession {
  session_id: string;
  telescope_name: string;
  stream_type: string;
  state: string;
}

export type ConnectionState = 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed';

export class WebRTCService extends EventEmitter {
  private apiUrl: string;
  private peerConnection: RTCPeerConnection | null = null;
  private sessionId: string | null = null;
  private iceCandidateSource: EventSource | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private connectionState: ConnectionState = 'new';

  constructor(apiUrl: string = '') {
    super();
    this.apiUrl = apiUrl;
  }

  /**
   * Get WebRTC configuration from server
   */
  async getConfig(): Promise<WebRTCConfig> {
    const response = await fetch(`${this.apiUrl}/api/webrtc/config`);
    if (!response.ok) {
      throw new Error(`Failed to get WebRTC config: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Create a new WebRTC session for a telescope
   */
  async createSession(
    telescopeName: string,
    streamType: 'live' | 'stacked' = 'live'
  ): Promise<MediaStream> {
    try {
      // Clean up any existing session
      await this.disconnect();

      // Get WebRTC configuration
      const config = await this.getConfig();

      // Create peer connection
      this.peerConnection = new RTCPeerConnection(config);
      this.setupPeerConnectionHandlers();

      // Create offer
      const offer = await this.peerConnection.createOffer({
        offerToReceiveVideo: true,
        offerToReceiveAudio: false,
      });
      await this.peerConnection.setLocalDescription(offer);

      // Send offer to server
      const request: CreateSessionRequest = {
        telescope_name: telescopeName,
        offer: {
          sdp: offer.sdp!,
          type: 'offer',
        },
        stream_type: streamType,
      };

      const response = await fetch(`${this.apiUrl}/api/webrtc/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(`Failed to create session: ${response.statusText}`);
      }

      const sessionResponse: CreateSessionResponse = await response.json();
      this.sessionId = sessionResponse.session_id;

      // Set remote description (answer)
      await this.peerConnection.setRemoteDescription(
        new RTCSessionDescription(sessionResponse.answer)
      );

      // Start listening for ICE candidates
      this.listenForIceCandidates();

      // Return the remote stream (will be populated when tracks are received)
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout waiting for remote stream'));
        }, 30000); // 30 second timeout

        this.once('stream', (stream: MediaStream) => {
          clearTimeout(timeout);
          resolve(stream);
        });

        this.once('error', (error: Error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
    } catch (error) {
      await this.disconnect();
      throw error;
    }
  }

  /**
   * Setup peer connection event handlers
   */
  private setupPeerConnectionHandlers(): void {
    if (!this.peerConnection) return;

    // Handle incoming tracks
    this.peerConnection.ontrack = (event) => {
      console.log('Received remote track:', event.track.kind);
      
      if (!this.remoteStream) {
        this.remoteStream = new MediaStream();
      }
      
      this.remoteStream.addTrack(event.track);
      
      // Emit stream event when we have video
      if (event.track.kind === 'video') {
        this.emit('stream', this.remoteStream);
      }
    };

    // Handle ICE candidates
    this.peerConnection.onicecandidate = async (event) => {
      if (event.candidate && this.sessionId) {
        try {
          await this.sendIceCandidate(event.candidate);
        } catch (error) {
          console.error('Failed to send ICE candidate:', error);
        }
      }
    };

    // Handle connection state changes
    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection!.connectionState;
      console.log('Connection state:', state);
      this.connectionState = state as ConnectionState;
      this.emit('connectionStateChange', state);

      if (state === 'failed' || state === 'closed') {
        this.emit('error', new Error(`Connection ${state}`));
      }
    };

    // Handle ICE connection state changes
    this.peerConnection.oniceconnectionstatechange = () => {
      const state = this.peerConnection!.iceConnectionState;
      console.log('ICE connection state:', state);
      this.emit('iceConnectionStateChange', state);
    };
  }

  /**
   * Send ICE candidate to server
   */
  private async sendIceCandidate(candidate: RTCIceCandidate): Promise<void> {
    if (!this.sessionId) {
      throw new Error('No active session');
    }

    const iceCandidateData: WebRTCIceCandidate = {
      candidate: candidate.candidate,
      sdpMLineIndex: candidate.sdpMLineIndex,
      sdpMid: candidate.sdpMid,
      usernameFragment: candidate.usernameFragment,
    };

    const response = await fetch(
      `${this.apiUrl}/api/webrtc/sessions/${this.sessionId}/ice-candidates`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(iceCandidateData),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to send ICE candidate: ${response.statusText}`);
    }
  }

  /**
   * Listen for ICE candidates from server via SSE
   */
  private listenForIceCandidates(): void {
    if (!this.sessionId) return;

    this.iceCandidateSource = new EventSource(
      `${this.apiUrl}/api/webrtc/sessions/${this.sessionId}/ice-candidates/stream`
    );

    this.iceCandidateSource.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'keepalive') {
          return; // Ignore keepalive messages
        }

        // Add remote ICE candidate
        const candidate = new RTCIceCandidate(data);
        await this.peerConnection?.addIceCandidate(candidate);
        console.log('Added remote ICE candidate');
      } catch (error) {
        console.error('Failed to add remote ICE candidate:', error);
      }
    };

    this.iceCandidateSource.onerror = (error) => {
      console.error('ICE candidate stream error:', error);
    };
  }

  /**
   * Get current session information
   */
  async getSession(): Promise<WebRTCSession | null> {
    if (!this.sessionId) return null;

    const response = await fetch(
      `${this.apiUrl}/api/webrtc/sessions/${this.sessionId}`
    );
    
    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Failed to get session: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * List all active sessions
   */
  async listSessions(): Promise<WebRTCSession[]> {
    const response = await fetch(`${this.apiUrl}/api/webrtc/sessions`);
    
    if (!response.ok) {
      throw new Error(`Failed to list sessions: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Disconnect and clean up resources
   */
  async disconnect(): Promise<void> {
    // Close ICE candidate stream
    if (this.iceCandidateSource) {
      this.iceCandidateSource.close();
      this.iceCandidateSource = null;
    }

    // Close peer connection
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    // Clean up streams
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    if (this.remoteStream) {
      this.remoteStream.getTracks().forEach(track => track.stop());
      this.remoteStream = null;
    }

    // Delete session on server
    if (this.sessionId) {
      try {
        await fetch(`${this.apiUrl}/api/webrtc/sessions/${this.sessionId}`, {
          method: 'DELETE',
        });
      } catch (error) {
        console.error('Failed to delete session:', error);
      }
      this.sessionId = null;
    }

    this.connectionState = 'closed';
    this.emit('disconnected');
  }

  /**
   * Get current connection state
   */
  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  /**
   * Get remote stream if available
   */
  getRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }

  /**
   * Get current session ID
   */
  getSessionId(): string | null {
    return this.sessionId;
  }
}