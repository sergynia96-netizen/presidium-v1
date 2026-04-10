'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PhoneOff,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Video,
  VideoOff,
  Monitor,
  MonitorOff,
  RotateCcw,
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useAppStore } from '@/store/use-app-store';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { webrtcManager, type CallState, type SignalingMessage } from '@/lib/webrtc';
import { relayClient } from '@/lib/crypto/relay-client';
import { toast } from 'sonner';

function getInitials(name: string) {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

interface CallScreenProps {
  callType?: 'audio' | 'video';
  peerId?: string;
  peerName?: string;
}

export default function CallScreen({ callType = 'audio', peerId, peerName }: CallScreenProps) {
  const { t } = useT();
  const { activeChatId, chats, goBack } = useAppStore();

  const chat = useMemo(
    () => chats.find((c) => c.id === activeChatId),
    [chats, activeChatId],
  );

  const [callState, setCallState] = useState<CallState>('connecting');
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(callType === 'video');
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const callIdRef = useRef<string>('');

  const handleSignalingMessage = useCallback(async (message: SignalingMessage) => {
    try {
      switch (message.type) {
        case 'answer':
          await webrtcManager.handleAnswer(message);
          break;
        case 'ice-candidate':
          await webrtcManager.handleICECandidate(message.candidate);
          break;
        case 'hangup':
          await webrtcManager.endCall();
          break;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Signaling error';
      setError(msg);
    }
  }, []);

  // Initialize WebRTC
  useEffect(() => {
    const targetPeerId = peerId || activeChatId || '';
    void targetPeerId; // Used in startOutgoingCall

    if (!callIdRef.current) {
      callIdRef.current = `call-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }

    // Set up WebRTC event handlers
    webrtcManager.onSignaling((message: SignalingMessage) => {
      // Send signaling message via relay WebSocket
      if (relayClient.connected) {
        const ws = (relayClient as any).ws;
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'call.signal',
            payload: message,
          }));
        }
      }
    });

    webrtcManager.onState((state: CallState) => {
      setCallState(state);
      if (state === 'connected') {
        setElapsedSeconds(0);
      }
      if (state === 'ended' || state === 'failed') {
        if (state === 'failed') {
          toast.error('Call failed');
        }
      }
    });

    webrtcManager.onStream((type, stream) => {
      if (type === 'local' && localVideoRef.current && stream) {
        localVideoRef.current.srcObject = stream;
      }
      if (type === 'remote') {
        if (remoteVideoRef.current && stream) {
          remoteVideoRef.current.srcObject = stream;
        }
        if (remoteAudioRef.current && stream) {
          remoteAudioRef.current.srcObject = stream;
        }
      }
    });

    webrtcManager.onErrorCallback((err: string) => {
      setError(err);
      toast.error(err);
    });

    // Start outgoing call
    webrtcManager.startOutgoingCall(callIdRef.current, targetPeerId, callType).catch((err) => {
      setError(err.message);
      toast.error(err.message);
    });

    // Listen for incoming signaling messages from relay
    const unsub = relayClient.on((event) => {
      if (event.type === 'message' && (event.data as any).callSignal) {
        const payload = (event.data as any).callSignal as SignalingMessage;
        handleSignalingMessage(payload);
      }
    });

    return () => {
      unsub();
      webrtcManager.endCall();
    };
  }, [callType, peerId, activeChatId, handleSignalingMessage]);

  // Timer
  useEffect(() => {
    if (callState !== 'connected') return;

    const interval = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [callState]);

  const formatTime = useCallback((seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }, []);

  const handleEndCall = useCallback(() => {
    webrtcManager.endCall().then(() => {
      goBack();
    });
  }, [goBack]);

  const handleToggleMute = useCallback(() => {
    const muted = webrtcManager.toggleMute();
    setIsMuted(muted);
  }, []);

  const handleToggleVideo = useCallback(() => {
    const videoOn = webrtcManager.toggleVideo();
    setIsVideoOn(videoOn);
  }, []);

  const handleToggleSpeaker = useCallback(() => {
    const speakerOn = webrtcManager.toggleSpeaker();
    setIsSpeakerOn(speakerOn);
  }, []);

  const handleToggleScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      await webrtcManager.stopScreenShare();
      setIsScreenSharing(false);
    } else {
      await webrtcManager.startScreenShare();
      setIsScreenSharing(true);
    }
  }, [isScreenSharing]);

  const handleSwitchCamera = useCallback(async () => {
    await webrtcManager.switchCamera();
  }, []);

  const displayName = peerName || chat?.name || 'Unknown';

  const stateLabel = useMemo(() => {
    switch (callState) {
      case 'calling':
        return 'Calling...';
      case 'ringing':
        return 'Ringing...';
      case 'connecting':
        return 'Connecting...';
      case 'connected':
        return formatTime(elapsedSeconds);
      case 'ended':
        return 'Call ended';
      case 'failed':
        return error || 'Call failed';
      default:
        return '';
    }
  }, [callState, elapsedSeconds, error, formatTime]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-50 flex flex-col bg-gradient-to-b from-gray-900 via-gray-800 to-gray-900"
    >
      {/* Remote video (for video calls) */}
      {callType === 'video' && (
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          muted
          className={cn(
            'absolute inset-0 object-cover',
            !isVideoOn && 'hidden',
          )}
        />
      )}

      {/* Hidden audio element for remote audio */}
      <audio
        ref={remoteAudioRef}
        autoPlay
        playsInline
        className="hidden"
      />

      {/* Local video PiP (for video calls) */}
      {callType === 'video' && isVideoOn && (
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="absolute top-4 right-4 z-20 w-32 rounded-xl overflow-hidden border-2 border-white/20 shadow-lg"
        >
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
        </motion.div>
      )}

      {/* Background blur circles */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-20 left-1/2 size-72 -translate-x-1/2 rounded-full bg-emerald-brand/10 blur-3xl" />
        <div className="absolute -bottom-20 left-1/2 size-72 -translate-x-1/2 rounded-full bg-emerald-brand/5 blur-3xl" />
      </div>

      {/* Top section - avatar and info */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-6 px-4">
        {/* Pulsing ring + avatar */}
        <AnimatePresence>
          {callState !== 'connected' && (
            <div className="relative">
              {/* Outer pulsing ring */}
              <motion.div
                animate={{
                  scale: [1, 1.15, 1],
                  opacity: [0.4, 0.1, 0.4],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
                className="absolute -inset-4 rounded-full bg-emerald-brand/30"
              />

              {/* Second ring */}
              <motion.div
                animate={{
                  scale: [1, 1.08, 1],
                  opacity: [0.3, 0.1, 0.3],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: 'easeInOut',
                  delay: 0.3,
                }}
                className="absolute -inset-2 rounded-full bg-emerald-brand/20"
              />

              {/* Avatar */}
              <Avatar className="relative size-28">
                <AvatarFallback className="bg-gray-700 text-4xl font-bold text-white">
                  {getInitials(displayName)}
                </AvatarFallback>
              </Avatar>
            </div>
          )}
        </AnimatePresence>

        {/* Contact name */}
        <motion.div
          initial={{ y: 15, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="flex flex-col items-center gap-2"
        >
          <h2 className="text-2xl font-semibold text-white">{displayName}</h2>

          {/* Call status */}
          <div className="flex items-center gap-2">
            {callState === 'failed' ? (
              <span className="text-sm text-red-400">{stateLabel}</span>
            ) : callState === 'connecting' || callState === 'calling' || callState === 'ringing' ? (
              <motion.span
                animate={{ opacity: [1, 0.4, 1] }}
                transition={{ duration: 1.2, repeat: Infinity }}
                className="text-sm text-gray-400"
              >
                {stateLabel}
              </motion.span>
            ) : callState === 'connected' ? (
              <span className="font-mono text-lg tracking-wider text-gray-300">
                {stateLabel}
              </span>
            ) : (
              <span className="text-sm text-gray-400">{stateLabel}</span>
            )}
          </div>

          {/* Call type badge */}
          <Badge
            variant="secondary"
            className={cn(
              'mt-1 text-xs',
              callType === 'video'
                ? 'bg-blue-500/15 text-blue-400 hover:bg-blue-500/20'
                : 'bg-emerald-brand/15 text-emerald-400 hover:bg-emerald-brand/20',
            )}
          >
            {callType === 'video' ? t('calls.video') : t('calls.audio')}
          </Badge>

          {/* Muted indicator */}
          {isMuted && (
          <Badge variant="destructive" className="mt-1 text-xs">
            Muted
          </Badge>
          )}
        </motion.div>
      </div>

      {/* Bottom controls */}
      <div className="relative z-10 px-8 pb-12 pt-6">
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="flex items-center justify-center gap-4"
        >
          {/* Speaker */}
          <button
            onClick={handleToggleSpeaker}
            className="flex size-14 items-center justify-center rounded-full bg-gray-700/80 text-white transition-colors hover:bg-gray-600"
            title="Speaker"
          >
            {isSpeakerOn ? (
              <Volume2 className="size-5 text-emerald-400" />
            ) : (
              <VolumeX className="size-5" />
            )}
          </button>

          {/* Mute */}
          <button
            onClick={handleToggleMute}
            className={cn(
              'flex size-14 items-center justify-center rounded-full text-white transition-colors',
              isMuted
                ? 'bg-white text-gray-900'
                : 'bg-gray-700/80 hover:bg-gray-600',
            )}
            title="Mute"
          >
            {isMuted ? <MicOff className="size-5" /> : <Mic className="size-5" />}
          </button>

          {/* Video toggle */}
          {callType === 'video' && (
            <button
              onClick={handleToggleVideo}
              className={cn(
                'flex size-14 items-center justify-center rounded-full text-white transition-colors',
                isVideoOn
                  ? 'bg-gray-700/80 hover:bg-gray-600'
                  : 'bg-white text-gray-900',
              )}
              title="Video"
            >
              {isVideoOn ? <Video className="size-5" /> : <VideoOff className="size-5" />}
            </button>
          )}

          {/* Screen share */}
          {callType === 'video' && (
            <button
              onClick={handleToggleScreenShare}
              className={cn(
                'flex size-14 items-center justify-center rounded-full text-white transition-colors',
                isScreenSharing
                  ? 'bg-emerald-500 text-white'
                  : 'bg-gray-700/80 hover:bg-gray-600',
              )}
              title="Screen Share"
            >
              {isScreenSharing ? (
                <MonitorOff className="size-5" />
              ) : (
                <Monitor className="size-5" />
              )}
            </button>
          )}

          {/* Switch camera */}
          {callType === 'video' && isVideoOn && (
            <button
              onClick={handleSwitchCamera}
              className="flex size-14 items-center justify-center rounded-full bg-gray-700/80 text-white transition-colors hover:bg-gray-600"
              title="Flip Camera"
            >
              <RotateCcw className="size-5" />
            </button>
          )}

          {/* End call */}
          <button
            onClick={handleEndCall}
            className="flex size-16 items-center justify-center rounded-full bg-red-500 text-white shadow-lg shadow-red-500/30 transition-colors hover:bg-red-600"
            title="End Call"
          >
            <PhoneOff className="size-7" />
          </button>
        </motion.div>
      </div>
    </motion.div>
  );
}
