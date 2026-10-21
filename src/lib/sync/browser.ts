import { dev } from '$app/environment';
import { base } from '$app/paths';
import { db } from '$lib/db';
import { exportToJson, downloadFile } from '$lib/utils/export';
import { reloadAllStores } from '$lib/stores/reload';
import { derived } from 'svelte/store';
import { SyncApp, type AuthClient } from './app';
import { onCaptureCommitted } from './capture';
import { hasAuthCallback, hasStoredSession, signInRedirectUrl, supabaseAuthOptions, syncConfig } from './config';
import { BUSY, SyncService, needsAttention } from './service';
import { SupabaseTransport } from './supabaseTransport';
import type { SupabaseClient } from '@supabase/supabase-js';

// The real wiring of the sync app: the Supabase library (loaded only when
// needed), this browser's storage, timers, tab lock and events. Nothing runs
// at import time, so the pages can still be built without a browser.

export const syncEnabled = syncConfig() !== null;

let app: SyncApp<SupabaseClient & AuthClient> | null = null;
let clientPromise: Promise<SupabaseClient> | null = null;

function loadClient(): Promise<SupabaseClient> {
  if (!clientPromise) {
    const config = syncConfig();
    if (!config) return Promise.reject(new Error('Sync is not configured'));
    clientPromise = import('@supabase/supabase-js')
      .then(({ createClient }) => createClient(config.url, config.key, { auth: supabaseAuthOptions }))
      .catch((e) => {
        clientPromise = null; // the chunk may just have been unreachable (offline): try again next time
        throw e;
      });
  }
  return clientPromise;
}

// One sync at a time across tabs; a tab that finds another syncing waits.
function tabLock<T>(fn: () => Promise<T>): Promise<T | typeof BUSY> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  if (!locks) return fn();
  return locks.request('bdgt-sync', { ifAvailable: true }, async (lock) => (lock ? fn() : BUSY)) as Promise<T | typeof BUSY>;
}

export function getSyncApp(): SyncApp<SupabaseClient & AuthClient> {
  if (!app) {
    app = new SyncApp<SupabaseClient & AuthClient>({
      db,
      enabled: syncEnabled,
      hasSessionHint: () => hasStoredSession(localStorage) || hasAuthCallback(location.search),
      getClient: () => loadClient() as Promise<SupabaseClient & AuthClient>,
      makeTransport: (client) => new SupabaseTransport(client),
      makeService: (ctx) =>
        new SyncService({
          ctx,
          onChanged: reloadAllStores,
          lock: tabLock,
          isVisible: () => document.visibilityState === 'visible',
        }),
      reload: reloadAllStores,
      exportBackup: exportToJson,
      saveFile: (text, filename) => downloadFile(text, filename, 'application/json'),
      redirectTo: () => signInRedirectUrl(location.origin, base),
      reloadPage: () => location.reload(),
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
      today: () => new Date().toISOString().split('T')[0],
    });
  }
  return app;
}

// True when something about sync needs the person's attention (for the
// mobile dot and the chip).
export function syncAttention() {
  return derived(getSyncApp().status, (s) => (s ? needsAttention(s) : false));
}

let triggersInstalled = false;

function installTriggers(syncApp: SyncApp<SupabaseClient & AuthClient>): void {
  if (triggersInstalled) return;
  triggersInstalled = true;
  // A write committed: sync soon. Coming back to the tab, regaining the
  // network: sync now.
  onCaptureCommitted(() => syncApp.syncService?.requestSync());
  const now = () => void syncApp.syncService?.syncNow();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') now();
  });
  window.addEventListener('focus', now);
  window.addEventListener('online', now);
}

// Called once at start-up, after the local data is loaded. Never throws: sync
// is an extra, and the app must work without it.
export async function initSync(): Promise<void> {
  if (!syncEnabled) return;
  const syncApp = getSyncApp();
  if (dev) (window as unknown as { __bdgtSync: unknown }).__bdgtSync = syncApp;
  installTriggers(syncApp);
  try {
    await syncApp.init();
  } catch (e) {
    console.error('Sync could not start', e);
  }
}
