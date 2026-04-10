'use client';
/* eslint-disable @next/next/no-img-element */

import { useState, useEffect } from 'react';
import { motion, type Variants } from 'framer-motion';
import {
  ArrowLeft,
  Search,
  BookOpen,
  Globe,
  Tag,
  Library as LibraryIcon,
  BookmarkCheck,
  Clock,
  BookMarked,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAppStore } from '@/store/use-app-store';
import { useLibraryStore, type Book, type ReadingProgress } from '@/store/use-library-store';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';

const container: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.03, delayChildren: 0.04 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: 0.2, ease: 'easeOut' as const } },
};

function formatWords(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return count.toString();
}

function BookCard({
  book,
  progress,
  onView,
}: {
  book: Book;
  progress?: ReadingProgress | null;
  onView: (book: Book) => void;
}) {
  const { t } = useT();
  const langLabel = book.language === 'ru' ? 'RU' : 'EN';

  return (
    <motion.div variants={item} className="cursor-pointer" onClick={() => onView(book)}>
      <Card className="group overflow-hidden border-border/50 py-0 transition-all duration-200 hover:border-border hover:shadow-md rounded-2xl">
        <div className="relative flex h-40 items-center justify-center overflow-hidden bg-gradient-to-br from-primary/5 to-primary/10">
          {book.coverUrl ? (
            <img
              src={book.coverUrl}
              alt={book.title}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              loading="lazy"
            />
          ) : (
            <BookOpen className="size-12 text-primary/30" />
          )}
          <Badge variant="secondary" className="absolute right-2 top-2 bg-background/80 py-0 px-1.5 text-[10px] font-mono backdrop-blur-sm">
            {langLabel}
          </Badge>
          {progress && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-background/80 backdrop-blur-sm">
              <div className="h-full bg-primary transition-all duration-300" style={{ width: `${Math.min(100, progress.percentage)}%` }} />
            </div>
          )}
        </div>
        <CardContent className="p-3">
          <h3 className="mb-0.5 line-clamp-2 text-sm font-medium transition-colors group-hover:text-primary">{book.title}</h3>
          <p className="mb-1.5 text-xs text-muted-foreground">{book.author}</p>
          <div className="flex items-center justify-between gap-1.5">
            <Badge variant="secondary" className="py-0 px-1.5 text-[10px]">
              {book.category}
            </Badge>
            <span className="text-[10px] text-muted-foreground">
              {formatWords(book.totalWords)} {t('library.words')}
            </span>
          </div>
          {progress && (
            <div className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
              {progress.isCompleted ? (
                <BookmarkCheck className="size-3 text-emerald-500" />
              ) : (
                <Clock className="size-3 text-amber-500" />
              )}
              <span>{progress.isCompleted ? t('library.completed') : `${Math.round(progress.percentage)}%`}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default function LibraryScreen() {
  const { t } = useT();
  const goBack = useAppStore((s) => s.goBack);
  const setView = useAppStore((s) => s.setView);

  const books = useLibraryStore((s) => s.books);
  const categories = useLibraryStore((s) => s.categories);
  const library = useLibraryStore((s) => s.library);
  const activeCategory = useLibraryStore((s) => s.activeCategory);
  const activeLanguage = useLibraryStore((s) => s.activeLanguage);
  const searchQuery = useLibraryStore((s) => s.searchQuery);
  const isLoading = useLibraryStore((s) => s.isLoading);
  const setActiveCategory = useLibraryStore((s) => s.setActiveCategory);
  const setActiveLanguage = useLibraryStore((s) => s.setActiveLanguage);
  const setSearchQuery = useLibraryStore((s) => s.setSearchQuery);
  const fetchBooks = useLibraryStore((s) => s.fetchBooks);
  const fetchCategories = useLibraryStore((s) => s.fetchCategories);
  const fetchLibrary = useLibraryStore((s) => s.fetchLibrary);
  const selectBook = useLibraryStore((s) => s.selectBook);

  const [showMyBooks, setShowMyBooks] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);

  useEffect(() => {
    void fetchBooks();
    void fetchCategories();
    void fetchLibrary();
  }, [fetchBooks, fetchCategories, fetchLibrary]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      void fetchBooks();
      return;
    }
    const timer = setTimeout(() => {
      void fetchBooks();
    }, 350);
    return () => clearTimeout(timer);
  }, [searchQuery, fetchBooks]);

  useEffect(() => {
    void fetchBooks();
  }, [activeCategory, activeLanguage, fetchBooks]);

  const displayBooks = showMyBooks
    ? library
        .map((p) => p.book)
        .filter((b, i, arr) => arr.findIndex((x) => x.id === b.id) === i)
    : books;

  const completedCount = library.filter((p) => p.isCompleted).length;
  const readingCount = library.filter((p) => !p.isCompleted && p.percentage > 0).length;

  const handleViewBook = async (book: Book) => {
    await selectBook(book);
    setView('library-reader');
  };

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex shrink-0 items-center justify-between border-b border-border/50 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <Button variant="ghost" size="icon" className="size-9" onClick={goBack}>
            <ArrowLeft className="size-5" />
          </Button>
          <LibraryIcon className="size-5 text-primary" />
          <h1 className="text-lg font-semibold">{t('library.title')}</h1>
        </div>
        <Button
          variant={showMyBooks ? 'default' : 'outline'}
          size="sm"
          className={cn('h-8 gap-1.5 rounded-lg text-xs transition-all', showMyBooks && 'shadow-sm')}
          onClick={() => setShowMyBooks((v) => !v)}
        >
          <BookMarked className="size-3.5" />
          {showMyBooks ? t('library.myBooks') : t('library.catalog')}
        </Button>
      </div>

      <div className="shrink-0 px-4 pt-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder={t('library.searchBooks')}
            className={cn('h-9 rounded-lg pl-9 text-sm', searchFocused && 'ring-2 ring-primary/20')}
          />
        </div>
      </div>

      <div className="shrink-0 px-4 pt-2">
        <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto">
          <Button
            variant={activeLanguage === 'All' ? 'default' : 'outline'}
            size="sm"
            className="h-7 shrink-0 gap-1 rounded-full px-3 text-xs"
            onClick={() => setActiveLanguage('All')}
          >
            <Globe className="size-3" />
            All
          </Button>
          {['en', 'ru'].map((lang) => (
            <Button
              key={lang}
              variant={activeLanguage === lang ? 'default' : 'outline'}
              size="sm"
              className="h-7 shrink-0 rounded-full px-3 text-xs"
              onClick={() => setActiveLanguage(lang)}
            >
              {lang === 'en' ? 'English' : 'Русский'}
            </Button>
          ))}
        </div>
      </div>

      <div className="shrink-0 px-4 pt-1">
        <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto">
          <Button
            variant={activeCategory === 'All' ? 'default' : 'outline'}
            size="sm"
            className="h-7 shrink-0 gap-1 rounded-full px-3 text-xs"
            onClick={() => setActiveCategory('All')}
          >
            <Tag className="size-3" />
            All
          </Button>
          {categories.map((cat) => (
            <Button
              key={cat.name}
              variant={activeCategory === cat.name ? 'default' : 'outline'}
              size="sm"
              className="h-7 shrink-0 rounded-full px-3 text-xs"
              onClick={() => setActiveCategory(cat.name)}
            >
              {cat.label}
            </Button>
          ))}
        </div>
      </div>

      {showMyBooks && (
        <div className="shrink-0 px-4 pt-2">
          <div className="flex gap-2">
            <div className="flex-1 rounded-xl border border-border/50 bg-muted/50 p-2.5 text-center">
              <p className="text-[10px] text-muted-foreground">{t('library.totalBooks')}</p>
              <p className="text-lg font-semibold">{library.length}</p>
            </div>
            <div className="flex-1 rounded-xl border border-border/50 bg-muted/50 p-2.5 text-center">
              <p className="text-[10px] text-muted-foreground">{t('library.reading')}</p>
              <p className="text-lg font-semibold text-amber-500">{readingCount}</p>
            </div>
            <div className="flex-1 rounded-xl border border-border/50 bg-muted/50 p-2.5 text-center">
              <p className="text-[10px] text-muted-foreground">{t('library.completed')}</p>
              <p className="text-lg font-semibold text-emerald-500">{completedCount}</p>
            </div>
          </div>
        </div>
      )}

      <ScrollArea className="flex-1">
        <div className="mx-auto max-w-2xl p-4 pb-6">
          {isLoading ? (
            <div className="grid grid-cols-2 gap-3 pb-4 lg:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-52 animate-pulse rounded-2xl bg-muted/30" />
              ))}
            </div>
          ) : displayBooks.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
              className="flex flex-col items-center justify-center py-16"
            >
              <div className="mb-4 flex size-20 items-center justify-center rounded-full bg-muted/60">
                <BookOpen className="size-8 text-muted-foreground/40" />
              </div>
              <h3 className="mb-1 text-base font-semibold">{t('library.emptyTitle')}</h3>
              <p className="mb-6 max-w-[260px] text-center text-sm text-muted-foreground">{t('library.emptyDesc')}</p>
            </motion.div>
          ) : (
            <motion.div variants={container} initial="hidden" animate="show" className="grid grid-cols-2 gap-3 pb-4 lg:grid-cols-3">
              {displayBooks.map((book) => (
                <BookCard
                  key={book.id}
                  book={book}
                  progress={showMyBooks ? library.find((p) => p.bookId === book.id) || null : null}
                  onView={handleViewBook}
                />
              ))}
            </motion.div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
