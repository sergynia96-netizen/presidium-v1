'use client';

import { motion } from 'framer-motion';
import { MessageSquare, Rss, Sparkles, User } from 'lucide-react';
import { useAppStore } from '@/store/use-app-store';
import { useT } from '@/lib/i18n';
import type { TabView, AppView } from '@/types';

interface NavTab {
  id: TabView;
  labelKey: 'nav.chats' | 'nav.feed' | 'nav.ai' | 'nav.profile';
  icon: React.ComponentType<{ className?: string }>;
  view: AppView;
}

export function BottomNav() {
  const activeTab = useAppStore((s) => s.activeTab);
  const currentView = useAppStore((s) => s.currentView);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const setView = useAppStore((s) => s.setView);
  const { t } = useT();

  const tabs: NavTab[] = [
    { id: 'chats', labelKey: 'nav.chats', icon: MessageSquare, view: 'chats' },
    { id: 'feed', labelKey: 'nav.feed', icon: Rss, view: 'feed' },
    { id: 'ai', labelKey: 'nav.ai', icon: Sparkles, view: 'ai-center' },
    { id: 'profile', labelKey: 'nav.profile', icon: User, view: 'profile' },
  ];

  const hiddenViews: AppView[] = [
    'onboarding', 'chat', 'group-creation',
    'edit-profile', 'two-factor', 'notifications', 'storage',
    'favorites', 'contacts', 'calls', 'create-channel', 'personal-data',
    'contact-profile', 'new-contact', 'global-search', 'create-post',
    'marketplace', 'library', 'library-reader', 'settings',
  ];
  const isVisible = !hiddenViews.includes(currentView);

  if (!isVisible) return null;

  return (
    <motion.nav
      initial={{ y: 100 }}
      animate={{ y: 0 }}
      exit={{ y: 100 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className="fixed bottom-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-lg border-t border-border safe-bottom"
    >
      <div className="max-w-md mx-auto flex items-center justify-around px-2 pt-2 pb-2">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;

          return (
            <motion.button
              key={tab.id}
              whileTap={{ scale: 0.9 }}
              onClick={() => {
                setActiveTab(tab.id);
                setView(tab.view);
              }}
              className="relative flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-xl transition-colors min-w-[64px]"
            >
              {/* Active indicator */}
              {isActive && (
                <motion.div
                  layoutId="activeTabIndicator"
                  className="absolute -top-2 left-1/2 -translate-x-1/2 w-8 h-1 rounded-full bg-primary"
                  transition={{
                    type: 'spring',
                    stiffness: 400,
                    damping: 30,
                  }}
                />
              )}

              {/* Icon with background pill */}
              <motion.div
                className={`flex items-center justify-center size-10 rounded-full transition-colors ${
                  isActive
                    ? 'bg-primary/10'
                    : ''
                }`}
                animate={{ scale: isActive ? 1.05 : 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              >
                <Icon
                  className={`size-5 transition-colors ${
                    isActive
                      ? 'text-primary'
                      : 'text-muted-foreground'
                  }`}
                />
              </motion.div>

              {/* Label */}
              <span
                className={`text-[11px] font-medium transition-colors ${
                  isActive
                    ? 'text-primary'
                    : 'text-muted-foreground'
                }`}
              >
                {t(tab.labelKey)}
          </span>
            </motion.button>
          );
        })}
      </div>
    </motion.nav>
  );
}
