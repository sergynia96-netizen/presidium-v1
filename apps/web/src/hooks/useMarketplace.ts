/**
 * @author Сергей Сергеевич Карнаух
 * @copyright (C) 2026 Сергей Сергеевич Карнаух. All Rights Reserved.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface MarketplaceItem {
  id: string;
  title: string;
  description: string;
  price: number;
  category: string;
  images: string[];
  sellerId: string;
  sellerName: string;
  sellerAvatar?: string;
  location?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateItemPayload {
  title: string;
  description: string;
  price: number;
  category: string;
  images?: string[];
  location?: string;
}

const CATEGORIES = ['Электроника', 'Услуги', 'Недвижимость', 'Авто', 'Работа', 'Другое'] as const;
export type Category = (typeof CATEGORIES)[number];
export { CATEGORIES };

export function useMarketplaceItems(category?: Category, search?: string, sort?: 'price_asc' | 'price_desc' | 'date') {
  return useQuery({
    queryKey: ['marketplace', category, search, sort],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (category) params.set('category', category);
      if (search) params.set('search', search);
      if (sort) params.set('sort', sort);
      const { data } = await api.get(/marketplace?);
      return data as MarketplaceItem[];
    },
  });
}

export function useMarketplaceItem(id: string) {
  return useQuery({
    queryKey: ['marketplace', id],
    queryFn: async () => {
      const { data } = await api.get(/marketplace/);
      return data as MarketplaceItem;
    },
    enabled: !!id,
  });
}

export function useCreateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateItemPayload) => {
      const { data } = await api.post('/marketplace', payload);
      return data as MarketplaceItem;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['marketplace'] }),
  });
}

export function useDeleteItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(/marketplace/);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['marketplace'] }),
  });
}
