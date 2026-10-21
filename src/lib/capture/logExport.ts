import { getLocalDateKey } from '$lib/utils/dates';
import type { KeptItem } from './native';

// The capture log a tester shares from the test build. Long digit runs are
// masked; amounts and dates are kept, because those are what the samples are
// for.

// A currency marker right before a digit run makes it an amount.
const CURRENCY_BEFORE = /(?:₹|\$|\b(?:rs\.?|inr|usd))\s*$/i;

// Reference, account and phone numbers (runs of 6 or more digits) keep only
// their last two digits, so their length and shape survive.
export function maskDigits(text: string): string {
  return text.replace(/\d{6,}/g, (run: string, offset: number, whole: string) => {
    if (CURRENCY_BEFORE.test(whole.slice(Math.max(0, offset - 8), offset))) return run;
    return 'X'.repeat(run.length - 2) + run.slice(-2);
  });
}

export interface LogFile {
  app: 'bdgt';
  kind: 'capture-log';
  version: 1;
  appVersion: string;
  exportedAt: string;
  items: KeptItem[];
}

export function buildLogFile(items: KeptItem[], appVersion: string, now: Date = new Date()): LogFile {
  const mask = (value: string | undefined) => (value === undefined ? undefined : maskDigits(value));
  return {
    app: 'bdgt',
    kind: 'capture-log',
    version: 1,
    appVersion,
    exportedAt: now.toISOString(),
    items: items.map((item) => ({
      ...item,
      notificationKey: maskDigits(item.notificationKey),
      sender: mask(item.sender),
      title: mask(item.title),
      text: maskDigits(item.text),
      extras: item.extras && Object.fromEntries(Object.entries(item.extras).map(([key, value]) => [key, maskDigits(value)])),
    })),
  };
}

export function logFilename(now: Date = new Date()): string {
  return `bdgt-capture-log-${getLocalDateKey(now)}.json`;
}
