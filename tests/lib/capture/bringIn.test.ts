import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '$lib/db';
import { bringIn, type Inbox } from '$lib/capture/bringIn';
import { payeeKey } from '$lib/capture/payee';
import type { KeptItem } from '$lib/capture/native';
import { resetRealDb } from '../../helpers/realDb';

const T = new Date(2026, 9, 21, 9, 0).getTime();
const MIN = 60_000;

const sms = (id: string, text: string, postedAt = T): KeptItem => ({
  id, packageName: 'com.google.android.apps.messaging', kind: 'sms', notificationKey: 'k', postedAt, sender: 'VM-HDFCBK', title: 'VM-HDFCBK', text,
});
const phonepe = (id: string, title: string, postedAt = T): KeptItem => ({
  id, packageName: 'com.phonepe.app', kind: 'app', notificationKey: 'k2', postedAt, title, text: 'UPI transaction successful',
});

// The phone's buffer: items stay until acknowledged.
class FakeInbox implements Inbox {
  acked = new Set<string>();
  constructor(public items: KeptItem[]) {}
  async takePending({ limit = 500 } = {}) {
    const items = this.items.filter((i) => !this.acked.has(i.id)).sort((a, b) => a.postedAt - b.postedAt).slice(0, limit);
    return { items };
  }
  async ack({ ids }: { ids: string[] }) {
    ids.forEach((id) => this.acked.add(id));
  }
}

const SWIGGY = 'Rs.250.00 debited from A/c XX1234 on 21-10-26 to VPA swiggy@icici. UPI Ref 612345678902';

beforeEach(async () => {
  await resetRealDb();
});

describe('bringIn', () => {
  it('turns a bank SMS into a payment to review, keeps its text on the phone and marks it done', async () => {
    const inbox = new FakeInbox([sms('a', SWIGGY)]);
    expect(await bringIn(db, inbox, 'INR', T)).toEqual({ added: 1, read: 1 });
    const capture = await db.captures.get('sms:a');
    expect(capture).toMatchObject({
      status: 'pending', source: 'sms', sourceLabel: 'HDFC Bank SMS', postedAt: T, date: new Date(2026, 9, 21),
      amount: 25000, currency: 'INR', merchant: 'swiggy@icici', kind: 'dining', accountHint: '1234',
      payeeKey: await payeeKey({ upiId: 'swiggy@icici', merchant: null }),
    });
    expect(await db.captureRaw.get('sms:a')).toMatchObject({ text: SWIGGY, sender: 'VM-HDFCBK', reference: '612345678902' });
    expect([...inbox.acked]).toEqual(['a']);
  });

  it('marks everything read done, but queues only spending', async () => {
    const inbox = new FakeInbox([sms('a', SWIGGY), sms('b', 'Money Received - INR 500.00 in your HDFC Bank A/c xx1234 by A/c linked to VPA rahul@okicici')]);
    expect(await bringIn(db, inbox, 'INR', T)).toEqual({ added: 1, read: 2 });
    expect(await db.captures.count()).toBe(1);
    expect(inbox.acked.size).toBe(2);
  });

  it('dismisses payments to an ignored payee straight away', async () => {
    const key = (await payeeKey({ upiId: 'cred.club@axisb', merchant: null }))!;
    await db.captureRules.put({ id: `payee:${key}`, payeeKey: key, merchant: 'CRED', action: 'ignore' });
    await bringIn(db, new FakeInbox([sms('a', 'Rs.12,500.00 debited from A/c XX4321 to VPA cred.club@axisb. UPI Ref 612345678910')]), 'INR', T);
    expect(await db.captures.get('sms:a')).toMatchObject({ status: 'dismissed', resolvedAt: T, hint: 'card-bill' });
  });

  it('folds the same payment from a UPI app into the bank SMS, in one run or across runs', async () => {
    await bringIn(db, new FakeInbox([sms('a', SWIGGY), phonepe('b', 'Paid ₹250 to Swiggy', T + 2 * MIN)]), 'INR', T);
    expect(await db.captures.get('upi-app:b')).toMatchObject({ status: 'duplicate', duplicateOf: 'sms:a' });

    await bringIn(db, new FakeInbox([phonepe('c', 'Paid ₹99 to Zepto', T + 30 * MIN)]), 'INR', T);
    await bringIn(db, new FakeInbox([sms('d', 'Rs.99.00 debited from A/c XX1234 to VPA zepto@ybl. UPI Ref 612345678999', T + 31 * MIN)]), 'INR', T);
    expect(await db.captures.get('sms:d')).toMatchObject({ status: 'duplicate', duplicateOf: 'upi-app:c' });
  });

  it('does not add a payment twice when a run is repeated before the phone heard back', async () => {
    const inbox = new FakeInbox([sms('a', SWIGGY)]);
    inbox.ack = async () => {}; // the acknowledgement never arrives
    await bringIn(db, inbox, 'INR', T);
    expect(await bringIn(db, inbox, 'INR', T)).toEqual({ added: 0, read: 1 });
    expect(await db.captures.count()).toBe(1);
  });

  it('forgets the full text 30 days after a payment was resolved, not while it waits', async () => {
    const DAY = 24 * 3600_000;
    await bringIn(db, new FakeInbox([sms('a', SWIGGY), sms('b', SWIGGY.replace('250.00', '80.00'), T + MIN)]), 'INR', T);
    await db.captures.update('sms:a', { status: 'approved', resolvedAt: T + DAY });
    await bringIn(db, new FakeInbox([]), 'INR', T + 32 * DAY);
    expect(await db.captureRaw.get('sms:a')).toBeUndefined();
    expect(await db.captureRaw.get('sms:b')).toBeDefined();
  });
});
