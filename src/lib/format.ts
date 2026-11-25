import type { PriceRange } from '../types';

const TIER_LABELS: Record<PriceRange, string> = {
  $: 'Essential',
  $$: 'Standard',
  $$$: 'Upscale',
  $$$$: 'Signature',
};

export function formatTierLabel(tier: PriceRange | string | undefined): string {
  if (!tier) return 'Standard';
  return TIER_LABELS[tier as PriceRange] || 'Standard';
}

export function formatServiceFee(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return 'Complimentary';
  return `${amount.toFixed(2)}`;
}
