import { describe, it, expect } from 'vitest';
import {
  suggestBucket, rulesByKey, isIgnored, baseAmount, pendingEverydayCents, canApproveInBulk,
  buildApproval, approvedWith, learnedRule, reopened, transactionIdFor, captureIdOf, recordedDiffers,
} from '$lib/capture/queue';
import type { Bucket, Capture, CaptureRule } from '$lib/types';

const bucket = (id: string, name: string, over: Partial<Bucket> = {}): Bucket => ({
  id, name, color: '#000', order: 0, isDefault: true, allocationType: 'fixed', fixedAmount: 0, percentageAmount: 0,
  isSavings: false, isEveryday: true, createdAt: new Date(2026, 0, 1), ...over,
});
const buckets = [
  bucket('dining', 'Dining Out'),
  bucket('grocery', 'Grocery'),
  bucket('rent', 'Rent/Mortgage', { isEveryday: false }),
  bucket('savings', 'Savings', { isSavings: true, isEveryday: false }),
  bucket('unsorted', 'Unsorted', { isSystem: true, isEveryday: false }),
];
const capture = (over: Partial<Capture> = {}): Capture => ({
  id: 'sms:1', status: 'pending', source: 'sms', sourceLabel: 'HDFC Bank SMS', postedAt: Date.UTC(2026, 9, 21, 9),
  date: new Date(2026, 9, 21), amount: 25000, currency: 'INR', merchant: 'Swiggy', ...over,
});
const rule = (over: Partial<CaptureRule> = {}): CaptureRule => ({ id: 'payee:k', payeeKey: 'k', merchant: 'Swiggy', action: 'suggest', bucketId: 'grocery', ...over });

describe('suggestBucket', () => {
  it('prefers a learned rule, then the merchant kind, then nothing', () => {
    const rules = rulesByKey([rule()]);
    expect(suggestBucket(capture({ payeeKey: 'k', kind: 'dining' }), rules, buckets)).toEqual({ bucketId: 'grocery', reason: 'rule' });
    expect(suggestBucket(capture({ payeeKey: 'other', kind: 'dining' }), rules, buckets)).toEqual({ bucketId: 'dining', reason: 'kind' });
    expect(suggestBucket(capture({ payeeKey: 'other' }), rules, buckets)).toBeNull();
  });

  it('ignores a rule whose bucket is gone or that says ignore, and never suggests a system bucket', () => {
    expect(suggestBucket(capture({ payeeKey: 'k', kind: 'dining' }), rulesByKey([rule({ bucketId: 'deleted' })]), buckets)).toEqual({ bucketId: 'dining', reason: 'kind' });
    expect(suggestBucket(capture({ payeeKey: 'k' }), rulesByKey([rule({ action: 'ignore', bucketId: undefined })]), buckets)).toBeNull();
    expect(suggestBucket(capture({ payeeKey: 'k' }), rulesByKey([rule({ bucketId: 'unsorted' })]), buckets)).toBeNull();
  });

  it('matches the kind to a renamed-case bucket but not to a renamed one', () => {
    expect(suggestBucket(capture({ kind: 'grocery' }), new Map(), [bucket('g', ' grocery ')])).toEqual({ bucketId: 'g', reason: 'kind' });
    expect(suggestBucket(capture({ kind: 'grocery' }), new Map(), [bucket('g', 'Food shopping')])).toBeNull();
  });
});

describe('isIgnored', () => {
  it('is true only for an ignore rule on the payee', () => {
    expect(isIgnored(capture({ payeeKey: 'k' }), rulesByKey([rule({ action: 'ignore' })]))).toBe(true);
    expect(isIgnored(capture({ payeeKey: 'k' }), rulesByKey([rule()]))).toBe(false);
    expect(isIgnored(capture(), rulesByKey([rule({ action: 'ignore' })]))).toBe(false);
  });
});

describe('baseAmount', () => {
  it('uses the amount in the base currency and converts a foreign one with a rate', () => {
    expect(baseAmount(capture(), 'INR', null)).toBe(25000);
    expect(baseAmount(capture(), 'USD', 84)).toBe(298);
    expect(baseAmount(capture(), 'USD', null)).toBeNull();
  });
});

describe('pendingEverydayCents', () => {
  const month = '2026-10';
  const rate = () => null;
  it('counts pending captures headed for everyday spending or with no suggestion', () => {
    const rules = rulesByKey([rule({ payeeKey: 'rent', bucketId: 'rent' }), rule({ payeeKey: 'save', bucketId: 'savings' })]);
    const list = [
      capture({ id: 'a', kind: 'dining', amount: 1000 }),
      capture({ id: 'b', amount: 2000 }),
      capture({ id: 'c', payeeKey: 'rent', amount: 50000 }),
      capture({ id: 'd', payeeKey: 'save', amount: 7000 }),
      capture({ id: 'e', status: 'approved', amount: 300 }),
      capture({ id: 'f', status: 'duplicate', amount: 400 }),
      capture({ id: 'g', date: new Date(2026, 8, 30), amount: 500 }),
    ];
    expect(pendingEverydayCents(list, rules, buckets, 'INR', rate, month)).toBe(3000);
  });

  it('converts foreign payments with the last rate and leaves them out without one', () => {
    const list = [capture({ currency: 'USD', amount: 1000 })];
    expect(pendingEverydayCents(list, new Map(), buckets, 'INR', () => 0.012, month)).toBe(83333);
    expect(pendingEverydayCents(list, new Map(), buckets, 'INR', () => null, month)).toBe(0);
  });
});

describe('canApproveInBulk', () => {
  const s = { bucketId: 'dining', reason: 'kind' as const };
  it('needs a suggestion, no hint and a known amount', () => {
    expect(canApproveInBulk(capture(), s, true)).toBe(true);
    expect(canApproveInBulk(capture(), null, true)).toBe(false);
    expect(canApproveInBulk(capture({ hint: 'card-bill' }), s, true)).toBe(false);
    expect(canApproveInBulk(capture(), s, false)).toBe(false);
    expect(canApproveInBulk(capture({ status: 'duplicate' }), s, true)).toBe(false);
  });
});

describe('buildApproval', () => {
  it('turns a capture into the transaction capture:<id>', () => {
    const { transaction, capture: approved } = buildApproval(capture(), { bucketId: 'dining' }, 'INR', 123);
    expect(transaction).toEqual({ id: transactionIdFor('sms:1'), amount: 25000, bucketId: 'dining', date: new Date(2026, 9, 21), note: 'Swiggy', createdAt: 123 });
    expect(approved).toMatchObject({ status: 'approved', transactionId: 'capture:sms:1', resolvedAt: 123, amount: 25000 });
  });

  it('applies edits and keeps the captured amount on the capture', () => {
    const { transaction, capture: approved } = buildApproval(capture(), { bucketId: 'grocery', amount: 27500, date: new Date(2026, 9, 20), note: ' Dinner + tip ' }, 'INR', 1);
    expect(transaction).toMatchObject({ amount: 27500, bucketId: 'grocery', date: new Date(2026, 9, 20), note: 'Dinner + tip' });
    expect(approved.amount).toBe(25000);
  });

  it('converts a foreign payment and keeps what was paid', () => {
    const { transaction } = buildApproval(capture({ currency: 'USD', amount: 650 }), { bucketId: 'dining', rate: 0.012 }, 'INR', 1);
    expect(transaction).toMatchObject({ amount: 54167, foreign: { amount: 650, currency: 'USD', rate: 0.012, base: 'INR' } });
    expect(() => buildApproval(capture({ currency: 'USD' }), { bucketId: 'dining' }, 'INR', 1)).toThrow();
  });
});

describe('approvedWith', () => {
  it('saves exactly the edited values, foreign details included, and drops an empty note', () => {
    const foreign = { amount: 27500, currency: 'INR' as const, rate: 84, base: 'USD' as const };
    const { transaction, capture: approved } = approvedWith(capture(), { amount: 327, foreign, bucketId: 'dining', date: new Date(2026, 9, 20), note: '  ' }, 9);
    expect(transaction).toEqual({ id: 'capture:sms:1', amount: 327, foreign, bucketId: 'dining', date: new Date(2026, 9, 20), createdAt: 9 });
    expect(approved).toMatchObject({ status: 'approved', transactionId: 'capture:sms:1', resolvedAt: 9, amount: 25000 });
  });
});

describe('learnedRule', () => {
  it('learns the bucket for the payee unless the rule already says so', () => {
    expect(learnedRule(capture({ payeeKey: 'k' }), 'dining', undefined)).toEqual({ id: 'payee:k', payeeKey: 'k', merchant: 'Swiggy', action: 'suggest', bucketId: 'dining' });
    expect(learnedRule(capture({ payeeKey: 'k' }), 'grocery', rule())).toBeNull();
    expect(learnedRule(capture({ payeeKey: 'k' }), 'dining', rule())).toMatchObject({ bucketId: 'dining' });
    expect(learnedRule(capture({ payeeKey: 'k' }), 'dining', rule({ action: 'ignore', bucketId: undefined }))).toMatchObject({ action: 'suggest' });
    expect(learnedRule(capture(), 'dining', undefined)).toBeNull();
  });
});

describe('reopened', () => {
  it('returns a capture to the queue', () => {
    const r = reopened(capture({ status: 'approved', transactionId: 'capture:sms:1', resolvedAt: 5 }));
    expect(r.status).toBe('pending');
    expect(r).not.toHaveProperty('transactionId');
    expect(r).not.toHaveProperty('resolvedAt');
  });
});

describe('captureIdOf and recordedDiffers', () => {
  it('finds the capture behind an approved transaction', () => {
    expect(captureIdOf('capture:sms:1')).toBe('sms:1');
    expect(captureIdOf('8f0c2a')).toBeNull();
  });

  it('tells a partly recorded or converted payment from one recorded as paid', () => {
    const tx = (over: object) => ({ id: 'capture:sms:1', amount: 25000, bucketId: 'dining', date: new Date(2026, 9, 21), ...over });
    expect(recordedDiffers(capture(), tx({}), 'INR')).toBe(false);
    expect(recordedDiffers(capture(), tx({ amount: 10000 }), 'INR')).toBe(true);
    expect(recordedDiffers(capture(), tx({ amount: 298 }), 'USD')).toBe(true);
  });
});
