/**
 * @author Сергей Сергеевич Карнаух
 * @copyright (C) 2026 Сергей Сергеевич Карнаух. All Rights Reserved.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type TierId = 'free' | 'local_ai' | 'cloud_ai';

export interface SubscriptionTier {
  id: TierId;
  name: string;
  price: number;
  features: string[];
}

export interface UserSubscription {
  tierId: TierId;
  expiresAt: string | null;
  isActive: boolean;
}

export const TIERS: SubscriptionTier[] = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    features: [
      'Базовый мессенджер',
      'Лента новостей',
      '5 ГБ хранилища',
      'Базовый маркетплейс',
    ],
  },
  {
    id: 'local_ai',
    name: 'Local AI',
    price: 299,
    features: [
      'Всё из Free',
      'Локальный ИИ-ассистент',
      '50 ГБ хранилища',
      'Расширенный маркетплейс',
      'Библиотека книг',
      'Приоритетная поддержка',
    ],
  },
  {
    id: 'cloud_ai',
    name: 'Cloud AI',
    price: 599,
    features: [
      'Всё из Local AI',
      'Облачный ИИ (GPT-4, Claude)',
      '200 ГБ хранилища',
      'API доступ',
      'Админ-панель',
      'Безлимитные загрузки',
    ],
  },
];

export function useSubscription() {
  return useQuery({
    queryKey: ['subscription'],
    queryFn: async () => {
      const { data } = await api.get('/subscriptions/me');
      return data as UserSubscription;
    },
  });
}

export function useUpgradeSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tierId: TierId) => {
      const { data } = await api.post('/subscriptions/upgrade', { tierId });
      return data as UserSubscription;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subscription'] }),
  });
}
