'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Camera, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useAppStore } from '@/store/use-app-store';
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

export default function EditProfileScreen() {
  const { goBack, user } = useAppStore();
  const { t } = useT();

  const [name, setName] = useState(user?.name || '');
  const [username, setUsername] = useState(user?.username?.replace('@', '') || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [email, setEmail] = useState(user?.email || '');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const handleSave = async () => {
    if (!user?.id || !name.trim() || !username.trim() || !email.trim()) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          username: username.trim().replace(/^@+/, ''),
          bio: bio.trim(),
          phone: phone.trim(),
          email: email.trim(),
        }),
      });

      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
        user?: {
          name?: string;
          email?: string;
          username?: string | null;
          avatar?: string | null;
          bio?: string | null;
          phone?: string | null;
          birthday?: string | null;
          status?: 'online' | 'away' | 'offline' | null;
        };
      };

      if (!res.ok) {
        throw new Error(payload.error || 'Failed to save profile');
      }

      if (payload.user) {
        useAppStore.setState((state) => ({
          user: state.user
            ? {
                ...state.user,
                name: payload.user?.name || state.user.name,
                email: payload.user?.email || state.user.email,
                username: payload.user?.username || undefined,
                avatar: payload.user?.avatar || state.user.avatar,
                bio: payload.user?.bio || undefined,
                phone: payload.user?.phone || undefined,
                birthday: payload.user?.birthday || undefined,
                status: payload.user?.status || state.user.status,
              }
            : state.user,
        }));
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      toast({
        title: 'Profile updated',
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: error instanceof Error ? error.message : 'Failed to save profile',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50 shrink-0">
        <Button variant="ghost" size="icon" className="size-9" onClick={goBack}>
          <ArrowLeft className="size-5" />
        </Button>
        <h1 className="text-lg font-semibold flex-1">{t('editProfile.title')}</h1>
        <Button
          size="sm"
          className={cn(
            'gap-1.5 transition-all',
            saved
              ? 'bg-emerald-600 hover:bg-emerald-600 text-white'
              : ''
          )}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? (
            <div className="size-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : saved ? (
            <Check className="size-4" />
          ) : null}
          {saved ? t('editProfile.saved').split(' ')[0] : saving ? '...' : t('editProfile.save')}
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <motion.div
          variants={container as unknown as never}
          initial="hidden"
          animate="show"
          className="mx-auto max-w-2xl p-4 lg:p-6 space-y-5 pb-8"
        >
          {/* Avatar with camera overlay */}
          <motion.div variants={item as unknown as never} className="flex justify-center pt-4 pb-2">
            <button
              type="button"
              className="relative group"
            >
              <Avatar className="size-28">
                <AvatarFallback className="text-3xl font-bold bg-primary text-primary-foreground">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/0 group-hover:bg-black/40 transition-colors">
                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center size-12 rounded-full bg-background/90">
                  <Camera className="size-5 text-foreground" />
                </div>
              </div>
            </button>
          </motion.div>

          <Separator />

          {/* Name field */}
          <motion.div variants={item as unknown as never} className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground">
              {t('editProfile.name')}
            </Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-11"
              autoFocus
            />
          </motion.div>

          {/* Username field with @ prefix */}
          <motion.div variants={item as unknown as never} className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground">
              {t('editProfile.username')}
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                @
              </span>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="h-11 pl-8"
              />
            </div>
          </motion.div>

          {/* Bio field */}
          <motion.div variants={item as unknown as never} className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground">
              {t('editProfile.bio')}
            </Label>
            <Textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="min-h-[100px] resize-none"
              placeholder={t('personalData.aboutPlaceholder')}
            />
          </motion.div>

          <Separator />

          {/* Phone field */}
          <motion.div variants={item as unknown as never} className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground">
              {t('editProfile.phone')}
            </Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="h-11"
              placeholder="+1 (555) 000-0000"
            />
          </motion.div>

          {/* Email field */}
          <motion.div variants={item as unknown as never} className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground">
              {t('editProfile.email')}
            </Label>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11"
              type="email"
              placeholder="you@example.com"
            />
          </motion.div>

          <Separator />

          {/* Cancel button */}
          <motion.div variants={item as unknown as never} className="pt-2">
            <Button
              variant="outline"
              className="w-full"
              onClick={goBack}
            >
              {t('editProfile.cancel')}
            </Button>
          </motion.div>
        </motion.div>
      </ScrollArea>
    </div>
  );
}
