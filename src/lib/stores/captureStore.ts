import { writable, derived, get } from 'svelte/store';
import { db } from '$lib/db';
import { buckets, transactions, bucketStatuses } from './budgetStore';
import { baseCurrency } from './currencyStore';
import { currentMonthKey, today } from './uiStore';
import { rememberedRate } from '$lib/currency/conversion';
import type { CurrencyCode } from '$lib/currency/currencies';
import { calculateSafeToSpendPerDay } from '$lib/utils/calculations';
import { getDaysInMonth, getMonthKey, isCurrentMonth, reviveDateFields } from '$lib/utils/dates';
import {
  suggestBucket, rulesByKey, baseAmount, pendingEverydayCents, canApproveInBulk, buildApproval,
  learnedRule, reopened, transactionIdFor, ruleId, type ApprovalChoice, type Suggestion,
} from '$lib/capture/queue';
import type { Capture, CaptureRule } from '$lib/types';

// The review queue: captured payments and the payee rules learned from them.
// Writes go to Dexie first, then the stores, like the rest of the app.

export const captures = writable<Capture[]>([]);
export const captureRules = writable<CaptureRule[]>([]);

export async function loadCaptures(): Promise<void> {
  const [loaded, rules] = await Promise.all([db.captures.toArray(), db.captureRules.toArray()]);
  captures.set(loaded.map((c) => reviveDateFields(c, ['date'])));
  captureRules.set(rules);
}

const newestFirst = (a: Capture, b: Capture) => b.postedAt - a.postedAt;

export const pendingCaptures = derived(captures, ($c) => $c.filter((c) => c.status === 'pending').sort(newestFirst));

// Duplicates folded under the capture they matched.
export const duplicatesOf = derived(captures, ($c) => {
  const map = new Map<string, Capture[]>();
  for (const c of $c) {
    if (c.status !== 'duplicate' || !c.duplicateOf) continue;
    map.set(c.duplicateOf, [...(map.get(c.duplicateOf) ?? []), c]);
  }
  return map;
});

export const ruleMap = derived(captureRules, ($r) => rulesByKey($r));

export const suggestions = derived([captures, ruleMap, buckets], ([$c, $rules, $buckets]) => {
  const map = new Map<string, Suggestion | null>();
  for (const c of $c) map.set(c.id, suggestBucket(c, $rules, $buckets));
  return map;
});

// The last rate used for a currency, as the Log form remembers it.
export function rateFor(currency: CurrencyCode): number | null {
  return rememberedRate(get(transactions), currency, get(baseCurrency));
}

export const pendingTotal = derived([pendingCaptures, baseCurrency, transactions], ([$p, $base, $t]) =>
  $p.reduce((sum, c) => sum + (baseAmount(c, $base, rememberedRate($t, c.currency, $base)) ?? 0), 0)
);

export const pendingEverydaySpend = derived(
  [captures, ruleMap, buckets, baseCurrency, transactions, today],
  ([$c, $rules, $buckets, $base, $t, $today]) =>
    pendingEverydayCents($c, $rules, $buckets, $base, (cur) => rememberedRate($t, cur, $base), getMonthKey($today))
);

// Safe to spend counts pending payments right away, so it never reads higher
// than it will once they are approved.
export const safeToSpendWithPending = derived(
  [bucketStatuses, currentMonthKey, today, pendingEverydaySpend],
  ([$statuses, $month, $today, $pending]) => {
    if (!isCurrentMonth($month, $today)) return null;
    const daysLeft = getDaysInMonth($month) - $today.getDate() + 1;
    return calculateSafeToSpendPerDay($statuses, daysLeft, $pending);
  }
);

function find(id: string): Capture {
  const c = get(captures).find((x) => x.id === id);
  if (!c) throw new Error('That payment is no longer in the queue');
  return c;
}

function replaceCaptures(changed: Capture[]): void {
  const byId = new Map(changed.map((c) => [c.id, c]));
  captures.update(($c) => $c.map((c) => byId.get(c.id) ?? c));
}

function upsertRule(rule: CaptureRule): void {
  captureRules.update(($r) => [...$r.filter((r) => r.id !== rule.id), rule]);
}

const writeTables = () => [db.transactions, db.captures, db.captureRules];

// Approves with the given bucket, or the suggested one. A foreign payment
// uses the given rate, or the last one used for its currency.
export async function approveCapture(id: string, choice: Partial<ApprovalChoice> = {}): Promise<void> {
  const capture = find(id);
  const bucketId = choice.bucketId ?? get(suggestions).get(id)?.bucketId;
  if (!bucketId) throw new Error('Choose a bucket first');
  const base = get(baseCurrency);
  const rate = choice.rate ?? (capture.currency === base ? undefined : rateFor(capture.currency) ?? undefined);
  const { transaction, capture: approved } = buildApproval(capture, { ...choice, bucketId, rate }, base, Date.now());
  const rule = learnedRule(capture, bucketId, capture.payeeKey ? get(ruleMap).get(capture.payeeKey) : undefined);
  await db.transaction('rw', writeTables(), async () => {
    await db.transactions.put(transaction);
    await db.captures.put(approved);
    if (rule) await db.captureRules.put(rule);
  });
  transactions.update(($t) => [...$t.filter((t) => t.id !== transaction.id), transaction]);
  replaceCaptures([approved]);
  if (rule) upsertRule(rule);
}

// Dismissing also deletes transaction capture:<id>, even where it never
// existed: if another device approved meanwhile, the later action wins for
// both records.
export async function dismissCapture(id: string, options: { ignorePayee?: boolean } = {}): Promise<void> {
  const capture = find(id);
  const now = Date.now();
  const targets = [capture];
  let rule: CaptureRule | null = null;
  if (options.ignorePayee && capture.payeeKey) {
    rule = { id: ruleId(capture.payeeKey), payeeKey: capture.payeeKey, merchant: capture.merchant, action: 'ignore' };
    targets.push(...get(pendingCaptures).filter((c) => c.id !== id && c.payeeKey === capture.payeeKey));
  }
  const dismissed = targets.map((c) => {
    const { transactionId: _t, ...rest } = c;
    return { ...rest, status: 'dismissed' as const, resolvedAt: now };
  });
  await db.transaction('rw', writeTables(), async () => {
    await db.transactions.bulkDelete(dismissed.map((c) => transactionIdFor(c.id)));
    await db.captures.bulkPut(dismissed);
    if (rule) await db.captureRules.put(rule);
  });
  const gone = new Set(dismissed.map((c) => transactionIdFor(c.id)));
  transactions.update(($t) => $t.filter((t) => !gone.has(t.id)));
  replaceCaptures(dismissed);
  if (rule) upsertRule(rule);
}

// Back to pending after an approve or dismiss; the transaction goes.
export async function undoCapture(id: string): Promise<void> {
  const capture = reopened(find(id));
  const txId = transactionIdFor(id);
  await db.transaction('rw', writeTables(), async () => {
    await db.transactions.delete(txId);
    await db.captures.put(capture);
  });
  transactions.update(($t) => $t.filter((t) => t.id !== txId));
  replaceCaptures([capture]);
}

export async function notDuplicate(id: string): Promise<void> {
  const { duplicateOf: _d, ...rest } = find(id);
  const capture: Capture = { ...rest, status: 'pending' };
  await db.captures.put(capture);
  replaceCaptures([capture]);
}

// The captures "Approve all suggested" would take, with their base amounts.
export const bulkApprovable = derived([pendingCaptures, suggestions, baseCurrency, transactions], ([$p, $s, $base, $t]) =>
  $p
    .map((c) => ({ capture: c, amount: baseAmount(c, $base, rememberedRate($t, c.currency, $base)) }))
    .filter(({ capture, amount }) => canApproveInBulk(capture, $s.get(capture.id) ?? null, amount !== null))
);

export async function approveAllSuggested(): Promise<number> {
  const list = get(bulkApprovable);
  for (const { capture } of list) await approveCapture(capture.id);
  return list.length;
}

export async function setRuleBucket(id: string, bucketId: string): Promise<void> {
  const existing = get(captureRules).find((r) => r.id === id);
  if (!existing) return;
  const rule: CaptureRule = { ...existing, action: 'suggest', bucketId };
  await db.captureRules.put(rule);
  upsertRule(rule);
}

export async function setRuleIgnore(id: string): Promise<void> {
  const existing = get(captureRules).find((r) => r.id === id);
  if (!existing) return;
  const { bucketId: _b, ...rest } = existing;
  const rule: CaptureRule = { ...rest, action: 'ignore' };
  await db.captureRules.put(rule);
  upsertRule(rule);
}

export async function deleteRule(id: string): Promise<void> {
  await db.captureRules.delete(id);
  captureRules.update(($r) => $r.filter((r) => r.id !== id));
}
