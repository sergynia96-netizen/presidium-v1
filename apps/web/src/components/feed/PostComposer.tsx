'use client';

import { useCallback, useRef, useState } from 'react';
import { ImagePlus, Loader2, Send, X } from 'lucide-react';

import { useCreatePost } from '@/hooks/useFeed';
import { api } from '@/lib/api';

const TOPICS = [
  'Tech',
  'News',
  'Art',
  'Science',
  'Politics',
  'Humor',
  'Crypto',
  'Education',
];

export function PostComposer({ onSuccess }: { onSuccess?: () => void }) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [topic, setTopic] = useState('');
  const [mediaKeys, setMediaKeys] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [previews, setPreviews] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const createMutation = useCreatePost();

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files) {
      return;
    }

    setUploading(true);
    const newKeys: string[] = [];
    const newPreviews: string[] = [];

    for (const file of Array.from(files).slice(0, 10)) {
      const ext = file.name.split('.').pop();
      const key = `feed/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      try {
        const { data } = await api.get(`/media/upload-url?key=${encodeURIComponent(key)}`);
        await fetch(data.url as string, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type },
        });
        newKeys.push(key);
        newPreviews.push(URL.createObjectURL(file));
      } catch (err) {
        console.error('[Feed] Upload failed:', err);
      }
    }

    setMediaKeys((prev) => [...prev, ...newKeys]);
    setPreviews((prev) => [...prev, ...newPreviews]);
    setUploading(false);
  }, []);

  const removeMedia = (index: number) => {
    setMediaKeys((prev) => prev.filter((_, idx) => idx !== index));
    setPreviews((prev) => prev.filter((_, idx) => idx !== index));
  };

  const submit = async () => {
    if (!title.trim() || !content.trim()) {
      return;
    }

    await createMutation.mutateAsync({
      title: title.trim(),
      content: content.trim(),
      topic: topic || undefined,
      mediaKeys: mediaKeys.length > 0 ? mediaKeys : undefined,
    });

    setTitle('');
    setContent('');
    setTopic('');
    setMediaKeys([]);
    setPreviews([]);
    onSuccess?.();
  };

  const isValid =
    title.trim().length > 0 &&
    content.trim().length > 0 &&
    !createMutation.isPending;

  return (
    <div className="mb-6 rounded-xl border border-slate-800 bg-slate-900 p-4">
      <h3 className="mb-3 font-semibold text-white">Create Post</h3>

      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Title"
        maxLength={500}
        className="mb-3 w-full rounded-lg bg-slate-800 px-3 py-2 text-white placeholder-slate-500 outline-none focus:ring-2 focus:ring-indigo-500"
      />

      <textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        placeholder="What's on your mind?"
        rows={4}
        maxLength={50000}
        className="mb-3 w-full resize-none rounded-lg bg-slate-800 px-3 py-2 text-white placeholder-slate-500 outline-none focus:ring-2 focus:ring-indigo-500"
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select
          value={topic}
          onChange={(event) => setTopic(event.target.value)}
          className="rounded-lg bg-slate-800 px-3 py-2 text-sm text-slate-300 outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">Select topic</option>
          {TOPICS.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>

        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading || mediaKeys.length >= 10}
          className="flex items-center gap-1 rounded-lg bg-slate-800 px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-700 disabled:opacity-50"
        >
          <ImagePlus className="h-4 w-4" />
          {uploading ? 'Uploading...' : 'Add Media'}
        </button>

        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/*,video/*"
          className="hidden"
          onChange={(event) => {
            handleFiles(event.target.files).catch((err) =>
              console.error('[Feed] File handling failed:', err)
            );
          }}
        />
      </div>

      {previews.length > 0 && (
        <div className="mb-3 grid grid-cols-3 gap-2">
          {previews.map((url, index) => (
            <div
              key={`${url}-${index}`}
              className="relative aspect-square overflow-hidden rounded-lg bg-slate-800"
            >
              <img src={url} alt="" className="h-full w-full object-cover" />
              <button
                onClick={() => removeMedia(index)}
                className="absolute right-1 top-1 rounded-full bg-black/60 p-1 hover:bg-black/80"
              >
                <X className="h-3 w-3 text-white" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500">{content.length}/50000</span>
        <button
          onClick={() => {
            submit().catch((err) => console.error('[Feed] Create post failed:', err));
          }}
          disabled={!isValid}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white transition-colors hover:bg-indigo-500 disabled:bg-slate-700"
        >
          {createMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          Post
        </button>
      </div>
    </div>
  );
}
