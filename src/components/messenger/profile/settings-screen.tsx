'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCallback } from 'react';
import {
  ArrowLeft,
  Bell,
  Shield,
  Cpu,
  Monitor,
  MousePointerClick,
  Volume2,
  MessageSquare,
  Megaphone,
  Users,
  UserPlus,
  Pin,
  Phone,
  KeyRound,
  Lock,
  Trash2,
  Brain,
  Plug,
  Server,
  ChevronDown,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useAppStore } from '@/store/use-app-store';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05, delayChildren: 0.1 },
  },
};

const item = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: 'easeOut' } },
};

/* ─── Section Card ─────────────────────────────── */

function SettingsSection({
  icon: Icon,
  title,
  description,
  children,
  defaultOpen = false,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <motion.div variants={item as unknown as never}>
      <Card className="overflow-hidden border-border/50">
        {/* Clickable header */}
        <button
          type="button"
          className="flex items-center gap-3 w-full p-4 text-left hover:bg-accent/20 transition-colors"
          onClick={() => setOpen((v) => !v)}
        >
          <div className="flex items-center justify-center size-9 rounded-lg bg-primary/10 shrink-0">
            <Icon className="size-4.5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">{title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          </div>
          <motion.div
            animate={{ rotate: open ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="shrink-0"
          >
            <ChevronDown className="size-4 text-muted-foreground" />
          </motion.div>
        </button>

        {/* Collapsible content */}
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div className="border-t border-border/50">
                <CardContent className="p-0">
                  {children}
                </CardContent>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </motion.div>
  );
}

/* ─── Setting Row ──────────────────────────────── */

function SettingRow({
  icon: Icon,
  label,
  description,
  children,
}: {
  icon: React.ElementType;
  label: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 py-3 px-4 hover:bg-accent/20 transition-colors">
      <div className="flex items-center justify-center size-9 rounded-lg bg-muted/60 shrink-0">
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm">{label}</p>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
      <div className="shrink-0 flex items-center gap-2">{children}</div>
    </div>
  );
}

/* ─── Main Component ───────────────────────────── */

export default function SettingsScreen() {
  const { goBack, settings, updateSettings } = useAppStore();
  const { t } = useT();

  const handleToggle = useCallback(
    (key: keyof typeof settings) => {
      updateSettings({ [key]: !settings[key] });
    },
    [settings, updateSettings]
  );

  const handleAutoDelete = useCallback(
    (value: string) => {
      updateSettings({ autoDelete: value });
    },
    [updateSettings]
  );

  // Auto-delete
  const autoDeleteOptions = ['Off', '1 day', '1 week', '1 month'] as const;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50 shrink-0">
        <Button variant="ghost" size="icon" className="size-9" onClick={goBack}>
          <ArrowLeft className="size-5" />
        </Button>
        <h1 className="text-lg font-semibold">{t('settings.title')}</h1>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <motion.div
          variants={container as unknown as never}
          initial="hidden"
          animate="show"
          className="mx-auto max-w-2xl p-4 space-y-4 pb-8"
        >
          {/* Section 1: Notifications & Sounds */}
          <SettingsSection
            icon={Bell}
            title={t('settings.notifSounds')}
            description={t('settings.desktopNotifDesc')}
            defaultOpen={true}
          >
            <Separator className="mx-4" />
            <SettingRow
              icon={Monitor}
              label={t('settings.desktopNotif')}
              description={t('settings.desktopNotifDesc')}
            >
              <Switch checked={settings.desktopNotif} onCheckedChange={() => handleToggle('desktopNotif')} />
            </SettingRow>
            <Separator className="mx-4" />
            <SettingRow
              icon={MousePointerClick}
              label={t('settings.taskbarAnim')}
              description={t('settings.taskbarAnimDesc')}
            >
              <Switch checked={settings.taskbarAnim} onCheckedChange={() => handleToggle('taskbarAnim')} />
            </SettingRow>
            <Separator className="mx-4" />
            <SettingRow
              icon={Volume2}
              label={t('settings.sound')}
              description={t('settings.soundDesc')}
            >
              <Switch checked={settings.sound} onCheckedChange={() => handleToggle('sound')} />
            </SettingRow>
            <Separator className="mx-4" />
            <SettingRow
              icon={MessageSquare}
              label={t('settings.notifPrivate')}
              description={t('settings.notifPrivateDesc')}
            >
              <Switch checked={settings.notifPrivate} onCheckedChange={() => handleToggle('notifPrivate')} />
            </SettingRow>
            <Separator className="mx-4" />
            <SettingRow
              icon={Megaphone}
              label={t('settings.notifChannels')}
              description={t('settings.notifChannelsDesc')}
            >
              <Switch checked={settings.notifChannels} onCheckedChange={() => handleToggle('notifChannels')} />
            </SettingRow>
            <Separator className="mx-4" />
            <SettingRow
              icon={Users}
              label={t('settings.notifGroups')}
              description={t('settings.notifGroupsDesc')}
            >
              <Switch checked={settings.notifGroups} onCheckedChange={() => handleToggle('notifGroups')} />
            </SettingRow>
            <Separator className="mx-4" />
            <SettingRow
              icon={UserPlus}
              label={t('settings.notifNewUser')}
              description={t('settings.notifNewUserDesc')}
            >
              <Switch checked={settings.notifNewUser} onCheckedChange={() => handleToggle('notifNewUser')} />
            </SettingRow>
            <Separator className="mx-4" />
            <SettingRow
              icon={Pin}
              label={t('settings.notifPinned')}
              description={t('settings.notifPinnedDesc')}
            >
              <Switch checked={settings.notifPinned} onCheckedChange={() => handleToggle('notifPinned')} />
            </SettingRow>
            <Separator className="mx-4" />
            <SettingRow
              icon={Phone}
              label={t('settings.notifCalls')}
              description={t('settings.notifCallsDesc')}
            >
              <Switch checked={settings.notifCalls} onCheckedChange={() => handleToggle('notifCalls')} />
            </SettingRow>
          </SettingsSection>

          {/* Section 2: Privacy */}
          <SettingsSection
            icon={Shield}
            title={t('settings.privacy')}
            description={t('settings.privacyDesc')}
          >
            <Separator className="mx-4" />
            <SettingRow
              icon={KeyRound}
              label={t('settings.pinCode')}
              description={t('settings.pinCodeDesc')}
            >
              <div className="flex items-center gap-2">
                <Badge className="text-xs gap-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-0">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  {t('settings.pinCodeStatus')}
                </Badge>
                <Button variant="outline" size="sm" className="h-7 text-xs">
                  {t('settings.configure')}
                </Button>
              </div>
            </SettingRow>
            <Separator className="mx-4" />
            <SettingRow
              icon={Lock}
              label={t('settings.cloudPassword')}
              description={t('settings.cloudPasswordDesc')}
            >
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs border-0 bg-muted">
                  {t('settings.cloudPasswordStatus')}
                </Badge>
                <Button variant="outline" size="sm" className="h-7 text-xs">
                  {t('settings.configure')}
                </Button>
              </div>
            </SettingRow>
            <Separator className="mx-4" />
            <SettingRow
              icon={Trash2}
              label={t('settings.autoDelete')}
              description={t('settings.autoDeleteDesc')}
            >
              <div className="flex items-center gap-1">
                {autoDeleteOptions.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    className={cn(
                      'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                      settings.autoDelete === opt
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted/60 text-muted-foreground hover:bg-muted'
                    )}
                    onClick={() => handleAutoDelete(opt)}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </SettingRow>
          </SettingsSection>

          {/* Section 3: Advanced Settings */}
          <SettingsSection
            icon={Cpu}
            title={t('settings.advanced')}
            description={t('settings.advancedDesc')}
          >
            <Separator className="mx-4" />
            <SettingRow
              icon={Brain}
              label={t('settings.aiManagement')}
              description={t('settings.aiManagementDesc')}
            >
              <div className="flex items-center gap-2">
                <Badge className="text-xs gap-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-0">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  {t('settings.aiStatus')}
                </Badge>
                <Button variant="outline" size="sm" className="h-7 text-xs">
                  {t('settings.configure')}
                </Button>
              </div>
            </SettingRow>
            <Separator className="mx-4" />
            <SettingRow
              icon={Plug}
              label={t('settings.openclaw')}
              description={t('settings.openclawDesc')}
            >
              <div className="flex items-center gap-2">
                <Badge className="text-xs gap-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-0">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  {t('settings.openclawStatus')}
                </Badge>
                <Badge variant="outline" className="text-xs gap-1.5 border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
                  <ShieldCheck className="size-3" />
                  {t('settings.enabled')}
                </Badge>
              </div>
            </SettingRow>
            <Separator className="mx-4" />
            <SettingRow
              icon={Server}
              label={t('settings.mcpServers')}
              description={t('settings.mcpServersDesc')}
            >
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs border-0 bg-muted">{t('settings.mcpServersStatus')}</Badge>
              </div>
            </SettingRow>
          </SettingsSection>
        </motion.div>
      </ScrollArea>
    </div>
  );
}
