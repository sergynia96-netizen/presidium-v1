/**
 * WebRTC Peer Connection Manager
 *
 * Handles real-time audio/video calls using WebRTC.
 * Features:
 * - 1:1 audio/video calls
 * - ICE candidate exchange
 * - SDP offer/answer negotiation
 * - Media stream management (mic, camera, speaker)
 * - Call state tracking
 * - Screen sharing
 * - Group calls (SFU-ready architecture)
 *
 * Architecture:
 * - Signaling is handled externally via relay WebSocket
 * - STUN/TURN servers for NAT traversal
 * - Media constraints are configurable
 */

import { useAppStore } from '@/store/use-app-store';

// ─── Types ───────────────────────────────────────────────────────────────────

export type CallType = 'audio' | 'video';
export type CallState = 'idle' | 'calling' | 'ringing' | 'connecting' | 'connected' | 'ended' | 'failed';
export type GroupCallState = 'idle' | 'joining' | 'connected' | 'ended' | 'failed';

export interface CallConfig {
  iceServers: RTCIceServer[];
  audioConstraints?: MediaStreamConstraints['audio'];
  videoConstraints?: MediaStreamConstraints['video'];
  screenShareConstraints?: DisplayMediaStreamOptions;
}

export interface CallInfo {
  callId: string;
  type: CallType;
  state: CallState;
  peerId: string;
  peerName?: string;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  screenStream: MediaStream | null;
  startTime: number | null;
  endTime: number | null;
  isMuted: boolean;
  isVideoOn: boolean;
  isScreenSharing: boolean;
  isSpeakerOn: boolean;
  error: string | null;
}

export interface SDPOffer {
  type: 'offer';
  sdp: string;
  callId: string;
  callType: CallType;
  from: string;
  to: string;
}

export interface SDPAnswer {
  type: 'answer';
  sdp: string;
  callId: string;
  from: string;
  to: string;
}

export interface ICECandidateMessage {
  type: 'ice-candidate';
  candidate: RTCIceCandidateInit;
  callId: string;
  from: string;
  to: string;
}

export interface CallHangupMessage {
  type: 'hangup';
  callId: string;
  reason?: string;
  from: string;
  to: string;
}

export type SignalingMessage = SDPOffer | SDPAnswer | ICECandidateMessage | CallHangupMessage;

export interface GroupParticipant {
  participantId: string;
  displayName?: string;
  stream: MediaStream | null;
  joinedAt: number;
  isMuted?: boolean;
  isVideoOn?: boolean;
}

export interface GroupCallInfo {
  callId: string;
  roomId: string;
  state: GroupCallState;
  type: CallType;
  localStream: MediaStream | null;
  participants: GroupParticipant[];
  startTime: number | null;
  endTime: number | null;
  isMuted: boolean;
  isVideoOn: boolean;
  isScreenSharing: boolean;
  error: string | null;
}

export type GroupSignalMessage =
  | {
      type: 'group.join';
      callId: string;
      roomId: string;
      from: string;
      callType: CallType;
      displayName?: string;
    }
  | {
      type: 'group.offer';
      callId: string;
      roomId: string;
      from: string;
      sdp: string;
      callType: CallType;
    }
  | {
      type: 'group.answer';
      callId: string;
      roomId: string;
      from: string;
      sdp: string;
    }
  | {
      type: 'group.ice-candidate';
      callId: string;
      roomId: string;
      from: string;
      candidate: RTCIceCandidateInit;
    }
  | {
      type: 'group.leave';
      callId: string;
      roomId: string;
      from: string;
      reason?: string;
    }
  | {
      type: 'group.participant-joined';
      callId: string;
      roomId: string;
      participantId: string;
      displayName?: string;
    }
  | {
      type: 'group.participant-left';
      callId: string;
      roomId: string;
      participantId: string;
      reason?: string;
    };

// ─── Default Config ──────────────────────────────────────────────────────────

export const DEFAULT_CALL_CONFIG: CallConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    ...(process.env.NEXT_PUBLIC_TURN_URL
      ? [
          {
            urls: process.env.NEXT_PUBLIC_TURN_URL,
            username: process.env.NEXT_PUBLIC_TURN_USERNAME || '',
            credential: process.env.NEXT_PUBLIC_TURN_PASSWORD || '',
          },
        ]
      : []),
  ],
  audioConstraints: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    sampleRate: 48000,
  },
  videoConstraints: {
    width: { ideal: 1280, max: 1920 },
    height: { ideal: 720, max: 1080 },
    frameRate: { ideal: 30, max: 60 },
    facingMode: 'user',
  },
  screenShareConstraints: {
    video: {
      displaySurface: 'monitor' as const,
    },
    audio: false,
  },
};

// ─── WebRTC Manager ─────────────────────────────────────────────────────────

class WebRTCManager {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  private config: CallConfig;
  private onSignalingMessage: ((message: SignalingMessage) => void) | null = null;
  private onStateChange: ((state: CallState) => void) | null = null;
  private onStreamChange: ((type: 'local' | 'remote' | 'screen', stream: MediaStream | null) => void) | null = null;
  private onError: ((error: string) => void) | null = null;

  private currentCallId: string | null = null;
  private currentState: CallState = 'idle';
  private isMuted = false;
  private isVideoOn = false;
  private isScreenSharing = false;
  private isSpeakerOn = false;

  constructor(config: Partial<CallConfig> = {}) {
    this.config = { ...DEFAULT_CALL_CONFIG, ...config };
  }

  // ─── Event Handlers ─────────────────────────────────────────────────────

  /**
   * Set callback for signaling messages (to send via relay).
   */
  onSignaling(callback: (message: SignalingMessage) => void): void {
    this.onSignalingMessage = callback;
  }

  /**
   * Set callback for call state changes.
   */
  onState(callback: (state: CallState) => void): void {
    this.onStateChange = callback;
  }

  /**
   * Set callback for media stream changes.
   */
  onStream(callback: (type: 'local' | 'remote' | 'screen', stream: MediaStream | null) => void): void {
    this.onStreamChange = callback;
  }

  /**
   * Set callback for errors.
   */
  onErrorCallback(callback: (error: string) => void): void {
    this.onError = callback;
  }

  // ─── Call Initiation ────────────────────────────────────────────────────

  /**
   * Start an outgoing call.
   * Creates local media stream and peer connection, then generates SDP offer.
   */
  async startOutgoingCall(callId: string, peerId: string, type: CallType): Promise<void> {
    if (this.currentState !== 'idle') {
      throw new Error('Call already in progress');
    }

    this.currentCallId = callId;
    this.setState('calling');

    try {
      // Get local media stream
      await this.getLocalStream(type);

      // Create peer connection
      this.createPeerConnection();

      // Add local tracks to peer connection
      if (this.localStream) {
        this.localStream.getTracks().forEach(track => {
          this.peerConnection!.addTrack(track, this.localStream!);
        });
      }

      // Create SDP offer
      const offer = await this.peerConnection!.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: type === 'video',
      });

      await this.peerConnection!.setLocalDescription(offer);

      // Send offer via signaling
      this.emitSignaling({
        type: 'offer',
        sdp: offer.sdp!,
        callId,
        callType: type,
        from: this.getLocalUserId(),
        to: peerId,
      });

      this.setState('connecting');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to start call';
      this.handleError(msg);
      await this.endCall();
    }
  }

  /**
   * Handle an incoming call offer.
   * Creates local media stream and peer connection, then generates SDP answer.
   */
  async handleIncomingCall(offer: SDPOffer): Promise<void> {
    if (this.currentState !== 'idle') {
      // Busy - reject
      this.emitSignaling({
        type: 'hangup',
        callId: offer.callId,
        reason: 'busy',
        from: offer.to,
        to: offer.from,
      });
      return;
    }

    this.currentCallId = offer.callId;
    this.setState('ringing');

    try {
      // Get local media stream
      await this.getLocalStream(offer.callType);

      // Create peer connection
      this.createPeerConnection();

      // Add local tracks
      if (this.localStream) {
        this.localStream.getTracks().forEach(track => {
          this.peerConnection!.addTrack(track, this.localStream!);
        });
      }

      // Set remote description (offer)
      await this.peerConnection!.setRemoteDescription({
        type: 'offer',
        sdp: offer.sdp,
      });

      // Create and send answer
      const answer = await this.peerConnection!.createAnswer();
      await this.peerConnection!.setLocalDescription(answer);

      this.emitSignaling({
        type: 'answer',
        sdp: answer.sdp!,
        callId: offer.callId,
        from: offer.to,
        to: offer.from,
      });

      this.setState('connecting');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to handle incoming call';
      this.handleError(msg);
      await this.endCall();
    }
  }

  // ─── Signaling ──────────────────────────────────────────────────────────

  /**
   * Handle a received SDP answer.
   */
  async handleAnswer(answer: SDPAnswer): Promise<void> {
    if (!this.peerConnection || this.currentState !== 'connecting') {
      return;
    }

    await this.peerConnection.setRemoteDescription({
      type: 'answer',
      sdp: answer.sdp,
    });

    this.setState('connected');
  }

  /**
   * Handle a received ICE candidate.
   */
  async handleICECandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.peerConnection) return;

    try {
      await this.peerConnection.addIceCandidate(candidate);
    } catch (error) {
      console.warn('[WebRTC] Failed to add ICE candidate:', error);
    }
  }

  /**
   * Handle a hangup signal.
   */
  async handleHangup(_message: CallHangupMessage): Promise<void> {
    await this.endCall();
  }

  // ─── Media Controls ─────────────────────────────────────────────────────

  /**
   * Toggle microphone mute.
   */
  toggleMute(): boolean {
    if (!this.localStream) return this.isMuted;

    const audioTrack = this.localStream.getAudioTracks()[0];
    if (audioTrack) {
      this.isMuted = !audioTrack.enabled;
      audioTrack.enabled = !this.isMuted;
    }

    return this.isMuted;
  }

  /**
   * Toggle video on/off.
   */
  toggleVideo(): boolean {
    if (!this.localStream) return this.isVideoOn;

    const videoTrack = this.localStream.getVideoTracks()[0];
    if (videoTrack) {
      this.isVideoOn = !videoTrack.enabled;
      videoTrack.enabled = this.isVideoOn;
    }

    return this.isVideoOn;
  }

  /**
   * Toggle speaker mode.
   */
  toggleSpeaker(): boolean {
    this.isSpeakerOn = !this.isSpeakerOn;

    // On mobile, this would use setSinkId
    // On desktop, speaker is default
    if (this.remoteStream) {
      const audioElement = document.querySelector('audio#remote-audio') as HTMLAudioElement;
      if (audioElement && 'setSinkId' in audioElement) {
        // Could set specific output device here
      }
    }

    return this.isSpeakerOn;
  }

  /**
   * Start screen sharing.
   */
  async startScreenShare(): Promise<void> {
    if (this.isScreenSharing) return;

    try {
      this.screenStream = await navigator.mediaDevices.getDisplayMedia(
        this.config.screenShareConstraints,
      );

      // Replace video track in peer connection
      if (this.peerConnection && this.screenStream) {
        const videoTrack = this.screenStream.getVideoTracks()[0];
        const senders = this.peerConnection.getSenders();
        const videoSender = senders.find(s => s.track?.kind === 'video');

        if (videoSender) {
          await videoSender.replaceTrack(videoTrack);
        }

        // Handle screen share stop
        videoTrack.onended = async () => {
          await this.stopScreenShare();
        };
      }

      this.isScreenSharing = true;
      this.emitStreamChange('screen', this.screenStream);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to start screen share';
      this.handleError(msg);
    }
  }

  /**
   * Stop screen sharing.
   */
  async stopScreenShare(): Promise<void> {
    if (!this.isScreenSharing) return;

    // Stop screen stream
    if (this.screenStream) {
      this.screenStream.getTracks().forEach(track => track.stop());
      this.screenStream = null;
    }

    // Restore camera video track
    if (this.peerConnection && this.localStream && this.isVideoOn) {
      const videoTrack = this.localStream.getVideoTracks()[0];
      if (videoTrack) {
        const senders = this.peerConnection.getSenders();
        const videoSender = senders.find(s => s.track?.kind === 'video');
        if (videoSender) {
          await videoSender.replaceTrack(videoTrack);
        }
      }
    }

    this.isScreenSharing = false;
    this.emitStreamChange('screen', null);
  }

  /**
   * Switch camera (front/back).
   */
  async switchCamera(): Promise<void> {
    if (!this.localStream || !this.isVideoOn) return;

    const videoTrack = this.localStream.getVideoTracks()[0];
    if (!videoTrack) return;

    const currentFacing = videoTrack.getSettings().facingMode;
    const newFacing = currentFacing === 'user' ? 'environment' : 'user';

    try {
      const videoSettings: Record<string, unknown> = {};
      if (this.config.videoConstraints && typeof this.config.videoConstraints === 'object') {
        Object.assign(videoSettings, this.config.videoConstraints);
      }
      videoSettings.facingMode = newFacing;

      const newStream = await navigator.mediaDevices.getUserMedia({
        video: videoSettings as MediaTrackConstraints,
        audio: false,
      });

      const newVideoTrack = newStream.getVideoTracks()[0];

      // Replace track in peer connection
      if (this.peerConnection) {
        const senders = this.peerConnection.getSenders();
        const videoSender = senders.find(s => s.track?.kind === 'video');
        if (videoSender) {
          await videoSender.replaceTrack(newVideoTrack);
        }
      }

      // Replace track in local stream
      videoTrack.stop();
      this.localStream.removeTrack(videoTrack);
      this.localStream.addTrack(newVideoTrack);

      this.emitStreamChange('local', this.localStream);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to switch camera';
      this.handleError(msg);
    }
  }

  // ─── Call End ───────────────────────────────────────────────────────────

  /**
   * End the current call.
   */
  async endCall(): Promise<void> {
    // Send hangup signal
    if (this.currentCallId) {
      this.emitSignaling({
        type: 'hangup',
        callId: this.currentCallId,
        from: this.getLocalUserId(),
        to: '',
      });
    }

    // Stop all tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    if (this.screenStream) {
      this.screenStream.getTracks().forEach(track => track.stop());
      this.screenStream = null;
    }

    // Close peer connection
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    this.remoteStream = null;
    this.currentCallId = null;
    this.isMuted = false;
    this.isVideoOn = false;
    this.isScreenSharing = false;
    this.isSpeakerOn = false;

    this.setState('ended');

    // Reset to idle after a short delay
    setTimeout(() => {
      this.setState('idle');
    }, 1000);
  }

  // ─── Internal Methods ───────────────────────────────────────────────────

  /**
   * Get local media stream (audio + optional video).
   */
  private async getLocalStream(type: CallType): Promise<MediaStream> {
    const constraints: MediaStreamConstraints = {
      audio: this.config.audioConstraints || true,
      video: type === 'video' ? (this.config.videoConstraints || true) : false,
    };

    this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
    this.isVideoOn = type === 'video';

    this.emitStreamChange('local', this.localStream);
    return this.localStream;
  }

  /**
   * Create and configure RTCPeerConnection.
   */
  private createPeerConnection(): void {
    this.peerConnection = new RTCPeerConnection({
      iceServers: this.config.iceServers,
      iceCandidatePoolSize: 10,
    });

    // Handle ICE candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.currentCallId) {
        this.emitSignaling({
          type: 'ice-candidate',
          candidate: event.candidate.toJSON(),
          callId: this.currentCallId,
          from: this.getLocalUserId(),
          to: '',
        });
      }
    };

    // Handle remote stream
    this.peerConnection.ontrack = (event) => {
      if (!this.remoteStream) {
        this.remoteStream = new MediaStream();
        this.emitStreamChange('remote', this.remoteStream);
      }

      event.streams[0].getTracks().forEach(track => {
        this.remoteStream!.addTrack(track);
      });
    };

    // Handle connection state changes
    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection!.connectionState;

      switch (state) {
        case 'connected':
          this.setState('connected');
          break;
        case 'disconnected':
        case 'failed':
          this.handleError('Connection lost');
          break;
        case 'closed':
          this.setState('ended');
          break;
      }
    };

    // Handle ICE connection state
    this.peerConnection.oniceconnectionstatechange = () => {
      const state = this.peerConnection!.iceConnectionState;

      if (state === 'failed') {
        this.handleError('ICE connection failed');
      }
    };
  }

  // ─── State Management ───────────────────────────────────────────────────

  private setState(state: CallState): void {
    this.currentState = state;
    this.onStateChange?.(state);
  }

  private emitSignaling(message: SignalingMessage): void {
    this.onSignalingMessage?.(message);
  }

  private emitStreamChange(type: 'local' | 'remote' | 'screen', stream: MediaStream | null): void {
    this.onStreamChange?.(type, stream);
  }

  private handleError(error: string): void {
    this.onError?.(error);
    console.error('[WebRTC]', error);
  }

  private getLocalUserId(): string {
    const user = useAppStore.getState().user;
    return user?.id || 'anonymous';
  }

  // ─── Getters ────────────────────────────────────────────────────────────

  getCallInfo(): CallInfo {
    const info: CallInfo = {
      callId: this.currentCallId || '',
      type: this.isVideoOn ? 'video' : 'audio',
      state: this.currentState,
      peerId: '',
      localStream: this.localStream,
      remoteStream: this.remoteStream,
      screenStream: this.screenStream,
      startTime: this.currentState === 'connected' ? Date.now() : null,
      endTime: this.currentState === 'ended' ? Date.now() : null,
      isMuted: this.isMuted,
      isVideoOn: this.isVideoOn,
      isScreenSharing: this.isScreenSharing,
      isSpeakerOn: this.isSpeakerOn,
      error: null,
    };
    return info;
  }

  isCallActive(): boolean {
    return this.currentState !== 'idle' && this.currentState !== 'ended';
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

export const webrtcManager = new WebRTCManager();

// ─── Group Call Manager (SFU-ready) ─────────────────────────────────────────

/**
 * GroupCallManager is designed for SFU topology:
 * - Single upstream RTCPeerConnection to SFU
 * - SFU fan-out to all participants
 * - Client tracks participant streams as they arrive from SFU
 *
 * This avoids N² mesh scaling and keeps architecture ready for large rooms.
 */
class GroupCallManager {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  private participants = new Map<string, GroupParticipant>();
  private config: CallConfig;

  private currentCallId: string | null = null;
  private currentRoomId: string | null = null;
  private currentType: CallType = 'audio';
  private state: GroupCallState = 'idle';
  private startTime: number | null = null;
  private endTime: number | null = null;
  private lastError: string | null = null;

  private isMuted = false;
  private isVideoOn = false;
  private isScreenSharing = false;

  private participantCounter = 0;

  private onSignal: ((message: GroupSignalMessage) => void) | null = null;
  private onState: ((state: GroupCallState) => void) | null = null;
  private onParticipantStream: ((participant: GroupParticipant) => void) | null = null;
  private onParticipantLeft: ((participantId: string) => void) | null = null;
  private onLocalStream: ((stream: MediaStream | null) => void) | null = null;
  private onError: ((error: string) => void) | null = null;

  constructor(config: Partial<CallConfig> = {}) {
    this.config = { ...DEFAULT_CALL_CONFIG, ...config };
  }

  onSignaling(callback: (message: GroupSignalMessage) => void): void {
    this.onSignal = callback;
  }

  onStateChange(callback: (state: GroupCallState) => void): void {
    this.onState = callback;
  }

  onParticipantStreamChange(callback: (participant: GroupParticipant) => void): void {
    this.onParticipantStream = callback;
  }

  onParticipantLeave(callback: (participantId: string) => void): void {
    this.onParticipantLeft = callback;
  }

  onLocalStreamChange(callback: (stream: MediaStream | null) => void): void {
    this.onLocalStream = callback;
  }

  onErrorCallback(callback: (error: string) => void): void {
    this.onError = callback;
  }

  async joinRoom(params: {
    callId: string;
    roomId: string;
    type: CallType;
    displayName?: string;
  }): Promise<void> {
    if (this.state !== 'idle' && this.state !== 'ended') {
      throw new Error('Group call already in progress');
    }

    this.currentCallId = params.callId;
    this.currentRoomId = params.roomId;
    this.currentType = params.type;
    this.startTime = Date.now();
    this.endTime = null;
    this.lastError = null;
    this.participants.clear();
    this.participantCounter = 0;
    this.setState('joining');

    try {
      await this.acquireLocalStream(params.type);
      this.createPeerConnection();

      if (this.localStream && this.peerConnection) {
        this.localStream.getTracks().forEach((track) => {
          this.peerConnection!.addTrack(track, this.localStream!);
        });
      }

      // SFU-ready: explicit recvonly transceivers for downlink media.
      this.peerConnection!.addTransceiver('audio', { direction: 'recvonly' });
      this.peerConnection!.addTransceiver('video', { direction: 'recvonly' });

      const offer = await this.peerConnection!.createOffer();
      await this.peerConnection!.setLocalDescription(offer);

      this.emitSignal({
        type: 'group.join',
        callId: params.callId,
        roomId: params.roomId,
        from: this.getLocalUserId(),
        callType: params.type,
        displayName: params.displayName,
      });

      this.emitSignal({
        type: 'group.offer',
        callId: params.callId,
        roomId: params.roomId,
        from: this.getLocalUserId(),
        sdp: offer.sdp || '',
        callType: params.type,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to join group call';
      this.handleError(message);
      await this.leaveRoom('join_failed');
      throw error;
    }
  }

  async handleSignal(message: GroupSignalMessage): Promise<void> {
    if (!this.peerConnection) return;
    if (!this.currentCallId || !this.currentRoomId) return;
    if (message.callId !== this.currentCallId || message.roomId !== this.currentRoomId) return;

    try {
      switch (message.type) {
        case 'group.answer':
          await this.peerConnection.setRemoteDescription({
            type: 'answer',
            sdp: message.sdp,
          });
          this.setState('connected');
          break;
        case 'group.ice-candidate':
          await this.peerConnection.addIceCandidate(message.candidate);
          break;
        case 'group.participant-joined':
          this.ensureParticipant(message.participantId, message.displayName);
          break;
        case 'group.participant-left':
          this.removeParticipant(message.participantId);
          break;
        case 'group.leave':
          if (message.from !== this.getLocalUserId()) {
            this.removeParticipant(message.from);
          }
          break;
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to process group signal';
      this.handleError(msg);
    }
  }

  async leaveRoom(reason = 'left'): Promise<void> {
    if (!this.currentCallId || !this.currentRoomId) {
      this.resetToIdle();
      return;
    }

    this.emitSignal({
      type: 'group.leave',
      callId: this.currentCallId,
      roomId: this.currentRoomId,
      from: this.getLocalUserId(),
      reason,
    });

    if (this.screenStream) {
      this.screenStream.getTracks().forEach((track) => track.stop());
      this.screenStream = null;
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
      this.onLocalStream?.(null);
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    this.participants.clear();
    this.endTime = Date.now();
    this.setState('ended');

    setTimeout(() => this.resetToIdle(), 800);
  }

  toggleMute(): boolean {
    if (!this.localStream) return this.isMuted;

    const track = this.localStream.getAudioTracks()[0];
    if (track) {
      this.isMuted = !track.enabled;
      track.enabled = !this.isMuted;
    }
    return this.isMuted;
  }

  toggleVideo(): boolean {
    if (!this.localStream) return this.isVideoOn;

    const track = this.localStream.getVideoTracks()[0];
    if (track) {
      this.isVideoOn = !track.enabled;
      track.enabled = this.isVideoOn;
    }
    return this.isVideoOn;
  }

  async startScreenShare(): Promise<void> {
    if (this.isScreenSharing) return;
    if (!this.peerConnection) return;

    try {
      this.screenStream = await navigator.mediaDevices.getDisplayMedia(
        this.config.screenShareConstraints || { video: true, audio: false },
      );
      const screenTrack = this.screenStream.getVideoTracks()[0];
      const videoSender = this.peerConnection
        .getSenders()
        .find((sender) => sender.track?.kind === 'video');

      if (videoSender && screenTrack) {
        await videoSender.replaceTrack(screenTrack);
        this.isScreenSharing = true;
      }

      if (screenTrack) {
        screenTrack.onended = () => {
          void this.stopScreenShare();
        };
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to start screen share';
      this.handleError(msg);
    }
  }

  async stopScreenShare(): Promise<void> {
    if (!this.isScreenSharing) return;

    if (this.screenStream) {
      this.screenStream.getTracks().forEach((track) => track.stop());
      this.screenStream = null;
    }

    if (this.peerConnection && this.localStream && this.isVideoOn) {
      const localVideoTrack = this.localStream.getVideoTracks()[0];
      const videoSender = this.peerConnection
        .getSenders()
        .find((sender) => sender.track?.kind === 'video');
      if (videoSender && localVideoTrack) {
        await videoSender.replaceTrack(localVideoTrack);
      }
    }

    this.isScreenSharing = false;
  }

  getGroupCallInfo(): GroupCallInfo {
    return {
      callId: this.currentCallId || '',
      roomId: this.currentRoomId || '',
      state: this.state,
      type: this.currentType,
      localStream: this.localStream,
      participants: Array.from(this.participants.values()),
      startTime: this.startTime,
      endTime: this.endTime,
      isMuted: this.isMuted,
      isVideoOn: this.isVideoOn,
      isScreenSharing: this.isScreenSharing,
      error: this.lastError,
    };
  }

  isActive(): boolean {
    return this.state === 'joining' || this.state === 'connected';
  }

  private async acquireLocalStream(type: CallType): Promise<void> {
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: this.config.audioConstraints || true,
      video: type === 'video' ? (this.config.videoConstraints || true) : false,
    });
    this.isVideoOn = type === 'video';
    this.isMuted = false;
    this.onLocalStream?.(this.localStream);
  }

  private createPeerConnection(): void {
    this.peerConnection = new RTCPeerConnection({
      iceServers: this.config.iceServers,
      iceCandidatePoolSize: 16,
    });

    this.peerConnection.onicecandidate = (event) => {
      if (!event.candidate || !this.currentCallId || !this.currentRoomId) return;
      this.emitSignal({
        type: 'group.ice-candidate',
        callId: this.currentCallId,
        roomId: this.currentRoomId,
        from: this.getLocalUserId(),
        candidate: event.candidate.toJSON(),
      });
    };

    this.peerConnection.ontrack = (event) => {
      const participantId = this.deriveParticipantId(event.streams[0]);
      const participant = this.ensureParticipant(participantId);
      participant.stream = event.streams[0] || participant.stream;
      participant.isVideoOn = participant.stream?.getVideoTracks().length > 0;
      participant.isMuted = participant.stream?.getAudioTracks().every((track) => !track.enabled) ?? false;
      this.participants.set(participantId, participant);
      this.onParticipantStream?.(participant);
    };

    this.peerConnection.onconnectionstatechange = () => {
      if (!this.peerConnection) return;
      const state = this.peerConnection.connectionState;
      if (state === 'connected') this.setState('connected');
      if (state === 'failed' || state === 'disconnected') this.handleError('Group call connection lost');
      if (state === 'closed') this.setState('ended');
    };
  }

  private deriveParticipantId(stream?: MediaStream): string {
    if (stream?.id) return stream.id;
    this.participantCounter += 1;
    return `participant-${this.participantCounter}`;
  }

  private ensureParticipant(participantId: string, displayName?: string): GroupParticipant {
    const existing = this.participants.get(participantId);
    if (existing) {
      if (displayName) existing.displayName = displayName;
      return existing;
    }

    const participant: GroupParticipant = {
      participantId,
      displayName,
      stream: null,
      joinedAt: Date.now(),
    };
    this.participants.set(participantId, participant);
    return participant;
  }

  private removeParticipant(participantId: string): void {
    if (!this.participants.has(participantId)) return;
    this.participants.delete(participantId);
    this.onParticipantLeft?.(participantId);
  }

  private emitSignal(message: GroupSignalMessage): void {
    this.onSignal?.(message);
  }

  private setState(state: GroupCallState): void {
    this.state = state;
    this.onState?.(state);
  }

  private handleError(message: string): void {
    this.lastError = message;
    this.setState('failed');
    this.onError?.(message);
    console.error('[GroupCallManager]', message);
  }

  private resetToIdle(): void {
    this.currentCallId = null;
    this.currentRoomId = null;
    this.state = 'idle';
    this.startTime = null;
    this.endTime = null;
    this.lastError = null;
    this.isMuted = false;
    this.isVideoOn = false;
    this.isScreenSharing = false;
    this.participants.clear();
    this.setState('idle');
  }

  private getLocalUserId(): string {
    const user = useAppStore.getState().user;
    return user?.id || 'anonymous';
  }
}

export const groupCallManager = new GroupCallManager();
