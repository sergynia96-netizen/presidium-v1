/**
 * Voice Message Bubble
 *
 * Features:
 * - Waveform visualization
 * - Play/pause with progress
 * - Speed control (1x, 1.5x, 2x)
 * - Duration display
 * - Download/save
 */

'use client';

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Play, Pause, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { createMediaUrl, revokeMediaUrl } from '@/lib/media';

interface VoiceMessageBubbleProps {
  blob: Blob;
  duration: number;
  waveform?: number[];
  isMe: boolean;
  className?: string;
}

export function VoiceMessageBubble({
  blob,
  duration,
  waveform = [],
  isMe,
  className,
}: VoiceMessageBubbleProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  // Create audio URL on mount
  useEffect(() => {
    urlRef.current = createMediaUrl(blob);
    audioRef.current = new Audio(urlRef.current);

    audioRef.current.onended = () => {
      setIsPlaying(false);
      setProgress(0);
      setCurrentTime(0);
    };

    audioRef.current.ontimeupdate = () => {
      if (audioRef.current && audioRef.current.duration) {
        setCurrentTime(audioRef.current.currentTime);
        setProgress(audioRef.current.currentTime / audioRef.current.duration);
      }
    };

    return () => {
      if (urlRef.current) {
        revokeMediaUrl(urlRef.current);
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [blob]);

  const togglePlay = useCallback(() => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.playbackRate = playbackRate;
      audioRef.current.play();
    }

    setIsPlaying(!isPlaying);
  }, [isPlaying, playbackRate]);

  const toggleSpeed = useCallback(() => {
    const rates = [1, 1.5, 2];
    const currentIndex = rates.indexOf(playbackRate);
    const nextRate = rates[(currentIndex + 1) % rates.length];
    setPlaybackRate(nextRate);

    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate;
    }
  }, [playbackRate]);

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !urlRef.current) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    const time = percentage * duration;

    audioRef.current.currentTime = time;
    setProgress(percentage);
    setCurrentTime(time);
  }, [duration]);

  const handleDownload = useCallback(() => {
    if (!urlRef.current) return;

    const a = document.createElement('a');
    a.href = urlRef.current;
    a.download = `voice-${Date.now()}.webm`;
    a.click();
  }, []);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  // Generate fallback waveform once per mount to keep render pure/idempotent
  const fallbackBars = useMemo(
    () =>
      Array.from({ length: 40 }, (_, i) => {
        // Deterministic waveform profile to keep render pure (no Math.random)
        const normalized = (Math.sin(i * 0.9) + 1) / 2; // 0..1
        return 0.3 + normalized * 0.7;
      }),
    [],
  );
  const bars = waveform.length > 0 ? waveform : fallbackBars;

  return (
    <div className={cn('flex items-center gap-3 min-w-[200px] max-w-[320px]', className)}>
      {/* Play/Pause button */}
      <button
        onClick={togglePlay}
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-full transition-colors',
          isMe
            ? 'bg-white/20 text-white hover:bg-white/30'
            : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600',
        )}
      >
        {isPlaying ? (
          <Pause className="size-4" />
        ) : (
          <Play className="size-4 ml-0.5" />
        )}
      </button>

      {/* Waveform + Progress */}
      <div className="flex flex-1 flex-col gap-1">
        {/* Waveform */}
        <div
          className="flex items-center gap-0.5 h-8 cursor-pointer"
          onClick={handleSeek}
        >
          {bars.map((value, i) => {
            const barProgress = i / bars.length;
            const isPlayed = barProgress <= progress;
            const height = Math.max(4, value * 32);

            return (
              <motion.div
                key={i}
                className={cn(
                  'w-1 rounded-full transition-colors',
                  isPlayed
                    ? isMe
                      ? 'bg-white'
                      : 'bg-emerald-brand'
                    : isMe
                      ? 'bg-white/30'
                      : 'bg-gray-300 dark:bg-gray-600',
                )}
                style={{ height }}
                whileHover={{ scale: 1.2 }}
              />
            );
          })}
        </div>

        {/* Time + Speed */}
        <div className="flex items-center justify-between">
          <span className={cn(
            'text-[10px] font-mono',
            isMe ? 'text-white/60' : 'text-gray-400',
          )}>
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>

          <div className="flex items-center gap-1">
            {/* Speed button */}
            <button
              onClick={toggleSpeed}
              className={cn(
                'text-[10px] font-medium px-1.5 py-0.5 rounded transition-colors',
                isMe
                  ? 'text-white/60 hover:text-white hover:bg-white/10'
                  : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700',
              )}
            >
              {playbackRate}x
            </button>

            {/* Download */}
            <button
              onClick={handleDownload}
              className={cn(
                'p-0.5 rounded transition-colors',
                isMe
                  ? 'text-white/60 hover:text-white'
                  : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300',
              )}
            >
              <Download className="size-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
