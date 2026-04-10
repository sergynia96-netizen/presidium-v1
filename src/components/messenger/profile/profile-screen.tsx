'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  User as UserIcon,
  Shield,
  Lock,
  Key,
  Smartphone,
  ShieldCheck,
  ChevronRight,
  Palette,
  Eye,
  Settings,
  Bell,
  HardDrive,
  Globe,
  LogOut,
  Monitor,
  Tablet,
  Star,
  Phone,
  Users,
  Megaphone,
  UserCircle,
  QrCode,
  Ghost,
  Copy,
  Unlink2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useAppStore } from '@/store/use-app-store';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { ThemeToggle } from '@/components/shared/theme-toggle';
import type { AppView } from '@/types';
import {
  computeMessageBreakdownBytes,
  estimateLocalCacheBytes,
  formatStorageValue,
} from '@/lib/storage-usage';
import {
  listActiveSessions,
  revokeActiveSession,
  revokeAllOtherSessions,
  issueDeviceLink,
  revokeDeviceLink,
  type SessionSnapshot,
} from '@/lib/data-export';

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

const accentColors = [
  { name: 'Emerald', value: 'emerald', className: 'bg-emerald-500 ring-offset-background' },
  { name: 'Amber', value: 'amber', className: 'bg-amber-500 ring-offset-background' },
  { name: 'Rose', value: 'rose', className: 'bg-rose-500 ring-offset-background' },
  { name: 'Cyan', value: 'cyan', className: 'bg-cyan-500 ring-offset-background' },
];

const deviceIcons: Record<string, React.ElementType> = {
  desktop: Monitor,
  mobile: Smartphone,
  tablet: Tablet,
};

interface DeviceSession {
  id: string;
  name?: string | null;
  type: 'desktop' | 'mobile' | 'tablet';
  current: boolean;
  lastActiveAt?: string | null;
  expiresAt?: string | null;
}

function detectDeviceType(userAgent: string | null | undefined): DeviceSession['type'] {
  if (!userAgent) return 'desktop';
  const ua = userAgent.toLowerCase();
  if (ua.includes('ipad') || (ua.includes('android') && !ua.includes('mobile'))) return 'tablet';
  if (ua.includes('mobile') || ua.includes('iphone') || ua.includes('android')) return 'mobile';
  return 'desktop';
}

function detectDeviceName(userAgent: string | null | undefined): string {
  if (!userAgent) return '';
  const ua = userAgent.toLowerCase();
  if (ua.includes('edg/')) return 'Microsoft Edge';
  if (ua.includes('chrome/') && !ua.includes('edg/')) return 'Google Chrome';
  if (ua.includes('firefox/')) return 'Mozilla Firefox';
  if (ua.includes('safari/') && !ua.includes('chrome/')) return 'Safari';
  return 'Browser';
}

function mapSessionToDevice(session: SessionSnapshot): DeviceSession {
  const resolvedType =
    session.deviceType && session.deviceType !== 'unknown'
      ? session.deviceType
      : detectDeviceType(session.userAgent);
  return {
    id: session.id,
    name: session.deviceName || detectDeviceName(session.userAgent),
    type: resolvedType,
    current: session.current,
    lastActiveAt: session.lastActiveAt || null,
    expiresAt: session.expires,
  };
}

function SettingsRow({
  icon: Icon,
  label,
  children,
  onClick,
  badge,
}: {
  icon: React.ElementType;
  label: string;
  children?: React.ReactNode;
  onClick?: () => void;
  badge?: string;
}) {
  return (
    <button
      type="button"
      className="flex items-center gap-3 w-full py-3 px-1 text-left hover:bg-accent/30 rounded-lg transition-colors"
      onClick={onClick}
    >
      <Icon className="size-4 text-muted-foreground shrink-0" />
      <span className="text-sm flex-1">{label}</span>
      {badge && (
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-muted border-0 mr-1">
          {badge}
        </Badge>
      )}
      {children}
    </button>
  );
}

function SectionHeader({
  icon: Icon,
  title,
}: {
  icon: React.ElementType;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-1">
      <Icon className="size-4 text-muted-foreground" />
      <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        {title}
      </h2>
    </div>
  );
}

function DevicesDialog({
  open,
  onOpenChange,
  devices,
  loading,
  error,
  revokingSessionId,
  revokingAllSessions,
  onRevokeSession,
  onRevokeAllOthers,
  deviceLink,
  deviceLinkLoading,
  deviceLinkError,
  revokingDeviceLink,
  onIssueDeviceLink,
  onRevokeDeviceLink,
  onCopyDeviceLink,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  devices: DeviceSession[];
  loading: boolean;
  error: string | null;
  revokingSessionId: string | null;
  revokingAllSessions: boolean;
  onRevokeSession: (sessionId: string) => void;
  onRevokeAllOthers: () => void;
  deviceLink: { code: string; expiresAt: string; pairingUri: string } | null;
  deviceLinkLoading: boolean;
  deviceLinkError: string | null;
  revokingDeviceLink: boolean;
  onIssueDeviceLink: () => void;
  onRevokeDeviceLink: () => void;
  onCopyDeviceLink: (value: string) => void;
}) {
  const { t } = useT();
  const hasOtherSessions = devices.some((device) => !device.current);
  const hasCurrentSession = devices.some((device) => device.current);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('profile.devicesTitle')}</DialogTitle>
          <DialogDescription>
            {t('profile.devicesDesc')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          <div className="rounded-xl border border-border/50 p-3 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">Link New Device</p>
                <p className="text-xs text-muted-foreground">
                  Generate one-time code to sign in on another device.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                disabled={deviceLinkLoading || revokingDeviceLink}
                onClick={onIssueDeviceLink}
              >
                {deviceLinkLoading ? t('profile.loading') : 'Generate'}
              </Button>
            </div>

            {deviceLinkError && (
              <p className="text-xs text-destructive">{deviceLinkError}</p>
            )}

            {deviceLink && (
              <div className="rounded-lg border border-border/60 bg-muted/30 p-2.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <code className="text-sm font-semibold tracking-widest">{deviceLink.code}</code>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => onCopyDeviceLink(deviceLink.code)}
                  >
                    <Copy className="size-3.5 mr-1" />
                    Copy
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Expires: {new Date(deviceLink.expiresAt).toLocaleString()}
                </p>
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    className="text-[11px] text-primary hover:underline truncate text-left"
                    onClick={() => onCopyDeviceLink(deviceLink.pairingUri)}
                    title={deviceLink.pairingUri}
                  >
                    {deviceLink.pairingUri}
                  </button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                    disabled={revokingDeviceLink}
                    onClick={onRevokeDeviceLink}
                  >
                    <Unlink2 className="size-3.5 mr-1" />
                    Revoke
                  </Button>
                </div>
              </div>
            )}
          </div>

          {hasOtherSessions && (
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                disabled={loading || revokingAllSessions}
                onClick={onRevokeAllOthers}
              >
                {revokingAllSessions ? t('profile.revoking') : t('profile.revokeOthers')}
              </Button>
            </div>
          )}
          {!loading && !error && hasCurrentSession && !hasOtherSessions && (
            <div className="rounded-xl border border-border/50 p-3 text-sm text-muted-foreground">
              {t('profile.noOtherSessions')}
            </div>
          )}
          {loading && (
            <div className="rounded-xl border border-border/50 p-3 text-sm text-muted-foreground">
              {t('profile.loading')}
            </div>
          )}
          {!loading && error && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          {!loading && !error && devices.length === 0 && (
            <div className="rounded-xl border border-border/50 p-3 text-sm text-muted-foreground">
              {t('profile.devicesDesc')}
            </div>
          )}
          {devices.map((device) => {
            const DeviceIcon = deviceIcons[device.type] || Smartphone;
            return (
              <div
                key={device.id}
                className="flex items-center gap-3 p-3 rounded-xl border border-border/50"
              >
                <div className="flex items-center justify-center size-10 rounded-lg bg-muted">
                  <DeviceIcon className="size-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  {(() => {
                    const displayName = device.name?.trim() ? device.name : t('profile.unknownDevice');
                    const lastActiveLabel = device.lastActiveAt
                      ? new Date(device.lastActiveAt).toLocaleString([], {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : t('profile.unknown');
                    return (
                      <>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{displayName}</span>
                          {device.current && (
                            <Badge
                              variant="secondary"
                              className="text-[10px] px-1.5 py-0 h-4 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-0"
                            >
                              {t('profile.current')}
                            </Badge>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {t('profile.lastActive')}
                          {lastActiveLabel}
                        </span>
                      </>
                    );
                  })()}
                  {device.expiresAt && (
                    <span className="block text-xs text-muted-foreground">
                      {t('profile.expires')}
                      {new Date(device.expiresAt).toLocaleString()}
                    </span>
                  )}
                </div>
                {!device.current && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-destructive hover:text-destructive h-7"
                    disabled={revokingSessionId === device.id || revokingAllSessions}
                    onClick={() => onRevokeSession(device.id)}
                  >
                    {t('profile.revoke')}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function ProfileScreen() {
  const {
    user,
    logout,
    locale,
    setLocale,
    setView,
    accentColor,
    setAccentColor,
    settings,
    updateSettings,
    messages,
  } = useAppStore();
  const { t } = useT();

  const storageUsedLabel = useMemo(() => {
    const breakdown = computeMessageBreakdownBytes(messages);
    const cacheBytes = estimateLocalCacheBytes();
    return formatStorageValue(
      breakdown.media + breakdown.documents + breakdown.voice + cacheBytes,
    );
  }, [messages]);

  const statusConfig = {
    online: { label: t('status.online'), className: 'bg-emerald-500' },
    away: { label: t('status.away'), className: 'bg-amber-500' },
    offline: { label: t('status.offline'), className: 'bg-gray-400' },
  };

  const [pinSaving, setPinSaving] = useState(false);
  const selectedAccent = accentColor;
  const [devicesOpen, setDevicesOpen] = useState(false);
  const [deviceSessions, setDeviceSessions] = useState<DeviceSession[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [devicesError, setDevicesError] = useState<string | null>(null);
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null);
  const [revokingAllSessions, setRevokingAllSessions] = useState(false);
  const [deviceLink, setDeviceLink] = useState<{
    code: string;
    expiresAt: string;
    pairingUri: string;
  } | null>(null);
  const [deviceLinkLoading, setDeviceLinkLoading] = useState(false);
  const [deviceLinkError, setDeviceLinkError] = useState<string | null>(null);
  const [revokingDeviceLink, setRevokingDeviceLink] = useState(false);

  useEffect(() => {
    if (!devicesOpen) return;

    let cancelled = false;
    const loadSessions = async () => {
      setDevicesLoading(true);
      setDevicesError(null);
      try {
        const sessions = await listActiveSessions();
        if (cancelled) return;

        setDeviceSessions(sessions.map(mapSessionToDevice));
      } catch (error) {
        if (cancelled) return;
        setDeviceSessions([]);
        setDevicesError(error instanceof Error ? error.message : 'Failed to load active sessions');
      } finally {
        if (!cancelled) {
          setDevicesLoading(false);
        }
      }
    };

    void loadSessions();
    return () => {
      cancelled = true;
    };
  }, [devicesOpen]);

  const status = user?.status || 'online';
  const statusInfo = statusConfig[status];
  const initials = user?.name
    ? user.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : '??';

  const handleToggleLocale = () => {
    setLocale(locale === 'en' ? 'ru' : 'en');
  };

  const navigateTo = (view: AppView) => {
    setView(view);
  };

  const handleRevokeSession = async (sessionId: string) => {
    if (!sessionId || sessionId === 'current') return;
    setRevokingSessionId(sessionId);
    try {
      await revokeActiveSession(sessionId);
      setDeviceSessions((prev) => prev.filter((session) => session.id !== sessionId));
      toast({
        title: t('profile.sessionRevoked'),
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: error instanceof Error ? error.message : t('profile.sessionRevokeFailed'),
      });
    } finally {
      setRevokingSessionId(null);
    }
  };

  const handleRevokeAllOtherSessions = async () => {
    setRevokingAllSessions(true);
    try {
      await revokeAllOtherSessions();
      setDeviceSessions((prev) => prev.filter((session) => session.current));
      toast({
        title: t('profile.otherSessionsRevoked'),
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: error instanceof Error ? error.message : t('profile.otherSessionsRevokeFailed'),
      });
    } finally {
      setRevokingAllSessions(false);
    }
  };

  const handleIssueDeviceLink = async () => {
    setDeviceLinkLoading(true);
    setDeviceLinkError(null);
    try {
      const link = await issueDeviceLink();
      setDeviceLink({
        code: link.code,
        expiresAt: link.expiresAt,
        pairingUri: link.pairingUri,
      });
      toast({
        title: 'Device-link code generated',
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to issue device-link code';
      setDeviceLinkError(message);
      toast({
        variant: 'destructive',
        title: message,
      });
    } finally {
      setDeviceLinkLoading(false);
    }
  };

  const handleRevokeDeviceLink = async () => {
    setRevokingDeviceLink(true);
    try {
      await revokeDeviceLink();
      setDeviceLink(null);
      toast({ title: 'Device-link code revoked' });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: error instanceof Error ? error.message : 'Failed to revoke device-link code',
      });
    } finally {
      setRevokingDeviceLink(false);
    }
  };

  const handleCopyDeviceLink = async (value: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: 'Copied to clipboard' });
    } catch {
      toast({
        variant: 'destructive',
        title: 'Clipboard access failed',
      });
    }
  };

  const handleTogglePin = async () => {
    if (!user?.id || pinSaving) return;

    const nextPinEnabled = !Boolean(user.pinEnabled);
    setPinSaving(true);
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(user.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinEnabled: nextPinEnabled }),
      });

      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
        user?: { pinEnabled?: boolean | null };
      };

      if (!res.ok) {
        throw new Error(payload.error || 'Failed to update PIN setting');
      }

      useAppStore.setState((state) => ({
        user: state.user
          ? {
              ...state.user,
              pinEnabled: Boolean(payload.user?.pinEnabled ?? nextPinEnabled),
            }
          : state.user,
      }));

      toast({
        title: nextPinEnabled
          ? locale === 'ru'
            ? 'PIN включен'
            : 'PIN enabled'
          : locale === 'ru'
            ? 'PIN отключен'
            : 'PIN disabled',
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: error instanceof Error ? error.message : 'Failed to update PIN setting',
      });
    } finally {
      setPinSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border/50 shrink-0">
        <UserIcon className="size-5 text-primary" />
        <h1 className="text-lg font-semibold">{t('profile.title')}</h1>
      </div>

      <ScrollArea className="flex-1">
        <motion.div
          variants={container as unknown as never}
          initial="hidden"
          animate="show"
          className="mx-auto max-w-2xl p-4 lg:p-6 space-y-5 pb-8"
        >
          {/* Profile top section */}
          <motion.div variants={item as unknown as never} className="flex lg:flex-row flex-col items-center gap-4 lg:gap-6 pt-2 pb-4 lg:py-6">
            <div className="relative">
              <Avatar className="size-20">
                <AvatarFallback className="text-xl font-bold bg-primary text-primary-foreground">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="absolute bottom-0.5 right-0.5 size-4 rounded-full border-2 border-background">
                <div className={cn('size-full rounded-full', statusInfo.className)} />
              </div>
            </div>
            <div className="text-center">
              <h2 className="text-xl font-bold">{user?.name || 'Alex Morgan'}</h2>
              <p className="text-sm text-muted-foreground mt-0.5">{user?.email || 'alex@presidium.app'}</p>
              <Badge
                variant="secondary"
                className="mt-2 text-xs gap-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-0"
              >
                <span className="size-1.5 rounded-full bg-emerald-500" />
                {statusInfo.label}
              </Badge>
            </div>
            <Button variant="outline" size="sm" className="mt-1" onClick={() => navigateTo('edit-profile')}>
              {t('profile.editProfile')}
            </Button>
          </motion.div>

          <Separator />

          {/* Quick Actions */}
          <motion.div variants={item as unknown as never} className="grid grid-cols-3 gap-2">
            <button
              onClick={() => navigateTo('favorites')}
              className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-muted/50 hover:bg-muted transition-colors"
            >
              <Star className="size-5 text-amber-500" />
              <span className="text-xs font-medium">{t('profile.favorites')}</span>
            </button>
            <button
              onClick={() => navigateTo('contacts')}
              className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-muted/50 hover:bg-muted transition-colors"
            >
              <Users className="size-5 text-primary" />
              <span className="text-xs font-medium">{t('profile.contacts')}</span>
            </button>
            <button
              onClick={() => navigateTo('calls')}
              className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-muted/50 hover:bg-muted transition-colors"
            >
              <Phone className="size-5 text-emerald-500" />
              <span className="text-xs font-medium">{t('profile.calls')}</span>
            </button>
          </motion.div>

          <Separator />

          {/* Security Section */}
          <motion.div variants={item as unknown as never} className="space-y-0.5">
            <SectionHeader icon={Shield} title={t('profile.security')} />
            <SettingsRow icon={Lock} label={t('profile.e2e')}>
              <Badge className="text-xs gap-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-0">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                {t('profile.e2eActive')}
              </Badge>
            </SettingsRow>
            <SettingsRow icon={Key} label={t('profile.pin')}>
              <Switch
                checked={Boolean(user?.pinEnabled)}
                onCheckedChange={() => {
                  void handleTogglePin();
                }}
                disabled={pinSaving}
              />
            </SettingsRow>
            <SettingsRow icon={Smartphone} label={t('profile.devices')} onClick={() => setDevicesOpen(true)}>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{deviceSessions.length} {t('profile.devicesCount')}</span>
                <ChevronRight className="size-3.5 text-muted-foreground" />
              </div>
            </SettingsRow>
            <SettingsRow icon={ShieldCheck} label={t('profile.2fa')} onClick={() => navigateTo('two-factor')}>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs border-0 bg-muted">
                  {t('profile.off')}
                </Badge>
                <ChevronRight className="size-3.5 text-muted-foreground" />
              </div>
            </SettingsRow>
          </motion.div>

          <Separator />

          {/* Appearance Section */}
          <motion.div variants={item as unknown as never} className="space-y-0.5">
            <SectionHeader icon={Palette} title={t('profile.appearance')} />
            <SettingsRow icon={Palette} label={t('profile.darkMode')}>
              <ThemeToggle />
            </SettingsRow>
            <SettingsRow icon={Palette} label={t('profile.accentColor')}>
              <div className="flex items-center gap-2">
                {accentColors.map((color) => (
                  <button
                    key={color.value}
                    type="button"
                    className={cn(
                      'size-6 rounded-full transition-all',
                      color.className,
                      selectedAccent === color.value
                        ? 'ring-2 ring-foreground ring-offset-2 scale-110'
                        : 'opacity-60 hover:opacity-100'
                    )}
                    onClick={() => {
                      setAccentColor(color.value);
                      toast({
                        title: locale === 'ru' ? 'Цвет акцента применён' : 'Accent color applied',
                      });
                    }}
                    title={color.name}
                  />
                ))}
              </div>
            </SettingsRow>
          </motion.div>

          <Separator />

          {/* Privacy Section */}
          <motion.div variants={item as unknown as never} className="space-y-0.5">
            <SectionHeader icon={Eye} title={t('profile.privacy')} />
            <SettingsRow icon={Bell} label={t('profile.readReceipts')}>
              <Switch
                checked={settings.readReceipts}
                onCheckedChange={(checked) => updateSettings({ readReceipts: checked })}
              />
            </SettingsRow>
            <SettingsRow icon={Eye} label={t('profile.onlineStatus')}>
              <Switch
                checked={settings.onlineStatus}
                onCheckedChange={(checked) => updateSettings({ onlineStatus: checked })}
              />
            </SettingsRow>
            <SettingsRow icon={Settings} label={t('profile.typingIndicator')}>
              <Switch
                checked={settings.typingIndicators}
                onCheckedChange={(checked) => updateSettings({ typingIndicators: checked })}
              />
            </SettingsRow>
            <SettingsRow icon={Ghost} label={t('profile.incognitoMode')}>
              <Switch
                checked={Boolean(settings.incognitoMode)}
                onCheckedChange={(checked) => updateSettings({ incognitoMode: checked })}
              />
            </SettingsRow>
          </motion.div>

          <Separator />

          {/* General Section */}
          <motion.div variants={item as unknown as never} className="space-y-0.5">
            <SectionHeader icon={Settings} title={t('profile.general')} />
            <SettingsRow icon={Settings} label={t('settings.title')} onClick={() => navigateTo('settings')}>
              <ChevronRight className="size-3.5 text-muted-foreground" />
            </SettingsRow>
            <SettingsRow icon={Bell} label={t('profile.notifications')} onClick={() => navigateTo('notifications')}>
              <ChevronRight className="size-3.5 text-muted-foreground" />
            </SettingsRow>
            <SettingsRow icon={HardDrive} label={t('profile.storage')} onClick={() => navigateTo('storage')}>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {t('profile.storageUsed')}: {storageUsedLabel}
                </span>
                <ChevronRight className="size-3.5 text-muted-foreground" />
              </div>
            </SettingsRow>
            <SettingsRow icon={Globe} label={t('profile.language')} onClick={handleToggleLocale}>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-primary">{locale === 'en' ? 'English' : 'Русский'}</span>
                <ChevronRight className="size-3.5 text-muted-foreground" />
              </div>
            </SettingsRow>
          </motion.div>

          <Separator />

          {/* Channels & User Data */}
          <motion.div variants={item as unknown as never} className="space-y-0.5">
            <SectionHeader icon={Megaphone} title={t('profile.createChannel')} />
            <SettingsRow icon={Megaphone} label={t('profile.createChannel')} onClick={() => navigateTo('create-channel')}>
              <ChevronRight className="size-3.5 text-muted-foreground" />
            </SettingsRow>
          </motion.div>

          <Separator />

          <motion.div variants={item as unknown as never} className="space-y-0.5">
            <SectionHeader icon={UserCircle} title={t('profile.userData')} />
            <SettingsRow icon={UserCircle} label={t('profile.userData')} onClick={() => navigateTo('personal-data')}>
              <ChevronRight className="size-3.5 text-muted-foreground" />
            </SettingsRow>
            <SettingsRow icon={UserCircle} label={t('profile.personalChannel')} onClick={() => navigateTo('create-channel')}>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground truncate max-w-[120px]">{t('personalChannel.desc')}</span>
                <ChevronRight className="size-3.5 text-muted-foreground" />
              </div>
            </SettingsRow>
            <SettingsRow icon={UserIcon} label={t('profile.about')}>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground truncate max-w-[120px]">{user?.bio || '—'}</span>
                <ChevronRight className="size-3.5 text-muted-foreground" />
              </div>
            </SettingsRow>
            <SettingsRow icon={Star} label={t('profile.birthday')}>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{user?.birthday || '—'}</span>
                <ChevronRight className="size-3.5 text-muted-foreground" />
              </div>
            </SettingsRow>
            <SettingsRow icon={QrCode} label={t('profile.qrCode')} onClick={() => navigateTo('personal-data')}>
              <ChevronRight className="size-3.5 text-muted-foreground" />
            </SettingsRow>
          </motion.div>

          <Separator />

          {/* About Section */}
          <motion.div variants={item as unknown as never} className="space-y-2 pt-1">
            <div className="text-center">
              <p className="text-sm font-semibold text-foreground">{t('app.name')}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t('app.version')}</p>
            </div>
            <div className="flex items-center justify-center gap-4">
              <button className="text-xs text-primary hover:underline">{t('profile.terms')}</button>
              <span className="text-xs text-muted-foreground">|</span>
              <button className="text-xs text-primary hover:underline">{t('profile.privacyPolicy')}</button>
            </div>
          </motion.div>

          {/* Logout */}
          <motion.div variants={item as unknown as never} className="pt-2">
            <Button
              variant="destructive"
              className="w-full gap-2"
              onClick={logout}
            >
              <LogOut className="size-4" />
              {t('profile.logout')}
            </Button>
          </motion.div>
        </motion.div>
      </ScrollArea>

      {/* Devices Dialog */}
      <DevicesDialog
        open={devicesOpen}
        onOpenChange={setDevicesOpen}
        devices={deviceSessions}
        loading={devicesLoading}
        error={devicesError}
        revokingSessionId={revokingSessionId}
        revokingAllSessions={revokingAllSessions}
        deviceLink={deviceLink}
        deviceLinkLoading={deviceLinkLoading}
        deviceLinkError={deviceLinkError}
        revokingDeviceLink={revokingDeviceLink}
        onIssueDeviceLink={() => {
          void handleIssueDeviceLink();
        }}
        onRevokeDeviceLink={() => {
          void handleRevokeDeviceLink();
        }}
        onCopyDeviceLink={(value) => {
          void handleCopyDeviceLink(value);
        }}
        onRevokeSession={(sessionId) => {
          void handleRevokeSession(sessionId);
        }}
        onRevokeAllOthers={() => {
          void handleRevokeAllOtherSessions();
        }}
      />
    </div>
  );
}
