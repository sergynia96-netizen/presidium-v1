'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { MessageSquare, Phone, Video, Search } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useAppStore } from '@/store/use-app-store';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';

export function DesktopWelcome() {
  const user = useAppStore((s) => s.user);
  const setView = useAppStore((s) => s.setView);
  const chats = useAppStore((s) => s.chats);
  const blockedChatIds = useAppStore((s) => s.blockedChatIds);
  const callRecords = useAppStore((s) => s.callRecords);
  const { t, tf } = useT();

  const initials = user?.name
    ? user.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : 'AM';

  const chatCount = useMemo(
    () => chats.filter((chat) => !chat.isArchived && !blockedChatIds.includes(chat.id)).length,
    [blockedChatIds, chats],
  );

  const callCount = callRecords.length;

  const meetingCount = useMemo(
    () => callRecords.filter((record) => record.type === 'video' || record.type === 'missed_video').length,
    [callRecords],
  );

  return (
    <div className="hidden lg:flex flex-col items-center justify-center flex-1 h-full bg-background select-none">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="flex flex-col items-center text-center max-w-sm px-8"
      >
        {/* Avatar */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.4 }}
          className="mb-5"
        >
          <Avatar className="size-20 ring-4 ring-primary/10">
            <AvatarFallback className="text-xl font-bold bg-primary text-primary-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
        </motion.div>

        {/* Greeting */}
        <motion.h2
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.4 }}
          className="text-2xl font-bold text-foreground mb-1"
        >
          {tf('desktop.welcomeGreeting', { name: user?.name?.split(' ')[0] || 'Alex' })}
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          className="text-sm text-muted-foreground mb-8"
        >
          {t('desktop.welcomeDesc')}
        </motion.p>

        {/* Quick stats */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.4 }}
          className="flex items-center gap-6"
        >
          <QuickStat icon={MessageSquare} label={t('desktop.statChats')} value={chatCount} />
          <QuickStat icon={Phone} label={t('desktop.statCalls')} value={callCount} />
          <QuickStat icon={Video} label={t('desktop.statMeetings')} value={meetingCount} />
        </motion.div>

        {/* CTA */}
        <motion.button
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.4 }}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => setView('group-creation')}
          className={cn(
            'mt-10 flex items-center gap-2 px-6 py-2.5 rounded-xl',
            'bg-primary text-primary-foreground text-sm font-medium',
            'hover:bg-primary/90 transition-colors shadow-md shadow-primary/20'
          )}
        >
          <Search className="size-4" />
          {t('desktop.startConversation')}
        </motion.button>
      </motion.div>
    </div>
  );
}

function QuickStat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="flex items-center justify-center size-10 rounded-xl bg-muted">
        <Icon className="size-5 text-muted-foreground" />
      </div>
      <span className="text-lg font-bold text-foreground">{value}</span>
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </div>
  );
}
