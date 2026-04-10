'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, FileText, MessageSquare, Calendar, BookOpen, Languages,
  PenTool, ListTodo, Code, BarChart3, Bot, ChevronRight, Send,
  Plus, ArrowLeft, X, Loader2, ShieldAlert, Zap,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useAppStore } from '@/store/use-app-store';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { AIConversation, AIConversationMessage } from '@/types';
import OpenClawPanel from '@/components/messenger/ai-center/openclaw-panel';
import { aiChatApi } from '@/lib/api-client';

// ─── Types ─────────────────────────────────────────

interface Capability {
  titleKey: string;
  descKey: string;
  icon: React.ElementType;
  mode: string;
  prompt: string;
  color: string;
}

// ─── Animation variants ────────────────────────────

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
};

const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } },
};

// ─── Capability definitions ────────────────────────

const CAPABILITIES: Capability[] = [
  { titleKey: 'ai.cap.summaries', descKey: 'ai.cap.summariesDesc', icon: BookOpen, mode: 'summarize', prompt: 'Summarize my unread conversations and highlight the most important messages.', color: 'text-emerald-500 bg-emerald-500/10' },
  { titleKey: 'ai.cap.translation', descKey: 'ai.cap.translationDesc', icon: Languages, mode: 'translation', prompt: 'Translate the following text:', color: 'text-blue-500 bg-blue-500/10' },
  { titleKey: 'ai.cap.writing', descKey: 'ai.cap.writingDesc', icon: PenTool, mode: 'writing', prompt: 'Help me improve this message:', color: 'text-violet-500 bg-violet-500/10' },
  { titleKey: 'ai.cap.tasks', descKey: 'ai.cap.tasksDesc', icon: ListTodo, mode: 'tasks', prompt: 'Extract actionable tasks from the following:', color: 'text-orange-500 bg-orange-500/10' },
  { titleKey: 'ai.cap.code', descKey: 'ai.cap.codeDesc', icon: Code, mode: 'code', prompt: 'Review this code and suggest improvements:', color: 'text-amber-500 bg-amber-500/10' },
  { titleKey: 'ai.cap.insights', descKey: 'ai.cap.insightsDesc', icon: BarChart3, mode: 'insights', prompt: 'Analyze my recent communication patterns and provide insights.', color: 'text-rose-500 bg-rose-500/10' },
];

// ─── Quick actions ─────────────────────────────────

interface QuickAction {
  labelKey: string;
  icon: React.ElementType;
  mode: string;
  prompt: string;
}

// ─── Conversation Sidebar (mobile overlay / desktop inline) ─────────

function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onNewChat,
  visible,
  onClose,
}: {
  conversations: AIConversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  visible: boolean;
  onClose: () => void;
}) {
  const { t } = useT();

  const content = (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 shrink-0">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          {t('ai.conversations')}
        </h2>
        <Button variant="ghost" size="icon" className="size-8" onClick={onNewChat}>
          <Plus className="size-4" />
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2">
          {conversations.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8">{t('ai.noConversations')}</p>
          )}
          {conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => { onSelect(conv.id); onClose(); }}
              className={cn(
                'w-full flex items-center gap-3 p-3 rounded-xl text-left transition-colors',
                activeId === conv.id ? 'bg-primary/10' : 'hover:bg-accent/50'
              )}
            >
              <div className="flex items-center justify-center size-10 rounded-xl bg-amber-500/10 shrink-0">
                <Bot className="size-5 text-amber-500" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-medium truncate">{conv.title}</h4>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{conv.lastMessage}</p>
              </div>
              <span className="text-[10px] text-muted-foreground shrink-0">{conv.timestamp}</span>
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );

  return (
    <>
      {/* Desktop: always visible inline */}
      <div className="hidden md:flex flex-col w-[280px] shrink-0 border-r bg-background overflow-hidden">
        {content}
      </div>
      {/* Mobile: overlay */}
      <AnimatePresence>
        {visible && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 md:hidden bg-background"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
              <button onClick={onClose} className="size-8 flex items-center justify-center rounded-lg hover:bg-muted">
                <ArrowLeft className="size-5" />
              </button>
              <h2 className="text-sm font-semibold">{t('ai.conversations')}</h2>
              <Button variant="ghost" size="icon" className="size-8" onClick={onNewChat}>
                <Plus className="size-4" />
              </Button>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2">
                {conversations.map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => { onSelect(conv.id); onClose(); }}
                    className={cn(
                      'w-full flex items-center gap-3 p-3 rounded-xl text-left transition-colors',
                      activeId === conv.id ? 'bg-primary/10' : 'hover:bg-accent/50'
                    )}
                  >
                    <div className="flex items-center justify-center size-10 rounded-xl bg-amber-500/10 shrink-0">
                      <Bot className="size-5 text-amber-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-medium truncate">{conv.title}</h4>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{conv.lastMessage}</p>
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">{conv.timestamp}</span>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ─── Message Bubble ────────────────────────────────

function MessageBubble({ message }: { message: AIConversationMessage }) {
  const isUser = message.role === 'user';
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={cn('flex gap-2.5 max-w-[85%]', isUser ? 'ml-auto flex-row-reverse' : 'mr-auto')}
    >
      {!isUser && (
        <div className="flex items-center justify-center size-8 rounded-lg bg-amber-500/10 shrink-0 mt-1">
          <Sparkles className="size-4 text-amber-500" />
        </div>
      )}
      <div
        className={cn(
          'rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
          isUser
            ? 'bg-primary text-primary-foreground rounded-br-md'
            : 'bg-muted rounded-bl-md'
        )}
      >
        <div className="whitespace-pre-wrap break-words">{message.content}</div>
        <div className={cn('text-[10px] mt-1', isUser ? 'text-primary-foreground/60' : 'text-muted-foreground')}>
          {message.timestamp}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Typing Indicator ──────────────────────────────

function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex gap-2.5 max-w-[85%] mr-auto"
    >
      <div className="flex items-center justify-center size-8 rounded-lg bg-amber-500/10 shrink-0 mt-1">
        <Sparkles className="size-4 text-amber-500" />
      </div>
      <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
        <div className="flex items-center gap-1.5">
          <Loader2 className="size-3.5 text-muted-foreground animate-spin" />
          <span className="text-xs text-muted-foreground">...</span>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Capability Card ───────────────────────────────

function CapabilityCard({
  capability,
  onClick,
}: {
  capability: Capability;
  onClick: () => void;
}) {
  const { t } = useT();
  const Icon = capability.icon;
  return (
    <motion.div variants={item as unknown as never}>
      <Card
        className="border-border/50 py-0 transition-all duration-200 hover:border-primary/30 hover:shadow-md cursor-pointer"
        onClick={onClick}
      >
        <CardContent className="p-4">
          <div className="flex items-center gap-3 mb-2.5">
            <div className={cn('flex items-center justify-center size-9 rounded-lg', capability.color)}>
              <Icon className="size-4.5" />
            </div>
            <h3 className="text-sm font-semibold">{t(capability.titleKey as unknown as never)}</h3>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">{t(capability.descKey as unknown as never)}</p>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ─── Main Component ────────────────────────────────

export default function AICenterScreen() {
  const user = useAppStore((s) => s.user);
  const { t, tf } = useT();
  const aiConversations = useAppStore((s) => s.aiConversations);
  const addAIConversation = useAppStore((s) => s.addAIConversation);
  const updateAIConversation = useAppStore((s) => s.updateAIConversation);
  const setAIConversations = useAppStore((s) => s.setAIConversations);

  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showOpenClaw, setShowOpenClaw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const activeConv = aiConversations.find((c) => c.id === activeConvId);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConv?.messages, isLoading]);

  // Focus input on conversation select
  useEffect(() => {
    if (activeConvId) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [activeConvId]);

  useEffect(() => {
    let cancelled = false;

    const formatTime = (value?: string): string => {
      if (!value) return now();
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) return value;
      return parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const loadConversations = async () => {
      if (!user?.id) return;

      setIsLoadingHistory(true);
      try {
        const response = await aiChatApi.list({ limit: 100 });
        if (cancelled) return;

        const mapped: AIConversation[] = (response.conversations || []).map((conversation) => ({
          id: conversation.id,
          title: conversation.title,
          lastMessage: conversation.lastMessage,
          timestamp: formatTime(conversation.updatedAt),
          mode: conversation.mode || 'default',
          messages: (conversation.messages || []).map((message) => ({
            id: message.id,
            role: message.role === 'assistant' ? 'assistant' : 'user',
            content: message.content,
            timestamp: formatTime(message.timestamp),
          })),
        }));

        setAIConversations(mapped);

        setActiveConvId((previous) => {
          if (!previous) {
            return mapped[0]?.id || null;
          }
          return mapped.some((conversation) => conversation.id === previous)
            ? previous
            : mapped[0]?.id || null;
        });
      } catch {
        if (!cancelled) {
          setError(t('ai.error'));
        }
      } finally {
        if (!cancelled) {
          setIsLoadingHistory(false);
        }
      }
    };

    void loadConversations();

    return () => {
      cancelled = true;
    };
  }, [setAIConversations, t, user?.id]);

  const generateId = () => crypto.randomUUID();

  const now = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const sendMessage = useCallback(async (text: string, mode: string = 'default') => {
    if (!text.trim() || isLoading) return;

    let convId = activeConvId;

    // If no active conversation or mode differs, create new
    if (!convId) {
      const newConv: AIConversation = {
        id: crypto.randomUUID(),
        title: text.slice(0, 40) + (text.length > 40 ? '...' : ''),
        lastMessage: text.slice(0, 50) + (text.length > 50 ? '...' : ''),
        timestamp: t('ai.today'),
        messages: [],
        mode,
      };
      convId = newConv.id;
      addAIConversation(newConv);
      setActiveConvId(convId);
    }

    const userMsg: AIConversationMessage = {
      id: generateId(),
      role: 'user',
      content: text.trim(),
      timestamp: now(),
    };

    // Add user message to conversation
    const currentBeforeSend = useAppStore.getState().aiConversations.find((c) => c.id === convId);
    updateAIConversation(convId, {
      messages: [...(currentBeforeSend?.messages || []), userMsg],
      lastMessage: text.trim().slice(0, 50),
      timestamp: now(),
    });

    setInputValue('');
    setError(null);
    setIsLoading(true);

    try {
      const res = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text.trim(),
          conversationId: convId,
          mode,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || t('ai.error'));
      }

      const aiMsg: AIConversationMessage = {
        id: generateId(),
        role: 'assistant',
        content: data.response,
        timestamp: now(),
      };

      const currentConv = useAppStore.getState().aiConversations.find((c) => c.id === convId);
      const currentMessages = currentConv?.messages || [];

      updateAIConversation(convId, {
        messages: [...currentMessages, aiMsg],
        lastMessage: data.response.slice(0, 50),
        timestamp: now(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('ai.error');
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [activeConvId, isLoading, t, addAIConversation, updateAIConversation]);

  const handleQuickAction = (prompt: string, mode: string) => {
    // Start a new conversation for quick actions
    setActiveConvId(null);
    setTimeout(() => {
      sendMessage(prompt, mode);
    }, 0);
  };

  const handleCapabilityClick = (cap: Capability) => {
    handleQuickAction(cap.prompt, cap.mode);
  };

  const handleNewChat = () => {
    setActiveConvId(null);
    setInputValue('');
    setError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(inputValue, activeConv?.mode || 'default');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputValue, activeConv?.mode || 'default');
    }
  };

  // ─── Quick Actions ─────────────────────────────
  const quickActions: QuickAction[] = [
    { labelKey: 'ai.quickSummarize', icon: FileText, mode: 'summarize', prompt: 'Summarize my unread conversations and highlight the most important messages.' },
    { labelKey: 'ai.quickReplies', icon: MessageSquare, mode: 'reply', prompt: 'Suggest smart replies for my recent conversations.' },
    { labelKey: 'ai.quickMeetings', icon: Calendar, mode: 'meeting', prompt: 'Help me organize my meeting notes from recent discussions.' },
  ];

  // ─── Render ────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border/50 shrink-0">
        <button
          onClick={() => setShowSidebar(true)}
          className="md:hidden size-8 flex items-center justify-center rounded-lg hover:bg-muted"
        >
          <Sparkles className="size-5 text-amber-500" />
        </button>
        <Sparkles className="size-5 text-amber-500 hidden md:block" />
        <h1 className="text-lg font-semibold">{t('ai.title')}</h1>
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'size-8 rounded-full transition-colors',
              showOpenClaw
                ? 'bg-emerald-500 text-white hover:bg-emerald-500/90'
                : 'text-muted-foreground hover:bg-accent',
            )}
            onClick={() => setShowOpenClaw((v) => !v)}
            title="OpenClaw"
          >
            <Zap className="size-4" />
          </Button>
          {/* OpenClaw status indicator */}
          <Badge
            variant="outline"
            className="gap-1.5 text-[10px] font-medium border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0"
          >
            <ShieldAlert className="size-3" />
            {t('openclaw.active')}
          </Badge>
          <Button variant="ghost" size="icon" className="size-8 md:hidden" onClick={() => setShowSidebar(true)}>
            <MessageSquare className="size-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Conversation sidebar (desktop) */}
        <ConversationSidebar
          conversations={aiConversations}
          activeId={activeConvId}
          onSelect={setActiveConvId}
          onNewChat={handleNewChat}
          visible={showSidebar}
          onClose={() => setShowSidebar(false)}
        />

        {/* Main content area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Chat area or Welcome screen */}
          {showOpenClaw ? (
            <OpenClawPanel />
          ) : !activeConv ? (
            /* ─── Welcome / Home Screen ─── */
            <ScrollArea className="flex-1">
              <div className="mx-auto max-w-2xl p-4 space-y-6 pb-8">
                {isLoadingHistory && (
                  <div className="rounded-xl border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                    {t('ai.thinking')}
                  </div>
                )}
                {/* Greeting card */}
                <motion.div
                  initial={{ opacity: 0, y: 16, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                >
                  <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500 via-emerald-600 to-amber-500 p-5 text-white">
                    <div className="absolute -top-8 -right-8 size-32 rounded-full bg-white/10" />
                    <div className="absolute -bottom-6 -left-6 size-24 rounded-full bg-white/5" />
                    <div className="relative z-10">
                      <div className="flex items-center gap-2 mb-1">
                        <Sparkles className="size-4 opacity-80" />
                        <span className="text-xs font-medium opacity-80">
                          {tf('ai.greeting', { name: user?.name?.split(' ')[0] || 'User' })}
                        </span>
                      </div>
                      <p className="text-sm leading-relaxed opacity-90 mb-4">
                        {t('ai.greetingDesc')}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {quickActions.map((action) => {
                          const Icon = action.icon;
                          return (
                            <Button
                              key={action.labelKey}
                              variant="secondary"
                              size="sm"
                              className="bg-white/20 hover:bg-white/30 text-white border-0 backdrop-blur-sm text-xs font-medium gap-1.5 h-8"
                              onClick={() => handleQuickAction(action.prompt, action.mode)}
                            >
                              <Icon className="size-3.5" />
                              {t(action.labelKey as unknown as never)}
                            </Button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </motion.div>

                {/* Quick Input (start any conversation) */}
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
                  <form onSubmit={(e) => { e.preventDefault(); if (inputValue.trim()) handleQuickAction(inputValue, 'default'); }} className="relative">
                    <Input
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      placeholder={t('ai.chatPlaceholder')}
                      className="pr-10 h-11 rounded-xl bg-muted/50 border-border/50"
                    />
                    <Button
                      type="submit"
                      size="icon"
                      variant="ghost"
                      className="absolute right-1 top-1/2 -translate-y-1/2 size-8 text-primary"
                      disabled={!inputValue.trim()}
                    >
                      <Send className="size-4" />
                    </Button>
                  </form>
                </motion.div>

                {/* Recent Conversations */}
                <motion.div variants={container as unknown as never} initial="hidden" animate="show">
                  <motion.div variants={item as unknown as never} className="flex items-center justify-between mb-2">
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                      {t('ai.recent')}
                    </h2>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-primary h-7 gap-1 px-2"
                      onClick={() => setShowSidebar(true)}
                    >
                      {t('ai.viewAll')}
                      <ChevronRight className="size-3" />
                    </Button>
                  </motion.div>
                  <Card className="border-border/50 py-1 gap-0">
                    <CardContent className="p-1">
                      {aiConversations.map((conv) => (
                        <motion.button
                          key={conv.id}
                          variants={item as unknown as never}
                          className="group w-full flex items-center gap-3 p-3 rounded-xl text-left transition-colors hover:bg-accent/50"
                          onClick={() => setActiveConvId(conv.id)}
                        >
                          <div className="flex items-center justify-center size-10 rounded-xl bg-amber-500/10 shrink-0">
                            <Bot className="size-5 text-amber-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-medium truncate">{conv.title}</h4>
                            <p className="text-xs text-muted-foreground truncate mt-0.5">{conv.lastMessage}</p>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <span className="text-[10px] text-muted-foreground">{conv.timestamp}</span>
                            <ChevronRight className="size-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </motion.button>
                      ))}
                    </CardContent>
                  </Card>
                </motion.div>

                {/* AI Capabilities */}
                <motion.div variants={container as unknown as never} initial="hidden" animate="show">
                  <motion.div variants={item as unknown as never} className="mb-3">
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                      {t('ai.capabilities')}
                    </h2>
                  </motion.div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {CAPABILITIES.map((cap) => (
                      <CapabilityCard
                        key={cap.mode}
                        capability={cap}
                        onClick={() => handleCapabilityClick(cap)}
                      />
                    ))}
                  </div>
                </motion.div>
              </div>
            </ScrollArea>
          ) : (
            /* ─── Active Chat View ─── */
            <>
              {/* Chat messages */}
              <ScrollArea className="flex-1" ref={scrollRef}>
                <div className="flex flex-col gap-3 p-4 max-w-2xl mx-auto">
                  {/* Conversation header */}
                  <div className="flex items-center gap-3 pb-3 border-b border-border/30 mb-2">
                    <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={() => { setActiveConvId(null); setError(null); }}>
                      <ArrowLeft className="size-4" />
                    </Button>
                    <div className="flex items-center justify-center size-8 rounded-lg bg-amber-500/10 shrink-0">
                      <Bot className="size-4 text-amber-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h2 className="text-sm font-semibold truncate">{activeConv.title}</h2>
                      <p className="text-[10px] text-muted-foreground">{activeConv.timestamp}</p>
                    </div>
                    <Badge variant="secondary" className="text-[10px] shrink-0">
                      {activeConv.messages?.length || 0} {t('ai.conversations').toLowerCase()}
                    </Badge>
                  </div>

                  {(activeConv.messages || []).map((msg) => (
                    <MessageBubble key={msg.id} message={msg} />
                  ))}
                  {isLoading && <TypingIndicator />}
                  {error && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex items-center gap-2 p-3 rounded-xl bg-destructive/10 text-destructive text-xs max-w-[85%]"
                    >
                      <X className="size-3.5 shrink-0" />
                      <span>{error}</span>
                    </motion.div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              {/* Message input */}
              <div className="shrink-0 border-t border-border/50 p-3">
                <form onSubmit={handleSubmit} className="mx-auto max-w-2xl flex items-center gap-2">
                  <Input
                    ref={inputRef}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={t('ai.chatPlaceholder')}
                    className="flex-1 h-10 rounded-xl bg-muted/50 border-border/50"
                    disabled={isLoading}
                  />
                  <Button
                    type="submit"
                    size="icon"
                    className="size-10 rounded-xl shrink-0"
                    disabled={!inputValue.trim() || isLoading}
                  >
                    {isLoading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Send className="size-4" />
                    )}
                  </Button>
                </form>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
