import { writable, type Readable } from 'svelte/store';
import { isAndroidPlatform } from '$lib/android';
import { checkForUpdate, type Update } from '$lib/appUpdate';
import { getCapture } from '$lib/capture/native';

// Android app only: a newer test build when CI has published one. The app
// checks on start and whenever it comes back to the screen (at most every
// six hours); the navigation bar shows the offer. "Later" hides it until an
// even newer build.

const DISMISSED = 'bdgt-update-dismissed';
const RECHECK_MS = 6 * 3600_000;
const offer = writable<Update | null>(null);
export const availableUpdate: Readable<Update | null> = { subscribe: offer.subscribe };
let lastCheck = 0;

function dismissedBuild(): number | null {
  try {
    return Number(localStorage.getItem(DISMISSED)) || null;
  } catch {
    return null;
  }
}

async function check() {
  if (Date.now() - lastCheck < RECHECK_MS) return;
  lastCheck = Date.now();
  const capture = await getCapture();
  const version = (await capture?.plugin.getStatus())?.appVersion;
  if (!version) return;
  const found = await checkForUpdate(version);
  offer.set(found && found.build !== dismissedBuild() ? found : null);
}

export function dismissUpdate(update: Update): void {
  try {
    localStorage.setItem(DISMISSED, String(update.build));
  } catch {
    // storage unavailable: it just shows again next time
  }
  offer.set(null);
}

// Starts checking; returns the stop function.
export function startUpdateChecks(): () => void {
  if (!isAndroidPlatform()) return () => {};
  const onVisible = () => {
    if (document.visibilityState === 'visible') void check().catch(() => {});
  };
  void check().catch(() => {});
  document.addEventListener('visibilitychange', onVisible);
  return () => document.removeEventListener('visibilitychange', onVisible);
}
