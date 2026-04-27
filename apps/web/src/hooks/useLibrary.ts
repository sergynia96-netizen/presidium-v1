/**
 * @author Сергей Сергеевич Карнаух
 * @copyright (C) 2026 Сергей Сергеевич Карнаух. All Rights Reserved.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface Book {
  id: string;
  title: string;
  author: string;
  description: string;
  category: string;
  coverUrl: string;
  fileUrl: string;
  price: number;
  rating: number;
  downloads: number;
  sellerId: string;
  sellerName: string;
  createdAt: string;
}

export interface UploadBookPayload {
  title: string;
  author: string;
  description: string;
  category: string;
  coverUrl?: string;
  fileUrl: string;
  price: number;
}

const BOOK_CATEGORIES = ['Фантастика', 'Детектив', 'Учебная', 'Бизнес', 'Программирование', 'Другое'] as const;
export type BookCategory = (typeof BOOK_CATEGORIES)[number];
export { BOOK_CATEGORIES };

export function useBooks(category?: BookCategory, search?: string, sort?: 'rating' | 'popularity' | 'price_asc' | 'price_desc') {
  return useQuery({
    queryKey: ['books', category, search, sort],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (category) params.set('category', category);
      if (search) params.set('search', search);
      if (sort) params.set('sort', sort);
      const { data } = await api.get(/library?);
      return data as Book[];
    },
  });
}

export function useBook(id: string) {
  return useQuery({
    queryKey: ['book', id],
    queryFn: async () => {
      const { data } = await api.get(/library/);
      return data as Book;
    },
    enabled: !!id,
  });
}

export function useUploadBook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: UploadBookPayload) => {
      const { data } = await api.post('/library', payload);
      return data as Book;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['books'] }),
  });
}

export function useDownloadBook() {
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.get(/library//download, { responseType: 'blob' });
      return data;
    },
  });
}
