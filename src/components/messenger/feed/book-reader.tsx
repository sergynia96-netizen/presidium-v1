'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Type,
  Sun,
  Moon,
  Bookmark,
  List,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  BookmarkCheck,
  X,
  BookOpen,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/store/use-app-store';
import { useLibraryStore } from '@/store/use-library-store';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';

function ProgressRing({ percentage, size = 40 }: { percentage: number; size?: number }) {
  const radius = size / 2 - 3;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(100, percentage) / 100);

  return (
    <svg width={size} height={size} className="shrink-0 -rotate-90" viewBox={`0 0 ${size} ${size}`}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        className="text-muted-foreground/30"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        className="text-emerald-500 transition-all duration-500"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function BookReader() {
  const { t } = useT();
  const goBack = useAppStore((s) => s.goBack);
  const book = useLibraryStore((s) => s.currentBook);
  const currentProgress = useLibraryStore((s) => s.currentProgress);
  const updateProgress = useLibraryStore((s) => s.updateProgress);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [fontSize, setFontSize] = useState<'sm' | 'md' | 'lg'>('md');
  const [nightMode, setNightMode] = useState(false);
  const [chapterByBook, setChapterByBook] = useState<Record<string, number>>({});
  const [showChapterList, setShowChapterList] = useState(false);
  const [showBookmarkToast, setShowBookmarkToast] = useState(false);

  const fontSizes: Record<'sm' | 'md' | 'lg', string> = {
    sm: 'text-sm leading-relaxed',
    md: 'text-base leading-loose',
    lg: 'text-lg leading-loose',
  };

  const fontPx: Record<'sm' | 'md' | 'lg', string> = {
    sm: '14px',
    md: '16px',
    lg: '18px',
  };

  const currentChapter = book
    ? chapterByBook[book.id] ?? currentProgress?.currentChapter ?? 1
    : 1;
  const totalChapters = book?.chapters?.length || book?.totalChapters || 1;
  const chapterProgress = Math.round((currentChapter / totalChapters) * 100);

  const saveCurrentProgress = useCallback(() => {
    if (!book || !scrollRef.current) return;
    const el = scrollRef.current;
    const scrollPct = el.scrollHeight > el.clientHeight ? el.scrollTop / (el.scrollHeight - el.clientHeight) : 0;
    const overallPct = ((currentChapter - 1) / totalChapters) * 100 + (scrollPct / totalChapters) * 100;

    updateProgress(book.id, {
      currentChapter,
      scrollPosition: scrollPct,
      percentage: Math.min(100, Math.round(overallPct * 10) / 10),
    });
  }, [book, currentChapter, totalChapters, updateProgress]);

  useEffect(() => {
    if (!book) return;
    const timer = setInterval(saveCurrentProgress, 10000);
    return () => {
      clearInterval(timer);
      saveCurrentProgress();
    };
  }, [book, saveCurrentProgress]);

  const goToChapter = (num: number) => {
    if (book) {
      setChapterByBook((state) => ({
        ...state,
        [book.id]: num,
      }));
    }
    setShowChapterList(false);
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
    if (book) {
      const pct = Math.round(((num - 1) / totalChapters) * 1000) / 10;
      updateProgress(book.id, {
        currentChapter: num,
        scrollPosition: 0,
        percentage: pct,
      });
    }
  };

  const prevChapter = () => goToChapter(Math.max(1, currentChapter - 1));
  const nextChapter = () => goToChapter(Math.min(totalChapters, currentChapter + 1));

  const handleBookmark = () => {
    if (!book) return;
    updateProgress(book.id, {
      bookmarkAdd: {
        chapter: currentChapter,
        position: 0.5,
        label: `${t('library.bookmarkChapter')} ${currentChapter}`,
      },
    });
    setShowBookmarkToast(true);
    setTimeout(() => setShowBookmarkToast(false), 2000);
  };

  const cycleFontSize = () => {
    setFontSize((prev) => {
      const sizes: Array<'sm' | 'md' | 'lg'> = ['sm', 'md', 'lg'];
      const idx = sizes.indexOf(prev);
      return sizes[(idx + 1) % sizes.length];
    });
  };

  if (!book) return null;

  const chapterContent =
    book.chapters && book.chapters[currentChapter - 1]
      ? book.chapters[currentChapter - 1].content
      : book.content || 'No content available.';

  return (
    <div className={cn('relative flex h-full flex-col', nightMode ? 'bg-gray-950 text-gray-100' : 'bg-background')}>
      <AnimatePresence mode="wait">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="flex h-full flex-col"
        >
          <div className={cn('z-10 flex shrink-0 items-center justify-between border-b border-border/50 px-3 py-2', nightMode ? 'bg-gray-900 border-gray-800' : 'bg-background')}>
            <div className="min-w-0 flex flex-1 items-center gap-2">
              <Button variant="ghost" size="icon" className="size-8" onClick={goBack}>
                <ArrowLeft className="size-4" />
              </Button>
              <div className="min-w-0 flex items-center gap-1.5">
                <BookOpen className="size-4 shrink-0 text-primary" />
                <span className="truncate text-xs font-medium">{book.title}</span>
                <span className="hidden truncate text-[10px] text-muted-foreground sm:inline">— {book.author}</span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <ProgressRing percentage={chapterProgress} size={30} />
              <span className="w-8 text-right font-mono text-[10px] text-muted-foreground">{chapterProgress}%</span>
            </div>
          </div>

          <div className={cn('flex shrink-0 items-center justify-between border-b border-border/30 px-3 py-1.5', nightMode ? 'bg-gray-900/80 border-gray-800' : 'bg-muted/30')}>
            <Button variant="ghost" size="sm" className="size-7" onClick={prevChapter} disabled={currentChapter <= 1}>
              <ChevronLeft className="size-3.5" />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 rounded-lg px-3 text-[11px] font-medium" onClick={() => setShowChapterList((v) => !v)}>
              {t('library.chapter')} {currentChapter}/{totalChapters}
            </Button>
            <Button variant="ghost" size="sm" className="size-7" onClick={nextChapter} disabled={currentChapter >= totalChapters}>
              <ChevronRight className="size-3.5" />
            </Button>
            <div className="mx-1 h-4 w-px bg-border/50" />
            <Button variant="ghost" size="icon" className="size-7" onClick={handleBookmark}>
              <Bookmark className="size-3.5" />
            </Button>
          </div>

          <AnimatePresence>
            {showChapterList && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="absolute left-2 right-2 top-[88px] z-30 max-h-[60%] overflow-hidden rounded-xl border border-border bg-background shadow-xl"
              >
                <div className="flex items-center justify-between border-b border-border/50 px-3 pb-2 pt-3">
                  <span className="text-xs font-semibold">{t('library.chapters')}</span>
                  <Button variant="ghost" size="icon" className="size-6" onClick={() => setShowChapterList(false)}>
                    <X className="size-3" />
                  </Button>
                </div>
                <div className="max-h-[50vh] overflow-y-auto px-2 pb-2">
                  {Array.from({ length: totalChapters }, (_, i) => i + 1).map((num) => (
                    <button
                      key={num}
                      onClick={() => goToChapter(num)}
                      className={cn(
                        'w-full rounded-lg px-2 py-2 text-left text-xs transition-colors hover:bg-muted/50 flex items-center gap-2',
                        currentChapter === num && 'bg-primary text-primary-foreground',
                      )}
                    >
                      <span className="w-5 shrink-0 text-right text-muted-foreground">{num}.</span>
                      <span className="flex-1 truncate">
                        {book.chapters && book.chapters[num - 1] ? book.chapters[num - 1].title : `${t('library.chapter')} ${num}`}
                      </span>
                      {num < currentChapter && <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 pb-12 pt-5">
            <div className="mx-auto mb-6 max-w-2xl">
              <h2 className={cn('mb-1 font-semibold', fontSize === 'sm' ? 'text-lg' : fontSize === 'lg' ? 'text-2xl' : 'text-xl', nightMode ? 'text-gray-100' : 'text-foreground')}>
                {book.chapters && book.chapters[currentChapter - 1]
                  ? book.chapters[currentChapter - 1].title
                  : `${t('library.chapter')} ${currentChapter}`}
              </h2>
              <div className="h-px bg-border/40" />
            </div>

            <article className={cn('mx-auto max-w-2xl whitespace-pre-wrap break-words selection:bg-primary/20', fontSizes[fontSize], nightMode ? 'text-gray-300' : 'text-foreground')}>
              {chapterContent}
            </article>

            {currentChapter < totalChapters && (
              <div className="mx-auto mb-4 mt-8 flex max-w-2xl flex-col items-center gap-3">
                <div className="h-px w-16 bg-border/40" />
                <Button variant="outline" className="gap-2 rounded-xl text-sm" onClick={nextChapter}>
                  {t('library.chapter')} {currentChapter + 1}
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            )}
            {currentChapter >= totalChapters && (
              <div className="mx-auto mb-4 mt-8 flex max-w-2xl flex-col items-center gap-3">
                <div className="h-px w-16 bg-border/40" />
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="size-4 text-emerald-500" />
                  {t('library.completed')}
                </div>
              </div>
            )}
          </div>

          <div className={cn('z-10 flex shrink-0 items-center justify-between border-t border-border/50 px-4 py-2', nightMode ? 'border-gray-800 bg-gray-900' : 'bg-background')}>
            <div className="flex items-center gap-1.5">
              <Button variant="ghost" size="sm" className="size-7" onClick={cycleFontSize}>
                <Type className="size-3.5" />
              </Button>
              <span className="font-mono text-[10px] text-muted-foreground">{fontPx[fontSize]}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Button variant="ghost" size="sm" className="size-7" onClick={() => setNightMode((v) => !v)}>
                {nightMode ? <Moon className="size-3.5" /> : <Sun className="size-3.5" />}
              </Button>
              <span className="text-[10px] text-muted-foreground">{nightMode ? t('library.nightMode') : t('library.dayMode')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Button variant="ghost" size="sm" className="size-7" onClick={() => setShowChapterList(true)}>
                <List className="size-3.5" />
              </Button>
              <span className="text-[10px] text-muted-foreground">{t('library.goToChapter')}</span>
            </div>
          </div>

          <AnimatePresence>
            {showBookmarkToast && (
              <motion.div
                initial={{ opacity: 0, y: 4, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.9 }}
                className="absolute bottom-16 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-primary px-3 py-1.5 text-[10px] font-medium text-primary-foreground shadow-lg"
              >
                <BookmarkCheck className="size-3" />
                {t('library.bookmarkSaved')}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
