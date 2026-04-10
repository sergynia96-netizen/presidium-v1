'use client';

import { motion } from 'framer-motion';
import { MessageSquare, UserPlus, Users } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { useT } from '@/lib/i18n';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.15,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] },
  },
};

export function EmptyState() {
  const { t } = useT();

  const actions = [
    {
      icon: MessageSquare,
      title: t('empty.note.title'),
      description: t('empty.note.desc'),
      color: 'bg-sky-50 text-sky-600',
    },
    {
      icon: UserPlus,
      title: t('empty.invite.title'),
      description: t('empty.invite.desc'),
      color: 'bg-violet-50 text-violet-600',
    },
    {
      icon: Users,
      title: t('empty.group.title'),
      description: t('empty.group.desc'),
      color: 'bg-emerald-50 text-emerald-600',
    },
  ];

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
      <motion.div
        className="w-full max-w-sm text-center"
        variants={containerVariants as unknown as never}
        initial="hidden"
        animate="visible"
      >
        {/* Title */}
        <motion.h2
          variants={itemVariants as unknown as never}
          className="mb-1 text-xl font-bold text-foreground"
        >
          {t('empty.title')}
        </motion.h2>
        <motion.p
          variants={itemVariants as unknown as never}
          className="mb-8 text-sm text-muted-foreground"
        >
          {t('empty.subtitle')}
        </motion.p>

        {/* Action cards */}
        <div className="flex flex-col gap-3">
          {actions.map((action) => (
            <motion.div key={action.title} variants={itemVariants as unknown as never}>
              <Card
                className="cursor-pointer gap-0 overflow-hidden rounded-xl py-0 transition-colors hover:bg-accent/50 active:scale-[0.98]"
              >
                <div className="flex items-center gap-4 p-4">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${action.color}`}
                  >
                    <action.icon className="h-5 w-5" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-semibold text-foreground">
                      {action.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {action.description}
                    </p>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
