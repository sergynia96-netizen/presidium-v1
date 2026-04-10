'use client';

import { motion } from 'framer-motion';
import {
  ArrowLeft,
  MessageSquare,
  Users,
  Megaphone,
  Phone,
  Eye,
  Volume2,
  Vibrate,
  BellOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useAppStore } from '@/store/use-app-store';
import { useT } from '@/lib/i18n';

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05, delayChildren: 0.1 },
  },
};

const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
};

interface NotificationRow {
  key: string;
  labelKey: string;
  icon: React.ElementType;
}

type NotificationSettingKey =
  | 'notifPrivate'
  | 'notifGroups'
  | 'notifChannels'
  | 'notifCalls'
  | 'notifPreview'
  | 'sound'
  | 'notifVibration';

export default function NotificationsScreen() {
  const { goBack, settings, updateSettings } = useAppStore();
  const { t } = useT();

  const rows: Array<NotificationRow & { settingKey: NotificationSettingKey }> = [
    { key: 'privateChats', settingKey: 'notifPrivate', labelKey: 'notif.privateChats', icon: MessageSquare },
    { key: 'groupChats', settingKey: 'notifGroups', labelKey: 'notif.groupChats', icon: Users },
    { key: 'channels', settingKey: 'notifChannels', labelKey: 'notif.channels', icon: Megaphone },
    { key: 'calls', settingKey: 'notifCalls', labelKey: 'notif.calls', icon: Phone },
    { key: 'preview', settingKey: 'notifPreview', labelKey: 'notif.preview', icon: Eye },
    { key: 'sound', settingKey: 'sound', labelKey: 'notif.sound', icon: Volume2 },
    { key: 'vibration', settingKey: 'notifVibration', labelKey: 'notif.vibrate', icon: Vibrate },
  ];

  const handleToggle = (key: NotificationSettingKey) => {
    updateSettings({ [key]: !settings[key] });
  };

  const handleMuteAll = () => {
    const nextMuted = !settings.notifMutedAll;
    updateSettings({
      notifMutedAll: nextMuted,
      notifPrivate: !nextMuted,
      notifGroups: !nextMuted,
      notifChannels: !nextMuted,
      notifCalls: !nextMuted,
      notifPreview: !nextMuted,
      sound: !nextMuted,
      notifVibration: !nextMuted,
    });
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50 shrink-0">
        <Button variant="ghost" size="icon" className="size-9" onClick={goBack}>
          <ArrowLeft className="size-5" />
        </Button>
        <h1 className="text-lg font-semibold">{t('notif.title')}</h1>
      </div>

      <ScrollArea className="flex-1">
        <motion.div
          variants={container as unknown as never}
          initial="hidden"
          animate="show"
          className="mx-auto max-w-2xl p-4 lg:p-6 space-y-1 pb-8"
        >
          {rows.map((row) => {
            const Icon = row.icon;
            const checked = settings[row.settingKey] ?? true;
            return (
              <motion.div
                key={row.key}
                variants={item as unknown as never}
                className="flex items-center gap-3 py-3 px-1"
              >
                <div className="flex items-center justify-center size-9 rounded-lg bg-muted/60 shrink-0">
                  <Icon className="size-4 text-muted-foreground" />
                </div>
                <span className="text-sm flex-1">{t(row.labelKey as unknown as never)}</span>
                <Switch
                  checked={checked}
                  onCheckedChange={() => handleToggle(row.settingKey)}
                />
              </motion.div>
            );
          })}

          <Separator className="my-3" />

          {/* Mute All button */}
          <motion.div variants={item as unknown as never} className="pt-2">
            <Button
              variant={settings.notifMutedAll ? 'default' : 'destructive'}
              className="w-full gap-2"
              onClick={handleMuteAll}
            >
              <BellOff className="size-4" />
              {settings.notifMutedAll ? t('notif.unmuteAll') : t('notif.muteAll')}
            </Button>
          </motion.div>
        </motion.div>
      </ScrollArea>
    </div>
  );
}
