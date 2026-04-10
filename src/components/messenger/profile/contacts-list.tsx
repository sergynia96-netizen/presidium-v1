'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Search,
  UserPlus,
  Star,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useAppStore } from '@/store/use-app-store';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';

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

const statusColors = {
  online: 'bg-emerald-500',
  away: 'bg-amber-500',
  offline: 'bg-gray-400',
};

export default function ContactsScreen() {
  const { goBack, contacts, setView } = useAppStore();
  const { t } = useT();

  const [searchQuery, setSearchQuery] = useState('');

  const filteredContacts = useMemo(() => {
    if (!searchQuery.trim()) return contacts;
    const q = searchQuery.toLowerCase();
    return contacts.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.username?.toLowerCase().includes(q)
    );
  }, [contacts, searchQuery]);

  const favoriteContacts = useMemo(
    () =>
      filteredContacts
        .filter((c) => c.isFavorite)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [filteredContacts]
  );

  const allContacts = useMemo(
    () =>
      filteredContacts
        .filter((c) => !c.isFavorite)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [filteredContacts]
  );

  const getInitials = (name: string) =>
    name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

  const getAvatarColor = (id: string) => {
    const idx = contacts.findIndex((c) => c.id === id);
    return avatarColors[(idx % avatarColors.length + avatarColors.length) % avatarColors.length];
  };

  const handleContactClick = (_contactId: string) => {
    setView('contact-profile');
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50 shrink-0">
        <Button variant="ghost" size="icon" className="size-9" onClick={goBack}>
          <ArrowLeft className="size-5" />
        </Button>
        <h1 className="text-lg font-semibold flex-1">{t('contacts.title')}</h1>
        <Button variant="ghost" size="icon" className="size-9" onClick={() => setView('new-contact')}>
          <UserPlus className="size-5" />
        </Button>
      </div>

      {/* Search */}
      <div className="px-4 py-2.5 shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder={t('contacts.search')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-10 pl-9"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <motion.div
          variants={container as unknown as never}
          initial="hidden"
          animate="show"
          className="mx-auto max-w-2xl px-4 pb-8"
        >
          {filteredContacts.length === 0 ? (
            <motion.div
              variants={item as unknown as never}
              className="flex flex-col items-center justify-center py-16 text-center"
            >
              <div className="flex items-center justify-center size-16 rounded-full bg-muted mb-3">
                <Search className="size-7 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">{t('contacts.noContacts')}</p>
            </motion.div>
          ) : (
            <>
              {/* Favorites section */}
              {favoriteContacts.length > 0 && (
                <>
                  <motion.div variants={item as unknown as never} className="flex items-center gap-2 py-3 px-1">
                    <Star className="size-3.5 text-amber-500" />
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {t('favorites.title')}
                    </span>
                    <Badge variant="secondary" className="text-[10px] border-0 bg-muted px-1.5 h-4">
                      {favoriteContacts.length}
                    </Badge>
                  </motion.div>

                  {favoriteContacts.map((contact) => (
                    <motion.div
                      key={contact.id}
                      variants={item as unknown as never}
                      className={cn(
                        'flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-colors hover:bg-accent/40'
                      )}
                      onClick={() => handleContactClick(contact.id)}
                    >
                      <div className="relative shrink-0">
                        <Avatar className="size-11">
                          <AvatarFallback
                            className={cn('text-xs font-bold text-white', getAvatarColor(contact.id))}
                          >
                            {getInitials(contact.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div
                          className={cn(
                            'absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-background',
                            statusColors[contact.status]
                          )}
                        />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium truncate">{contact.name}</span>
                          <Star className="size-3 text-amber-500 fill-amber-500 shrink-0" />
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {contact.status === 'online'
                            ? t('status.online')
                            : contact.bio || t('status.offline')}
                        </p>
                      </div>

                      <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
                    </motion.div>
                  ))}

                  <Separator className="my-2" />
                </>
              )}

              {/* All contacts section */}
              <motion.div variants={item as unknown as never} className="flex items-center gap-2 py-3 px-1">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {t('contacts.title')}
                </span>
                <Badge variant="secondary" className="text-[10px] border-0 bg-muted px-1.5 h-4">
                  {allContacts.length}
                </Badge>
              </motion.div>

              {allContacts.map((contact) => (
                <motion.div
                  key={contact.id}
                  variants={item as unknown as never}
                  className={cn(
                    'flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-colors hover:bg-accent/40'
                  )}
                  onClick={() => handleContactClick(contact.id)}
                >
                  <div className="relative shrink-0">
                    <Avatar className="size-11">
                      <AvatarFallback
                        className={cn('text-xs font-bold text-white', getAvatarColor(contact.id))}
                      >
                        {getInitials(contact.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div
                      className={cn(
                        'absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-background',
                        statusColors[contact.status]
                      )}
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium truncate block">{contact.name}</span>
                    <p className="text-xs text-muted-foreground truncate">
                      {contact.status === 'online'
                        ? t('status.online')
                        : contact.bio || t('status.offline')}
                    </p>
                  </div>

                  <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
                </motion.div>
              ))}
            </>
          )}
        </motion.div>
      </ScrollArea>
    </div>
  );
}
