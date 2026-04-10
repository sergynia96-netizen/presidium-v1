'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Heart,
  MessageCircle,
  ChevronRight,
  Rss,
  Plus,
  ThumbsDown,
  Repeat2,
  ShoppingBag,
  X,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { useAppStore } from '@/store/use-app-store';
import { useT } from '@/lib/i18n';
import { FeedPost } from '@/types';
import CommentPopup from '@/components/messenger/feed/comment-popup';
import { feedApi } from '@/lib/api-client';
import { toast } from 'sonner';

// ─── Constants ──────────────────────────────────────

const channelInitials: Record<string, string> = {
  'Presidium Updates': 'PU',
  'Security Lab': 'SL',
  'Dev Community': 'DC',
  'Design Notes': 'DN',
};

const channelAvatarColors: Record<string, string> = {
  'Presidium Updates': 'bg-emerald-500 text-white',
  'Security Lab': 'bg-amber-500 text-white',
  'Dev Community': 'bg-rose-500 text-white',
  'Design Notes': 'bg-cyan-500 text-white',
};

const TOPICS = [
  'Tech',
  'Science',
  'Design',
  'Crypto',
  'Business',
  'Gaming',
  'Music',
  'Art',
  'News',
] as const;

const HEART_PARTICLES = [
  { size: 9, x: -22, y: -26, rotate: -45 },
  { size: 10, x: -10, y: -34, rotate: -20 },
  { size: 12, x: 0, y: -38, rotate: 0 },
  { size: 11, x: 12, y: -32, rotate: 20 },
  { size: 9, x: 24, y: -24, rotate: 40 },
  { size: 8, x: 16, y: -18, rotate: 60 },
] as const;

// ─── Helpers ────────────────────────────────────────

function formatLikes(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return count.toString();
}

// ─── Heart burst particle ───────────────────────────

function HeartBurst({ active }: { active: boolean }) {
  return (
    <AnimatePresence>
      {active && (
        <>
          {HEART_PARTICLES.map((particle, i) => (
            <motion.span
              key={i}
              className="absolute pointer-events-none text-rose-500"
              style={{
                fontSize: particle.size,
              }}
              initial={{
                opacity: 1,
                x: 0,
                y: 0,
                scale: 0,
              }}
              animate={{
                opacity: 0,
                x: particle.x,
                y: particle.y,
                scale: [0, 1, 0.5],
                rotate: particle.rotate,
              }}
              exit={{ opacity: 0 }}
              transition={{
                duration: 0.6,
                ease: 'easeOut',
                delay: i * 0.03,
              }}
            >
              ❤
            </motion.span>
          ))}
        </>
      )}
    </AnimatePresence>
  );
}

// ─── Dislike animation ──────────────────────────────

function DislikeBurst({ active }: { active: boolean }) {
  return (
    <AnimatePresence>
      {active && (
        <motion.span
          className="absolute pointer-events-none"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1.2, y: -4 }}
          exit={{ opacity: 0, scale: 0.8, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          👎
        </motion.span>
      )}
    </AnimatePresence>
  );
}

// ─── Feed Card ──────────────────────────────────────

interface FeedCardProps {
  post: FeedPost;
  index: number;
  onComment: (post: FeedPost) => void;
  onLike: (post: FeedPost) => Promise<void>;
  onDislike: (post: FeedPost) => Promise<void>;
  onRepost: (post: FeedPost) => Promise<void>;
}

function FeedCard({ post, index, onComment, onLike, onDislike, onRepost }: FeedCardProps) {
  const { t } = useT();
  const [showHeartBurst, setShowHeartBurst] = useState(false);
  const [showDislikeBurst, setShowDislikeBurst] = useState(false);
  const [showToast, setShowToast] = useState(false);

  const handleLike = useCallback(async () => {
    await onLike(post);
    if (!post.isLiked) {
      setShowHeartBurst(true);
      setTimeout(() => setShowHeartBurst(false), 700);
    }
  }, [onLike, post]);

  const handleDislike = useCallback(async () => {
    await onDislike(post);
    if (!post.isDisliked) {
      setShowDislikeBurst(true);
      setTimeout(() => setShowDislikeBurst(false), 400);
    }
  }, [onDislike, post]);

  const handleRepost = useCallback(async () => {
    await onRepost(post);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 1500);
  }, [onRepost, post]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.08, ease: 'easeOut' }}
    >
      <Card className="group cursor-pointer border-border/50 py-0 transition-all duration-200 hover:border-border hover:shadow-md">
        <CardContent className="p-4">
          {/* Channel info */}
          <div className="flex items-center gap-2.5 mb-3">
            <Avatar className="size-7">
              <AvatarFallback
                className={`text-[10px] font-semibold ${channelAvatarColors[post.channelName] || 'bg-primary text-primary-foreground'}`}
              >
                {channelInitials[post.channelName] || post.channelName.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="text-xs font-medium text-muted-foreground">
              {post.channelName}
            </span>
          </div>

          {/* Title */}
          <h3 className="text-[15px] font-semibold leading-snug mb-2 text-foreground group-hover:text-primary transition-colors">
            {post.title}
          </h3>

          {/* Content preview */}
          <p className="text-sm text-muted-foreground leading-relaxed mb-4 line-clamp-3">
            {post.content}
          </p>

          {/* Footer actions */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              {/* Like */}
              <button
                onClick={handleLike}
                className="relative flex items-center gap-1.5 px-2 py-1 rounded-lg text-muted-foreground hover:text-rose-500 transition-colors"
              >
                <motion.div
                  className="relative"
                  whileTap={{ scale: 0.8 }}
                >
                  <motion.div
                    animate={post.isLiked ? { scale: [1, 1.4, 1] } : {}}
                    transition={{ type: 'tween', duration: 0.4, ease: 'easeOut' }}
                  >
                    <Heart
                      className={`size-4 transition-colors ${
                        post.isLiked
                          ? 'text-rose-500 fill-rose-500'
                          : 'text-muted-foreground'
                      }`}
                    />
                  </motion.div>
                  <HeartBurst active={showHeartBurst} />
                </motion.div>
                <span
                  className={`text-xs font-medium transition-colors ${
                    post.isLiked ? 'text-rose-500' : ''
                  }`}
                >
                  {formatLikes(post.likes)}
                </span>
              </button>

              {/* Dislike */}
              <button
                onClick={handleDislike}
                className="relative flex items-center gap-1.5 px-2 py-1 rounded-lg text-muted-foreground hover:text-blue-500 transition-colors"
              >
                <motion.div
                  className="relative"
                  whileTap={{ scale: 0.8 }}
                >
                  <motion.div
                    animate={post.isDisliked ? { scale: [1, 1.3, 1] } : {}}
                    transition={{ type: 'tween', duration: 0.35, ease: 'easeOut' }}
                  >
                    <ThumbsDown
                      className={`size-4 transition-colors ${
                        post.isDisliked
                          ? 'text-blue-500 fill-blue-500'
                          : 'text-muted-foreground'
                      }`}
                    />
                  </motion.div>
                  <DislikeBurst active={showDislikeBurst} />
                </motion.div>
                <span
                  className={`text-xs font-medium transition-colors ${
                    post.isDisliked ? 'text-blue-500' : ''
                  }`}
                >
                  {formatLikes(post.dislikes || 0)}
                </span>
              </button>

              {/* Comments */}
              <button
                onClick={() => onComment(post)}
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-muted-foreground hover:text-primary transition-colors"
              >
                <MessageCircle className="size-4" />
                <span className="text-xs font-medium">{post.comments}</span>
              </button>

              {/* Repost */}
              <button
                onClick={handleRepost}
                className={`relative flex items-center gap-1.5 px-2 py-1 rounded-lg transition-colors ${
                  post.isReposted
                    ? 'text-emerald-500'
                    : 'text-muted-foreground hover:text-emerald-500'
                }`}
              >
                <Repeat2 className={`size-4 ${post.isReposted ? 'fill-emerald-500' : ''}`} />
                <span className="text-xs font-medium">{formatLikes(post.repostCount || 0)}</span>

                {/* Toast */}
                <AnimatePresence>
                  {showToast && (
                    <motion.div
                      initial={{ opacity: 0, y: 4, scale: 0.9 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -8, scale: 0.9 }}
                      transition={{ duration: 0.2 }}
                      className="absolute -top-8 left-1/2 -translate-x-1/2 bg-emerald-500 text-white text-[10px] font-medium px-2 py-1 rounded-full whitespace-nowrap z-10"
                    >
                      {t('feed.reposted')}
                    </motion.div>
                  )}
                </AnimatePresence>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{post.timestamp}</span>
              <ChevronRight className="size-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ─── Topics Popup ───────────────────────────────────

function TopicsPopup({ onClose }: { onClose: () => void }) {
  const { t } = useT();

  const topicMap: Record<string, string> = {
    Tech: t('feed.tech'),
    Science: t('feed.science'),
    Design: t('feed.design'),
    Crypto: t('feed.crypto'),
    Business: t('feed.business'),
    Gaming: t('feed.gaming'),
    Music: t('feed.music'),
    Art: t('feed.art'),
    News: t('feed.news'),
  };

  const topicColors: Record<string, string> = {
    Tech: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    Science: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
    Design: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300',
    Crypto: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
    Business: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
    Gaming: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
    Music: 'bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300',
    Art: 'bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300',
    News: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.15 }}
      className="absolute top-full left-0 right-0 z-30 bg-background border border-border/60 rounded-xl shadow-lg p-3 mx-4 mt-1"
    >
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-xs font-semibold text-muted-foreground">{t('feed.topics')}</span>
        <Button variant="ghost" size="icon" className="size-6 rounded-full" onClick={onClose}>
          <X className="size-3" />
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {TOPICS.map((topic) => (
          <motion.button
            key={topic}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className={`px-3 py-1.5 rounded-full text-xs font-medium ${topicColors[topic]}`}
            onClick={onClose}
          >
            {topicMap[topic]}
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}

// ─── Main Feed Screen ───────────────────────────────

export default function FeedScreen() {
  const { t } = useT();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('recommendations');
  const [showTopicsPopup, setShowTopicsPopup] = useState(false);
  const [commentPost, setCommentPost] = useState<FeedPost | null>(null);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const setView = useAppStore((s) => s.setView);
  const loadPosts = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await feedApi.list({ page: 1, limit: 100 });
      setPosts((response.posts || []) as FeedPost[]);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to load feed';
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPosts();
  }, [loadPosts]);

  const visiblePosts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return posts;
    return posts.filter(
      (post) =>
        post.title.toLowerCase().includes(q) ||
        post.content.toLowerCase().includes(q) ||
        post.channelName.toLowerCase().includes(q),
    );
  }, [posts, searchQuery]);

  const handlePostPatch = useCallback((nextPost: FeedPost) => {
    setPosts((prev) => prev.map((post) => (post.id === nextPost.id ? nextPost : post)));
    setCommentPost((prev) => (prev?.id === nextPost.id ? nextPost : prev));
  }, []);

  const handleLike = useCallback(async (post: FeedPost) => {
    try {
      const response = await feedApi.react(post.id, 'like');
      handlePostPatch(response.post as FeedPost);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to like post';
      toast.error(message);
    }
  }, [handlePostPatch]);

  const handleDislike = useCallback(async (post: FeedPost) => {
    try {
      const response = await feedApi.react(post.id, 'dislike');
      handlePostPatch(response.post as FeedPost);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to dislike post';
      toast.error(message);
    }
  }, [handlePostPatch]);

  const handleRepost = useCallback(async (post: FeedPost) => {
    try {
      const response = await feedApi.react(post.id, 'repost');
      handlePostPatch(response.post as FeedPost);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to repost';
      toast.error(message);
    }
  }, [handlePostPatch]);

  const tabs = [
    { id: 'recommendations', label: t('feed.recommendations') },
    { id: 'interests', label: t('feed.yourInterests') },
    { id: 'popular', label: t('feed.popular') },
    { id: 'library', label: t('feed.library') },
    { id: 'topics', label: t('feed.topical') },
  ];

  const handleMarketplace = () => {
    setView('marketplace');
  };

  const handleCreatePost = () => {
    setView('create-post');
  };

  return (
    <div className="flex flex-col h-full bg-background relative">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 shrink-0">
        <div className="flex items-center gap-2.5">
          <Rss className="size-5 text-primary" />
          <h1 className="text-lg font-semibold">{t('feed.title')}</h1>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-9 rounded-full"
            onClick={handleCreatePost}
          >
            <Plus className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-9 rounded-full"
            onClick={() => setSearchOpen(!searchOpen)}
          >
            <Search className="size-4" />
          </Button>
        </div>
      </div>

      {/* Search bar (toggle) */}
      <AnimatePresence>
        {searchOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="px-4 pt-3 shrink-0 overflow-hidden"
          >
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('feed.search')}
              className="w-full h-9 rounded-lg border-border/60"
              autoFocus
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Feed search tabs */}
      <div className="shrink-0 border-b border-border/40">
        <div className="flex items-center gap-1 px-4 py-2 overflow-x-auto no-scrollbar">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                if (tab.id === 'topics') {
                  setShowTopicsPopup((p) => !p);
                } else if (tab.id === 'library') {
                  setShowTopicsPopup(false);
                  setView('library');
                } else {
                  setActiveTab(tab.id);
                  setShowTopicsPopup(false);
                }
              }}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}

          {/* Marketplace button - special pill */}
          <button
            onClick={handleMarketplace}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-all whitespace-nowrap"
          >
            <ShoppingBag className="size-3" />
            {t('feed.commission')}
          </button>
        </div>

        {/* Topics popup */}
        <AnimatePresence>
          {showTopicsPopup && (
            <TopicsPopup onClose={() => setShowTopicsPopup(false)} />
          )}
        </AnimatePresence>
      </div>

      {/* Feed posts */}
      <ScrollArea className="flex-1">
        <div className="mx-auto max-w-2xl p-4 space-y-3 pb-6">
          {isLoading && (
            <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
              Loading feed...
            </div>
          )}

          {visiblePosts.map((post, index) => (
            <FeedCard
              key={post.id}
              post={post}
              index={index}
              onComment={setCommentPost}
              onLike={handleLike}
              onDislike={handleDislike}
              onRepost={handleRepost}
            />
          ))}

          {visiblePosts.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/20 px-5 py-12 text-center"
            >
              <Rss className="mb-3 size-6 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">{t('feed.empty')}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t('feed.emptyHint')}</p>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="flex flex-col items-center gap-2 pt-4 pb-2"
            >
              <div className="h-px w-12 bg-border/60" />
              <span className="text-xs text-muted-foreground">{t('feed.noMore')}</span>
            </motion.div>
          )}
        </div>
      </ScrollArea>

      {/* Comment popup */}
      <CommentPopup
        isOpen={!!commentPost}
        onClose={() => setCommentPost(null)}
        post={commentPost}
        onPostUpdated={handlePostPatch}
      />
    </div>
  );
}
 
