/**
 * Voice Message Recording UI
 *
 * Features:
 * - Hold to record (long press)
 * - Swipe down to cancel
 * - Real-time waveform visualization
 * - Timer display
 * - Lock recording mode (hands-free)
 */

'use client';

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, X, Lock, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  startVoiceRecording,
  stopVoiceRecording,
  cancelVoiceRecording,
  generateWaveform,
  type VoiceRecording,
} from '@/lib/media';

interface VoiceRecorderProps {
  onSend: (blob: Blob, duration: number, waveform: number[]) => void;
  onCancel: () => void;
  className?: string;
}

export function VoiceRecorder({ onSend, onCancel, className }: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [duration, setDuration] = useState(0);
  const [waveform, setWaveform] = useState<number[]>([]);
  const [isCancelling, setIsCancelling] = useState(false);
  const [startY, setStartY] = useState(0);

  const recordingRef = useRef<VoiceRecording | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const liveWaveHeights = useMemo(
    () =>
      Array.from({ length: 50 }, (_, i) => {
        // Deterministic animation peaks to keep render pure (no Math.random)
        const normalized = (Math.sin(i * 0.8 + 0.5) + 1) / 2; // 0..1
        return 12 + normalized * 20;
      }),
    [],
  );

  // Timer
  useEffect(() => {
    if (!isRecording) return;

    timerRef.current = setInterval(() => {
      setDuration(d => d + 0.1);
    }, 100);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isRecording]);

  const startRecording = useCallback(async () => {
    try {
      const recording = await startVoiceRecording();
      recordingRef.current = recording;
      setIsRecording(true);
      setIsLocked(false);
      setDuration(0);
      setWaveform([]);
      setIsCancelling(false);
    } catch {
      onCancel();
    }
  }, [onCancel]);

  const finishRecording = useCallback(async () => {
    if (!recordingRef.current) return;

    const recording = recordingRef.current;
    recordingRef.current = null;

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (isCancelling) {
      cancelVoiceRecording(recording);
      setIsRecording(false);
      onCancel();
      return;
    }

    const blob = await stopVoiceRecording(recording);
    const wf = await generateWaveform(blob, 50);

    setIsRecording(false);
    onSend(blob, duration, wf);
  }, [isCancelling, duration, onSend, onCancel]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    setStartY(e.clientY);
    startRecording();
  }, [startRecording]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isRecording || isLocked) return;

    const deltaY = e.clientY - startY;
    if (deltaY > 80) {
      setIsCancelling(true);
    } else {
      setIsCancelling(false);
    }
  }, [isRecording, isLocked, startY]);

  const handlePointerUp = useCallback(() => {
    if (!isRecording) return;

    if (duration < 0.5) {
      // Too short, cancel
      setIsCancelling(true);
    }

    finishRecording();
  }, [isRecording, duration, finishRecording]);

  const handleLock = useCallback(() => {
    setIsLocked(true);
  }, []);

  const handleCancel = useCallback(() => {
    setIsCancelling(true);
    finishRecording();
  }, [finishRecording]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div
      ref={containerRef}
      className={cn('flex items-center gap-3 px-2', className)}
    >
      <AnimatePresence>
        {isRecording ? (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="flex flex-1 items-center gap-3"
          >
            {/* Cancel button */}
            <button
              onClick={handleCancel}
              className={cn(
                'flex size-10 items-center justify-center rounded-full transition-colors',
                isCancelling
                  ? 'bg-red-500 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300',
              )}
            >
              <X className="size-5" />
            </button>

            {/* Waveform + Timer */}
            <div className="flex flex-1 items-center gap-2">
              {/* Timer */}
              <span className="font-mono text-sm text-gray-500 dark:text-gray-400 min-w-[48px]">
                {formatTime(duration)}
              </span>

              {/* Waveform visualization */}
              <div className="flex flex-1 items-center gap-0.5 h-8 overflow-hidden">
                {Array.from({ length: 50 }).map((_, i) => {
                  const height = waveform[i]
                    ? Math.max(4, waveform[i] * 32)
                    : 4;
                  return (
                    <motion.div
                      key={i}
                      className={cn(
                        'w-1 rounded-full transition-colors',
                        isCancelling
                          ? 'bg-red-400'
                          : 'bg-emerald-brand',
                      )}
                      animate={{
                        height: isRecording && !waveform[i]
                          ? [4, liveWaveHeights[i] ?? 20, 4]
                          : height,
                      }}
                      transition={{
                        duration: 0.3,
                        repeat: isRecording && !waveform[i] ? Infinity : 0,
                      }}
                    />
                  );
                })}
              </div>
            </div>

            {/* Lock / Send button */}
            {!isLocked ? (
              <button
                onClick={handleLock}
                className="flex size-10 items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                <Lock className="size-5" />
              </button>
            ) : (
              <button
                onClick={finishRecording}
                className="flex size-10 items-center justify-center rounded-full bg-emerald-brand text-white transition-colors hover:bg-emerald-600"
              >
                <Send className="size-5" />
              </button>
            )}
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
          >
            <button
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              className="flex size-10 items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors hover:bg-gray-300 dark:hover:bg-gray-600 active:scale-95"
            >
              <Mic className="size-5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
