import { get } from 'svelte/store';
import { db } from '$lib/db';
import { baseCurrency } from '$lib/stores/currencyStore';
import { syncEnabled } from '$lib/sync/browser';
import { getState, LINKED_ACCOUNT } from '$lib/sync/state';
import { describeItem } from './describe';
import type { CapturePlugin, CaptureStatus, KeptItem } from './native';
import { isBusinessSender } from './parse';
import { bringInSoon, startCapture } from './runner';

// DEVELOPMENT ONLY (`npm run dev`). A fake phone for trying payment capture
// in a browser with messages copied from real notifications. The layout
// imports this file only under `import.meta.env.DEV`, which Vite replaces
// with `false` in every build (the website and the Android app), so the file
// is not part of them; CI checks that its functions are absent from the build.
//
// In the browser console:
//   __bdgtParse('sms', 'VM-HDFCBK', 'Rs.250.00 debited ...')  what the app makes of it; changes nothing
//   __bdgtFakePhone()                                          start a fake phone (refuses while synced)
//   __bdgtNotify('wallet', 'Starbucks', '$5.45 with Visa •••• 1234')  a notification, as if it just arrived
// Sources: 'wallet', 'gpay', 'phonepe', 'paytm' (title, text) and 'sms' (sender, message).

type Source = 'wallet' | 'gpay' | 'phonepe' | 'paytm' | 'sms';

const PACKAGES: Record<Source, string> = {
  wallet: 'com.google.android.apps.walletnfcrel',
  gpay: 'com.google.android.apps.nbu.paisa.user',
  phonepe: 'com.phonepe.app',
  paytm: 'net.one97.paytm',
  sms: 'com.google.android.apps.messaging',
};

// The phone's keep rules (android/.../capture/KeepRules.kt), mirrored so a
// message the phone would drop says so here. Change both together.
const KEEP_AMOUNT = /(?:₹|\$|€|£|\b(?:rs\.?|inr|usd|eur|gbp|aed))\s*\d|\d(?:[\d,]*\d)?(?:\.\d{1,2})?\s*(?:inr|usd|eur|gbp|aed|rupees)\b|\b(?:debited|credited)\s+(?:by|for|with)\s+\d/i;
const KEEP_BANK_WORDS = /\b(?:debited|credited|debit|credit|spent|paid|sent|received|withdrawn|withdrawal|txn|transaction|purchase|a\/c|acct|account|card|upi|neft|imps|rtgs|ref|balance|bal)\b/i;
const KEEP_OTP = /\b(?:otp|one[- ]time password|verification code)\b/i;

function phoneWouldDrop(item: KeptItem): string | null {
  const text = item.kind === 'sms' ? item.text : [item.title, item.text].filter(Boolean).join('\n');
  if (item.kind === 'sms' && !isBusinessSender(item.sender)) return 'the sender is not a bank';
  if (!KEEP_AMOUNT.test(text)) return 'no amount';
  if (item.kind === 'sms' && !KEEP_BANK_WORDS.test(text)) return 'no banking word';
  if (KEEP_OTP.test(text)) return 'a one-time password';
  return null;
}

let counter = 0;
function makeItem(source: Source, first: string, text: string, minutesAgo = 0): KeptItem {
  const postedAt = Date.now() - minutesAgo * 60_000;
  const id = `dev-${postedAt}-${counter++}`;
  const base = { id, packageName: PACKAGES[source], notificationKey: id, postedAt, text };
  return source === 'sms' ? { ...base, kind: 'sms', sender: first, title: first } : { ...base, kind: 'app', title: first };
}

function checkSource(source: string): source is Source {
  if (source in PACKAGES) return true;
  console.warn(`Unknown source "${source}". Use one of: ${Object.keys(PACKAGES).join(', ')}`);
  return false;
}

function parse(source: string, first: string, text: string): string {
  if (!checkSource(source)) return 'Unknown source';
  const item = makeItem(source, first, text);
  const dropped = phoneWouldDrop(item);
  return dropped ? `The phone would not keep this: ${dropped}` : describeItem(item, get(baseCurrency));
}

let phone: { plugin: CapturePlugin; push(item: KeptItem): void } | null = null;

function fakePlugin() {
  const items: KeptItem[] = [];
  const acked = new Set<string>();
  const listeners: ((item: KeptItem) => void)[] = [];
  const status: Omit<CaptureStatus, 'count' | 'waiting'> = {
    available: true, accessGranted: true, listenerConnected: true, enabled: true, lastKeptAt: 0, sms: true, appVersion: 'dev',
  };
  const plugin: CapturePlugin = {
    getStatus: async () => ({ ...status, count: items.length, waiting: items.filter((i) => !acked.has(i.id)).length }),
    setConfig: async (o) => void Object.assign(status, o),
    installedSources: async () => ({
      sources: [
        { packageName: PACKAGES.wallet, label: 'Google Wallet', kind: 'app' },
        { packageName: PACKAGES.gpay, label: 'Google Pay', kind: 'app' },
        { packageName: PACKAGES.phonepe, label: 'PhonePe', kind: 'app' },
        { packageName: PACKAGES.paytm, label: 'Paytm', kind: 'app' },
        { packageName: PACKAGES.sms, label: 'Messages', kind: 'sms' },
      ],
    }),
    openAccessSettings: async () => {},
    openBatterySettings: async () => {},
    requestRebind: async () => {},
    list: async ({ limit = 200 } = {}) => ({ items: [...items].sort((a, b) => b.postedAt - a.postedAt).slice(0, limit) }),
    clear: async () => void items.splice(0),
    takePending: async ({ limit = 500 } = {}) => ({
      items: items.filter((i) => !acked.has(i.id)).sort((a, b) => a.postedAt - b.postedAt).slice(0, limit),
    }),
    ack: async ({ ids }) => ids.forEach((id) => acked.add(id)),
    reset: async () => {
      status.enabled = false;
      items.splice(0);
    },
    share: async ({ text }) => console.log(text),
    addListener: async (_event, listener) => {
      listeners.push(listener);
      return { remove: async () => void listeners.splice(listeners.indexOf(listener), 1) };
    },
  };
  return {
    plugin,
    push(item: KeptItem) {
      items.push(item);
      status.lastKeptAt = item.postedAt;
      listeners.forEach((l) => l(item));
    },
  };
}

async function fakePhone(options: { allowSync?: boolean } = {}): Promise<string> {
  if (phone) return 'The fake phone is already on.';
  if (syncEnabled && (await getState<string>(db, LINKED_ACCOUNT)) !== undefined && !options.allowSync) {
    return 'Refused: this browser is signed in, so fake payments would sync to your account. Sign out, use a private window, or run `VITE_SUPABASE_URL= npm run dev`. (__bdgtFakePhone({ allowSync: true }) overrides.)';
  }
  phone = fakePlugin();
  (window as unknown as { __bdgtCapture: CapturePlugin }).__bdgtCapture = phone.plugin;
  await startCapture();
  return 'Fake phone on. Try __bdgtNotify(\'sms\', \'VM-HDFCBK\', \'Rs.250.00 debited from A/c XX1234 to VPA swiggy@icici. UPI Ref 612345678902\'). Open Settings (Automatic capture) and Review from the menu, without reloading: a reload turns the fake phone off.';
}

function notify(source: string, first: string, text: string, minutesAgo = 0): string {
  if (!phone) return 'Start the fake phone first: __bdgtFakePhone()';
  if (!checkSource(source)) return 'Unknown source';
  const item = makeItem(source, first, text, minutesAgo);
  const dropped = phoneWouldDrop(item);
  if (dropped) return `The phone would not keep this: ${dropped}`;
  phone.push(item);
  void bringInSoon();
  const outcome = describeItem(item, get(baseCurrency));
  return outcome.startsWith('Payment') ? `${outcome} → on its way to Review` : outcome;
}

export function installDevPhone(): void {
  Object.assign(window, { __bdgtParse: parse, __bdgtFakePhone: fakePhone, __bdgtNotify: notify });
}
