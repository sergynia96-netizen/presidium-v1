/**
 * @author Сергей Сергеевич Карнаух
 * @copyright (C) 2026 Сергей Сергеевич Карнаух. All Rights Reserved.
 */
'use client';

import { Check } from 'lucide-react';
import type { SubscriptionTier, TierId } from '@/hooks/useSubscriptions';

interface Props {
  tier: SubscriptionTier;
  current?: TierId;
  onSelect: (tierId: TierId) => void;
  isPending: boolean;
}

export function TierCard({ tier, current, onSelect, isPending }: Props) {
  const isCurrent = current === tier.id;

  return (
    <div
      className={lex flex-col rounded-xl border p-6 }
    >
      <h3 className="mb-1 text-lg font-bold text-white">{tier.name}</h3>
      <p className="mb-4 text-3xl font-extrabold text-white">
        {tier.price === 0 ? 'Бесплатно' : ${tier.price} ₽}
        {tier.price > 0 && <span className="text-sm font-normal text-slate-500">/мес</span>}
      </p>

      <ul className="mb-6 flex-1 space-y-2">
        {tier.features.map((f) => (
          <li key={f} className="flex items-center gap-2 text-sm text-slate-300">
            <Check className="h-4 w-4 text-indigo-400" />
            {f}
          </li>
        ))}
      </ul>

      <button
        onClick={() => onSelect(tier.id)}
        disabled={isCurrent || isPending}
        className={ounded-lg py-2.5 text-sm font-semibold transition-colors }
      >
        {isCurrent ? 'Текущий план' : 'Выбрать'}
      </button>
    </div>
  );
}
