'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  MoreVertical,
  Phone,
  AtSign,
  FileText,
  Share2,
  Pencil,
  Trash2,
  Ban,
  Users,
  Image,
  Music,
  Film,
  File,
  Mic,
  Link2,
  BookOpen,
  Gift,
  Newspaper,
  Eye,
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { useAppStore } from '@/store/use-app-store';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { TranslationKey } from '@/lib/i18n';
import { toast } from 'sonner';

function getInitials(name: string) {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

const MEDIA_COLORS = [
  'bg-emerald-brand/20',
  'bg-amber-ai/20',
  'bg-blue-400/20',
  'bg-rose-400/20',
  'bg-violet-400/20',
  'bg-teal-400/20',
  'bg-orange-400/20',
  'bg-pink-400/20',
  'bg-cyan-400/20',
  'bg-lime-400/20',
  'bg-indigo-400/20',
  'bg-fuchsia-400/20',
];

const MOCK_GROUPS = [
  { name: 'PRESIDIUM Dev Team', members: 4 },
  { name: 'Security Research', members: 3 },
  { name: 'Product Design', members: 3 },
];

export default function ContactProfileCard() {
  const { t } = useT();
  const { activeChatId, chats, contacts, goBack, settings, updateSettings } = useAppStore();
  const [activeTab, setActiveTab] = useState('posts');

  const chat = useMemo(
    () => chats.find((c) => c.id === activeChatId),
    [chats, activeChatId]
  );

  const contact = useMemo(() => {
    if (!chat) return null;
    return contacts.find((c) => c.name === chat.name) || null;
  }, [chat, contacts]);

  const tabs = [
    { id: 'posts', labelKey: 'upc.posts' as TranslationKey, icon: Newspaper },
    { id: 'links', labelKey: 'upc.links' as TranslationKey, icon: Link2 },
    { id: 'media', labelKey: 'upc.media' as TranslationKey, icon: Image },
    { id: 'audio', labelKey: 'upc.audio' as TranslationKey, icon: Music },
    { id: 'video', labelKey: 'upc.video' as TranslationKey, icon: Film },
    { id: 'documents', labelKey: 'upc.documents' as TranslationKey, icon: File },
    { id: 'photos', labelKey: 'upc.photos' as TranslationKey, icon: Image },
    { id: 'publications', labelKey: 'upc.publications' as TranslationKey, icon: BookOpen },
    { id: 'voice', labelKey: 'upc.voiceMessages' as TranslationKey, icon: Mic },
    { id: 'gif', labelKey: 'upc.gif' as TranslationKey, icon: Gift },
    { id: 'groups', labelKey: 'upc.commonGroups' as TranslationKey, icon: Users },
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case 'posts':
        return (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
            <Newspaper className="size-10 opacity-30" />
            <p className="text-sm">{t('upc.noPosts')}</p>
          </div>
        );

      case 'links':
        return (
          <div className="grid grid-cols-1 gap-2 p-4">
            {['https://presidium.app', 'https://github.com/presidium', 'https://docs.presidium.app'].map(
              (link, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-lg border bg-card p-3"
                >
                  <Link2 className="size-4 shrink-0 text-emerald-brand" />
                  <span className="truncate text-sm text-muted-foreground">{link}</span>
                </div>
              )
            )}
          </div>
        );

      case 'media':
      case 'photos':
        return (
          <div className="grid grid-cols-3 gap-1 p-4">
            {MEDIA_COLORS.map((color, i) => (
              <div
                key={i}
                className={cn(
                  'aspect-square rounded-md',
                  color
                )}
              />
            ))}
          </div>
        );

      case 'audio':
      case 'music':
        return (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-lg border bg-card p-3"
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-brand/10">
                  <Music className="size-4 text-emerald-brand" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">Track {i + 1}</p>
                  <p className="text-xs text-muted-foreground">2:{String(30 + i * 12).padStart(2, '0')}</p>
                </div>
              </div>
            ))}
          </div>
        );

      case 'video':
        return (
          <div className="grid grid-cols-2 gap-2 p-4">
            {MEDIA_COLORS.slice(0, 6).map((color, i) => (
              <div
                key={i}
                className={cn(
                  'relative aspect-video rounded-md',
                  color
                )}
              >
                <div className="absolute inset-0 flex items-center justify-center">
                  <Film className="size-5 text-muted-foreground/40" />
                </div>
              </div>
            ))}
          </div>
        );

      case 'documents':
        return (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-lg border bg-card p-3"
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded bg-blue-500/10">
                  <FileText className="size-4 text-blue-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">Document_{i + 1}.pdf</p>
                  <p className="text-xs text-muted-foreground">{(i + 1) * 240} KB</p>
                </div>
              </div>
            ))}
          </div>
        );

      case 'publications':
        return (
          <div className="flex flex-col gap-3 p-4">
            {['Research Notes', 'Weekly Update', 'Team Blog'].map((title, i) => (
              <div
                key={i}
                className="rounded-lg border bg-card p-3"
              >
                <div className="flex items-center gap-2">
                  <BookOpen className="size-4 text-emerald-brand" />
                  <p className="text-sm font-medium">{title}</p>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Short preview of the publication content goes here...
                </p>
              </div>
            ))}
          </div>
        );

      case 'voice':
        return (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-lg border bg-card p-3"
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-brand/10">
                  <Mic className="size-4 text-emerald-brand" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{t('upc.voiceMessages')}</p>
                  <p className="text-xs text-muted-foreground">0:{String(15 + i * 20).padStart(2, '0')}</p>
                </div>
              </div>
            ))}
          </div>
        );

      case 'gif':
        return (
          <div className="grid grid-cols-3 gap-1 p-4">
            {MEDIA_COLORS.slice(0, 9).map((color, i) => (
              <div
                key={i}
                className={cn(
                  'aspect-square rounded-md flex items-center justify-center',
                  color
                )}
              >
                <Gift className="size-4 text-muted-foreground/40" />
              </div>
            ))}
          </div>
        );

      case 'groups':
        return (
          <div className="flex flex-col gap-2 p-4">
            {MOCK_GROUPS.map((group, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-lg border bg-card p-3"
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-brand/10">
                  <Users className="size-4 text-emerald-brand" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{group.name}</p>
                  <p className="text-xs text-muted-foreground">{group.members} members</p>
                </div>
              </div>
            ))}
          </div>
        );

      default:
        return null;
    }
  };

  if (!chat) return null;

  const displayName = chat.name;
  const displayInitials = getInitials(displayName);
  const phoneVisible =
    settings.privacyPhone === 'everyone' ||
    (settings.privacyPhone === 'contacts' && Boolean(contact));
  const hasLastSeenException = settings.lastSeenExceptions.includes(chat.id);

  const handleShareContact = async () => {
    const lines = [
      displayName,
      contact?.username || '',
      contact?.phone || '',
      contact?.bio || '',
    ].filter(Boolean);
    const payload = lines.join('\n');

    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({
          title: displayName,
          text: payload,
        });
        return;
      }

      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(payload);
        toast.success(t('upc.shareCopied'));
        return;
      }

      toast.error(t('msg.copyFailed'));
    } catch {
      // User-cancelled share should not be treated as hard error.
    }
  };

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 250 }}
      className="absolute inset-0 z-50 flex flex-col bg-background"
    >
      {/* Header */}
      <header className="flex shrink-0 items-center gap-3 border-b bg-background/95 px-3 py-2.5 backdrop-blur-sm">
        <Button
          variant="ghost"
          size="icon"
          className="size-9 shrink-0"
          onClick={goBack}
        >
          <ArrowLeft className="size-5" />
        </Button>
        <h1 className="flex-1 truncate text-sm font-semibold">{displayName}</h1>
        <Button variant="ghost" size="icon" className="size-9 shrink-0">
          <MoreVertical className="size-5" />
        </Button>
      </header>

      <ScrollArea className="flex-1">
        {/* Profile section */}
        <div className="flex flex-col items-center gap-3 px-4 pt-6 pb-4">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1 }}
          >
            <Avatar className="size-24">
              <AvatarFallback className="bg-surface-secondary text-2xl font-bold text-foreground">
                {displayInitials}
              </AvatarFallback>
            </Avatar>
          </motion.div>

          <motion.div
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.15 }}
            className="flex flex-col items-center gap-1"
          >
            <h2 className="text-lg font-semibold">{displayName}</h2>
            {contact?.username && (
              <p className="text-sm text-muted-foreground">{contact.username}</p>
            )}
            {contact?.status === 'online' && (
              <Badge variant="secondary" className="bg-emerald-brand/10 text-emerald-brand text-xs">
                {t('chat.online')}
              </Badge>
            )}
          </motion.div>

          {contact?.bio && (
            <motion.p
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="text-center text-sm text-muted-foreground"
            >
              {contact.bio}
            </motion.p>
          )}
        </div>

        <Separator />

        {/* Contact Info */}
        <div className="px-4 py-3">
          <div className="mb-2 flex items-center justify-between rounded-lg border border-border/50 px-3 py-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Eye className="size-3.5" />
              <span>{t('profile.lastSeen')}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() =>
                updateSettings({
                  lastSeenExceptions: hasLastSeenException
                    ? settings.lastSeenExceptions.filter((id) => id !== chat.id)
                    : [...settings.lastSeenExceptions, chat.id],
                })
              }
            >
              {hasLastSeenException ? t('profile.exceptionRemove') : t('profile.exceptionAdd')}
            </Button>
          </div>
          {contact?.phone && (
            <div className="flex items-center gap-3 py-2.5">
              <Phone className="size-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">{t('upc.phoneNumber')}</p>
                <p className="text-sm">{phoneVisible ? contact.phone : t('profile.hidden')}</p>
              </div>
            </div>
          )}
          {contact?.username && (
            <div className="flex items-center gap-3 py-2.5">
              <AtSign className="size-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">{t('upc.username')}</p>
                <p className="text-sm">{contact.username}</p>
              </div>
            </div>
          )}
          {contact?.bio && (
            <div className="flex items-center gap-3 py-2.5">
              <FileText className="size-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">{t('upc.bio')}</p>
                <p className="text-sm">{contact.bio}</p>
              </div>
            </div>
          )}
        </div>

        <Separator />

        {/* Tabbed media section */}
        <div className="flex flex-col">
          {/* Scrollable tabs */}
          <div className="flex gap-1 overflow-x-auto px-2 py-3 no-scrollbar">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                    isActive
                      ? 'bg-emerald-brand text-white'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
                  )}
                >
                  <Icon className="size-3" />
                  {t(tab.labelKey)}
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15 }}
          >
            {renderTabContent()}
          </motion.div>
        </div>

        <Separator />

        {/* Action buttons */}
        <div className="grid grid-cols-3 gap-2 p-4">
          <Button
            variant="outline"
            className="flex items-center justify-center gap-2 text-sm"
            onClick={handleShareContact}
          >
            <Share2 className="size-4" />
            {t('upc.share')}
          </Button>
          <Button
            variant="outline"
            className="flex items-center justify-center gap-2 text-sm"
          >
            <Pencil className="size-4" />
            {t('upc.edit')}
          </Button>
          <Button
            variant="outline"
            className="flex items-center justify-center gap-2 text-sm"
  >
            <Trash2 className="size-4 text-red-500" />
            {t('upc.delete')}
          </Button>
          <Button
            variant="outline"
            className="flex items-center justify-center gap-2 text-sm text-red-500 border-red-500/30 hover:bg-red-500/10"
          >
            <Ban className="size-4" />
            {t('upc.block')}
          </Button>
        </div>
      </ScrollArea>
    </motion.div>
  );
}
