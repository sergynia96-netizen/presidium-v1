/**
 * Privacy Settings Screen
 *
 * Features:
 * - Last seen visibility
 * - Profile photo visibility
 * - About visibility
 * - Read receipts toggle
 * - Typing indicators toggle
 * - Online status toggle
 * - Chat lock settings
 * - Auto-lock timeout
 * - Biometric auth setup
 * - Blocked users list
 * - Data & storage
 * - Account deletion
 */

'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Eye,
  EyeOff,
  Clock,
  MessageSquare,
  Lock,
  Fingerprint,
  Smartphone,
  Trash2,
  Shield,
  UserX,
  Download,
  Loader2,
  Phone,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { signOut } from 'next-auth/react';
import { useAppStore } from '@/store/use-app-store';
import { cn } from '@/lib/utils';
import { exportAllDataToFile, deleteOwnAccount } from '@/lib/data-export';
import {
  getAppLockSettings,
  updateAppLockSettings,
  isBiometricAvailable,
  type AppLockSettings,
} from '@/lib/chat-lock';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

// ─── Types ───────────────────────────────────────────────────────────────────

type PrivacyLevel = 'everyone' | 'contacts' | 'nobody';

interface PrivacySettings {
  lastSeen: PrivacyLevel;
  profilePhoto: PrivacyLevel;
  phonePrivacy: PrivacyLevel;
  about: PrivacyLevel;
  readReceipts: boolean;
  typingIndicators: boolean;
  onlineStatus: boolean;
  contentProtection: boolean;
  groupAdds: PrivacyLevel;
  callFrom: PrivacyLevel;
}

interface ContactApiItem {
  id: string;
  customName?: string | null;
  isBlocked?: boolean;
  contact?: {
    id?: string;
    name?: string;
    email?: string;
    displayName?: string;
  };
}

const DEFAULT_PRIVACY: PrivacySettings = {
  lastSeen: 'contacts',
  profilePhoto: 'contacts',
  phonePrivacy: 'contacts',
  about: 'everyone',
  readReceipts: true,
  typingIndicators: true,
  onlineStatus: true,
  contentProtection: false,
  groupAdds: 'contacts',
  callFrom: 'everyone',
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function PrivacySettingsScreen() {
  const { goBack, settings, updateSettings, user, logout } = useAppStore();
  const [lockSettings, setLockSettings] = useState<AppLockSettings>(getAppLockSettings());
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [saved, setSaved] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [blockedDialogOpen, setBlockedDialogOpen] = useState(false);
  const [blockedContacts, setBlockedContacts] = useState<ContactApiItem[]>([]);
  const [blockedLoading, setBlockedLoading] = useState(false);
  const [blockedError, setBlockedError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  const privacy: PrivacySettings = {
    lastSeen: settings.privacyLastSeen || DEFAULT_PRIVACY.lastSeen,
    profilePhoto: settings.privacyProfilePhoto || DEFAULT_PRIVACY.profilePhoto,
    phonePrivacy: settings.privacyPhone || DEFAULT_PRIVACY.phonePrivacy,
    about: settings.privacyAbout || DEFAULT_PRIVACY.about,
    readReceipts: settings.readReceipts,
    typingIndicators: settings.typingIndicators,
    onlineStatus: settings.onlineStatus,
    contentProtection: settings.contentProtection,
    groupAdds: settings.privacyGroupAdds || DEFAULT_PRIVACY.groupAdds,
    callFrom: settings.privacyCallFrom || DEFAULT_PRIVACY.callFrom,
  };

  useEffect(() => {
    isBiometricAvailable().then(setBiometricAvailable);
  }, []);

  const updatePrivacy = (key: keyof PrivacySettings, value: PrivacySettings[keyof PrivacySettings]) => {
    switch (key) {
      case 'lastSeen':
        updateSettings({ privacyLastSeen: value as PrivacyLevel });
        break;
      case 'profilePhoto':
        updateSettings({ privacyProfilePhoto: value as PrivacyLevel });
        break;
      case 'about':
        updateSettings({ privacyAbout: value as PrivacyLevel });
        break;
      case 'phonePrivacy':
        updateSettings({ privacyPhone: value as PrivacyLevel });
        break;
      case 'readReceipts':
        updateSettings({ readReceipts: value as boolean });
        break;
      case 'typingIndicators':
        updateSettings({ typingIndicators: value as boolean });
        break;
      case 'onlineStatus':
        updateSettings({ onlineStatus: value as boolean });
        break;
      case 'contentProtection':
        updateSettings({ contentProtection: value as boolean });
        break;
      case 'groupAdds':
        updateSettings({ privacyGroupAdds: value as PrivacyLevel });
        break;
      case 'callFrom':
        updateSettings({ privacyCallFrom: value as PrivacyLevel });
        break;
      default:
        break;
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const updateLockSetting = async (updates: Partial<AppLockSettings>) => {
    await updateAppLockSettings(updates);
    setLockSettings({ ...lockSettings, ...updates });
  };

  const showActionMessage = (type: 'success' | 'error', text: string) => {
    setActionMessage({ type, text });
    setTimeout(() => setActionMessage(null), 2500);
  };

  const handleExportData = async () => {
    if (!user?.id) {
      showActionMessage('error', 'Не удалось определить пользователя');
      return;
    }

    setIsExporting(true);
    try {
      const payload = await exportAllDataToFile(user.id, 'json', {
        includeAiConversations: true,
      });
      if (payload.warnings.length > 0) {
        showActionMessage('success', `Экспорт завершён с предупреждениями (${payload.warnings.length})`);
        return;
      }
      showActionMessage('success', 'Экспорт завершён');
    } catch (error) {
      showActionMessage('error', error instanceof Error ? error.message : 'Не удалось выполнить экспорт');
    } finally {
      setIsExporting(false);
    }
  };

  const handleOpenBlockedUsers = async () => {
    setBlockedDialogOpen(true);
    setBlockedLoading(true);
    setBlockedError(null);

    try {
      const response = await fetch('/api/contacts');
      if (!response.ok) {
        throw new Error('Не удалось загрузить список контактов');
      }

      const data = (await response.json()) as { contacts?: ContactApiItem[] };
      const blocked = (Array.isArray(data.contacts) ? data.contacts : []).filter((entry) => Boolean(entry.isBlocked));
      setBlockedContacts(blocked);
    } catch (error) {
      setBlockedError(error instanceof Error ? error.message : 'Не удалось загрузить список блокировок');
      setBlockedContacts([]);
    } finally {
      setBlockedLoading(false);
    }
  };

  const handleUnblockContact = async (contact: ContactApiItem) => {
    try {
      const response = await fetch(`/api/contacts/${encodeURIComponent(contact.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isBlocked: false }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || 'Не удалось разблокировать контакт');
      }

      setBlockedContacts((prev) => prev.filter((item) => item.id !== contact.id));
    } catch (error) {
      setBlockedError(error instanceof Error ? error.message : 'Не удалось разблокировать контакт');
    }
  };

  const handleDeleteAccount = async () => {
    if (!user?.id) {
      showActionMessage('error', 'Пользователь не найден');
      return;
    }

    if (deleteConfirmText.trim().toUpperCase() !== 'DELETE') {
      showActionMessage('error', 'Введите DELETE для подтверждения');
      return;
    }

    setIsDeletingAccount(true);
    try {
      await deleteOwnAccount(user.id);

      await signOut({ redirect: false });
      logout();
      setDeleteDialogOpen(false);
      setDeleteConfirmText('');
      showActionMessage('success', 'Аккаунт удалён');
    } catch (error) {
      showActionMessage('error', error instanceof Error ? error.message : 'Не удалось удалить аккаунт');
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const privacyLevelLabel = (level: PrivacyLevel): string => {
    switch (level) {
      case 'everyone': return 'Все';
      case 'contacts': return 'Контакты';
      case 'nobody': return 'Никто';
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50 shrink-0">
        <Button variant="ghost" size="icon" className="size-9" onClick={goBack}>
          <ArrowLeft className="size-5" />
        </Button>
        <h1 className="text-lg font-semibold flex-1">Приватность</h1>
        {saved && (
          <motion.span
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-xs text-emerald-500"
          >
            Сохранено
          </motion.span>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="py-4">
          {/* ── Last Seen & Online ─────────────────────────────── */}
          <div className="px-4 mb-2">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Видимость
            </h3>
          </div>

          <PrivacyOption
            icon={<Clock className="size-4" />}
            title="Последняя активность"
            value={privacyLevelLabel(privacy.lastSeen)}
            onClick={() => updatePrivacy('lastSeen', cyclePrivacy(privacy.lastSeen))}
          />
          <PrivacyOption
            icon={<Eye className="size-4" />}
            title="Фото профиля"
            value={privacyLevelLabel(privacy.profilePhoto)}
            onClick={() => updatePrivacy('profilePhoto', cyclePrivacy(privacy.profilePhoto))}
          />
          <PrivacyOption
            icon={<MessageSquare className="size-4" />}
            title="О себе"
            value={privacyLevelLabel(privacy.about)}
            onClick={() => updatePrivacy('about', cyclePrivacy(privacy.about))}
          />
          <PrivacyOption
            icon={<Phone className="size-4" />}
            title="Номер телефона"
            value={privacyLevelLabel(privacy.phonePrivacy)}
            onClick={() => updatePrivacy('phonePrivacy', cyclePrivacy(privacy.phonePrivacy))}
          />
          <PrivacyOption
            icon={<EyeOff className="size-4" />}
            title="Статус онлайн"
            value={privacy.onlineStatus ? 'Виден' : 'Скрыт'}
            onClick={() => updatePrivacy('onlineStatus', !privacy.onlineStatus)}
          />

          <Separator className="my-4" />

          {/* ── Messages ───────────────────────────────────────── */}
          <div className="px-4 mb-2">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Сообщения
            </h3>
          </div>

          <ToggleOption
            icon={<MessageSquare className="size-4" />}
            title="Отчёты о прочтении"
            description="Отправлять и получать синие галочки"
            checked={privacy.readReceipts}
            onCheckedChange={(checked) => updatePrivacy('readReceipts', checked)}
          />
          <ToggleOption
            icon={<MessageSquare className="size-4" />}
            title="Индикатор набора"
            description="Показывать когда вы печатаете"
            checked={privacy.typingIndicators}
            onCheckedChange={(checked) => updatePrivacy('typingIndicators', checked)}
          />
          <ToggleOption
            icon={<Shield className="size-4" />}
            title="Защита контента"
            description="Ограничить пересылку и копирование входящих сообщений"
            checked={privacy.contentProtection}
            onCheckedChange={(checked) => updatePrivacy('contentProtection', checked)}
          />
          <PrivacyOption
            icon={<UserX className="size-4" />}
            title="Добавление в группы"
            value={privacyLevelLabel(privacy.groupAdds)}
            onClick={() => updatePrivacy('groupAdds', cyclePrivacy(privacy.groupAdds))}
          />

          <Separator className="my-4" />

          {/* ── Calls ──────────────────────────────────────────── */}
          <div className="px-4 mb-2">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Звонки
            </h3>
          </div>

          <PrivacyOption
            icon={<Smartphone className="size-4" />}
            title="Кто может звонить"
            value={privacyLevelLabel(privacy.callFrom)}
            onClick={() => updatePrivacy('callFrom', cyclePrivacy(privacy.callFrom))}
          />

          <Separator className="my-4" />

          {/* ── Security ───────────────────────────────────────── */}
          <div className="px-4 mb-2">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Безопасность
            </h3>
          </div>

          <ToggleOption
            icon={<Lock className="size-4" />}
            title="Блокировка чатов"
            description="Защищать чаты PIN-кодом"
            checked={lockSettings.enabled}
            onCheckedChange={(checked) => updateLockSetting({ enabled: checked })}
          />

          {lockSettings.enabled && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="px-4 pb-4 space-y-3"
            >
              {/* Auto-lock timeout */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Clock className="size-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Автоблокировка</p>
                    <p className="text-xs text-muted-foreground">
                      {lockSettings.autoLockTimeout < 0
                        ? 'Никогда'
                        : lockSettings.autoLockTimeout === 0
                          ? 'Сразу'
                          : `Через ${lockSettings.autoLockTimeout}с`}
                    </p>
                  </div>
                </div>
                <select
                  value={lockSettings.autoLockTimeout}
                  onChange={(e) => updateLockSetting({ autoLockTimeout: Number(e.target.value) })}
                  className="text-sm bg-muted rounded-md px-2 py-1 border-0"
                >
                  <option value={0}>Сразу</option>
                  <option value={30}>30 сек</option>
                  <option value={60}>1 мин</option>
                  <option value={300}>5 мин</option>
                  <option value={-1}>Никогда</option>
                </select>
              </div>

              {/* Biometric */}
              {biometricAvailable && (
                <ToggleOption
                  icon={<Fingerprint className="size-4" />}
                  title="Биометрия"
                  description="Использовать отпечаток/Face ID"
                  checked={lockSettings.lockMethod === 'biometric' || lockSettings.lockMethod === 'both'}
                  onCheckedChange={(checked) =>
                    updateLockSetting({
                      lockMethod: checked ? 'biometric' : 'pin',
                    })
                  }
                />
              )}
            </motion.div>
          )}

          <Separator className="my-4" />

          {/* ── Data ───────────────────────────────────────────── */}
          <div className="px-4 mb-2">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Данные
            </h3>
          </div>

          <ActionOption
            icon={<Download className="size-4" />}
            title="Экспорт данных"
            description="Скачать все ваши данные"
            onClick={() => {
              void handleExportData();
            }}
            loading={isExporting}
          />
          <ActionOption
            icon={<Shield className="size-4" />}
            title="Заблокированные"
            description="Управление заблокированными контактами"
            onClick={() => {
              void handleOpenBlockedUsers();
            }}
          />
          <ActionOption
            icon={<Trash2 className="size-4 text-red-500" />}
            title="Удалить аккаунт"
            description="Удалить аккаунт и все данные"
            onClick={() => setDeleteDialogOpen(true)}
            danger
          />

          {actionMessage && (
            <div
              className={cn(
                'mx-4 mt-2 rounded-lg border px-3 py-2 text-xs',
                actionMessage.type === 'success'
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600'
                  : 'border-destructive/30 bg-destructive/10 text-destructive',
              )}
            >
              {actionMessage.text}
            </div>
          )}

          <div className="h-8" />
        </div>
      </ScrollArea>

      <Dialog open={blockedDialogOpen} onOpenChange={setBlockedDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Заблокированные контакты</DialogTitle>
            <DialogDescription>
              Управление списком заблокированных контактов.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            {blockedLoading && (
              <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
                <Loader2 className="mr-2 size-4 animate-spin" />
                Загрузка...
              </div>
            )}

            {!blockedLoading && blockedError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {blockedError}
              </div>
            )}

            {!blockedLoading && !blockedError && blockedContacts.length === 0 && (
              <p className="py-2 text-sm text-muted-foreground">Нет заблокированных контактов.</p>
            )}

            {!blockedLoading &&
              !blockedError &&
              blockedContacts.map((contact) => {
                const displayName =
                  contact.customName ||
                  contact.contact?.displayName ||
                  contact.contact?.name ||
                  contact.contact?.email ||
                  'Unknown';

                return (
                  <div key={contact.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                    <span className="truncate pr-3 text-sm">{displayName}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        void handleUnblockContact(contact);
                      }}
                    >
                      Разблокировать
                    </Button>
                  </div>
                );
              })}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Удаление аккаунта</DialogTitle>
            <DialogDescription>
              Это действие необратимо. Для подтверждения введите <span className="font-semibold">DELETE</span>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Input
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="DELETE"
              disabled={isDeletingAccount}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={isDeletingAccount}>
              Отмена
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                void handleDeleteAccount();
              }}
              disabled={isDeletingAccount || deleteConfirmText.trim().toUpperCase() !== 'DELETE'}
            >
              {isDeletingAccount ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Удалить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function cyclePrivacy(current: PrivacyLevel): PrivacyLevel {
  const order: PrivacyLevel[] = ['everyone', 'contacts', 'nobody'];
  const idx = order.indexOf(current);
  return order[(idx + 1) % order.length];
}

interface PrivacyOptionProps {
  icon: React.ReactNode;
  title: string;
  value: string;
  onClick: () => void;
}

function PrivacyOption({ icon, title, value, onClick }: PrivacyOptionProps) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors w-full"
    >
      <div className="text-muted-foreground">{icon}</div>
      <span className="flex-1 text-left text-sm font-medium">{title}</span>
      <span className="text-sm text-muted-foreground">{value}</span>
    </button>
  );
}

interface ToggleOptionProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

function ToggleOption({ icon, title, description, checked, onCheckedChange }: ToggleOptionProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="text-muted-foreground">{icon}</div>
      <div className="flex-1">
        <p className="text-sm font-medium">{title}</p>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

interface ActionOptionProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
  onClick: () => void;
  danger?: boolean;
  loading?: boolean;
}

function ActionOption({ icon, title, description, onClick, danger, loading = false }: ActionOptionProps) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={cn(
        'flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors w-full disabled:cursor-not-allowed disabled:opacity-60',
        danger && 'text-red-500',
      )}
    >
      <div className={danger ? 'text-red-500' : 'text-muted-foreground'}>
        {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      </div>
      <div className="flex-1 text-left">
        <p className={cn('text-sm font-medium', danger && 'text-red-500')}>{title}</p>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
    </button>
  );
}
