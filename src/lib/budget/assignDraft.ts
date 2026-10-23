import type { Bucket } from '$lib/types';
import { evaluateExpression } from '$lib/utils/currency';

// Assigning money is a draft until Done: one text field per fixed envelope
// (percentage and hybrid ones follow income on their own).

export type AssignDraft = Record<string, string>;

export function dollarsText(cents: number): string {
  if (!cents) return '';
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

export function draftFrom(statuses: { bucket: Bucket; allocated: number }[]): AssignDraft {
  return Object.fromEntries(
    statuses.filter((s) => !s.bucket.isSystem && s.bucket.allocationType === 'fixed').map((s) => [s.bucket.id, dollarsText(s.allocated)])
  );
}

// One field in cents: blank is nothing, an expression is worked out, and
// anything else (or below zero) is not an amount.
export function fieldCents(raw: string): number | null {
  const trimmed = (raw ?? '').trim();
  if (trimmed === '') return 0;
  const value = evaluateExpression(trimmed);
  if (value === null || value < 0) return null;
  return Math.round(value * 100);
}

// Everything assigned: the fields plus the envelopes that follow income.
export function draftTotal(draft: AssignDraft, derived: number): number | null {
  let total = derived;
  for (const raw of Object.values(draft)) {
    const cents = fieldCents(raw);
    if (cents === null) return null;
    total += cents;
  }
  return total;
}

export function leftToAssign(income: number, total: number): number {
  return income - total;
}

export function restTarget(buckets: Bucket[]): Bucket | null {
  return [...buckets].filter((b) => b.isSavings && !b.isSystem).sort((a, b) => a.order - b.order)[0] ?? null;
}
