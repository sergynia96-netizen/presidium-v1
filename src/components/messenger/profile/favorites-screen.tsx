'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Star, MessageSquare } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAppStore } from '@/store/use-app-store';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.15 },
  },
};

const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
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

interface FavoriteItem {
  id: string;
  chatId: string;
  senderName: string;
  content: string;
  chatName: string;
  timestamp: string;
}

export default function FavoritesScreen() {
  const { goBack, favorites, messages, chats, setActiveChat, setView } = useAppStore();
  const { t } = useT();

  const displayFavorites = useMemo(() => {
    const result: FavoriteItem[] = [];

    for (const msgId of favorites) {
      for (const chatId in messages) {
        const msg = messages[chatId]?.find((m) => m.id === msgId);
        if (!msg) continue;

        const chat = chats.find((c) => c.id === chatId);
        result.push({
          id: msg.id,
          chatId,
          senderName: msg.senderName,
          content: msg.content,
          chatName: chat?.name || 'Unknown',
          timestamp: msg.timestamp,
        });
        break;
      }
    }

    return result;
  }, [chats, favorites, messages]);

  const showEmpty = displayFavorites.length === 0;

  const handleOpenFavorite = (item: FavoriteItem) => {
    setActiveChat(item.chatId);
    setView('chat');
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50 shrink-0">
        <Button variant="ghost" size="icon" className="size-9" onClick={goBack}>
          <ArrowLeft className="size-5" />
        </Button>
        <h1 className="text-lg font-semibold">{t('favorites.title')}</h1>
        {!showEmpty && (
          <Badge variant="secondary" className="ml-auto text-xs border-0 bg-muted">
            {displayFavorites.length}
          </Badge>
        )}
      </div>

      <ScrollArea className="flex-1">
        <motion.div
          variants={container as unknown as never}
          initial="hidden"
          animate="show"
          className="mx-auto max-w-2xl p-4 lg:p-6 pb-8"
        >
          {showEmpty ? (
            <motion.div
              variants={item as unknown as never}
              className="flex flex-col items-center justify-center py-20 text-center"
            >
              <div className="flex items-center justify-center size-20 rounded-full bg-amber-500/10 mb-4">
                <Star className="size-10 text-amber-500" />
              </div>
              <h3 className="text-lg font-semibold mb-1">{t('favorites.empty')}</h3>
              <p className="text-sm text-muted-foreground max-w-xs">
                {t('favorites.emptyDesc')}
              </p>
            </motion.div>
          ) : (
            <div className="space-y-3">
              {displayFavorites.map((fav, index) => (
                <motion.div key={fav.id} variants={item as unknown as never}>
                  <Card
                    className="border-border/50 hover:border-primary/20 transition-colors cursor-pointer"
                    onClick={() => handleOpenFavorite(fav)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        handleOpenFavorite(fav);
                      }
                    }}
                  >
                    <CardContent className="p-4 space-y-2.5">
                      {/* Sender and timestamp */}
                      <div className="flex items-center gap-2.5">
                        <Avatar className="size-8">
                          <AvatarFallback
                            className={cn(
                              'text-xs font-bold text-white',
                              avatarColors[index % avatarColors.length]
                            )}
                          >
                            {fav.senderName
                              .split(' ')
                              .map((n) => n[0])
                              .join('')
                              .toUpperCase()
                              .slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium truncate block">
                            {fav.senderName}
                          </span>
                          <span className="text-xs text-muted-foreground">{fav.timestamp}</span>
                        </div>
                        <Star className="size-4 text-amber-500 fill-amber-500 shrink-0" />
                      </div>

                      {/* Message preview */}
                      <p className="text-sm text-muted-foreground line-clamp-2 pl-10">
                        {fav.content}
                      </p>

                      {/* Chat name */}
                      <div className="flex items-center gap-1.5 pl-10">
                        <MessageSquare className="size-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">{fav.chatName}</span>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      </ScrollArea>
    </div>
  );
}
