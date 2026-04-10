import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getRelayAuthHeaders } from '@/lib/relay-auth';

export interface BookChapter {
  number: number;
  title: string;
  content: string;
}

export interface Book {
  id: string;
  title: string;
  author: string;
  description: string | null;
  coverUrl: string | null;
  language: string;
  category: string;
  totalChapters: number;
  totalWords: number;
  content: string;
  chapters?: BookChapter[];
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ReadingProgress {
  id: string;
  accountId: string;
  bookId: string;
  currentChapter: number;
  scrollPosition: number;
  percentage: number;
  lastRead: string;
  bookmarks: Array<{ chapter: number; position: number; label: string }>;
  book: Book;
  isCompleted: boolean;
  lastReadAt: string;
}

interface LibraryState {
  books: Book[];
  categories: Array<{ name: string; label: string }>;
  library: ReadingProgress[];
  currentBook: Book | null;
  currentProgress: ReadingProgress | null;
  activeCategory: string;
  activeLanguage: string;
  searchQuery: string;
  isLoading: boolean;
  error: string | null;

  setActiveCategory: (cat: string) => void;
  setActiveLanguage: (lang: string) => void;
  setSearchQuery: (q: string) => void;
  fetchBooks: () => Promise<void>;
  fetchCategories: () => Promise<void>;
  fetchLibrary: () => Promise<void>;
  selectBook: (book: Book | null) => Promise<void>;
  updateProgress: (
    bookId: string,
    data: {
      currentChapter?: number;
      scrollPosition?: number;
      percentage?: number;
      bookmarkAdd?: { chapter: number; position: number; label: string };
      bookmarkRemove?: string;
    },
  ) => Promise<void>;
  clearError: () => void;
}

export const useLibraryStore = create<LibraryState>()(
  persist(
    (set, get) => ({
      books: [],
      categories: [],
      library: [],
      currentBook: null,
      currentProgress: null,
      activeCategory: 'All',
      activeLanguage: 'All',
      searchQuery: '',
      isLoading: false,
      error: null,

      setActiveCategory: (cat) => set({ activeCategory: cat }),
      setActiveLanguage: (lang) => set({ activeLanguage: lang }),
      setSearchQuery: (q) => set({ searchQuery: q }),

      fetchBooks: async () => {
        set({ isLoading: true, error: null });
        try {
          const params = new URLSearchParams();
          if (get().activeCategory !== 'All') params.set('category', get().activeCategory);
          if (get().activeLanguage !== 'All') params.set('language', get().activeLanguage);
          if (get().searchQuery.trim()) params.set('search', get().searchQuery.trim());

          const res = await fetch(`/api/books?${params.toString()}`);
          if (!res.ok) {
            throw new Error('Failed to load books');
          }
          const data = await res.json();
          set({ books: data.books || [], isLoading: false });
        } catch (err) {
          set({ isLoading: false, error: err instanceof Error ? err.message : 'Failed to load books' });
        }
      },

      fetchCategories: async () => {
        try {
          const res = await fetch('/api/books/categories');
          if (!res.ok) return;
          const data = await res.json();
          set({ categories: data.categories || [] });
        } catch {
          // noop
        }
      },

      fetchLibrary: async () => {
        set({ isLoading: true, error: null });
        try {
          const res = await fetch('/api/books/library', {
            headers: getRelayAuthHeaders(),
          });
          if (!res.ok) {
            throw new Error('Failed to load library. Login may be required.');
          }
          const data = await res.json();
          set({ library: data.library || [], isLoading: false });
        } catch (err) {
          set({ isLoading: false, error: err instanceof Error ? err.message : 'Failed to load library' });
        }
      },

      selectBook: async (book) => {
        set({ currentBook: book, currentProgress: null });
        if (!book) return;

        try {
          const detailsRes = await fetch(`/api/books/${book.id}`);
          if (detailsRes.ok) {
            const detailsData = await detailsRes.json();
            if (detailsData.book) {
              set({ currentBook: detailsData.book });
            }
          }
        } catch {
          // noop
        }

        try {
          const progressRes = await fetch(`/api/books/${book.id}/progress`, {
            headers: getRelayAuthHeaders(),
          });
          if (progressRes.ok) {
            const progressData = await progressRes.json();
            if (progressData.progress) {
              set({ currentProgress: progressData.progress });
            }
          }
        } catch {
          // noop
        }
      },

      updateProgress: async (bookId, data) => {
        try {
          const res = await fetch(`/api/books/${bookId}/progress`, {
            method: 'POST',
            headers: getRelayAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(data),
          });
          if (!res.ok) return;
          const result = await res.json();
          set((state) => ({
            currentProgress: result.progress || state.currentProgress,
          }));
          get().fetchLibrary();
        } catch {
          // noop
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'presidium-library',
      partialize: (state) => ({
        activeCategory: state.activeCategory,
        activeLanguage: state.activeLanguage,
      }),
    },
  ),
);
