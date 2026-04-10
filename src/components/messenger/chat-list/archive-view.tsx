'use client';

import { ArchiveRestore, ArrowLeft, Inbox } from 'lucide-react';
import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAppStore } from '@/store/use-app-store';
import { useT } from '@/lib/i18n';
import { ChatListItem } from './chat-list-item';

export function ArchiveView() {
  const { t } = useT();
  const chats = useAppStore((s) => s.chats);
  const blockedChatIds = useAppStore((s) => s.blockedChatIds);
  const restoreChat = useAppStore((s) => s.restoreChat);
  const setActiveChat = useAppStore((s) => s.setActiveChat);
  const goBack = useAppStore((s) => s.goBack);

  const archivedChats = useMemo(
    () => chats.filter((chat) => chat.isArchived && !blockedChatIds.includes(chat.id)),
    [blockedChatIds, chats],
  );

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <Button variant="ghost" size="icon" className="size-9" onClick={goBack}>
            <ArrowLeft className="size-5" />
          </Button>
          <ArchiveRestore className="size-5 text-primary" />
          <h1 className="text-lg font-semibold">{t('chatList.archiveTitle')}</h1>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="py-2">
          {archivedChats.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
              <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-muted">
                <Inbox className="size-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">{t('chatList.archiveEmpty')}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t('chatList.archiveEmptyHint')}</p>
            </div>
          ) : (
            archivedChats.map((chat) => (
              <ChatListItem
                key={chat.id}
                chat={chat}
                onClick={() => {
                  restoreChat(chat.id);
                  setActiveChat(chat.id);
                }}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
