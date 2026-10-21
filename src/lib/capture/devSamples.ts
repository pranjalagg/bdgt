import { db } from '$lib/db';
import { autoTransaction } from '$lib/sync/transactions';
import { loadCaptures } from '$lib/stores/captureStore';
import type { Capture } from '$lib/types';

// Development only (`npm run dev`): `window.__bdgtSampleCaptures()` adds a
// set of captures so the review queue can be looked at without a phone.
// Stage 4 brings real ones in from the Android app.

export function installSampleCaptures(): void {
  (window as unknown as { __bdgtSampleCaptures?: () => Promise<number> }).__bdgtSampleCaptures = async () => {
    const now = Date.now();
    const today = new Date();
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const min = 60_000;
    const samples: Capture[] = [
      { id: 'dev:wallet-1', status: 'pending', source: 'wallet', sourceLabel: 'Google Wallet', postedAt: now - 5 * min, date: day, amount: 650, currency: 'USD', merchant: 'Blue Bottle Coffee', payeeKey: 'dev-bluebottle', kind: 'dining', accountHint: '1234' },
      { id: 'dev:sms-1', status: 'pending', source: 'sms', sourceLabel: 'HDFC Bank SMS', postedAt: now - 40 * min, date: day, amount: 25000, currency: 'INR', merchant: 'Swiggy', payeeKey: 'dev-swiggy', kind: 'dining', accountHint: '4321' },
      { id: 'dev:upi-1', status: 'duplicate', source: 'upi-app', sourceLabel: 'PhonePe', postedAt: now - 39 * min, date: day, amount: 25000, currency: 'INR', merchant: 'Swiggy', payeeKey: 'dev-swiggy', duplicateOf: 'dev:sms-1' },
      { id: 'dev:sms-2', status: 'pending', source: 'sms', sourceLabel: 'ICICI Bank SMS', postedAt: now - 3 * 60 * min, date: day, amount: 1250000, currency: 'INR', merchant: 'CRED', payeeKey: 'dev-cred', hint: 'card-bill', accountHint: '9876' },
      { id: 'dev:upi-2', status: 'pending', source: 'upi-app', sourceLabel: 'Google Pay', postedAt: now - 5 * 60 * min, date: day, amount: 12000, currency: 'INR', merchant: 'RAHUL S', payeeKey: 'dev-rahul' },
      { id: 'dev:wallet-2', status: 'pending', source: 'wallet', sourceLabel: 'Google Wallet', postedAt: now - 26 * 60 * min, date: new Date(day.getTime() - 86_400_000), amount: 4210, currency: 'USD', merchant: 'Trader Joe’s', payeeKey: 'dev-tj', kind: 'grocery' },
    ];
    await autoTransaction(db, [db.captures], () => db.captures.bulkPut(samples));
    await loadCaptures();
    return samples.length;
  };
}
