import { get } from 'svelte/store';
import { db } from '$lib/db';
import { baseCurrency } from '$lib/stores/currencyStore';
import { loadCaptures } from '$lib/stores/captureStore';
import { getSyncApp, syncEnabled } from '$lib/sync/browser';
import { getState, LINKED_ACCOUNT } from '$lib/sync/state';
import { bringIn } from './bringIn';
import { getCapture, isAndroidApp, type CapturePlugin, type LogScope } from './native';

// When the app brings what the phone kept into the review queue: at start,
// whenever the listener keeps something while the app is open, on coming back
// to the app, and as soon as this device is linked to an account. On a build
// with sync, payments wait on the phone until the device is linked, so a
// first sign-in that replaces this device's data can never lose them.

let plugin: CapturePlugin | null = null;
let started = false;
let stopped = false;
let running: Promise<void> | null = null;
let again = false;
let claimedFor: string | undefined;

export async function canQueue(): Promise<boolean> {
  return !syncEnabled || (await getState<string>(db, LINKED_ACCOUNT)) !== undefined;
}

// The account this device is linked to, or null when signed out; undefined
// on a build without sync, where there are no accounts.
async function account(): Promise<string | null | undefined> {
  return syncEnabled ? ((await getState<string>(db, LINKED_ACCOUNT)) ?? null) : undefined;
}

// The part of the phone's log this device may show (see LogScope).
export async function logScope(): Promise<LogScope> {
  const owner = await account();
  return owner === undefined ? {} : { visibleTo: owner };
}

// One run at a time; a request during a run starts one more after it.
export function bringInSoon(): Promise<void> {
  if (stopped || !plugin) return Promise.resolve();
  if (running) {
    again = true;
    return running;
  }
  const phone = plugin;
  running = (async () => {
    do {
      again = false;
      if (!(await canQueue())) return;
      const owner = (await account()) ?? undefined;
      if (owner && claimedFor !== owner) {
        await phone.claim({ owner });
        claimedFor = owner;
      }
      // Each item brought in belongs to this account's log from then on.
      const inbox = {
        takePending: (o?: { limit?: number }) => phone.takePending(o),
        ack: ({ ids }: { ids: string[] }) => phone.ack(owner ? { ids, owner } : { ids }),
      };
      const { read } = await bringIn(db, inbox, get(baseCurrency));
      if (read > 0) await loadCaptures();
    } while (again && !stopped);
  })()
    .catch((e) => console.error('Bringing in payments failed', e))
    .finally(() => {
      running = null;
    });
  return running;
}

export function startCapture(): Promise<void> {
  if (started || !isAndroidApp()) return Promise.resolve();
  started = true;
  return (async () => {
    const capture = await getCapture();
    if (!capture || stopped) return;
    plugin = capture.plugin;
    await plugin.addListener('itemKept', () => void bringInSoon());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void bringInSoon();
    });
    if (syncEnabled) getSyncApp().linked.subscribe((linked) => linked && void bringInSoon());
    await bringInSoon();
  })().catch((e) => console.error('Payment capture could not start', e));
}

// Signing out: nothing more reaches the queue while the device's data is
// cleared. Recording goes on and the log stays (they hold nothing the phone's
// own notifications and messages do not); payments wait on the phone until
// it is signed in again.
export async function stopCapture(): Promise<void> {
  stopped = true;
  await running;
}
