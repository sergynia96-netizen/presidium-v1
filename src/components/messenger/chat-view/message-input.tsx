'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Paperclip,
  Sparkles,
  SendHorizontal,
  Mic,
  Zap,
  Reply,
  Pencil,
  X,
  Image as ImageIcon,
  Smile,
  BellOff,
  Ghost,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { useDraftAutosave } from '@/hooks/use-draft-autosave';
import type { MessageReplyPreview } from '@/types';
import { GIFPicker, StickerPicker, type GIFResult, type Sticker } from './stickers-gif-picker';

interface MessageInputProps {
  onSend: (message: string, options?: { anonymousAdmin?: boolean }) => void;
  onToggleAI: () => void;
  showAI: boolean;
  onAIMention?: (message: string) => void;
  onOpenClawMention?: (message: string, mode?: string) => void;
  onSendFile?: (file: File) => Promise<void> | void;
  onSendGif?: (gif: GIFResult) => Promise<void> | void;
  onSendSticker?: (sticker: Sticker) => Promise<void> | void;
  onTypingChange?: (isTyping: boolean) => void;
  replyTo?: MessageReplyPreview | null;
  onCancelReply?: () => void;
  editMessage?: { id: string; content: string } | null;
  onCancelEdit?: () => void;
  initialText?: string;
  draftStorageKey?: string;
  disableDraftPersistence?: boolean;
  silentMode?: boolean;
  onToggleSilentMode?: () => void;
  anonymousAdminEnabled?: boolean;
  anonymousAdminMode?: boolean;
  onToggleAnonymousAdminMode?: () => void;
  chatId?: string; // For server-side draft autosave
}

const AI_MENTION_REGEX = /^@ai\s+/i;
const OPENCLAW_MENTION_REGEX = /^@openclaw\s+/i;

export function MessageInput({
  onSend,
  onToggleAI,
  showAI,
  onAIMention,
  onOpenClawMention,
  onSendFile,
  onSendGif,
  onSendSticker,
  onTypingChange,
  replyTo,
  onCancelReply,
  editMessage,
  onCancelEdit,
  initialText,
  draftStorageKey,
  disableDraftPersistence = false,
  silentMode = false,
  onToggleSilentMode,
  anonymousAdminEnabled = false,
  anonymousAdminMode = false,
  onToggleAnonymousAdminMode,
  chatId,
}: MessageInputProps) {
  const { t, tf } = useT();
  const [text, setText] = useState('');

  // Server-side draft autosave (complements localStorage)
  useDraftAutosave(chatId || null, text, !disableDraftPersistence && !!chatId && !editMessage);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const gifPickerRef = useRef<HTMLDivElement>(null);
  const stickerPickerRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isTypingRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<BlobPart[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [showStickerPicker, setShowStickerPicker] = useState(false);

  const hasText = text.trim().length > 0;
  const isAIMode = AI_MENTION_REGEX.test(text);
  const isOpenClawMode = OPENCLAW_MENTION_REGEX.test(text);
  const isMentionMode = isAIMode || isOpenClawMode;
  const replyPreviewText = replyTo
    ? (replyTo.content || '').trim() ||
      (replyTo.type === 'media'
        ? t('common.attachment')
        : replyTo.type === 'voice'
          ? t('common.voiceMessage')
          : t('common.message'))
    : '';

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    const lineHeight = 24;
    const maxHeight = lineHeight * 4;
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [text, adjustHeight]);

  useEffect(() => {
    // Editing mode uses explicit message content, not draft buffer.
    if (editMessage) {
      setText(initialText || editMessage.content || '');
      return;
    }

    // If explicit initial text exists, prefer it.
    if (initialText) {
      setText(initialText);
      return;
    }

    // Restore draft per-chat when available.
    if (typeof window !== 'undefined' && draftStorageKey && !disableDraftPersistence) {
      const draft = window.localStorage.getItem(draftStorageKey) || '';
      setText(draft);
      return;
    }

    setText('');
  }, [disableDraftPersistence, draftStorageKey, editMessage, initialText]);

  useEffect(() => {
    if (!chatId || disableDraftPersistence || editMessage || initialText) return;
    if (typeof window === 'undefined') return;

    const localDraft = draftStorageKey ? window.localStorage.getItem(draftStorageKey) || '' : '';
    if (localDraft.trim().length > 0) return;

    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/chats/${chatId}/draft`);
        if (!response.ok) return;
        const payload = (await response.json()) as { content?: string | null };
        const serverDraft = typeof payload.content === 'string' ? payload.content : '';
        if (!serverDraft.trim() || cancelled) return;
        setText(serverDraft);
        if (draftStorageKey) {
          window.localStorage.setItem(draftStorageKey, serverDraft);
        }
      } catch {
        // Ignore draft bootstrap errors; local input remains usable.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chatId, disableDraftPersistence, draftStorageKey, editMessage, initialText]);

  const handleSend = useCallback(() => {
    if (!hasText) return;
    setShowGifPicker(false);
    setShowStickerPicker(false);
    const next = text.trim();

    if (isAIMode && onAIMention) {
      const payload = next.replace(AI_MENTION_REGEX, '').trim();
      if (payload) onAIMention(payload);
    } else if (isOpenClawMode && onOpenClawMention) {
      const payload = next.replace(OPENCLAW_MENTION_REGEX, '').trim();
      if (payload) onOpenClawMention(payload);
    } else {
      onSend(next, { anonymousAdmin: anonymousAdminEnabled && anonymousAdminMode });
    }

    setText('');
    if (typeof window !== 'undefined' && draftStorageKey && !disableDraftPersistence) {
      window.localStorage.removeItem(draftStorageKey);
    }
    if (isTypingRef.current) {
      onTypingChange?.(false);
      isTypingRef.current = false;
    }
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [
    disableDraftPersistence,
    draftStorageKey,
    hasText,
    text,
    isAIMode,
    isOpenClawMode,
    onAIMention,
    onOpenClawMention,
    onSend,
    anonymousAdminEnabled,
    anonymousAdminMode,
    onTypingChange,
  ]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter') {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          handleSend();
          return;
        }
        if (!e.shiftKey) {
          e.preventDefault();
          handleSend();
        }
      }
    },
    [handleSend],
  );

  const handleTextChange = useCallback(
    (value: string) => {
      setText(value);

      if (typeof window !== 'undefined' && draftStorageKey && !editMessage && !disableDraftPersistence) {
        if (value.trim().length === 0) {
          window.localStorage.removeItem(draftStorageKey);
        } else {
          window.localStorage.setItem(draftStorageKey, value);
        }
      }

      if (!onTypingChange) return;

      const nextIsTyping = value.trim().length > 0;
      if (nextIsTyping && !isTypingRef.current) {
        onTypingChange(true);
        isTypingRef.current = true;
      }

      if (!nextIsTyping && isTypingRef.current) {
        onTypingChange(false);
        isTypingRef.current = false;
      }

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      if (nextIsTyping) {
        typingTimeoutRef.current = setTimeout(() => {
          if (isTypingRef.current) {
            onTypingChange(false);
            isTypingRef.current = false;
          }
        }, 1200);
      } else {
        typingTimeoutRef.current = null;
      }
    },
    [disableDraftPersistence, draftStorageKey, editMessage, onTypingChange],
  );

  const stopVoiceTimer = useCallback(() => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  }, []);

  const cleanupVoiceStream = useCallback(() => {
    if (recordingStreamRef.current) {
      recordingStreamRef.current.getTracks().forEach((track) => track.stop());
      recordingStreamRef.current = null;
    }
  }, []);

  const stopVoiceRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
      return;
    }
    cleanupVoiceStream();
    stopVoiceTimer();
    setIsRecordingVoice(false);
  }, [cleanupVoiceStream, stopVoiceTimer]);

  const startVoiceRecording = useCallback(async () => {
    if (!onSendFile) return;
    if (typeof window === 'undefined') return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordingStreamRef.current = stream;
      recordingChunksRef.current = [];
      setRecordingSeconds(0);

      const preferredTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg'];
      const supportedType = preferredTypes.find((type) => MediaRecorder.isTypeSupported(type)) || '';
      const recorder = supportedType ? new MediaRecorder(stream, { mimeType: supportedType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordingChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        stopVoiceTimer();
        setIsRecordingVoice(false);
        cleanupVoiceStream();

        const chunks = recordingChunksRef.current;
        recordingChunksRef.current = [];
        if (!chunks.length) return;

        const normalizedType = supportedType.includes('audio/ogg') ? 'audio/ogg' : 'audio/webm';
        const blob = new Blob(chunks, { type: normalizedType });
        const ext = normalizedType === 'audio/ogg' ? 'ogg' : 'webm';
        const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: normalizedType });

        setIsProcessingVoice(true);
        try {
          await onSendFile(file);
        } finally {
          setIsProcessingVoice(false);
          setRecordingSeconds(0);
        }
      };

      recorder.start(300);
      setIsRecordingVoice(true);
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch {
      cleanupVoiceStream();
      stopVoiceTimer();
      setIsRecordingVoice(false);
    }
  }, [cleanupVoiceStream, onSendFile, stopVoiceTimer]);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      stopVoiceTimer();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      cleanupVoiceStream();
      if (isTypingRef.current) {
        onTypingChange?.(false);
        isTypingRef.current = false;
      }
    };
  }, [cleanupVoiceStream, onTypingChange, stopVoiceTimer]);

  const handleAttachmentClick = useCallback(() => {
    setShowGifPicker(false);
    setShowStickerPicker(false);
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !onSendFile) return;
      await onSendFile(file);
      e.target.value = '';
    },
    [onSendFile],
  );

  const handleVoiceButton = useCallback(() => {
    setShowGifPicker(false);
    setShowStickerPicker(false);
    if (isProcessingVoice) return;
    if (isRecordingVoice) {
      stopVoiceRecording();
      return;
    }
    void startVoiceRecording();
  }, [isProcessingVoice, isRecordingVoice, startVoiceRecording, stopVoiceRecording]);

  const handleGifToggle = useCallback(() => {
    if (!onSendGif) return;
    setShowStickerPicker(false);
    setShowGifPicker((prev) => !prev);
  }, [onSendGif]);

  const handleGifSelect = useCallback(
    async (gif: GIFResult) => {
      if (!onSendGif) return;
      await onSendGif(gif);
      setShowGifPicker(false);
    },
    [onSendGif],
  );

  const handleStickerToggle = useCallback(() => {
    if (!onSendSticker) return;
    setShowGifPicker(false);
    setShowStickerPicker((prev) => !prev);
  }, [onSendSticker]);

  const handleStickerSelect = useCallback(
    async (sticker: Sticker) => {
      if (!onSendSticker) return;
      await onSendSticker(sticker);
      setShowStickerPicker(false);
    },
    [onSendSticker],
  );

  useEffect(() => {
    if (!showGifPicker && !showStickerPicker) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      const clickedInsideGif = gifPickerRef.current?.contains(target) ?? false;
      const clickedInsideSticker = stickerPickerRef.current?.contains(target) ?? false;
      if (!clickedInsideGif && !clickedInsideSticker) {
        setShowGifPicker(false);
        setShowStickerPicker(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowGifPicker(false);
        setShowStickerPicker(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [showGifPicker, showStickerPicker]);

  const recordingTimeLabel = `${Math.floor(recordingSeconds / 60)
    .toString()
    .padStart(2, '0')}:${(recordingSeconds % 60).toString().padStart(2, '0')}`;

  return (
    <div className="relative border-t bg-background px-3 py-2 safe-bottom">
      {showGifPicker && onSendGif && (
        <div ref={gifPickerRef} className="absolute bottom-[calc(100%+0.5rem)] left-3 z-30">
          <GIFPicker onSelect={handleGifSelect} onClose={() => setShowGifPicker(false)} />
        </div>
      )}
      {showStickerPicker && onSendSticker && (
        <div ref={stickerPickerRef} className="absolute bottom-[calc(100%+0.5rem)] left-14 z-30">
          <StickerPicker onSelect={handleStickerSelect} onClose={() => setShowStickerPicker(false)} />
        </div>
      )}
      {editMessage && (
        <div className="mx-auto mb-2 flex items-start gap-2 rounded-xl border bg-muted/40 px-3 py-2 lg:max-w-3xl">
          <Pencil className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-foreground">{t('msg.editingLabel')}</p>
            <p className="truncate text-xs text-muted-foreground">{editMessage.content || t('common.message')}</p>
          </div>
          <button
            type="button"
            onClick={onCancelEdit}
            className="flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label={t('aria.cancelEditing')}
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}
      {replyTo && (
        <div className="mx-auto mb-2 flex items-start gap-2 rounded-xl border bg-muted/40 px-3 py-2 lg:max-w-3xl">
          <Reply className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-foreground">
              {tf('chat.replyingTo', { name: replyTo.senderName })}
            </p>
            <p className="truncate text-xs text-muted-foreground">{replyPreviewText}</p>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            className="flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label={t('aria.cancelReply')}
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}
      {(isRecordingVoice || isProcessingVoice) && (
        <div className="mx-auto mb-2 flex items-center justify-between rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-300 lg:max-w-3xl">
          <span>{isRecordingVoice ? tf('chat.recording', { time: recordingTimeLabel }) : t('chat.processingVoice')}</span>
          {isRecordingVoice && (
            <button
              type="button"
              onClick={handleVoiceButton}
              className="rounded-md bg-rose-500/20 px-2 py-1 text-[11px] font-semibold hover:bg-rose-500/30"
            >
              {t('chat.stopRecording')}
            </button>
          )}
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileChange}
        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.txt,.csv,.json"
      />
      <div className="mx-auto flex items-end gap-2 lg:max-w-3xl">
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={handleAttachmentClick}
          className="mb-1.5 flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label={t('aria.attachFile')}
          type="button"
        >
          <Paperclip className="size-5" />
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={handleGifToggle}
          disabled={!onSendGif}
          className={cn(
            'mb-1.5 flex size-9 shrink-0 items-center justify-center rounded-full transition-colors',
            showGifPicker
              ? 'bg-primary/15 text-primary'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            !onSendGif && 'cursor-not-allowed opacity-40',
          )}
          aria-label={t('aria.openGifPicker')}
          type="button"
        >
          <ImageIcon className="size-5" />
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={handleStickerToggle}
          disabled={!onSendSticker}
          className={cn(
            'mb-1.5 flex size-9 shrink-0 items-center justify-center rounded-full transition-colors',
            showStickerPicker
              ? 'bg-primary/15 text-primary'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            !onSendSticker && 'cursor-not-allowed opacity-40',
          )}
          aria-label={t('aria.openStickerPicker')}
          type="button"
        >
          <Smile className="size-5" />
        </motion.button>

        <div className="relative flex flex-1 items-end rounded-2xl border bg-muted/50 px-3 py-1.5 transition-colors focus-within:border-primary/30 focus-within:bg-background">
          <textarea
            id="message-input"
            ref={textareaRef}
            value={text}
            onChange={(e) => handleTextChange(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus={Boolean(editMessage)}
            placeholder={t('chat.placeholder')}
            aria-label={t('chat.placeholder')}
            rows={1}
            className="max-h-24 min-h-[24px] flex-1 resize-none bg-transparent pr-2 text-sm leading-6 outline-none placeholder:text-muted-foreground/60"
          />

          {isMentionMode && (
            <div className="mb-0.5 flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground">
              {isAIMode ? <Sparkles className="size-3 text-amber-ai" /> : <Zap className="size-3 text-emerald-500" />}
              <span>{isAIMode ? 'AI' : 'OpenClaw'}</span>
            </div>
          )}
        </div>

        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={onToggleAI}
          className={cn(
            'mb-1.5 flex size-9 shrink-0 items-center justify-center rounded-full transition-colors',
            showAI ? 'bg-amber-ai text-amber-ai-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
          )}
          aria-label={t('aria.toggleAiSuggestions')}
          type="button"
        >
          <Sparkles className="size-5" />
        </motion.button>

        {onToggleSilentMode && (
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onToggleSilentMode}
            className={cn(
              'mb-1.5 flex size-9 shrink-0 items-center justify-center rounded-full transition-colors',
              silentMode
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
            aria-label={t('aria.toggleSilentMode')}
            type="button"
          >
            <BellOff className="size-5" />
          </motion.button>
        )}

        {anonymousAdminEnabled && onToggleAnonymousAdminMode && (
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onToggleAnonymousAdminMode}
            className={cn(
              'mb-1.5 flex size-9 shrink-0 items-center justify-center rounded-full transition-colors',
              anonymousAdminMode
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
            aria-label={anonymousAdminMode ? 'Disable anonymous admin mode' : 'Enable anonymous admin mode'}
            title={anonymousAdminMode ? 'Anonymous admin mode enabled' : 'Post as anonymous admin'}
            type="button"
          >
            <Ghost className="size-5" />
          </motion.button>
        )}

        <AnimatePresence mode="wait">
          {hasText ? (
            <motion.button
              key="send"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={{ duration: 0.15 }}
              whileTap={{ scale: 0.9 }}
              onClick={handleSend}
              className="mb-1.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-brand text-emerald-brand-foreground transition-colors hover:bg-emerald-brand/90"
              aria-label={t('aria.sendMessage')}
              type="button"
            >
              <SendHorizontal className="size-5" />
            </motion.button>
          ) : (
            <motion.button
              key="mic"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={{ duration: 0.15 }}
              whileTap={{ scale: 0.9 }}
              onClick={handleVoiceButton}
              disabled={isProcessingVoice}
              className={cn(
                'mb-1.5 flex size-9 shrink-0 items-center justify-center rounded-full transition-colors',
                isRecordingVoice
                  ? 'bg-rose-500 text-white hover:bg-rose-500/90'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
              aria-label={isRecordingVoice ? t('aria.stopVoiceRecording') : t('aria.startVoiceRecording')}
              type="button"
            >
              {isRecordingVoice ? <X className="size-5" /> : <Mic className="size-5" />}
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
