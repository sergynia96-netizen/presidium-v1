/**
 * @author Карнаух Сергей Сергеевич
 * @copyright (C) 2026 Карнаух Сергей Сергеевич
 */
'use client';

import { useCallback, useRef, useState } from 'react';

import { type CreateStoryInput, useStories } from '@/hooks/useStories';
import { PrivacySelector } from './PrivacySelector';

type CreateStep = 'select' | 'text' | 'privacy';

export function StoryCreator({ onCreated }: { onCreated: () => void }) {
  const { createStory, loading } = useStories();
  const [step, setStep] = useState<CreateStep>('select');
  const [text, setText] = useState('');
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image');
  const [privacy, setPrivacy] = useState<CreateStoryInput['privacy']>('contacts');
  const [allowedUserIds, setAllowedUserIds] = useState<string[]>([]);
  const [replyPermission, setReplyPermission] =
    useState<CreateStoryInput['replyPermission']>('everyone');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setMediaFile(file);
    setMediaType(file.type.startsWith('video') ? 'video' : 'image');
    setMediaPreview(URL.createObjectURL(file));
    setStep('privacy');
  }, []);

  const reset = () => {
    setStep('select');
    setText('');
    setMediaPreview(null);
    setMediaFile(null);
    setPrivacy('contacts');
    setAllowedUserIds([]);
    setReplyPermission('everyone');
  };

  const handlePublish = async () => {
    const input: CreateStoryInput = {
      type: mediaFile ? mediaType : 'text',
      content: mediaFile ? undefined : text,
      mediaFile: mediaFile || undefined,
      privacy,
      allowedUserIds: privacy === 'custom' ? allowedUserIds : undefined,
      replyPermission,
    };

    await createStory(input);
    onCreated();
    reset();
  };

  if (step === 'select') {
    return (
      <div className="mb-6 rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <h3 className="mb-4 text-lg font-bold text-white">Create Story</h3>
        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={() => setStep('text')}
            className="flex flex-col items-center gap-2 rounded-xl bg-slate-800 p-4 transition hover:bg-slate-700"
          >
            <span className="text-2xl">📝</span>
            <span className="text-sm text-slate-300">Text</span>
          </button>
          <button
            onClick={() => {
              setMediaType('image');
              fileInputRef.current?.click();
            }}
            className="flex flex-col items-center gap-2 rounded-xl bg-slate-800 p-4 transition hover:bg-slate-700"
          >
            <span className="text-2xl">📷</span>
            <span className="text-sm text-slate-300">Photo</span>
          </button>
          <button
            onClick={() => {
              setMediaType('video');
              fileInputRef.current?.click();
            }}
            className="flex flex-col items-center gap-2 rounded-xl bg-slate-800 p-4 transition hover:bg-slate-700"
          >
            <span className="text-2xl">🎥</span>
            <span className="text-sm text-slate-300">Video</span>
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>
    );
  }

  if (step === 'text') {
    return (
      <div className="mb-6 rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-bold text-white">Text Story</h3>
          <button onClick={reset} className="text-slate-400 hover:text-white">
            ✕
          </button>
        </div>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={2000}
          placeholder="What's on your mind?"
          className="h-40 w-full resize-none rounded-xl border border-slate-700 bg-slate-950 p-4 text-white placeholder-slate-600 focus:border-emerald-600 focus:outline-none"
        />
        <div className="mt-4 flex items-center justify-between">
          <span className="text-xs text-slate-500">{text.length}/2000</span>
          <button
            onClick={() => setStep('privacy')}
            disabled={!text.trim()}
            className="rounded-lg bg-emerald-600 px-6 py-2 font-medium text-white transition hover:bg-emerald-500 disabled:bg-slate-700"
          >
            Next
          </button>
        </div>
      </div>
    );
  }

  if (step === 'privacy') {
    return (
      <div className="mb-6 rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-bold text-white">Privacy</h3>
          <button onClick={reset} className="text-slate-400 hover:text-white">
            ✕
          </button>
        </div>

        {mediaPreview && (
          <div className="mb-4 flex max-h-64 items-center justify-center overflow-hidden rounded-xl bg-black">
            {mediaType === 'video' ? (
              <video src={mediaPreview} className="max-h-64 w-full object-contain" controls={false} />
            ) : (
              <img src={mediaPreview} alt="Preview" className="max-h-64 w-full object-contain" />
            )}
          </div>
        )}

        <PrivacySelector
          value={privacy}
          onChange={setPrivacy}
          allowedUserIds={allowedUserIds}
          onAllowedUserIdsChange={setAllowedUserIds}
        />

        <div className="mt-4 border-t border-slate-800 pt-4">
          <p className="mb-2 text-sm text-slate-400">Allow replies from:</p>
          <div className="flex flex-wrap gap-2">
            {(['everyone', 'contacts', 'close-friends', 'none'] as const).map((option) => (
              <button
                key={option}
                onClick={() => setReplyPermission(option)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  replyPermission === option
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => {
            handlePublish().catch((err) => console.error('[Stories] Publish failed:', err));
          }}
          disabled={loading}
          className="mt-6 w-full rounded-xl bg-emerald-600 py-3 font-semibold text-white transition hover:bg-emerald-500 disabled:bg-slate-700"
        >
          {loading ? 'Publishing...' : 'Publish Story'}
        </button>
      </div>
    );
  }

  return null;
}
