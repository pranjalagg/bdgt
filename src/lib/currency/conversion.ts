import { isSupportedCurrency, type CurrencyCode } from './currencies';
import type { ForeignAmount, Transaction } from '$lib/types';

// Half away from zero, so a refund converts to exactly the negative of the
// purchase (Math.round alone rounds -2.5 to -2 and 2.5 to 3).
export function convertToBase(foreignMinor: number, rate: number): number {
  const value = foreignMinor / rate;
  const rounded = Math.sign(value) * Math.round(Math.abs(value));
  return rounded === 0 ? 0 : rounded;
}

const RATE_PATTERN = /^(?:\d+(?:\.\d{1,6})?|\.\d{1,6})$/;

export function parseRate(input: string): number | null {
  const cleaned = input.replace(/,/g, '').trim();
  if (!RATE_PATTERN.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function rememberedRate(
  transactions: Pick<Transaction, 'foreign' | 'createdAt' | 'date'>[],
  currency: CurrencyCode,
  base: CurrencyCode
): number | null {
  let best: { at: number; rate: number } | null = null;
  for (const t of transactions) {
    if (!t.foreign || t.foreign.currency !== currency || t.foreign.base !== base) continue;
    const at = t.createdAt ?? new Date(t.date).getTime();
    if (!best || at > best.at) best = { at, rate: t.foreign.rate };
  }
  return best ? best.rate : null;
}

// After the user relabels the base currency, an old foreign record's rate no
// longer relates to the new base, so its note would read nonsense.
export function shouldShowForeignNote(foreign: ForeignAmount | undefined, base: CurrencyCode): boolean {
  return !!foreign && foreign.base === base && foreign.currency !== base;
}

// Backups are untrusted: anything off becomes "no foreign details", and the
// transaction keeps its base amount.
export function normalizeForeign(raw: unknown): ForeignAmount | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const { amount, currency, rate, base } = raw as Record<string, unknown>;
  if (!isSupportedCurrency(currency) || !isSupportedCurrency(base) || currency === base) return undefined;
  if (typeof amount !== 'number' || !Number.isInteger(amount)) return undefined;
  // Same rule as parseRate, so an imported record can always be edited again.
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0 || !RATE_PATTERN.test(String(rate))) return undefined;
  return { amount, currency, rate, base };
}

// Saving without touching the foreign details must not rewrite the stored
// base amount (an imported record may differ by a cent from round(foreign / rate)).
export function baseAmountForSave(
  original: { amount: number; foreign?: ForeignAmount },
  typedMinor: number,
  foreign: ForeignAmount | undefined,
  computedBase: number
): number {
  const o = original.foreign;
  if (o && foreign && o.currency === foreign.currency && o.rate === foreign.rate && o.amount === typedMinor) {
    return original.amount;
  }
  return computedBase;
}
