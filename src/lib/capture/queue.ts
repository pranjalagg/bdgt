import { convertToBase } from '$lib/currency/conversion';
import type { CurrencyCode } from '$lib/currency/currencies';
import { getMonthKey } from '$lib/utils/dates';
import type { Bucket, Capture, CaptureHint, CaptureRule, ForeignAmount, MerchantKind, Transaction } from '$lib/types';

// What the review queue decides, as plain functions: which bucket to suggest,
// what a capture is worth in the base currency, how much pending spending
// safe to spend should already count, and what approving writes.

export type SuggestionReason = 'rule' | 'kind';

export interface Suggestion {
  bucketId: string;
  reason: SuggestionReason;
}

// A merchant kind suggests the default bucket of that name, when the person
// still has it.
export const KIND_BUCKET_NAMES: Record<MerchantKind, string> = {
  grocery: 'Grocery',
  dining: 'Dining Out',
  transport: 'Transportation',
  subscriptions: 'Subscriptions',
  entertainment: 'Entertainment',
  utilities: 'Utilities',
};

export const HINT_TEXT: Record<CaptureHint, string> = {
  'card-bill': 'Looks like a credit card bill payment',
  transfer: 'Looks like a transfer between your own accounts',
  atm: 'Looks like a cash withdrawal',
  'upi-lite-topup': 'A UPI Lite top-up: the small payments it pays for are not listed one by one',
};

export function ruleId(payeeKey: string): string {
  return `payee:${payeeKey}`;
}

export function transactionIdFor(captureId: string): string {
  return `capture:${captureId}`;
}

// The capture a transaction was approved from, if any.
export function captureIdOf(transactionId: string): string | null {
  return transactionId.startsWith('capture:') ? transactionId.slice('capture:'.length) : null;
}

// True when what went into the budget is not simply the payment as captured:
// only part of it was kept (friends paid their share), or it was converted
// from another currency.
export function recordedDiffers(capture: Capture, transaction: Transaction, base: CurrencyCode): boolean {
  if (capture.currency !== base) return true;
  return transaction.foreign !== undefined || transaction.amount !== capture.amount;
}

export function rulesByKey(rules: CaptureRule[]): Map<string, CaptureRule> {
  return new Map(rules.map((r) => [r.payeeKey, r]));
}

// A learned rule first, then the merchant kind, then nothing. Worked out when
// shown, so a rule learned on any device applies to every pending capture.
export function suggestBucket(capture: Capture, rules: Map<string, CaptureRule>, buckets: Bucket[]): Suggestion | null {
  const assignable = buckets.filter((b) => !b.isSystem);
  const rule = capture.payeeKey ? rules.get(capture.payeeKey) : undefined;
  if (rule?.action === 'suggest' && rule.bucketId && assignable.some((b) => b.id === rule.bucketId)) {
    return { bucketId: rule.bucketId, reason: 'rule' };
  }
  if (capture.kind) {
    const name = KIND_BUCKET_NAMES[capture.kind].toLowerCase();
    const bucket = assignable.find((b) => b.name.trim().toLowerCase() === name);
    if (bucket) return { bucketId: bucket.id, reason: 'kind' };
  }
  return null;
}

export function isIgnored(capture: Capture, rules: Map<string, CaptureRule>): boolean {
  return !!capture.payeeKey && rules.get(capture.payeeKey)?.action === 'ignore';
}

// Base-currency cents, or null for a foreign payment with no rate to use.
export function baseAmount(capture: Pick<Capture, 'amount' | 'currency'>, base: CurrencyCode, rate: number | null | undefined): number | null {
  if (capture.currency === base) return capture.amount;
  return rate ? convertToBase(capture.amount, rate) : null;
}

// Pending payments this month that would land in everyday spending (their
// suggested bucket is an everyday, non-savings one, or there is no
// suggestion yet), in base cents. Foreign payments without a rate are left out.
export function pendingEverydayCents(
  captures: Capture[],
  rules: Map<string, CaptureRule>,
  buckets: Bucket[],
  base: CurrencyCode,
  rateFor: (currency: CurrencyCode) => number | null,
  monthKey: string
): number {
  let total = 0;
  for (const c of captures) {
    if (c.status !== 'pending' || getMonthKey(new Date(c.date)) !== monthKey) continue;
    const suggestion = suggestBucket(c, rules, buckets);
    const bucket = suggestion ? buckets.find((b) => b.id === suggestion.bucketId) : undefined;
    if (bucket && (bucket.isSavings || !bucket.isEveryday)) continue;
    const amount = baseAmount(c, base, rateFor(c.currency));
    if (amount !== null) total += amount;
  }
  return total;
}

// "Approve all suggested" takes only captures with a suggestion, no hint
// that they may not be spending, and a base amount it can work out.
export function canApproveInBulk(capture: Capture, suggestion: Suggestion | null, amountKnown: boolean): boolean {
  return capture.status === 'pending' && !!suggestion && !capture.hint && amountKnown;
}

export interface ApprovalChoice {
  bucketId: string;
  amount?: number; // minor units of the capture's currency, when edited
  date?: Date;
  note?: string;
  rate?: number; // for a foreign payment
}

// What an approval saves, as the edit form or a one-tap approval worked it out.
export interface ApprovedValues {
  amount: number; // base cents
  foreign?: ForeignAmount;
  bucketId: string;
  date: Date;
  note?: string;
}

// The transaction capture:<id> holding exactly these values, and the capture as approved.
export function approvedWith(capture: Capture, values: ApprovedValues, now: number): { transaction: Transaction; capture: Capture } {
  const transaction: Transaction = { id: transactionIdFor(capture.id), amount: values.amount, bucketId: values.bucketId, date: values.date, createdAt: now };
  const note = values.note?.trim();
  if (note) transaction.note = note;
  if (values.foreign) transaction.foreign = values.foreign;
  return {
    transaction,
    capture: { ...capture, status: 'approved', transactionId: transaction.id, resolvedAt: now },
  };
}

// One-tap approval: the captured amount (converted with `rate` when foreign),
// the capture's day, and the merchant as the note.
export function buildApproval(capture: Capture, choice: ApprovalChoice, base: CurrencyCode, now: number): { transaction: Transaction; capture: Capture } {
  const paid = choice.amount ?? capture.amount;
  const foreign = capture.currency !== base;
  if (foreign && !choice.rate) throw new Error('A rate is needed for a payment in another currency');
  return approvedWith(
    capture,
    {
      amount: foreign ? convertToBase(paid, choice.rate!) : paid,
      foreign: foreign ? { amount: paid, currency: capture.currency, rate: choice.rate!, base } : undefined,
      bucketId: choice.bucketId,
      date: choice.date ?? new Date(capture.date),
      note: choice.note ?? capture.merchant,
    },
    now
  );
}

// The rule an approval teaches, or null when it already says the same.
export function learnedRule(capture: Capture, bucketId: string, existing: CaptureRule | undefined): CaptureRule | null {
  if (!capture.payeeKey) return null;
  if (existing?.action === 'suggest' && existing.bucketId === bucketId) return null;
  return { id: ruleId(capture.payeeKey), payeeKey: capture.payeeKey, merchant: capture.merchant, action: 'suggest', bucketId };
}

// Back to the queue: approval or dismissal undone.
export function reopened(capture: Capture): Capture {
  const { transactionId: _t, resolvedAt: _r, ...rest } = capture;
  return { ...rest, status: 'pending' };
}
