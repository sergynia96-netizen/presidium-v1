'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  User,
  Phone,
  Mail,
  Megaphone,
  Cake,
  ChevronRight,
  Pencil,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAppStore } from '@/store/use-app-store';
import { useT } from '@/lib/i18n';
import { toast } from '@/hooks/use-toast';
import QRCode from 'qrcode';

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

function QRCodePlaceholder({ value }: { value: string }) {
  const { t } = useT();
  const [dataUrl, setDataUrl] = useState<string>('');

  useEffect(() => {
    let cancelled = false;

    const generate = async () => {
      try {
        const url = await QRCode.toDataURL(value, {
          width: 180,
          margin: 1,
          color: {
            dark: '#111827',
            light: '#FFFFFF',
          },
        });
        if (!cancelled) {
          setDataUrl(url);
        }
      } catch {
        if (!cancelled) {
          setDataUrl('');
        }
      }
    };

    void generate();
    return () => {
      cancelled = true;
    };
  }, [value]);

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="p-4 bg-white rounded-xl shadow-sm">
        {dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={dataUrl} alt="QR code" className="size-[180px]" />
        ) : (
          <div className="flex size-[180px] items-center justify-center rounded-lg border border-dashed border-gray-300 text-xs text-gray-500">
            QR
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{t('profile.shareQR')}</p>
    </div>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="border-border/50">
      <CardContent className="p-0">
        <div className="px-4 py-2.5 border-b border-border/30">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {title}
          </h3>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function DataRow({
  icon: Icon,
  label,
  value,
  placeholder,
  action,
}: {
  icon: React.ElementType;
  label: string;
  value?: string;
  placeholder?: string;
  action?: string;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="flex items-center justify-center size-8 rounded-lg bg-muted/60 shrink-0">
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium block">{label}</span>
        {value ? (
          <span className="text-xs text-muted-foreground truncate block">{value}</span>
        ) : placeholder ? (
          <span className="text-xs text-muted-foreground/60 truncate block italic">
            {placeholder}
          </span>
        ) : null}
      </div>
      {action && (
        <span className="text-xs text-primary font-medium shrink-0">{action}</span>
      )}
      {!action && (
        <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
      )}
    </div>
  );
}

export default function PersonalDataScreen() {
  const { goBack, user, setView } = useAppStore();
  const { t } = useT();

  const [editingBio, setEditingBio] = useState(false);
  const [bio, setBio] = useState(user?.bio || '');
  const [editingBirthday, setEditingBirthday] = useState(false);
  const [birthday, setBirthday] = useState(user?.birthday || '');
  const qrValue = `presidium://user/${user?.id || 'unknown'}?email=${encodeURIComponent(user?.email || '')}`;

  const persistProfilePatch = async (patch: { bio?: string; birthday?: string }) => {
    if (!user?.id) return false;

    const res = await fetch(`/api/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });

    const payload = (await res.json().catch(() => ({}))) as {
      error?: string;
      user?: {
        bio?: string | null;
        birthday?: string | null;
      };
    };

    if (!res.ok) {
      throw new Error(payload.error || 'Failed to save profile data');
    }

    useAppStore.setState((state) => ({
      user: state.user
        ? {
            ...state.user,
            bio: payload.user?.bio ?? state.user.bio,
            birthday: payload.user?.birthday ?? state.user.birthday,
          }
        : state.user,
    }));

    return true;
  };

  const formatBirthday = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50 shrink-0">
        <Button variant="ghost" size="icon" className="size-9" onClick={goBack}>
          <ArrowLeft className="size-5" />
        </Button>
        <h1 className="text-lg font-semibold">{t('personalData.title')}</h1>
      </div>

      <ScrollArea className="flex-1">
        <motion.div
          variants={container as unknown as never}
          initial="hidden"
          animate="show"
          className="mx-auto max-w-2xl p-4 lg:p-6 space-y-4 pb-8"
        >
          {/* About Section */}
          <motion.div variants={item as unknown as never}>
            <SectionCard title={t('personalData.about')}>
              {editingBio ? (
                <div className="p-4 space-y-2">
                  <Textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    className="min-h-[80px] resize-none"
                    placeholder={t('personalData.aboutPlaceholder')}
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => {
                        setEditingBio(false);
                        setBio(user?.bio || '');
                      }}
                    >
                      {t('editProfile.cancel')}
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1"
                      onClick={async () => {
                        try {
                          await persistProfilePatch({ bio: bio.trim() });
                          setEditingBio(false);
                          toast({ title: 'Saved' });
                        } catch (error) {
                          toast({
                            variant: 'destructive',
                            title: error instanceof Error ? error.message : 'Failed to save',
                          });
                        }
                      }}
                    >
                      {t('editProfile.save')}
                    </Button>
                  </div>
                </div>
              ) : (
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-accent/30 transition-colors rounded-b-lg"
                  onClick={() => setEditingBio(true)}
                >
                  <div className="flex items-center justify-center size-8 rounded-lg bg-muted/60 shrink-0">
                    <User className="size-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    {bio ? (
                      <span className="text-sm block">{bio}</span>
                    ) : (
                      <span className="text-sm text-muted-foreground/60 italic block">
                        {t('personalData.setBio')}
                      </span>
                    )}
                  </div>
                  <Pencil className="size-3.5 text-muted-foreground shrink-0" />
                </div>
              )}
            </SectionCard>
          </motion.div>

          {/* Contacts Section */}
          <motion.div variants={item as unknown as never}>
            <SectionCard title={t('personalData.contacts')}>
              <DataRow
                icon={Phone}
                label={t('editProfile.phone')}
                value={user?.phone}
                placeholder={t('personalData.addPhone')}
              />
              <div className="border-t border-border/20" />
              <DataRow
                icon={Mail}
                label={t('editProfile.email')}
                value={user?.email}
                placeholder={t('personalData.addEmail')}
              />
            </SectionCard>
          </motion.div>

          {/* Personal Channel Section */}
          <motion.div variants={item as unknown as never}>
            <SectionCard title={t('personalData.personalChannel')}>
              <button
                type="button"
                className="flex items-center gap-3 px-4 py-3 w-full text-left hover:bg-accent/30 transition-colors rounded-b-lg"
                onClick={() => setView('create-channel')}
              >
                <div className="flex items-center justify-center size-8 rounded-lg bg-muted/60 shrink-0">
                  <Megaphone className="size-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm block">{t('profile.createChannel')}</span>
                  <span className="text-xs text-muted-foreground block">{t('personalChannel.desc')}</span>
                </div>
                <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
              </button>
            </SectionCard>
          </motion.div>

          {/* Birthday Section */}
          <motion.div variants={item as unknown as never}>
            <SectionCard title={t('personalData.birthday')}>
              {editingBirthday ? (
                <div className="p-4 space-y-2">
                  <Label className="text-sm text-muted-foreground">
                    {t('personalData.birthday')}
                  </Label>
                  <Input
                    type="date"
                    value={birthday}
                    onChange={(e) => setBirthday(e.target.value)}
                    className="h-10"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => {
                        setEditingBirthday(false);
                        setBirthday(user?.birthday || '');
                      }}
                    >
                      {t('editProfile.cancel')}
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1"
                      onClick={async () => {
                        try {
                          await persistProfilePatch({ birthday });
                          setEditingBirthday(false);
                          toast({ title: 'Saved' });
                        } catch (error) {
                          toast({
                            variant: 'destructive',
                            title: error instanceof Error ? error.message : 'Failed to save',
                          });
                        }
                      }}
                    >
                      {t('editProfile.save')}
                    </Button>
                  </div>
                </div>
              ) : (
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-accent/30 transition-colors rounded-b-lg"
                  onClick={() => setEditingBirthday(true)}
                >
                  <div className="flex items-center justify-center size-8 rounded-lg bg-muted/60 shrink-0">
                    <Cake className="size-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    {birthday ? (
                      <span className="text-sm block">{formatBirthday(birthday)}</span>
                    ) : (
                      <span className="text-sm text-muted-foreground/60 italic block">
                        {t('personalData.birthday')}
                      </span>
                    )}
                  </div>
                  <Pencil className="size-3.5 text-muted-foreground shrink-0" />
                </div>
              )}
            </SectionCard>
          </motion.div>

          {/* QR Code Section */}
          <motion.div variants={item as unknown as never}>
            <SectionCard title={t('profile.qrCode')}>
              <div className="p-4 flex justify-center">
                <QRCodePlaceholder value={qrValue} />
              </div>
            </SectionCard>
          </motion.div>
        </motion.div>
      </ScrollArea>
    </div>
  );
}
