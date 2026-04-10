'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Heart } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { useT } from '@/lib/i18n';
import { FeedPost, FeedComment } from '@/types';
import { feedApi } from '@/lib/api-client';
import { toast } from 'sonner';

interface CommentPopupProps {
  isOpen: boolean;
  onClose: () => void;
  post: FeedPost | null;
  onPostUpdated?: (nextPost: FeedPost) => void;
}

const commentAvatarColors = [
  'bg-emerald-500 text-white',
  'bg-amber-500 text-white',
  'bg-rose-500 text-white',
  'bg-cyan-500 text-white',
  'bg-violet-500 text-white',
  'bg-orange-500 text-white',
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return commentAvatarColors[Math.abs(hash) % commentAvatarColors.length];
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export default function CommentPopup({ isOpen, onClose, post, onPostUpdated }: CommentPopupProps) {
  const { t } = useT();
  const [commentText, setCommentText] = useState('');
  const [comments, setComments] = useState<FeedComment[]>([]);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClose = useCallback(() => {
    setCommentText('');
    onClose();
  }, [onClose]);

  const handleDialogChange = useCallback(
    (open: boolean) => {
      if (!open) {
        setCommentText('');
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen && inputRef.current) {
      const timer = setTimeout(() => inputRef.current?.focus(), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    let mounted = true;
    if (!isOpen || !post) {
      setComments([]);
      return () => {
        mounted = false;
      };
    }

    const seed = async () => {
      setIsLoadingComments(true);
      try {
        const response = await feedApi.listComments(post.id);
        if (!mounted) return;
        setComments(response.comments || []);
      } catch {
        if (!mounted) return;
        setComments(post.commentList || []);
      } finally {
        if (mounted) setIsLoadingComments(false);
      }
    };

    void seed();
    return () => {
      mounted = false;
    };
  }, [isOpen, post]);

  const handleSend = async () => {
    if (!commentText.trim() || !post) return;

    setIsSending(true);
    try {
      const result = await feedApi.createComment(post.id, commentText.trim());
      const newComment: FeedComment = {
        id: result.comment.id,
        authorName: result.comment.authorName,
        authorAvatar: result.comment.authorAvatar,
        content: result.comment.content,
        timestamp: result.comment.timestamp,
        likes: result.comment.likes,
      };
      let nextComments: FeedComment[] = [];
      setComments((prev) => {
        nextComments = [...prev, newComment];
        return nextComments;
      });
      setCommentText('');

      onPostUpdated?.({
        ...post,
        comments: result.commentsCount,
        commentList: nextComments,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to add comment';
      toast.error(message);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleDialogChange}>
      <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden rounded-2xl">
        <DialogHeader className="px-4 pt-4 pb-2">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-base font-semibold">
                {t('feed.comments')}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                {comments.length} {comments.length === 1 ? t('feed.comment').toLowerCase() : t('feed.comments').toLowerCase()}
              </DialogDescription>
            </div>
            <Button variant="ghost" size="icon" className="size-8 rounded-full" onClick={handleClose}>
              <X className="size-4" />
            </Button>
          </div>
        </DialogHeader>

        <Separator className="opacity-50" />

        {/* Comments list */}
        <ScrollArea className="max-h-80 px-4 py-2">
          <AnimatePresence mode="popLayout">
            {isLoadingComments ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-10 text-muted-foreground"
              >
                <span className="text-sm">Loading comments...</span>
              </motion.div>
            ) : comments.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-10 text-muted-foreground"
              >
                <Heart className="size-8 mb-2 opacity-30" />
                <span className="text-sm">{t('feed.writeComment')}</span>
              </motion.div>
            ) : (
              <div className="space-y-3 pb-2">
                {comments.map((comment, idx) => (
                  <motion.div
                    key={comment.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.2, delay: idx * 0.04 }}
                    className="flex gap-2.5"
                  >
                    <Avatar className="size-8 shrink-0">
                      <AvatarFallback
                        className={`text-[10px] font-semibold ${getAvatarColor(comment.authorName)}`}
                      >
                        {getInitials(comment.authorName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-semibold text-foreground">
                          {comment.authorName}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {comment.timestamp}
                        </span>
                      </div>
                      <p className="text-sm text-foreground/90 leading-relaxed">
                        {comment.content}
                      </p>
                      {comment.likes > 0 && (
                        <div className="flex items-center gap-1 mt-1">
                          <Heart className="size-3 text-rose-400 fill-rose-400" />
                          <span className="text-[10px] text-muted-foreground font-medium">
                            {comment.likes}
                          </span>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </AnimatePresence>
        </ScrollArea>

        <Separator className="opacity-50" />

        {/* Input area */}
        <div className="px-4 py-3">
          <div className="flex items-center gap-2">
            <Input
              ref={inputRef}
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('feed.writeComment')}
            className="h-9 text-sm rounded-full border-border/60 focus-visible:border-primary/50"
            disabled={isSending}
          />
          <Button
            size="icon"
            className="size-9 rounded-full shrink-0"
            onClick={handleSend}
            disabled={!commentText.trim() || isSending}
          >
            <Send className="size-4" />
          </Button>
        </div>
      </div>
      </DialogContent>
    </Dialog>
  );
}
