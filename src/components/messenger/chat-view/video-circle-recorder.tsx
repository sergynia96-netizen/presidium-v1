/**
 * Video Circle Recorder UI
 *
 * Features:
 * - Front/back camera
 * - Circular preview during recording
 * - 60 second max duration
 * - Progress ring
 * - Swipe down to cancel
 * - Tap to toggle camera
 */

'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  startVideoCircleRecording,
  stopVideoCircleRecording,
  cancelVideoCircleRecording,
} from '@/lib/media';

interface VideoCircleRecorderProps {
  onSend: (blob: Blob, duration: number) => void;
  onCancel: () => void;
}

export function VideoCircleRecorder({ onSend, onCancel }: VideoCircleRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [isCancelling, setIsCancelling] = useState(false);
  const [startY, setStartY] = useState(0);
  const [_previewUrl, setPreviewUrl] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const finishRecording = useCallback(async () => {
    if (!recorderRef.current || !streamRef.current) return;

    const stream = streamRef.current;
    const recorder = recorderRef.current;
    const chunks = chunksRef.current;

    streamRef.current = null;
    recorderRef.current = null;

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (isCancelling) {
      cancelVideoCircleRecording(stream, recorder, chunks);
      setIsRecording(false);
      onCancel();
      return;
    }

    const { blob, duration: dur } = await stopVideoCircleRecording(stream, recorder, chunks);

    // Create thumbnail
    const url = URL.createObjectURL(blob);
    setPreviewUrl(url);

    setIsRecording(false);
    onSend(blob, dur);
  }, [isCancelling, onSend, onCancel]);

  // Timer
  useEffect(() => {
    if (!isRecording) return;

    timerRef.current = setInterval(() => {
      setDuration(d => {
        if (d >= 60) {
          // Auto-send at 60s
          finishRecording();
          return 60;
        }
        return d + 0.1;
      });
    }, 100);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isRecording, finishRecording]);

  const startRecording = useCallback(async () => {
    try {
      const { stream, recorder, chunks } = await startVideoCircleRecording();
      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = chunks;

      // Show preview
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      setIsRecording(true);
      setDuration(0);
      setIsCancelling(false);
    } catch {
      onCancel();
    }
  }, [onCancel]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    setStartY(e.clientY);
    startRecording();
  }, [startRecording]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isRecording) return;

    const deltaY = e.clientY - startY;
    if (deltaY > 80) {
      setIsCancelling(true);
    } else {
      setIsCancelling(false);
    }
  }, [isRecording, startY]);

  const handlePointerUp = useCallback(() => {
    if (!isRecording) return;
    finishRecording();
  }, [isRecording, finishRecording]);

  const handleCancel = useCallback(() => {
    setIsCancelling(true);
    finishRecording();
  }, [finishRecording]);

  const progress = Math.min(duration / 60, 1);
  const circumference = 2 * Math.PI * 90;
  const strokeDashoffset = circumference * (1 - progress);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90">
      {/* Camera preview */}
      <div className="relative flex flex-col items-center gap-6">
        {/* Circular preview */}
        <div className="relative">
          {/* Progress ring */}
          <svg className="absolute -inset-2 size-[200px] -rotate-90" viewBox="0 0 200 200">
            <circle
              cx="100"
              cy="100"
              r="90"
              fill="none"
              stroke="rgba(255,255,255,0.1)"
              strokeWidth="4"
            />
            <motion.circle
              cx="100"
              cy="100"
              r="90"
              fill="none"
              stroke={isCancelling ? '#ef4444' : '#10b981'}
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={circumference}
              animate={{ strokeDashoffset }}
              transition={{ duration: 0.1 }}
            />
          </svg>

          {/* Video element */}
          <div className="relative size-40 overflow-hidden rounded-full bg-gray-800">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="size-full object-cover"
            />

            {/* Cancel overlay */}
            {isCancelling && (
              <div className="absolute inset-0 flex items-center justify-center bg-red-500/30 rounded-full">
                <X className="size-10 text-white" />
              </div>
            )}
          </div>

          {/* Duration */}
          {isRecording && (
            <div className="absolute -bottom-8 left-1/2 -translate-x-1/2">
              <span className="font-mono text-sm text-white">
                {Math.floor(duration / 60)}:{String(Math.floor(duration % 60)).padStart(2, '0')}
              </span>
            </div>
          )}
        </div>

        {/* Controls */}
        <AnimatePresence>
          {isRecording && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="flex items-center gap-6 mt-12"
            >
              {/* Cancel */}
              <button
                onClick={handleCancel}
                className="flex size-12 items-center justify-center rounded-full bg-gray-700 text-white transition-colors hover:bg-gray-600"
              >
                <X className="size-5" />
              </button>

              {/* Record button */}
              <button
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
                className={cn(
                  'flex size-16 items-center justify-center rounded-full transition-all',
                  isCancelling
                    ? 'bg-red-500 scale-90'
                    : 'bg-emerald-brand hover:bg-emerald-600',
                )}
              >
                <Send className="size-7 text-white" />
              </button>

              {/* Flip camera */}
              <button
                className="flex size-12 items-center justify-center rounded-full bg-gray-700 text-white transition-colors hover:bg-gray-600"
              >
                <RotateCcw className="size-5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Instructions */}
        {!isRecording && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-sm text-gray-400 text-center max-w-xs"
          >
            Hold to record video circle (max 60s)
          </motion.p>
        )}
      </div>
    </div>
  );
}
