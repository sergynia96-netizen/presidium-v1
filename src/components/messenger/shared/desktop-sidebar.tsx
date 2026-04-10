'use client';

import { motion } from 'framer-motion';
import {
  MessageSquare,
  Rss,
  Sparkles,
  User,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useAppStore } from '@/store/use-app-store';
import { useT } from '@/lib/i18n';
import type { TabView, AppView } from '@/types';

interface NavItem {
  id: TabView;
  labelKey: 'nav.chats' | 'nav.feed' | 'nav.ai' | 'nav.profile';
  icon: React.ComponentType<{ className?: string }>;
  view: AppView;
}

export function DesktopSidebar() {
  const activeTab = useAppStore((s) => s.activeTab);
  const user = useAppStore((s) => s.user);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const setView = useAppStore((s) => s.setView);
  const { t } = useT();

  const navItems: NavItem[] = [
    { id: 'chats', labelKey: 'nav.chats', icon: MessageSquare, view: 'chats' },
    { id: 'feed', labelKey: 'nav.feed', icon: Rss, view: 'feed' },
    { id: 'ai', labelKey: 'nav.ai', icon: Sparkles, view: 'ai-center' },
    { id: 'profile', labelKey: 'nav.profile', icon: User, view: 'profile' },
  ];

  const initials = user?.name
    ? user.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : 'AM';

  return (
    <TooltipProvider delayDuration={300}>
      <aside className="hidden lg:flex flex-col items-center w-[68px] shrink-0 border-r bg-background/80 backdrop-blur-sm py-3 gap-1">
        {/* Logo / Brand */}
        <div className="flex items-center justify-center size-10 rounded-xl bg-primary text-primary-foreground mb-4">
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </div>

        {/* Nav items */}
        <nav className="flex flex-col items-center gap-1 flex-1">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            const Icon = item.icon;

            return (
              <Tooltip key={item.id}>
                <TooltipTrigger asChild>
                  <motion.button
                    whileTap={{ scale: 0.92 }}
                    onClick={() => {
                      setActiveTab(item.id);
                      setView(item.view);
                    }}
                    className={`relative flex items-center justify-center size-11 rounded-xl transition-all duration-200 ${
                      isActive
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="desktop-nav-active"
                        className="absolute inset-0 rounded-xl bg-primary/10 border border-primary/20"
                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                      />
                    )}
                    <Icon className="size-5 relative z-10" />
                  </motion.button>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={12} className="font-medium">
                  {t(item.labelKey)}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </nav>

        {/* Bottom section — user avatar */}
        <div className="flex flex-col items-center mt-auto">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => {
                  setActiveTab('profile');
                  setView('profile');
                }}
              >
                <Avatar className="size-10 ring-2 ring-primary/20 ring-offset-2 ring-offset-background">
                  <AvatarFallback className="text-xs font-bold bg-primary text-primary-foreground">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={12} className="font-medium">
              {user?.name || 'Alex Morgan'}</TooltipContent>
          </Tooltip>
        </div>
      </aside>
    </TooltipProvider>
  );
}
