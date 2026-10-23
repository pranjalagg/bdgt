import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { db } from '$lib/db';
import { buckets, transactions } from '$lib/stores/budgetStore';
import { baseCurrency } from '$lib/stores/currencyStore';
import { today, currentMonthKey } from '$lib/stores/uiStore';
import {
  captures, captureRules, loadCaptures, pendingCaptures, suggestions, approveCapture, approveCaptureAs, dismissCapture, undoCapture,
  notDuplicate, approveAllSuggested, bulkApprovable, pendingEverydaySpend, safeToSpendWithPending, duplicatesOf,
  setRuleBucket, setRuleIgnore, deleteRule,
} from '$lib/stores/captureStore';
import { resetRealDb } from '../../helpers/realDb';
import type { Bucket, Capture } from '$lib/types';

const bucket = (id: string, name: string, over: Partial<Bucket> = {}): Bucket => ({
  id, name, color: '#000', order: 0, isDefault: true, allocationType: 'fixed', fixedAmount: 0, percentageAmount: 0,
  isSavings: false, isEveryday: true, createdAt: new Date(2026, 0, 1), ...over,
});
const capture = (id: string, over: Partial<Capture> = {}): Capture => ({
  id, status: 'pending', source: 'sms', sourceLabel: 'HDFC Bank SMS', postedAt: Date.UTC(2026, 9, 21, 9),
  date: new Date(2026, 9, 21), amount: 25000, currency: 'INR', merchant: 'Swiggy', ...over,
});

async function seed(list: Capture[]) {
  await db.captures.bulkPut(list);
  await loadCaptures();
}

beforeEach(async () => {
  await resetRealDb();
  baseCurrency.set('INR');
  today.set(new Date(2026, 9, 21, 12));
  currentMonthKey.set('2026-10');
  buckets.set([bucket('dining', 'Dining Out'), bucket('grocery', 'Grocery'), bucket('rent', 'Rent/Mortgage', { isEveryday: false })]);
  transactions.set([]);
});

describe('approving', () => {
  it('creates transaction capture:<id>, marks the capture and learns the payee', async () => {
    await seed([capture('a', { payeeKey: 'k', kind: 'dining' })]);
    await approveCapture('a');
    const tx = await db.transactions.get('capture:a');
    expect(tx).toMatchObject({ amount: 25000, bucketId: 'dining', note: 'Swiggy' });
    expect(get(transactions).map((t) => t.id)).toEqual(['capture:a']);
    expect(await db.captures.get('a')).toMatchObject({ status: 'approved', transactionId: 'capture:a' });
    expect(await db.captureRules.get('payee:k')).toMatchObject({ action: 'suggest', bucketId: 'dining' });
    expect(get(pendingCaptures)).toEqual([]);
  });

  it('takes edits, and a learned rule changes the other pending payments to that payee at once', async () => {
    await seed([capture('a', { payeeKey: 'k', kind: 'dining' }), capture('b', { payeeKey: 'k', kind: 'dining', postedAt: 1 })]);
    await approveCapture('a', { bucketId: 'grocery', amount: 30000, note: 'Instamart' });
    expect(await db.transactions.get('capture:a')).toMatchObject({ amount: 30000, bucketId: 'grocery', note: 'Instamart' });
    expect(get(suggestions).get('b')).toEqual({ bucketId: 'grocery', reason: 'rule' });
  });

  it('approves with what the edit form shows and learns its bucket', async () => {
    await seed([capture('a', { payeeKey: 'k', kind: 'dining' })]);
    await approveCaptureAs('a', { amount: 31500, bucketId: 'grocery', date: new Date(2026, 9, 20), note: 'Instamart, with tip' });
    expect(await db.transactions.get('capture:a')).toMatchObject({ amount: 31500, bucketId: 'grocery', note: 'Instamart, with tip' });
    expect(await db.captureRules.get('payee:k')).toMatchObject({ bucketId: 'grocery' });
    expect(get(pendingCaptures)).toEqual([]);
  });

  it('refuses without a bucket, and converts a foreign payment with the last rate', async () => {
    await seed([capture('a'), capture('usd', { currency: 'USD', amount: 650, kind: 'dining' })]);
    await expect(approveCapture('a')).rejects.toThrow('Choose a bucket first');
    transactions.set([{ id: 'old', amount: 100, bucketId: 'dining', date: new Date(2026, 9, 1), createdAt: 1, foreign: { amount: 1, currency: 'USD', rate: 0.012, base: 'INR' } }]);
    await approveCapture('usd');
    expect(await db.transactions.get('capture:usd')).toMatchObject({ amount: 54167, foreign: { amount: 650, currency: 'USD', rate: 0.012, base: 'INR' } });
  });
});

describe('dismissing and undoing', () => {
  it('dismisses, and ignoring the payee dismisses its other pending payments and saves a rule', async () => {
    await seed([capture('a', { payeeKey: 'cred' }), capture('b', { payeeKey: 'cred' }), capture('c')]);
    await dismissCapture('a', { ignorePayee: true });
    expect((await db.captures.bulkGet(['a', 'b', 'c'])).map((c) => c!.status)).toEqual(['dismissed', 'dismissed', 'pending']);
    expect(await db.captureRules.get('payee:cred')).toMatchObject({ action: 'ignore' });
  });

  it('deletes the transaction id on dismiss, so an earlier approval is removed', async () => {
    await seed([capture('a', { kind: 'dining' })]);
    await approveCapture('a');
    await dismissCapture('a');
    expect(await db.transactions.get('capture:a')).toBeUndefined();
    expect(get(transactions)).toEqual([]);
    expect(await db.captures.get('a')).not.toHaveProperty('transactionId');
  });

  it('undo returns an approved capture to the queue and removes its transaction', async () => {
    await seed([capture('a', { kind: 'dining' })]);
    await approveCapture('a');
    await undoCapture('a');
    expect(await db.transactions.get('capture:a')).toBeUndefined();
    expect(get(pendingCaptures).map((c) => c.id)).toEqual(['a']);
    await approveCapture('a', { bucketId: 'grocery' });
    expect(await db.transactions.get('capture:a')).toMatchObject({ bucketId: 'grocery' });
  });
});

describe('duplicates', () => {
  it('folds a duplicate under its capture and can split it back', async () => {
    await seed([capture('a'), capture('b', { source: 'wallet', status: 'duplicate', duplicateOf: 'a' })]);
    expect(get(duplicatesOf).get('a')!.map((c) => c.id)).toEqual(['b']);
    await notDuplicate('b');
    expect(await db.captures.get('b')).toMatchObject({ status: 'pending' });
    expect(await db.captures.get('b')).not.toHaveProperty('duplicateOf');
  });
});

describe('approve all suggested', () => {
  it('approves only suggested payments without hints', async () => {
    await seed([
      capture('a', { kind: 'dining' }),
      capture('b'),
      capture('c', { kind: 'dining', hint: 'card-bill' }),
      capture('d', { kind: 'grocery', currency: 'USD', amount: 100 }),
    ]);
    expect(get(bulkApprovable).map((x) => x.capture.id)).toEqual(['a']);
    expect(await approveAllSuggested()).toBe(1);
    expect(get(pendingCaptures).map((c) => c.id).sort()).toEqual(['b', 'c', 'd']);
  });
});

describe('safe to spend', () => {
  it('counts pending everyday payments until they are approved or dismissed', async () => {
    await seed([capture('a', { kind: 'dining', amount: 3100 }), capture('b', { amount: 1000 })]);
    expect(get(pendingEverydaySpend)).toBe(4100);
    const withPending = get(safeToSpendWithPending);
    await dismissCapture('b');
    expect(get(pendingEverydaySpend)).toBe(3100);
    expect(get(safeToSpendWithPending)).toBeGreaterThan(withPending!);
  });
});

describe('rules', () => {
  it('can be changed, switched to ignore and deleted', async () => {
    await seed([capture('a', { payeeKey: 'k', kind: 'dining' })]);
    await approveCapture('a');
    await setRuleBucket('payee:k', 'grocery');
    expect(await db.captureRules.get('payee:k')).toMatchObject({ action: 'suggest', bucketId: 'grocery' });
    await setRuleIgnore('payee:k');
    expect(await db.captureRules.get('payee:k')).not.toHaveProperty('bucketId');
    await deleteRule('payee:k');
    expect(get(captureRules)).toEqual([]);
    expect(get(captures)).toHaveLength(1);
  });
});
