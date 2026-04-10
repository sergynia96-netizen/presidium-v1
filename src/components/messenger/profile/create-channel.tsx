'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Megaphone,
  Globe,
  Lock,
  Radio,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useAppStore } from '@/store/use-app-store';
import { useApiStore } from '@/store/use-api-store';
import { chatsApi, messagesApi } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { toast } from '@/hooks/use-toast';

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.1 },
  },
};

const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
};

export default function CreateChannelScreen() {
  const { goBack, setView, setActiveChat } = useAppStore();
  const syncChats = useApiStore((s) => s.syncChats);
  const { t } = useT();

  const [channelName, setChannelName] = useState('');
  const [description, setDescription] = useState('');
  const [channelType, setChannelType] = useState<'public' | 'private'>('public');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleCreate = async () => {
    const normalizedName = channelName.trim();
    const normalizedDescription = description.trim();

    if (!normalizedName) return;
    if (isSubmitting) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const response = await chatsApi.create({
        name: normalizedName,
        // Current MVP stores channels in the shared chat model as a group-like stream.
        type: 'group',
        isEncrypted: channelType === 'private',
        encryptionType: channelType === 'private' ? 'e2e' : 'server',
      });

      const createdChatId = response.data?.chat?.id;
      if (!createdChatId) {
        throw new Error('Channel creation failed: missing chat id');
      }

      if (normalizedDescription) {
        await messagesApi.send({
          chatId: createdChatId,
          type: 'system',
          content: normalizedDescription,
        });
      }

      await syncChats();
      setActiveChat(createdChatId);
      setView('chat');

      toast({
        title: t('channel.createBtn'),
        description: channelType === 'private' ? t('channel.privateDesc') : t('channel.publicDesc'),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to create channel';
      setSubmitError(message);
      toast({
        variant: 'destructive',
        title: message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50 shrink-0">
        <Button variant="ghost" size="icon" className="size-9" onClick={goBack}>
          <ArrowLeft className="size-5" />
        </Button>
        <h1 className="text-lg font-semibold">{t('channel.createTitle')}</h1>
      </div>

      <ScrollArea className="flex-1">
        <motion.div
          variants={container as unknown as never}
          initial="hidden"
          animate="show"
          className="mx-auto max-w-2xl p-4 lg:p-6 lg:mx-auto lg:max-w-lg space-y-5 pb-8"
        >
          {/* Channel icon */}
          <motion.div variants={item as unknown as never} className="flex justify-center pt-6 pb-2">
            <div className="flex items-center justify-center size-24 rounded-full bg-muted">
              <Megaphone className="size-10 text-muted-foreground" />
            </div>
          </motion.div>

          {/* Channel name */}
          <motion.div variants={item as unknown as never} className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground">
              {t('channel.nameLabel')}
            </Label>
            <Input
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
              className="h-12 text-base"
              placeholder={t('channel.namePlaceholder')}
              autoFocus
            />
          </motion.div>

          {/* Description */}
          <motion.div variants={item as unknown as never} className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground">
              {t('channel.description')}
            </Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[100px] resize-none"
              placeholder={t('channel.descPlaceholder')}
            />
          </motion.div>

          <Separator />

          {/* Channel Type */}
          <motion.div variants={item as unknown as never} className="space-y-3">
            <Label className="text-sm font-medium text-muted-foreground">
              {t('channel.type')}
            </Label>

            <div className="space-y-2.5">
              {/* Public option */}
              <button
                type="button"
                className={cn(
                  'w-full flex items-start gap-3.5 p-4 rounded-xl border-2 transition-all text-left',
                  channelType === 'public'
                    ? 'border-primary bg-primary/5'
                    : 'border-border/50 hover:border-border'
                )}
                onClick={() => setChannelType('public')}
              >
                <div
                  className={cn(
                    'flex items-center justify-center size-10 rounded-lg shrink-0 transition-colors',
                    channelType === 'public'
                      ? 'bg-primary/10'
                      : 'bg-muted'
                  )}
                >
                  <Globe
                    className={cn(
                      'size-5',
                      channelType === 'public' ? 'text-primary' : 'text-muted-foreground'
                    )}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{t('channel.public')}</span>
                    {/* Radio indicator */}
                    <div
                      className={cn(
                        'size-4 rounded-full border-2 shrink-0 transition-colors flex items-center justify-center',
                        channelType === 'public'
                          ? 'border-primary'
                          : 'border-muted-foreground/40'
                      )}
                    >
                      {channelType === 'public' && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="size-2 rounded-full bg-primary"
                        />
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t('channel.publicDesc')}
                  </p>
                </div>
              </button>

              {/* Private option */}
              <button
                type="button"
                className={cn(
                  'w-full flex items-start gap-3.5 p-4 rounded-xl border-2 transition-all text-left',
                  channelType === 'private'
                    ? 'border-primary bg-primary/5'
                    : 'border-border/50 hover:border-border'
                )}
                onClick={() => setChannelType('private')}
              >
                <div
                  className={cn(
                    'flex items-center justify-center size-10 rounded-lg shrink-0 transition-colors',
                    channelType === 'private'
                      ? 'bg-primary/10'
                      : 'bg-muted'
                  )}
                >
                  <Lock
                    className={cn(
                      'size-5',
                      channelType === 'private' ? 'text-primary' : 'text-muted-foreground'
                    )}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{t('channel.private')}</span>
                    {/* Radio indicator */}
                    <div
                      className={cn(
                        'size-4 rounded-full border-2 shrink-0 transition-colors flex items-center justify-center',
                        channelType === 'private'
                          ? 'border-primary'
                          : 'border-muted-foreground/40'
                      )}
                    >
                      {channelType === 'private' && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="size-2 rounded-full bg-primary"
                        />
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t('channel.privateDesc')}
                  </p>
                </div>
              </button>
            </div>
          </motion.div>

          <Separator />

          {/* Create button */}
          <motion.div variants={item as unknown as never} className="pt-2">
            {submitError && (
              <p className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {submitError}
              </p>
            )}
            <Button
              className="w-full h-11 text-base font-medium gap-2"
              disabled={!channelName.trim() || isSubmitting}
              onClick={() => {
                void handleCreate();
              }}
            >
              <Radio className="size-4" />
              {isSubmitting ? t('profile.loading') : t('channel.createBtn')}
            </Button>
          </motion.div>
        </motion.div>
      </ScrollArea>
    </div>
  );
}
