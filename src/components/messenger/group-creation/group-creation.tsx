'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Camera, X, Check, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAppStore } from '@/store/use-app-store';
import { useApiStore } from '@/store/use-api-store';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { toast } from 'sonner';

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

const onlineColors = [
  'bg-emerald-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-violet-500',
  'bg-orange-500',
  'bg-teal-500',
  'bg-pink-500',
];

export default function GroupCreation() {
  const { goBack, contacts, setView, setActiveChat } = useAppStore();
  const syncChats = useApiStore((s) => s.syncChats);
  const { t } = useT();

  const [step, setStep] = useState<1 | 2>(1);
  const [groupName, setGroupName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [_creating, setCreating] = useState(false);

  const filteredContacts = useMemo(() => {
    if (!searchQuery.trim()) return contacts;
    const q = searchQuery.toLowerCase();
    return contacts.filter((c) => c.name.toLowerCase().includes(q));
  }, [contacts, searchQuery]);

  const handleToggleMember = (id: string) => {
    setSelectedMembers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleCreateGroup = async () => {
    if (step === 1) {
      if (groupName.trim()) {
        setStep(2);
      }
    } else {
      if (selectedMembers.size === 0) return;

      setCreating(true);
      try {
        const response = await fetch('/api/chats', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: groupName.trim(),
            type: 'group',
            memberIds: Array.from(selectedMembers),
            isEncrypted: true,
            encryptionType: 'p2p',
          }),
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(payload.error || 'Failed to create group');
        }

        const data = (await response.json()) as { chat?: { id?: string } };
        await syncChats();

        if (data.chat?.id) {
          setActiveChat(data.chat.id);
          setView('chat');
        } else {
          goBack();
        }

        toast.success('Group created');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create group';
        toast.error(message);
      } finally {
        setCreating(false);
      }
    }
  };

  const handleRemoveMember = (id: string) => {
    setSelectedMembers((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50 shrink-0">
        <Button variant="ghost" size="icon" className="size-9" onClick={goBack}>
          <ArrowLeft className="size-5" />
        </Button>
        <h1 className="text-lg font-semibold">
          {step === 1 ? t('group.newTitle') : t('group.addMembers')}
        </h1>
      </div>

      <AnimatePresence mode="wait">
        {step === 1 ? (
          <motion.div
            key="step-1"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="flex flex-col flex-1 p-4 lg:mx-auto lg:max-w-lg"
          >
            {/* Avatar placeholder */}
            <div className="flex justify-center mb-6">
              <button
                type="button"
                className="relative flex items-center justify-center size-24 rounded-full bg-muted transition-colors hover:bg-muted/80"
              >
                <Camera className="size-8 text-muted-foreground" />
                <div className="absolute bottom-1 right-1 flex items-center justify-center size-7 rounded-full bg-primary text-primary-foreground">
                  <Camera className="size-3.5" />
                </div>
              </button>
            </div>

            {/* Group name input */}
            <div className="space-y-2 mb-auto">
              <label className="text-sm font-medium text-muted-foreground">
                {t('group.nameLabel')}
              </label>
              <Input
                placeholder={t('group.namePlaceholder')}
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                className="h-12 text-base"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && groupName.trim()) {
                    setStep(2);
                  }
                }}
              />
            </div>

            {/* Create button */}
            <Button
              className="w-full h-12 mt-6 text-base font-medium gap-2"
              disabled={!groupName.trim()}
              onClick={handleCreateGroup}
            >
              <Users className="size-4" />
              {t('group.createBtn')}
            </Button>
          </motion.div>
        ) : (
          <motion.div
            key="step-2"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="flex flex-col flex-1 overflow-hidden"
          >
            {/* Selected members chips */}
            {selectedMembers.size > 0 && (
              <div className="px-4 pt-4 pb-2 shrink-0">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    {selectedMembers.size} {t('group.selected')}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {Array.from(selectedMembers).map((memberId) => {
                    const contact = contacts.find((c) => c.id === memberId);
                    if (!contact) return null;
                    const idx = Math.max(0, contacts.findIndex((c) => c.id === memberId));
                    return (
                      <motion.div
                        key={memberId}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        className="flex items-center gap-1.5 pl-1 pr-2 py-0.5 rounded-full bg-primary/10 border border-primary/20"
                      >
                        <Avatar className="size-5">
                          <AvatarFallback
                            className={cn(
                              'text-[8px] font-bold text-white',
                              onlineColors[idx % onlineColors.length]
                            )}
                          >
                            {getInitials(contact.name)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-xs font-medium">{contact.name}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveMember(memberId)}
                          className="ml-0.5 hover:bg-muted rounded-full p-0.5 transition-colors"
                        >
                          <X className="size-3 text-muted-foreground" />
                        </button>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Search input */}
            <div className="px-4 py-2 shrink-0">
              <Input
                placeholder={t('group.searchContacts')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-10"
              />
            </div>

            {/* Contact list */}
            <ScrollArea className="flex-1">
              <div className="px-2 pb-4">
                {filteredContacts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Users className="size-8 mb-2 opacity-40" />
                    <p className="text-sm">{t('group.noContacts')}</p>
                  </div>
                ) : (
                  filteredContacts.map((contact, index) => {
                    const isSelected = selectedMembers.has(contact.id);
                    const idx = Math.max(0, contacts.findIndex((c) => c.id === contact.id));
                    return (
                      <motion.div
                        key={contact.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2, delay: index * 0.04 }}
                        className={cn(
                          'flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-colors',
                          isSelected ? 'bg-primary/5' : 'hover:bg-accent/40'
                        )}
                        onClick={() => handleToggleMember(contact.id)}
                      >
                        <div className="relative">
                          <Avatar className="size-10">
                            <AvatarFallback
                              className={cn(
                                'text-xs font-bold text-white',
                                onlineColors[idx % onlineColors.length]
                              )}
                            >
                              {getInitials(contact.name)}
                            </AvatarFallback>
                          </Avatar>
                          {contact.status === 'online' && (
                            <div className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full bg-emerald-500 border-2 border-background" />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-medium truncate">{contact.name}</h4>
                          <p className="text-xs text-muted-foreground">
                            {contact.status === 'online' ? t('status.online') : t('status.offline')}
                          </p>
                        </div>

                        <Checkbox checked={isSelected} />
                      </motion.div>
                    );
                  })
                )}
              </div>
            </ScrollArea>

            {/* Create button */}
            <div className="px-4 py-3 border-t border-border/50 shrink-0 safe-bottom">
              <Button
                className="w-full h-11 text-base font-medium gap-2"
                onClick={handleCreateGroup}
                disabled={selectedMembers.size === 0 || _creating}
              >
                <Check className="size-4" />
                {t('group.createBtn')}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
