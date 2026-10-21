import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeDevice, dropDevice } from '../../helpers/devices';
import { FakeServer } from '../../helpers/fakeServer';
import { syncOnce } from '$lib/sync/engine';
import { autoTransaction } from '$lib/sync/transactions';
import { resetClockForTests } from '$lib/sync/clock';
import { buildApproval, learnedRule, transactionIdFor, suggestBucket, rulesByKey } from '$lib/capture/queue';
import type { BudgetDatabase } from '$lib/db';
import type { Bucket, Capture } from '$lib/types';

// The review queue across two devices, through the same writes the capture
// store makes: a capture brought in on the phone (an automatic write), then
// approved or dismissed anywhere.

let A: BudgetDatabase; // the phone
let B: BudgetDatabase; // the laptop
let server: FakeServer;
const sync = (d: BudgetDatabase) => syncOnce({ db: d, transport: server });
const bucket = (id: string, name: string): Bucket => ({ id, name, color: '#000', order: 0, isDefault: true, allocationType: 'fixed', fixedAmount: 0, percentageAmount: 0, isSavings: false, isEveryday: true, createdAt: new Date(2026, 0, 1) });
const capture: Capture = {
  id: 'sms:1', status: 'pending', source: 'sms', sourceLabel: 'HDFC Bank SMS', postedAt: Date.UTC(2026, 9, 21, 9),
  date: new Date(2026, 9, 21), amount: 25000, currency: 'INR', merchant: 'Swiggy', payeeKey: 'k',
};

async function settle() {
  for (let i = 0; i < 3; i++) {
    await sync(A);
    await sync(B);
  }
}

async function approve(d: BudgetDatabase, bucketId: string) {
  const current = (await d.captures.get(capture.id))!;
  const { transaction, capture: approved } = buildApproval(current, { bucketId }, 'INR', Date.now());
  const rule = learnedRule(current, bucketId, await d.captureRules.get('payee:k'));
  await d.transaction('rw', [d.transactions, d.captures, d.captureRules], async () => {
    await d.transactions.put(transaction);
    await d.captures.put(approved);
    if (rule) await d.captureRules.put(rule);
  });
}

async function dismiss(d: BudgetDatabase) {
  const { transactionId: _t, ...rest } = (await d.captures.get(capture.id))!;
  await d.transaction('rw', [d.transactions, d.captures], async () => {
    await d.transactions.delete(transactionIdFor(capture.id));
    await d.captures.put({ ...rest, status: 'dismissed', resolvedAt: Date.now() });
  });
}

beforeEach(async () => {
  resetClockForTests();
  A = await makeDevice('capture-a');
  B = await makeDevice('capture-b');
  server = new FakeServer(() => 5_000_000_000_000);
  await A.buckets.bulkAdd([bucket('dining', 'Dining Out'), bucket('grocery', 'Grocery')]);
  await autoTransaction(A, [A.captures], () => A.captures.add(capture));
  await settle();
});

afterEach(async () => {
  await dropDevice(A);
  await dropDevice(B);
});

describe('the review queue on two devices', () => {
  it('a capture from the phone can be approved on the laptop', async () => {
    expect(await B.captures.get(capture.id)).toMatchObject({ status: 'pending', merchant: 'Swiggy' });
    await approve(B, 'dining');
    await settle();
    expect(await A.captures.get(capture.id)).toMatchObject({ status: 'approved' });
    expect(await A.transactions.get('capture:sms:1')).toMatchObject({ amount: 25000, bucketId: 'dining' });
  });

  it('approved on one and dismissed later on the other: both end dismissed, no transaction', async () => {
    await approve(A, 'dining');
    await dismiss(B);
    await settle();
    for (const d of [A, B]) {
      expect((await d.captures.get(capture.id))!.status).toBe('dismissed');
      expect(await d.transactions.get('capture:sms:1')).toBeUndefined();
    }
  });

  it('dismissed on one and approved later on the other: both end approved, with the transaction', async () => {
    await dismiss(A);
    await approve(B, 'grocery');
    await settle();
    for (const d of [A, B]) {
      expect((await d.captures.get(capture.id))!.status).toBe('approved');
      expect(await d.transactions.get('capture:sms:1')).toMatchObject({ bucketId: 'grocery' });
    }
  });

  it('approved on both: one transaction, the later bucket', async () => {
    await approve(A, 'dining');
    await approve(B, 'grocery');
    await settle();
    expect(await A.transactions.where('id').startsWith('capture:').count()).toBe(1);
    expect(await A.transactions.get('capture:sms:1')).toMatchObject({ bucketId: 'grocery' });
    expect(await B.transactions.get('capture:sms:1')).toMatchObject({ bucketId: 'grocery' });
  });

  it('a rule learned on the laptop suggests on the phone', async () => {
    await approve(B, 'grocery');
    await settle();
    const next: Capture = { ...capture, id: 'sms:2' };
    const suggestion = suggestBucket(next, rulesByKey(await A.captureRules.toArray()), await A.buckets.toArray());
    expect(suggestion).toEqual({ bucketId: 'grocery', reason: 'rule' });
  });
});
