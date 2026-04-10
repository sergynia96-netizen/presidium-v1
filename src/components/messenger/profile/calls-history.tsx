'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Phone,
  Video,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  VideoOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAppStore } from '@/store/use-app-store';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import type { CallRecord } from '@/types';

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.04, delayChildren: 0.1 },
  },
};

const item = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: 'easeOut' } },
};

const avatarColors = [
  'bg-emerald-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-violet-500',
  'bg-orange-500',
  'bg-teal-500',
  'bg-pink-500',
];

type FilterTab = 'all' | 'missed' | 'incoming' | 'outgoing';

export default function CallsScreen() {
  const { goBack, callRecords } = useAppStore();
  const { t } = useT();

  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');

  const tabs: { key: FilterTab; labelKey: string }[] = [
    { key: 'all', labelKey: 'calls.all' },
    { key: 'missed', labelKey: 'calls.missed' },
    { key: 'incoming', labelKey: 'calls.incoming' },
    { key: 'outgoing', labelKey: 'calls.outgoing' },
  ];

  const filteredCalls = useMemo(() => {
    switch (activeFilter) {
      case 'missed':
        return callRecords.filter(
          (c) => c.type === 'missed_audio' || c.type === 'missed_video'
        );
      case 'incoming':
        return callRecords.filter((c) => c.isIncoming && !c.type.startsWith('missed'));
      case 'outgoing':
        return callRecords.filter((c) => !c.isIncoming);
      default:
        return callRecords;
    }
  }, [callRecords, activeFilter]);

  const getInitials = (name: string) =>
    name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

  const getAvatarColor = (contactId: string) => {
    const idx = callRecords.findIndex((c) => c.contactId === contactId);
    return avatarColors[(idx % avatarColors.length + avatarColors.length) % avatarColors.length];
  };

  const getCallIcon = (call: CallRecord) => {
    const isMissed = call.type.startsWith('missed');
    const isVideo = call.type.includes('video');

    if (isMissed && isVideo) return { icon: VideoOff, color: 'text-red-500' };
    if (isMissed) return { icon: PhoneMissed, color: 'text-red-500' };
    if (isVideo) return { icon: Video, color: 'text-muted-foreground' };
    return { icon: Phone, color: 'text-muted-foreground' };
  };

  const getDirectionIcon = (call: CallRecord) => {
    const isMissed = call.type.startsWith('missed');
    if (call.isIncoming) {
      return <PhoneIncoming className={cn('size-3', isMissed ? 'text-red-500' : 'text-emerald-500')} />;
    }
    return <PhoneOutgoing className="size-3 text-blue-500" />;
  };

  const getCallLabel = (call: CallRecord) => {
    const isMissed = call.type.startsWith('missed');
    const isVideo = call.type.includes('video');
    if (isMissed && isVideo) return t('calls.missedVideo');
    if (isMissed) return t('calls.missedAudio');
    if (isVideo) return t('calls.video');
    return t('calls.audio');
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50 shrink-0">
        <Button variant="ghost" size="icon" className="size-9" onClick={goBack}>
          <ArrowLeft className="size-5" />
        </Button>
        <h1 className="text-lg font-semibold">{t('calls.title')}</h1>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 px-4 py-2.5 shrink-0 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={cn(
              'px-3 py-1.5 rounded-full text-sm font-medium transition-colors shrink-0',
              activeFilter === tab.key
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent/50'
            )}
            onClick={() => setActiveFilter(tab.key)}
          >
            {t(tab.labelKey as unknown as never)}
          </button>
        ))}
      </div>

      <ScrollArea className="flex-1">
        <motion.div
          variants={container as unknown as never}
          initial="hidden"
          animate="show"
          className="mx-auto max-w-2xl px-4 pb-8"
        >
          {filteredCalls.length === 0 ? (
            <motion.div
              variants={item as unknown as never}
              className="flex flex-col items-center justify-center py-16 text-center"
            >
              <div className="flex items-center justify-center size-16 rounded-full bg-muted mb-3">
                <Phone className="size-7 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">{t('calls.noCalls')}</p>
            </motion.div>
          ) : (
            <div className="space-y-0.5">
              {filteredCalls.map((call) => {
                const isMissed = call.type.startsWith('missed');
                const callIconInfo = getCallIcon(call);
                const CallIcon = callIconInfo.icon;

                return (
                  <motion.div
                    key={call.id}
                    variants={item as unknown as never}
                    className={cn(
                      'flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-colors hover:bg-accent/40',
                      isMissed && 'bg-red-500/5'
                    )}
                    onClick={() => {
                      /* Open call or contact profile */
                    }}
                  >
                    {/* Avatar */}
                    <div className="relative shrink-0">
                      <Avatar className="size-11">
                        <AvatarFallback
                          className={cn('text-xs font-bold text-white', getAvatarColor(call.contactId))}
                        >
                          {getInitials(call.contactName)}
                        </AvatarFallback>
                      </Avatar>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={cn('text-sm font-medium truncate', isMissed && 'text-red-500')}>
                          {call.contactName}
                        </span>
                        {getDirectionIcon(call)}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <CallIcon className={cn('size-3', callIconInfo.color)} />
                        <span className={cn('text-xs', isMissed ? 'text-red-400' : 'text-muted-foreground')}>
                          {getCallLabel(call)}
                        </span>
                        {call.duration !== '0:00' && (
                          <>
                            <span className="text-xs text-muted-foreground">·</span>
                            <span className="text-xs text-muted-foreground">{call.duration}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Timestamp + callback */}
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <span className="text-xs text-muted-foreground">{call.timestamp}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                          'size-7 rounded-full',
                          isMissed
                            ? 'text-red-500 hover:text-red-500 hover:bg-red-500/10'
                            : 'text-primary hover:text-primary hover:bg-primary/10'
                        )}
                      >
                        {call.type.includes('video') ? (
                          <Video className="size-3.5" />
                        ) : (
                          <Phone className="size-3.5" />
                        )}
                      </Button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </motion.div>
      </ScrollArea>
    </div>
  );
}
