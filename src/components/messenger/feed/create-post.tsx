'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useAppStore } from '@/store/use-app-store';
import { useT } from '@/lib/i18n';
import { feedApi } from '@/lib/api-client';
import { toast } from 'sonner';

const MAX_CHARS = 500;

export default function CreatePostScreen() {
  const { t } = useT();
  const [content, setContent] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);
  const goBack = useAppStore((s) => s.goBack);
  const setView = useAppStore((s) => s.setView);
  const user = useAppStore((s) => s.user);

  const charCount = content.length;
  const isOverLimit = charCount > MAX_CHARS;
  const canPublish = content.trim().length > 0 && !isOverLimit;

  const handlePublish = async () => {
    if (!canPublish) return;

    setIsPublishing(true);
    try {
      await feedApi.create({
        title: content.trim().split('\n')[0].slice(0, 80),
        content: content.trim(),
      });
      setContent('');
      setView('feed');
      toast.success(t('feed.publish'));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to publish post';
      toast.error(message);
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50 shrink-0">
        <Button variant="ghost" size="icon" className="size-9 rounded-full" onClick={goBack}>
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-lg font-semibold">{t('feed.createPost')}</h1>
      </div>

      {/* Content area */}
      <div className="flex-1 flex flex-col p-4 gap-4">
        {/* Author info */}
        <div className="flex items-center gap-3">
          <Avatar className="size-10">
            <AvatarFallback className="bg-emerald-500 text-white text-sm font-semibold">
              {(user?.name || 'User')
                .split(' ')
                .map((part) => part[0])
                .join('')
                .slice(0, 2)
                .toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="text-sm font-semibold">{user?.name || 'User'}</p>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Sparkles className="size-3 text-emerald-500" />
              {user?.username || user?.email || '@anonymous'}
            </p>
          </div>
        </div>

        {/* Textarea */}
        <div className="flex-1 flex flex-col">
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={t('feed.writePost')}
            className="flex-1 min-h-[200px] resize-none border-0 focus-visible:ring-0 text-base leading-relaxed placeholder:text-muted-foreground/50 bg-transparent p-0"
            maxLength={MAX_CHARS + 50}
          />
        </div>

        {/* Character count */}
        <motion.div
          className="flex justify-end"
          animate={{ scale: isOverLimit ? 1.05 : 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        >
          <span
            className={`text-xs font-medium transition-colors ${
              isOverLimit
                ? 'text-red-500'
                : charCount > MAX_CHARS * 0.8
                  ? 'text-amber-500'
                  : 'text-muted-foreground'
            }`}
          >
            {charCount}/{MAX_CHARS}
          </span>
        </motion.div>
      </div>

      {/* Publish button */}
      <div className="px-4 pb-6 pt-2 shrink-0">
        <Button
          className="w-full h-11 rounded-xl font-semibold text-sm"
          onClick={handlePublish}
          disabled={!canPublish || isPublishing}
        >
          {isPublishing ? 'Publishing...' : t('feed.publish')}
        </Button>
      </div>
    </div>
  );
}
         
