# Sign-in, Sync Service and Screens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the finished sync engine and Supabase backend into something a person can use: sign in with Google, link a device to an account (with the first-sign-in choice), keep a linked device synced in the background, show its state, and sign out safely. A build with no Supabase settings, or a person who never signs in, sees no change at all.

**Architecture:**
- `SyncService` runs sync cycles for a linked device (single-flight, debounced after writes, retry with backoff, status store). It never decides who is signed in.
- `SyncApp` decides when there is a linked device: it reads the session, runs `runFirstSignIn`, handles the choice and sign-out dialogs, and owns retries before a device is linked. Everything it touches comes in through injected dependencies, so it is tested without a browser or network.
- `browser.ts` is the only file that touches the real world (the lazily loaded Supabase library, storage, timers, the cross-tab lock, window events). It runs nothing at import time.
- Three small components: a status chip, the Settings → Sync section (with the sign-out dialog) and the first-sign-in choice dialog.

**Tech Stack:** SvelteKit 5 (Svelte 4 component syntax as used in this repo), TypeScript, supabase-js (loaded on demand), Vitest.

**Spec:** `docs/superpowers/specs/2026-10-20-cloud-sync-design.md` — "Accounts and UI", "Sync engine → When sync runs / Statuses and failures", "Setup and configuration". It builds on the merged sync engine, the Supabase backend (`docs/superpowers/plans/2026-10-21-supabase-backend.md`, branch `feat/cloud-sync-supabase`, pull request open) and the setup guide `docs/sync-setup.md`.

## Global Constraints

- **No change without a project.** If `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` are absent or invalid, no Sync UI appears, the Supabase library is never loaded and no request is made. A device that is not linked and has no sign-in under way also never loads it.
- **Never a secret key in the app.** `readSyncConfig` refuses `sb_secret_…` and any legacy key whose role is `service_role`.
- **Signing out clears this device;** it is always confirmed, and a backup is offered when changes have not synced.
- **Replacing a device's data needs the person's explicit choice,** and a backup file of that data downloads first.
- **Commits:** `git commit --no-gpg-sign`, no Co-Authored-By or AI attribution lines (the user's rule overrides any reminder). Run `git branch --show-current` before each commit: it must print `feat/cloud-sync-app`.
- **Commands:** tests `npx vitest run`; types `npm run check`; build `npm run build`.
- **This branch is based on `feat/cloud-sync-supabase`** (it uses `SupabaseTransport`). If that pull request has merged, rebase onto `main` first.

## Rulings made while planning

- **Environment variables use the `VITE_` prefix** (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`): Vite exposes them as `import.meta.env`, and a missing one is `undefined` rather than a failed build, which is what "no project means no change" needs.
- **The library is loaded on demand,** only when this device is linked, a session is stored, or the page was opened by the sign-in redirect. It sits in its own chunk.
- **Sign-in returns to the Settings page,** where the Sync section and any dialog live.
- **`SyncService.report()` only displays a problem; it never schedules a sync.** Before a device is linked, `SyncApp` owns the retries (30 s after the network was down, 5 min while the database is out of date), so an unlinked device can never start syncing on its own. A test caught this.
- **Closing the first-sign-in dialog without answering leaves the question open;** the Sync section shows a "Choose" banner. Cancel is an explicit button.
- **Background reloads are quiet:** `loadData({ background: true })` does not show the loading screen and `loadCurrency({ keepPrompt: true })` does not reopen the currency dialog.
- **Sign-out reloads the page** so no in-memory state (capture switch, stores, prompts) survives.
- **A dev-only hook** (`window.__bdgtSync`, present only under `npm run dev`) lets the screens be looked at in every state without a real account.
- **`.env.example` has no automated test:** Vite refuses to serve `.env*` files, even to tests.
- **Real Google sign-in cannot be automated** (Google blocks automated sign-in). Task 11 is done with the owner.

## Review Focus

Most likely first. Each is pinned by a test in the task named in brackets (browser checks are in Task 10).

- With no project configured, or signed out and not linked, nothing loads or runs. [Task 2, Task 7, Task 10]
- A first sign-in never replaces a device's data or uploads one account's data into another without the decision table and the person's choice; Cancel changes nothing. [Task 7]
- An unlinked device never starts syncing on its own (a reported problem schedules nothing). [Task 6, Task 7]
- A sync-triggered reload neither flashes the loading screen nor reopens the currency dialog. [Task 5]
- Offline keeps the queue and retries with growing gaps; a lost session shows "Sign in again" without losing anything and resumes when the session returns. [Task 6, Task 7]
- Signing out never silently loses unsynced changes, and its own sign-out is not mistaken for a lost session. [Task 7, Task 8]
- A secret or service-role key cannot reach the app. [Task 2]
- Only one tab syncs at a time; a write in any tab prompts a sync soon. [Task 1, Task 6, Task 8]
- The status chip and the mobile dot show the right state, and the Sync section is correct in every state. [Task 4, Task 10]

## File Structure

| File | Responsibility |
|------|----------------|
| `src/lib/sync/capture.ts` (modify) | Announce committed writes |
| `src/lib/sync/config.ts` (create) | Is sync configured; sign-in URL helpers; auth options |
| `src/lib/sync/parked.ts` (create) | Counts, retry and discard of refused changes |
| `src/lib/sync/status.ts`, `statusText.ts` (create) | Status types and attention rule; the wording and colour of every status |
| `src/lib/stores/budgetStore.ts`, `currencyStore.ts` (modify), `reload.ts` (create) | Quiet reloads after a sync |
| `src/lib/sync/service.ts` (create) | `SyncService`: cycles, debounce, backoff, status |
| `src/lib/sync/app.ts` (create) | `SyncApp`: session, first sign-in, dialogs, sign-out |
| `src/lib/sync/browser.ts` (create) | Real wiring: library, storage, timers, tab lock, events |
| `src/lib/components/sync/*.svelte` (create) | Status chip, Sync section, choice dialog |
| `Nav.svelte`, `Layout.svelte`, `+layout.svelte`, `settings/+page.svelte` (modify) | Mount the pieces, start sync, wording for import/reset |
| `.env.example`, `.github/workflows/deploy.yml`, `docs/sync-setup.md` (modify/create) | Configuration and part 2 of the setup guide |

---

### Task 1: Announce committed writes

**Files:**
- Modify: `src/lib/sync/capture.ts`, `tests/lib/sync/capture.test.ts`

**Interfaces:**
- Produces: `onCaptureCommitted(listener: () => void): () => void` (returns an unsubscribe). The listener fires once per IndexedDB transaction that captured a write, after it commits; never for a rollback, never for a write from the server or a local reset, never while capture is off.

- [ ] **Step 1: Add the tests (RED)**

Apply this change to `tests/lib/sync/capture.test.ts` (save the block as a patch file and run `git apply <patch>`, or make the same edits by hand):

```diff
diff --git a/tests/lib/sync/capture.test.ts b/tests/lib/sync/capture.test.ts
index 9b1026c..b37250e 100644
--- a/tests/lib/sync/capture.test.ts
+++ b/tests/lib/sync/capture.test.ts
@@ -2,7 +2,7 @@ import 'fake-indexeddb/auto';
 import Dexie from 'dexie';
 import { describe, it, expect, beforeEach, afterEach } from 'vitest';
 import { BudgetDatabase } from '$lib/db';
-import { setCaptureEnabled, isCaptureEnabled } from '$lib/sync/capture';
+import { setCaptureEnabled, isCaptureEnabled, onCaptureCommitted } from '$lib/sync/capture';
 import { setState, LINKED_ACCOUNT } from '$lib/sync/state';
 import { autoTransaction, remoteTransaction, resetTransaction } from '$lib/sync/transactions';
 import { resetClockForTests } from '$lib/sync/clock';
@@ -190,3 +190,51 @@ describe('capture: writes that must not be queued', () => {
     expect(await device.syncOutbox.count()).toBe(0);
   });
 });
+
+describe('capture: commit notifications', () => {
+  it('announces a committed edit once per transaction, however many records it wrote', async () => {
+    let calls = 0;
+    const stop = onCaptureCommitted(() => calls++);
+    await device.transaction('rw', device.transactions, async () => {
+      await t().add(rec('1'));
+      await t().add(rec('2'));
+    });
+    stop();
+    expect(calls).toBe(1);
+  });
+
+  it('announces an automatic write but not one that came from the server or a local reset', async () => {
+    let calls = 0;
+    const stop = onCaptureCommitted(() => calls++);
+    await remoteTransaction(device, [device.transactions], () => t().put(rec('r')));
+    await resetTransaction(device, [device.transactions], () => t().put(rec('s')));
+    expect(calls).toBe(0);
+    await autoTransaction(device, [device.transactions], () => t().put(rec('a')));
+    stop();
+    expect(calls).toBe(1);
+  });
+
+  it('says nothing when the transaction rolls back, or after the listener is removed', async () => {
+    let calls = 0;
+    const stop = onCaptureCommitted(() => calls++);
+    await expect(
+      device.transaction('rw', device.transactions, async () => {
+        await t().add(rec('1'));
+        throw new Error('boom');
+      })
+    ).rejects.toThrow('boom');
+    expect(calls).toBe(0);
+    stop();
+    await t().add(rec('2'));
+    expect(calls).toBe(0);
+  });
+
+  it('says nothing while capture is off', async () => {
+    let calls = 0;
+    const stop = onCaptureCommitted(() => calls++);
+    setCaptureEnabled(false);
+    await t().add(rec('1'));
+    stop();
+    expect(calls).toBe(0);
+  });
+});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/lib/sync/capture.test.ts`
Expected: FAIL (`onCaptureCommitted is not a function`).

- [ ] **Step 3: Implement**

Apply this change to `src/lib/sync/capture.ts` (save the block as a patch file and run `git apply <patch>`, or make the same edits by hand):

```diff
diff --git a/src/lib/sync/capture.ts b/src/lib/sync/capture.ts
index c25ef65..0b128ef 100644
--- a/src/lib/sync/capture.ts
+++ b/src/lib/sync/capture.ts
@@ -27,6 +27,17 @@ export function markTransaction(kind: WriteKind): void {
   if (trans) kinds.set(trans, kind);
 }
 
+// Tells the sync service a write worth uploading has committed. Fires once
+// per IndexedDB transaction, only after it commits (a rollback fires
+// nothing), and never for writes that came from the server or a local reset.
+const commitListeners = new Set<() => void>();
+const announced = new WeakSet<object>();
+
+export function onCaptureCommitted(listener: () => void): () => void {
+  commitListeners.add(listener);
+  return () => commitListeners.delete(listener);
+}
+
 export function currentWriteKind(): WriteKind {
   const trans = Dexie.currentTransaction;
   return (trans && kinds.get(trans)) || 'edit';
@@ -81,7 +92,13 @@ async function capturedMutate(down: DBCore, table: DBCoreTable, name: string, re
     op = 'delete';
     keys = req.keys;
   }
-  if (keys.length > 0) await record(down, req.trans, name, keys.map(String), op, kind);
+  if (keys.length > 0) {
+    await record(down, req.trans, name, keys.map(String), op, kind);
+    if (!announced.has(idb)) {
+      announced.add(idb);
+      idb.addEventListener('complete', () => commitListeners.forEach((l) => l()));
+    }
+  }
   return res;
 }
 
```

- [ ] **Step 4: Run the tests, the whole suite and the type check**

Run: `npx vitest run tests/lib/sync/capture.test.ts && npx vitest run && npm run check`
Expected: 4 new tests PASS, the suite PASS, 0 type errors.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must print feat/cloud-sync-app
git add src/lib/sync/capture.ts tests/lib/sync/capture.test.ts
git commit --no-gpg-sign -m "feat(sync): announce committed writes so a sync can follow"
```

---

### Task 2: Configuration and sign-in helpers

**Files:**
- Create: `src/lib/sync/config.ts`, `tests/lib/sync/config.test.ts`

**Interfaces:**
- Produces: `readSyncConfig(env)`, `syncConfig()`, `signInRedirectUrl(origin, base)`, `hasAuthCallback(search)`, `hasStoredSession(storage)`, `supabaseAuthOptions`, `AUTH_STORAGE_KEY`, `interface SyncConfig`.

- [ ] **Step 1: Write the failing tests**

`tests/lib/sync/config.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readSyncConfig, signInRedirectUrl, hasAuthCallback, hasStoredSession, supabaseAuthOptions, AUTH_STORAGE_KEY } from '$lib/sync/config';

const URL = 'https://kcggqvilbckwgvgaixwn.supabase.co';

describe('readSyncConfig', () => {
  it('reads a project address and publishable key', () => {
    expect(readSyncConfig({ VITE_SUPABASE_URL: `${URL}/`, VITE_SUPABASE_PUBLISHABLE_KEY: ' sb_publishable_abc ' })).toEqual({ url: URL, key: 'sb_publishable_abc' });
  });

  it('is off when either is missing, empty or not a string', () => {
    expect(readSyncConfig({})).toBeNull();
    expect(readSyncConfig({ VITE_SUPABASE_URL: URL })).toBeNull();
    expect(readSyncConfig({ VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abc' })).toBeNull();
    expect(readSyncConfig({ VITE_SUPABASE_URL: 5, VITE_SUPABASE_PUBLISHABLE_KEY: true })).toBeNull();
  });

  it('refuses an address that is not a Supabase project (or a local one)', () => {
    expect(readSyncConfig({ VITE_SUPABASE_URL: 'https://evil.example.com', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abc' })).toBeNull();
    expect(readSyncConfig({ VITE_SUPABASE_URL: 'http://kcggqvilbckwgvgaixwn.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abc' })).toBeNull();
    expect(readSyncConfig({ VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abc' })).not.toBeNull();
  });

  it('refuses a secret key, and a legacy service-role key, however they got there', () => {
    expect(readSyncConfig({ VITE_SUPABASE_URL: URL, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_abc' })).toBeNull();
    const jwt = (role: string) => `h.${btoa(JSON.stringify({ role })).replace(/=+$/, '')}.s`;
    expect(readSyncConfig({ VITE_SUPABASE_URL: URL, VITE_SUPABASE_PUBLISHABLE_KEY: jwt('service_role') })).toBeNull();
    expect(readSyncConfig({ VITE_SUPABASE_URL: URL, VITE_SUPABASE_PUBLISHABLE_KEY: jwt('anon') })).not.toBeNull();
  });
});

describe('sign-in helpers', () => {
  it('returns to the Settings page under the site\'s base path', () => {
    expect(signInRedirectUrl('https://pranjalagg.github.io', '/bdgt')).toBe('https://pranjalagg.github.io/bdgt/settings');
    expect(signInRedirectUrl('http://localhost:5173', '')).toBe('http://localhost:5173/settings');
  });

  it('recognizes a page opened by the sign-in redirect', () => {
    expect(hasAuthCallback('?code=abc123')).toBe(true);
    expect(hasAuthCallback('?foo=1&error_description=access_denied')).toBe(true);
    expect(hasAuthCallback('?month=2026-10')).toBe(false);
    expect(hasAuthCallback('')).toBe(false);
  });

  it('knows whether a session is stored, and survives storage being unavailable', () => {
    expect(hasStoredSession({ getItem: (k) => (k === AUTH_STORAGE_KEY ? '{}' : null) })).toBe(true);
    expect(hasStoredSession({ getItem: () => null })).toBe(false);
    expect(hasStoredSession(undefined)).toBe(false);
    expect(hasStoredSession({ getItem: () => { throw new Error('blocked'); } })).toBe(false);
  });

  it('uses the code-exchange flow and keeps the session in this browser', () => {
    expect(supabaseAuthOptions).toMatchObject({ flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true, storageKey: AUTH_STORAGE_KEY });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/lib/sync/config.test.ts`
Expected: FAIL, module `$lib/sync/config` not found.

- [ ] **Step 3: Implement**

`src/lib/sync/config.ts`:

```ts
// Whether this build is connected to a Supabase project, and the few facts
// about the browser the sign-in code needs. Everything is a plain function of
// its inputs so it can be tested; `syncConfig()` reads the real environment.

export interface SyncConfig {
  url: string;
  key: string;
}

export const AUTH_STORAGE_KEY = 'bdgt-sync-auth';

const SUPABASE_URL = /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/;
const LOCAL_URL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function isServiceRoleJwt(key: string): boolean {
  const payload = key.split('.')[1];
  if (!payload) return false;
  try {
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return json?.role === 'service_role';
  } catch {
    return false;
  }
}

// The app only ever holds the public key. A secret or service-role key would
// bypass every access rule, so it is refused outright (sync stays off).
export function readSyncConfig(env: Record<string, unknown>): SyncConfig | null {
  const url = typeof env.VITE_SUPABASE_URL === 'string' ? env.VITE_SUPABASE_URL.trim().replace(/\/$/, '') : '';
  const key = typeof env.VITE_SUPABASE_PUBLISHABLE_KEY === 'string' ? env.VITE_SUPABASE_PUBLISHABLE_KEY.trim() : '';
  if (!url || !key) return null;
  if (!SUPABASE_URL.test(url) && !LOCAL_URL.test(url)) return null;
  if (key.startsWith('sb_secret_') || isServiceRoleJwt(key)) return null;
  return { url, key };
}

export function syncConfig(): SyncConfig | null {
  return readSyncConfig(import.meta.env as Record<string, unknown>);
}

// Google returns to the Settings page, where the Sync section lives.
export function signInRedirectUrl(origin: string, base: string): string {
  return `${origin}${base}/settings`;
}

// The page was opened by the sign-in redirect (a code to exchange, or an error).
export function hasAuthCallback(search: string): boolean {
  return /[?&](code|error|error_description)=/.test(search);
}

export function hasStoredSession(storage: Pick<Storage, 'getItem'> | undefined): boolean {
  try {
    return !!storage?.getItem(AUTH_STORAGE_KEY);
  } catch {
    return false;
  }
}

// Authorization-code flow with PKCE: the right flow for a site with no server.
export const supabaseAuthOptions = {
  flowType: 'pkce' as const,
  detectSessionInUrl: true,
  persistSession: true,
  autoRefreshToken: true,
  storageKey: AUTH_STORAGE_KEY,
};
```

- [ ] **Step 4: Run the tests and the type check**

Run: `npx vitest run tests/lib/sync/config.test.ts && npx vitest run && npm run check`
Expected: 8 new tests PASS, the suite PASS, 0 type errors.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must print feat/cloud-sync-app
git add src/lib/sync/config.ts tests/lib/sync/config.test.ts
git commit --no-gpg-sign -m "feat(sync): configuration and sign-in helpers; refuse secret keys"
```

---

### Task 3: Parked changes

**Files:**
- Create: `src/lib/sync/parked.ts`, `tests/lib/sync/parked.test.ts`

**Interfaces:**
- Produces: `syncCounts(db): Promise<{ waiting; parked }>`, `listParked(db)`, `retryParked(db): Promise<number>` (back into the queue), `discardParked(db): Promise<number>` (stop trying; records stay).

- [ ] **Step 1: Write the failing tests**

`tests/lib/sync/parked.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeDevice, dropDevice } from '../../helpers/devices';
import { setCaptureEnabled } from '$lib/sync/capture';
import { syncCounts, listParked, retryParked, discardParked } from '$lib/sync/parked';
import type { BudgetDatabase } from '$lib/db';

let device: BudgetDatabase;
const entry = (id: string, over: Record<string, unknown> = {}) => ({ key: `transactions:${id}`, table: 'transactions', id, op: 'upsert' as const, at: 5, ...over });

beforeEach(async () => {
  device = await makeDevice('parked-test');
  await device.syncOutbox.bulkPut([entry('a'), entry('b', { parked: true, error: 'bad month' }), entry('c', { parked: true, error: 'x' })]);
});

afterEach(() => dropDevice(device));

describe('parked changes', () => {
  it('counts waiting and parked separately', async () => {
    expect(await syncCounts(device)).toEqual({ waiting: 1, parked: 2 });
  });

  it('lists only the parked ones, with why', async () => {
    const parked = await listParked(device);
    expect(parked.map((e) => [e.id, e.error])).toEqual([['b', 'bad month'], ['c', 'x']]);
  });

  it('puts parked changes back in the queue, clearing the flag and the reason', async () => {
    expect(await retryParked(device)).toBe(2);
    expect(await syncCounts(device)).toEqual({ waiting: 3, parked: 0 });
    expect(await device.syncOutbox.get('transactions:b')).toEqual(entry('b'));
  });

  it('drops parked changes without touching the records or the waiting ones', async () => {
    setCaptureEnabled(false); // editing a record would re-queue it and un-park it
    await device.transactions.add({ id: 'b', amount: 1, bucketId: 'x', date: new Date(2026, 9, 20) });
    setCaptureEnabled(true);
    expect(await discardParked(device)).toBe(2);
    expect(await syncCounts(device)).toEqual({ waiting: 1, parked: 0 });
    expect(await device.transactions.get('b')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/lib/sync/parked.test.ts`
Expected: FAIL, module `$lib/sync/parked` not found.

- [ ] **Step 3: Implement**

`src/lib/sync/parked.ts`:

```ts
import type { BudgetDatabase } from '$lib/db';
import type { SyncOutboxEntry } from './types';

// Changes the server refused are parked: kept, flagged, and left alone by
// later uploads. These are what the Settings screen offers to retry or drop.

export async function syncCounts(db: BudgetDatabase): Promise<{ waiting: number; parked: number }> {
  const entries = await db.syncOutbox.toArray();
  const parked = entries.filter((e) => e.parked).length;
  return { waiting: entries.length - parked, parked };
}

export function listParked(db: BudgetDatabase): Promise<SyncOutboxEntry[]> {
  return db.syncOutbox.filter((e) => e.parked === true).toArray();
}

// Back into the queue, to be tried again on the next sync.
export async function retryParked(db: BudgetDatabase): Promise<number> {
  const parked = await listParked(db);
  await db.syncOutbox.bulkPut(parked.map(({ parked: _p, error: _e, ...rest }) => rest));
  return parked.length;
}

// Stop trying. The records stay on this device; they just are not uploaded
// until they are edited again.
export async function discardParked(db: BudgetDatabase): Promise<number> {
  const parked = await listParked(db);
  await db.syncOutbox.bulkDelete(parked.map((e) => e.key));
  return parked.length;
}
```

- [ ] **Step 4: Run the tests and the type check**

Run: `npx vitest run tests/lib/sync/parked.test.ts && npx vitest run && npm run check`
Expected: 4 new tests PASS, the suite PASS, 0 type errors.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must print feat/cloud-sync-app
git add src/lib/sync/parked.ts tests/lib/sync/parked.test.ts
git commit --no-gpg-sign -m "feat(sync): count, retry and discard changes the server refused"
```

---

### Task 4: Status wording

**Files:**
- Create: `src/lib/sync/status.ts`, `src/lib/sync/statusText.ts`, `tests/lib/sync/statusText.test.ts`

**Interfaces:**
- Produces: in `status.ts`: `SyncState`, `SyncStatus`, `OFF_STATUS`, `needsAttention(status)`; in `statusText.ts`: `describeSync(status, now): { label; tone }` with `tone` one of `ok | quiet | warn | bad`, and `relativeTime(then, now)`.

- [ ] **Step 1: Write the failing tests**

`tests/lib/sync/statusText.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { describeSync, relativeTime } from '$lib/sync/statusText';
import { OFF_STATUS, needsAttention, type SyncStatus } from '$lib/sync/status';

const s = (over: Partial<SyncStatus>): SyncStatus => ({ ...OFF_STATUS, state: 'idle', ...over });
const NOW = 1_000_000_000;

describe('relativeTime', () => {
  it.each([
    [0, 'just now'], [30_000, 'just now'], [60_000, '1 min ago'], [150_000, '3 min ago'],
    [3_600_000, '1 h ago'], [5 * 3_600_000, '5 h ago'], [86_400_000, '1 d ago'], [3 * 86_400_000, '3 d ago'],
  ])('%i ms ago reads "%s"', (ago, text) => {
    expect(relativeTime(NOW - ago, NOW)).toBe(text);
  });

  it('never reads a time in the future as negative', () => {
    expect(relativeTime(NOW + 5_000, NOW)).toBe('just now');
  });
});

describe('describeSync', () => {
  it('says nothing when sync is off', () => {
    expect(describeSync(OFF_STATUS, NOW)).toEqual({ label: '', tone: 'quiet' });
  });

  it('shows when it last synced', () => {
    expect(describeSync(s({ lastSyncedAt: NOW - 120_000 }), NOW)).toEqual({ label: 'Synced · 2 min ago', tone: 'ok' });
    expect(describeSync(s({ lastSyncedAt: null }), NOW)).toEqual({ label: 'Connected', tone: 'ok' });
  });

  it('shows work in progress and changes waiting', () => {
    expect(describeSync(s({ state: 'syncing' }), NOW)).toEqual({ label: 'Syncing…', tone: 'quiet' });
    expect(describeSync(s({ waiting: 3 }), NOW)).toEqual({ label: '3 waiting', tone: 'quiet' });
  });

  it('shows offline with how much is waiting', () => {
    expect(describeSync(s({ state: 'offline', waiting: 3 }), NOW)).toEqual({ label: 'Offline · 3 waiting', tone: 'warn' });
    expect(describeSync(s({ state: 'offline' }), NOW)).toEqual({ label: 'Offline', tone: 'warn' });
  });

  it('puts changes the server refused ahead of everything that is fine', () => {
    expect(describeSync(s({ parked: 1, waiting: 4 }), NOW)).toEqual({ label: "1 change couldn't sync", tone: 'bad' });
    expect(describeSync(s({ parked: 2 }), NOW)).toEqual({ label: "2 changes couldn't sync", tone: 'bad' });
  });

  it('asks the person to act on a lost session, a missing invite or an old database', () => {
    expect(describeSync(s({ state: 'auth' }), NOW)).toEqual({ label: 'Sign in again', tone: 'bad' });
    expect(describeSync(s({ state: 'notAllowed' }), NOW)).toEqual({ label: "Sync isn't enabled for this account", tone: 'bad' });
    expect(describeSync(s({ state: 'schema' }), NOW)).toEqual({ label: 'Database needs update', tone: 'bad' });
  });
});

describe('needsAttention', () => {
  it('is quiet when all is well, offline or syncing', () => {
    for (const state of ['off', 'idle', 'syncing', 'offline'] as const) expect(needsAttention({ ...OFF_STATUS, state })).toBe(false);
  });

  it('flags a lost session, a missing invite, an old database and parked changes', () => {
    for (const state of ['auth', 'notAllowed', 'schema'] as const) expect(needsAttention({ ...OFF_STATUS, state })).toBe(true);
    expect(needsAttention({ ...OFF_STATUS, state: 'idle', parked: 2 })).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/lib/sync/statusText.test.ts`
Expected: FAIL, module `$lib/sync/statusText` not found.

- [ ] **Step 3: Implement**

`src/lib/sync/status.ts`:

```ts
// What the sync service reports, and which states the person has to look at.
// Kept apart from the service so the wording code can use it on its own.

export type SyncState = 'off' | 'idle' | 'syncing' | 'offline' | 'auth' | 'notAllowed' | 'schema';

export interface SyncStatus {
  state: SyncState;
  lastSyncedAt: number | null;
  waiting: number; // changes not yet uploaded
  parked: number; // changes the server refused
  message: string; // the server's or network's own words, for the Settings screen
}

export const OFF_STATUS: SyncStatus = { state: 'off', lastSyncedAt: null, waiting: 0, parked: 0, message: '' };

// Statuses the person should look at, not just glance past.
export function needsAttention(s: SyncStatus): boolean {
  return s.state === 'auth' || s.state === 'notAllowed' || s.state === 'schema' || s.parked > 0;
}
```

`src/lib/sync/statusText.ts`:

```ts
import type { SyncStatus } from './status';

// What the status chip and the Settings screen say, as plain data so the
// wording can be tested. `tone` picks the colour: ok (green), quiet (grey),
// warn (amber: will fix itself) or bad (needs the person).
export type SyncTone = 'ok' | 'quiet' | 'warn' | 'bad';

export function relativeTime(then: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function describeSync(status: SyncStatus, now: number): { label: string; tone: SyncTone } {
  switch (status.state) {
    case 'off':
      return { label: '', tone: 'quiet' };
    case 'syncing':
      return { label: 'Syncing…', tone: 'quiet' };
    case 'offline':
      return { label: status.waiting > 0 ? `Offline · ${status.waiting} waiting` : 'Offline', tone: 'warn' };
    case 'auth':
      return { label: 'Sign in again', tone: 'bad' };
    case 'notAllowed':
      return { label: "Sync isn't enabled for this account", tone: 'bad' };
    case 'schema':
      return { label: 'Database needs update', tone: 'bad' };
    case 'idle':
      if (status.parked > 0) return { label: `${plural(status.parked, 'change', 'changes')} couldn't sync`, tone: 'bad' };
      if (status.waiting > 0) return { label: `${status.waiting} waiting`, tone: 'quiet' };
      return {
        label: status.lastSyncedAt === null ? 'Connected' : `Synced · ${relativeTime(status.lastSyncedAt, now)}`,
        tone: 'ok',
      };
  }
}
```

- [ ] **Step 4: Run the tests and the type check**

Run: `npx vitest run tests/lib/sync/statusText.test.ts && npx vitest run && npm run check`
Expected: 17 new tests PASS, the suite PASS, 0 type errors.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must print feat/cloud-sync-app
git add src/lib/sync/status.ts src/lib/sync/statusText.ts tests/lib/sync/statusText.test.ts
git commit --no-gpg-sign -m "feat(sync): the wording and colour of each sync status"
```

---

### Task 5: Quiet reloads

**Files:**
- Modify: `src/lib/stores/budgetStore.ts`, `src/lib/stores/currencyStore.ts`
- Create: `src/lib/stores/reload.ts`, `tests/lib/stores/reload.test.ts`, `tests/lib/stores/backgroundLoad.test.ts`

**Interfaces:**
- Produces: `loadData({ background?: boolean })` (no loading screen when `background`); `loadCurrency({ keepPrompt?: boolean })` (does not re-arm the currency dialog); `reloadAllStores(): Promise<void>` (currency, data, recurring, goals, investments, then `processRecurring`).

- [ ] **Step 1: Write the failing tests**

`tests/lib/stores/reload.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const calls: string[] = [];
vi.mock('$lib/stores/currencyStore', () => ({ loadCurrency: vi.fn(async (o?: unknown) => void calls.push(`currency ${JSON.stringify(o)}`)) }));
vi.mock('$lib/stores/budgetStore', () => ({ loadData: vi.fn(async (o?: unknown) => void calls.push(`data ${JSON.stringify(o)}`)) }));
vi.mock('$lib/stores/recurringStore', () => ({
  loadRecurring: vi.fn(async () => void calls.push('recurring')),
  processRecurring: vi.fn(async () => void calls.push('process')),
}));
vi.mock('$lib/stores/goalsStore', () => ({ loadGoals: vi.fn(async () => void calls.push('goals')) }));
vi.mock('$lib/stores/investmentStore', () => ({ loadInvestments: vi.fn(async () => void calls.push('investments')) }));

import { reloadAllStores } from '$lib/stores/reload';

beforeEach(() => {
  calls.length = 0;
});

describe('reloadAllStores', () => {
  it('reloads every store quietly, then creates any recurring items now due', async () => {
    await reloadAllStores();
    expect(calls).toEqual(['currency {"keepPrompt":true}', 'data {"background":true}', 'recurring', 'goals', 'investments', 'process']);
  });
});
```

`tests/lib/stores/backgroundLoad.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { db } from '$lib/db';
import { loadData, isLoading } from '$lib/stores/budgetStore';
import { loadCurrency, takeCurrencyPrompt, baseCurrency } from '$lib/stores/currencyStore';
import { resetRealDb } from '../../helpers/realDb';
import { stubLocalStorage } from '../../helpers/localStorage';

beforeEach(async () => {
  await resetRealDb();
  stubLocalStorage();
});

describe('loadData', () => {
  it('shows the loading screen for a normal load', async () => {
    const seen: boolean[] = [];
    isLoading.set(false);
    const stop = isLoading.subscribe((v) => seen.push(v));
    await loadData();
    stop();
    expect(seen).toContain(true);
    expect(get(isLoading)).toBe(false);
  });

  it('does not, for a background reload, so the page is not torn down under the person', async () => {
    isLoading.set(false);
    const seen: boolean[] = [];
    const stop = isLoading.subscribe((v) => seen.push(v));
    await loadData({ background: true });
    stop();
    expect(seen).not.toContain(true);
  });
});

describe('loadCurrency', () => {
  it('asks again after a normal load, but not after a quiet one', async () => {
    await loadCurrency(); // nothing saved: an unconfirmed guess
    expect(takeCurrencyPrompt(false)).toBe(true);
    expect(takeCurrencyPrompt(false)).toBe(false); // already asked this load
    await loadCurrency({ keepPrompt: true });
    expect(takeCurrencyPrompt(false)).toBe(false); // a background reload must not reopen the dialog
    await loadCurrency();
    expect(takeCurrencyPrompt(false)).toBe(true);
  });

  it('still picks up a currency that changed in the database', async () => {
    await loadCurrency();
    await db.settings.bulkPut([{ key: 'baseCurrency', value: 'INR' }, { key: 'currencyConfirmed', value: true }]);
    await loadCurrency({ keepPrompt: true });
    expect(get(baseCurrency)).toBe('INR');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/lib/stores/reload.test.ts tests/lib/stores/backgroundLoad.test.ts`
Expected: FAIL (`$lib/stores/reload` not found; the background and keepPrompt tests fail).

- [ ] **Step 3: Implement**

Apply this change to `src/lib/stores/budgetStore.ts` (save the block as a patch file and run `git apply <patch>`, or make the same edits by hand):

```diff
diff --git a/src/lib/stores/budgetStore.ts b/src/lib/stores/budgetStore.ts
index 61b702c..2f8ca83 100644
--- a/src/lib/stores/budgetStore.ts
+++ b/src/lib/stores/budgetStore.ts
@@ -16,8 +16,10 @@ export const incomes = writable<Income[]>([]);
 export const monthSnapshots = writable<MonthSnapshot[]>([]);
 export const isLoading = writable(true);
 
-export async function loadData(): Promise<void> {
-  isLoading.set(true);
+// `background` is for a reload triggered by sync: the person is looking at the
+// page, so it must not be replaced by the loading screen.
+export async function loadData(options: { background?: boolean } = {}): Promise<void> {
+  if (!options.background) isLoading.set(true);
   await initializeDefaultBuckets();
 
   const [loadedBuckets, loadedTransactions, loadedIncomes, loadedAllocations, loadedNotes] = await Promise.all([
```

Apply this change to `src/lib/stores/currencyStore.ts` (save the block as a patch file and run `git apply <patch>`, or make the same edits by hand):

```diff
diff --git a/src/lib/stores/currencyStore.ts b/src/lib/stores/currencyStore.ts
index cbfabe7..b21c156 100644
--- a/src/lib/stores/currencyStore.ts
+++ b/src/lib/stores/currencyStore.ts
@@ -42,11 +42,13 @@ function detectOnDevice(): CurrencyCode {
 // is saved yet. A guess is saved as unconfirmed, so it stays put (a later
 // load from another time zone must not relabel amounts already entered)
 // while the confirm modal still asks until the user answers.
-export async function loadCurrency(): Promise<void> {
+// `keepPrompt` is for a reload triggered by sync: it must not reopen the
+// confirm dialog the person already dismissed.
+export async function loadCurrency(options: { keepPrompt?: boolean } = {}): Promise<void> {
   const stored = rowsToSettings(await db.settings.toArray());
   const settings = resolveStartupSettings(stored, detectOnDevice());
   if (!stored) await autoTransaction(db, [db.settings], () => db.settings.bulkPut(settingsToRows(settings)));
-  resetCurrencyPrompt();
+  if (!options.keepPrompt) resetCurrencyPrompt();
   baseCurrency.set(settings.baseCurrency);
   currencyConfirmed.set(settings.currencyConfirmed);
 }
```

`src/lib/stores/reload.ts`:

```ts
import { loadData } from './budgetStore';
import { loadCurrency } from './currencyStore';
import { loadGoals } from './goalsStore';
import { loadInvestments } from './investmentStore';
import { loadRecurring, processRecurring } from './recurringStore';

// Everything on screen comes from these stores. After a sync changes the
// database underneath them, reload all of them without a loading screen or a
// repeated currency dialog, then create any recurring items the sync made due.
export async function reloadAllStores(): Promise<void> {
  await loadCurrency({ keepPrompt: true });
  await loadData({ background: true });
  await loadRecurring();
  await loadGoals();
  await loadInvestments();
  await processRecurring();
}
```

- [ ] **Step 4: Run the tests, the whole suite and the type check**

Run: `npx vitest run tests/lib/stores && npx vitest run && npm run check`
Expected: 5 new tests PASS, the suite PASS, 0 type errors.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must print feat/cloud-sync-app
git add src/lib/stores/budgetStore.ts src/lib/stores/currencyStore.ts src/lib/stores/reload.ts tests/lib/stores/reload.test.ts tests/lib/stores/backgroundLoad.test.ts
git commit --no-gpg-sign -m "feat(sync): reload the stores quietly after a sync changed the data"
```

---

### Task 6: The sync service

**Files:**
- Create: `src/lib/sync/service.ts`, `tests/lib/sync/service.test.ts`

**Interfaces:**
- Consumes: `syncOnce`, `SyncFailure`, `SyncOutcome` (engine); `syncCounts` (Task 3); `SyncStatus`, `needsAttention`, `OFF_STATUS` (Task 4); `SyncContext`.
- Produces: `class SyncService` with `status` (readable `SyncStatus`), `start()`, `stop()`, `requestSync()`, `syncNow()`, `whenIdle()`, `report(failure)`, `resume()`, `refreshCounts()`; `SyncStatus`, `SyncState`, `OFF_STATUS`, `needsAttention(status)`, `BUSY`, `Timers`, `SyncServiceOptions`.

- [ ] **Step 1: Write the failing tests**

`tests/lib/sync/service.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { get } from 'svelte/store';
import { makeDevice, dropDevice } from '../../helpers/devices';
import { FakeServer } from '../../helpers/fakeServer';
import { SyncService, BUSY, type Timers } from '$lib/sync/service';
import { needsAttention, OFF_STATUS, type SyncStatus } from '$lib/sync/status';
import { resetClockForTests } from '$lib/sync/clock';
import { SyncError } from '$lib/sync/transport';
import { collectionByTable, toRow } from '$lib/sync/registry';
import type { BudgetDatabase } from '$lib/db';

// Timers the test fires by hand, so nothing waits on a real clock.
class ManualTimers implements Timers {
  tasks = new Map<number, { fn: () => void; ms: number }>();
  private next = 1;
  set(fn: () => void, ms: number) {
    const id = this.next++;
    this.tasks.set(id, { fn, ms });
    return id;
  }
  clear(handle: unknown) {
    this.tasks.delete(handle as number);
  }
  get delays() {
    return [...this.tasks.values()].map((t) => t.ms);
  }
  fireAll() {
    const due = [...this.tasks.entries()];
    this.tasks.clear();
    for (const [, t] of due) t.fn();
  }
}

let device: BudgetDatabase;
let server: FakeServer;
let timers: ManualTimers;
let changed: number;
const day = new Date(2026, 9, 20);
const tx = (id: string) => ({ id, amount: 100, bucketId: 'b1', date: day });
const bucket = { id: 'b1', name: 'b1', color: '#000', order: 0, isDefault: false, allocationType: 'fixed' as const, fixedAmount: 0, percentageAmount: 0, isSavings: false, isEveryday: true, createdAt: new Date(2026, 0, 1) };

function make(over: Partial<ConstructorParameters<typeof SyncService>[0]> = {}) {
  return new SyncService({
    ctx: { db: device, transport: server },
    onChanged: () => void changed++,
    timers,
    now: () => 1_000,
    ...over,
  });
}
const status = (s: SyncService): SyncStatus => get(s.status);
const settle = (s: SyncService) => s.whenIdle();

beforeEach(async () => {
  resetClockForTests();
  device = await makeDevice('service-test');
  server = new FakeServer(() => 5_000_000_000_000);
  timers = new ManualTimers();
  changed = 0;
});

afterEach(() => dropDevice(device));

describe('SyncService', () => {
  it('is off until started, and syncing does nothing then', async () => {
    const s = make();
    expect(status(s)).toEqual(OFF_STATUS);
    await s.syncNow();
    expect(server.upsertCalls).toEqual([]);
  });

  it('syncs when started and shows up to date', async () => {
    await device.buckets.add(bucket);
    const s = make();
    s.start();
    await settle(s);
    expect(status(s)).toMatchObject({ state: 'idle', lastSyncedAt: 1_000, waiting: 0, parked: 0, message: '' });
    expect(server.live('buckets')).toHaveLength(1);
  });

  it('syncs again after the interval while all is well', async () => {
    const s = make({ intervalMs: 300_000 });
    s.start();
    await settle(s);
    expect(timers.delays).toEqual([300_000]);
  });

  it('turns a burst of writes into one sync after the pause', async () => {
    const s = make({ debounceMs: 2_000 });
    s.start();
    await settle(s);
    timers.tasks.clear();
    await device.buckets.add(bucket);
    s.requestSync();
    s.requestSync();
    s.requestSync();
    expect(timers.delays).toEqual([2_000]);
    timers.fireAll();
    await settle(s);
    expect(server.upsertCalls.filter((c) => c.remote === 'buckets')).toHaveLength(1);
  });

  it('runs one cycle at a time and folds requests made meanwhile into one follow-up', async () => {
    const s = make();
    s.start();
    await settle(s);
    const original = server.pull.bind(server);
    let pulls = 0;
    server.pull = async (...args) => {
      if (args[0] === 'settings') pulls++;
      await new Promise((r) => setTimeout(r, 5));
      return original(...args);
    };
    await Promise.all([s.syncNow(), s.syncNow(), s.syncNow()]);
    await settle(s);
    expect(pulls).toBe(2); // the one that ran, and one follow-up
  });

  it('tells the app when the pull changed local data, and not otherwise', async () => {
    const s = make();
    s.start();
    await settle(s);
    expect(changed).toBe(0);
    const def = collectionByTable('buckets')!;
    await server.upsert('buckets', [{ ...toRow(def, bucket), updated_at: new Date(1000).toISOString(), deleted_at: null }]);
    await s.syncNow();
    await settle(s);
    expect(changed).toBe(1);
  });

  it('keeps the queue, shows offline, and retries with growing gaps', async () => {
    await device.buckets.add(bucket);
    server.offline = true;
    const s = make({ backoffMs: [5_000, 15_000, 45_000] });
    s.start();
    await settle(s);
    expect(status(s)).toMatchObject({ state: 'offline', waiting: 1 });
    expect(timers.delays).toEqual([5_000]);
    timers.fireAll();
    await settle(s);
    expect(timers.delays).toEqual([15_000]);
    timers.fireAll();
    await settle(s);
    timers.fireAll();
    await settle(s);
    expect(timers.delays).toEqual([45_000]); // capped at the last gap
    server.offline = false;
    timers.fireAll();
    await settle(s);
    expect(status(s)).toMatchObject({ state: 'idle', waiting: 0 });
    expect(timers.delays).toEqual([300_000]); // back to the normal interval
  });

  it('stops retrying for an account that is not invited, and says so', async () => {
    server.allowed = false;
    const s = make();
    s.start();
    await settle(s);
    expect(status(s)).toMatchObject({ state: 'notAllowed' });
    expect(timers.delays).toEqual([]);
  });

  it('shows a problem reported from outside a cycle without scheduling any sync of its own', async () => {
    const s = make();
    s.report({ status: 'offline', message: 'no network' });
    expect(status(s)).toMatchObject({ state: 'offline', message: 'no network' });
    s.report({ status: 'schema', message: 'Database needs update 1' });
    expect(status(s)).toMatchObject({ state: 'schema', message: 'Database needs update 1' });
    expect(timers.tasks.size).toBe(0);
    expect(server.upsertCalls).toEqual([]);
  });

  it('keeps checking an out-of-date database at the normal interval when a cycle finds it', async () => {
    const s = make();
    s.start();
    await settle(s);
    timers.tasks.clear();
    // A table request failing with a schema problem reaches the cycle as a schema outcome.
    server.pull = async () => {
      throw new SyncError('schema', 'column not found');
    };
    await s.syncNow();
    await settle(s);
    expect(status(s)).toMatchObject({ state: 'schema', message: 'column not found' });
    expect(timers.delays).toEqual([300_000]);
  });

  it('waits for the person after a lost session, then resumes', async () => {
    const s = make();
    s.start();
    await settle(s);
    s.report({ status: 'auth', message: 'JWT expired' });
    expect(status(s)).toMatchObject({ state: 'auth', message: 'JWT expired' });
    await device.buckets.add(bucket);
    s.resume();
    await settle(s);
    expect(status(s)).toMatchObject({ state: 'idle' });
    expect(server.live('buckets')).toHaveLength(1);
  });

  it('counts rows the server refused as parked', async () => {
    await device.transactions.bulkAdd([tx('a'), tx('bad')]);
    server.rejectIds.add('bad');
    const s = make();
    s.start();
    await settle(s);
    expect(status(s)).toMatchObject({ state: 'idle', waiting: 0, parked: 1 });
    expect(needsAttention(status(s))).toBe(true);
  });

  it('skips a cycle quietly when another tab is syncing, and tries again soon', async () => {
    const s = make({ lock: async () => BUSY, backoffMs: [5_000] });
    s.start();
    await settle(s);
    expect(status(s).state).toBe('idle');
    expect(server.upsertCalls).toEqual([]);
    expect(timers.delays).toEqual([5_000]);
  });

  it('waits for the tab to be visible before a background cycle', async () => {
    let visible = false;
    const s = make({ isVisible: () => visible, intervalMs: 300_000 });
    s.start();
    await settle(s);
    const before = server.upsertCalls.length;
    timers.fireAll(); // hidden: looks again later, does not sync
    await settle(s);
    expect(timers.delays).toEqual([300_000]);
    visible = true;
    await device.buckets.add(bucket);
    timers.fireAll();
    await settle(s);
    expect(server.upsertCalls.length).toBeGreaterThan(before);
  });

  it('treats an unexpected error as a failed attempt, not a crash', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const s = make({ lock: async () => { throw new Error('boom'); } });
    s.start();
    await settle(s);
    expect(status(s).state).toBe('offline');
    spy.mockRestore();
  });

  it('goes quiet when stopped: no timers, status off', async () => {
    const s = make();
    s.start();
    await settle(s);
    s.requestSync();
    s.stop();
    expect(timers.tasks.size).toBe(0);
    expect(status(s)).toEqual(OFF_STATUS);
    await s.syncNow();
    expect(timers.tasks.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/lib/sync/service.test.ts`
Expected: FAIL, module `$lib/sync/service` not found.

- [ ] **Step 3: Implement**

`src/lib/sync/service.ts`:

```ts
import { writable, type Readable } from 'svelte/store';
import { syncOnce, type SyncFailure, type SyncOutcome } from './engine';
import { syncCounts } from './parked';
import { OFF_STATUS, needsAttention, type SyncState, type SyncStatus } from './status';
import type { SyncContext } from './types';

// Runs sync cycles for a device that is linked to an account: when to run,
// how often to retry, and what to tell the person. It does not decide who is
// signed in (see app.ts); it only keeps a linked device synced.

export { OFF_STATUS, needsAttention, type SyncState, type SyncStatus };

export const BUSY = Symbol('another tab is syncing');

export interface Timers {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

const realTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export interface SyncServiceOptions {
  ctx: SyncContext;
  // The pull changed local data: the app's stores need reloading.
  onChanged: () => void | Promise<void>;
  timers?: Timers;
  // Runs one cycle exclusively across tabs; BUSY means another tab has it.
  lock?: <T>(fn: () => Promise<T>) => Promise<T | typeof BUSY>;
  // Background timers do nothing while the tab is hidden.
  isVisible?: () => boolean;
  now?: () => number;
  debounceMs?: number; // after a write
  intervalMs?: number; // between cycles while all is well
  backoffMs?: number[]; // between retries while offline, growing
}

export class SyncService {
  private store = writable<SyncStatus>({ ...OFF_STATUS });
  readonly status: Readable<SyncStatus> = { subscribe: this.store.subscribe };

  private active = false;
  private running: Promise<void> | null = null;
  private again = false;
  private failures = 0;
  private timer: unknown = null;
  private debounce: unknown = null;
  private current: SyncStatus = { ...OFF_STATUS };

  private readonly timers: Timers;
  private readonly lock: NonNullable<SyncServiceOptions['lock']>;
  private readonly isVisible: () => boolean;
  private readonly now: () => number;
  private readonly debounceMs: number;
  private readonly intervalMs: number;
  private readonly backoffMs: number[];

  constructor(private options: SyncServiceOptions) {
    this.timers = options.timers ?? realTimers;
    this.lock = options.lock ?? (async (fn) => fn());
    this.isVisible = options.isVisible ?? (() => true);
    this.now = options.now ?? Date.now;
    this.debounceMs = options.debounceMs ?? 2_000;
    this.intervalMs = options.intervalMs ?? 300_000;
    this.backoffMs = options.backoffMs ?? [5_000, 15_000, 45_000, 120_000, 300_000];
  }

  private patch(change: Partial<SyncStatus>): void {
    this.current = { ...this.current, ...change };
    this.store.set(this.current);
  }

  private clearTimers(): void {
    if (this.timer !== null) this.timers.clear(this.timer);
    if (this.debounce !== null) this.timers.clear(this.debounce);
    this.timer = null;
    this.debounce = null;
  }

  private arm(ms: number): void {
    if (this.timer !== null) this.timers.clear(this.timer);
    this.timer = this.timers.set(() => {
      this.timer = null;
      if (!this.active) return;
      if (!this.isVisible()) this.arm(ms); // look again later
      else void this.syncNow();
    }, ms);
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    this.failures = 0;
    this.patch({ state: 'idle', message: '' });
    void this.syncNow();
  }

  stop(): void {
    this.active = false;
    this.again = false;
    this.clearTimers();
    this.current = { ...OFF_STATUS };
    this.store.set(this.current);
  }

  // A write was committed: sync soon, once, however many writes came together.
  requestSync(): void {
    if (!this.active) return;
    if (this.debounce !== null) this.timers.clear(this.debounce);
    this.debounce = this.timers.set(() => {
      this.debounce = null;
      void this.syncNow();
    }, this.debounceMs);
  }

  // Runs a cycle now. One at a time: a request made while one is running is
  // folded into a single follow-up run.
  syncNow(): Promise<void> {
    if (!this.active) return Promise.resolve();
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = this.cycle().finally(() => {
      this.running = null;
      if (this.again && this.active) {
        this.again = false;
        void this.syncNow();
      } else {
        this.again = false;
      }
    });
    return this.running;
  }

  // Resolves once no cycle is running and none is waiting to follow.
  async whenIdle(): Promise<void> {
    while (this.running) await this.running;
  }

  // Shows a problem that happened outside a cycle (for example while
  // signing in), without scheduling anything: until the device is linked the
  // caller decides when to try again, and the service must not sync on its own.
  report(failure: SyncFailure): void {
    this.active = true;
    this.apply({ ...failure }, false);
  }

  // The session came back (token refreshed, signed in again): sync again.
  resume(): void {
    if (this.current.state === 'auth') {
      this.active = true;
      this.failures = 0;
      void this.syncNow();
    }
  }

  async refreshCounts(): Promise<void> {
    this.patch(await syncCounts(this.options.ctx.db));
  }

  private apply(outcome: SyncOutcome, schedule = true): void {
    if (outcome.status === 'ok') {
      this.failures = 0;
      this.patch({ state: 'idle', lastSyncedAt: this.now(), message: '' });
      if (schedule) this.arm(this.intervalMs);
      return;
    }
    this.patch({ state: outcome.status, message: outcome.message });
    if (!schedule) return;
    if (outcome.status === 'offline') {
      this.failures += 1;
      this.arm(this.backoffMs[Math.min(this.failures - 1, this.backoffMs.length - 1)]);
    } else if (outcome.status === 'schema') {
      this.arm(this.intervalMs); // the database may be upgraded meanwhile
    }
    // auth and notAllowed wait for the person: sign in again, or get invited.
  }

  private async cycle(): Promise<void> {
    this.clearTimers();
    const before = this.current.state;
    this.patch({ state: 'syncing' });

    let outcome: SyncOutcome | typeof BUSY;
    try {
      outcome = await this.lock(() => syncOnce(this.options.ctx));
    } catch (e) {
      console.error('Sync failed unexpectedly', e);
      outcome = { status: 'offline', message: 'Something went wrong while syncing' };
    }
    if (!this.active) return;

    if (outcome === BUSY) {
      this.patch({ state: before === 'syncing' ? 'idle' : before });
      this.arm(this.backoffMs[0]);
      return;
    }

    try {
      await this.refreshCounts();
    } catch (e) {
      console.error('Could not count waiting changes', e);
    }
    this.apply(outcome);
    if (outcome.status === 'ok' && outcome.changed) {
      try {
        await this.options.onChanged();
      } catch (e) {
        console.error('Could not reload after sync', e);
      }
    }
  }
}
```

- [ ] **Step 4: Run the tests, the whole suite and the type check**

Run: `npx vitest run tests/lib/sync/service.test.ts && npx vitest run && npm run check`
Expected: 16 new tests PASS, the suite PASS, 0 type errors.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must print feat/cloud-sync-app
git add src/lib/sync/service.ts tests/lib/sync/service.test.ts
git commit --no-gpg-sign -m "feat(sync): the sync service: single-flight cycles, debounce, backoff and status"
```

---

### Task 7: The sync app: sign-in, first sign-in, sign-out

**Files:**
- Create: `src/lib/sync/app.ts`, `tests/lib/sync/app.test.ts`

**Interfaces:**
- Consumes: `SyncService` (Task 6), `runFirstSignIn`, `signOutLocal`, `pendingChanges` (first sign-in module), `getState` / `LINKED_ACCOUNT`, `setCaptureEnabled`.
- Produces: `class SyncApp<C extends AuthClient>` with stores `account`, `prompt`, `error`, `busy`, `linked`, `status`; `syncService`; methods `init()`, `signIn()`, `resolvePrompt(choice)`, `requestSignOut()`, `confirmSignOut({ downloadBackup })`, `preview(...)` (development only); types `SyncUser`, `SyncPrompt`, `AuthClient`, `SyncAppDeps`.

- [ ] **Step 1: Write the failing tests**

`tests/lib/sync/app.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { get } from 'svelte/store';
import { makeDevice, dropDevice } from '../../helpers/devices';
import { FakeServer } from '../../helpers/fakeServer';
import { SyncApp, type AuthClient } from '$lib/sync/app';
import { SyncService, type Timers } from '$lib/sync/service';
import { collectionByTable, toRow } from '$lib/sync/registry';
import { getState, setState, LINKED_ACCOUNT } from '$lib/sync/state';
import { resetClockForTests } from '$lib/sync/clock';
import type { BudgetDatabase } from '$lib/db';

class ManualTimers implements Timers {
  tasks = new Map<number, { fn: () => void; ms: number }>();
  private next = 1;
  set(fn: () => void, ms: number) {
    const id = this.next++;
    this.tasks.set(id, { fn, ms });
    return id;
  }
  clear(handle: unknown) {
    this.tasks.delete(handle as number);
  }
  fireAll() {
    const due = [...this.tasks.values()];
    this.tasks.clear();
    for (const t of due) t.fn();
  }
}

type Session = { user: { id: string; email?: string } } | null;
const SESSION: Session = { user: { id: 'u1', email: 'me@example.com' } };

function fakeClient(session: Session) {
  const handlers: ((event: string, session: Session) => void)[] = [];
  return {
    auth: {
      getSession: vi.fn(async () => ({ data: { session } })),
      signInWithOAuth: vi.fn(async () => ({ error: null as { message: string } | null })),
      signOut: vi.fn(async () => ({ error: null })),
      onAuthStateChange: vi.fn((cb: (event: string, session: Session) => void) => {
        handlers.push(cb);
        return { data: { subscription: { unsubscribe() {} } } };
      }),
    },
    emit: (event: string, s: Session) => handlers.forEach((h) => h(event, s)),
  };
}

let device: BudgetDatabase;
let server: FakeServer;
let timers: ManualTimers;
let client: ReturnType<typeof fakeClient>;
let saveFile: Mock<(text: string, filename: string) => void>;
let reload: Mock<() => Promise<void>>;
let reloadPage: Mock<() => void>;
let makeServiceCalls: number;
let getClient: Mock<() => Promise<typeof client>>;

const day = new Date(2026, 9, 20);
const bucket = (id: string, name = id) => ({ id, name, color: '#000', order: 0, isDefault: false, allocationType: 'fixed' as const, fixedAmount: 0, percentageAmount: 0, isSavings: false, isEveryday: true, createdAt: new Date(2026, 0, 1) });

async function serverHasBucket(id: string, name: string) {
  const def = collectionByTable('buckets')!;
  await server.upsert('buckets', [{ ...toRow(def, bucket(id, name)), updated_at: new Date(1000).toISOString(), deleted_at: null }]);
}

function makeApp(over: { enabled?: boolean; hint?: boolean } = {}) {
  getClient = vi.fn(async () => client);
  return new SyncApp<typeof client>({
    db: device,
    enabled: over.enabled ?? true,
    hasSessionHint: () => over.hint ?? true,
    getClient: getClient as never,
    makeTransport: () => server,
    makeService: (ctx) => {
      makeServiceCalls++;
      return new SyncService({ ctx, onChanged: () => void reload(), timers, now: () => 1_000 });
    },
    reload: reload as never,
    exportBackup: async () => '{"backup":true}',
    saveFile: saveFile as never,
    redirectTo: () => 'https://example.com/bdgt/settings',
    reloadPage: reloadPage as never,
    setTimer: (fn, ms) => timers.set(fn, ms),
    clearTimer: (h) => timers.clear(h),
    today: () => '2026-10-21',
    retryMs: 30_000,
  });
}

// Waits for something asynchronous to become true, instead of guessing a delay.
async function eventually(check: () => Promise<boolean> | boolean, tries = 200): Promise<void> {
  for (let i = 0; i < tries; i++) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('condition never became true');
}

async function started(app: ReturnType<typeof makeApp>) {
  await app.init();
  await app.syncService?.whenIdle();
}

beforeEach(async () => {
  resetClockForTests();
  device = await makeDevice('app-test');
  server = new FakeServer(() => 5_000_000_000_000);
  timers = new ManualTimers();
  client = fakeClient(SESSION);
  saveFile = vi.fn();
  reload = vi.fn(async () => {});
  reloadPage = vi.fn();
  makeServiceCalls = 0;
});

afterEach(() => dropDevice(device));

describe('start-up', () => {
  it('does nothing at all when the build has no Supabase project', async () => {
    const app = makeApp({ enabled: false });
    await app.init();
    expect(getClient).not.toHaveBeenCalled();
  });

  it('does not load the library for a device that is not linked and has no sign-in under way', async () => {
    const app = makeApp({ hint: false });
    await app.init();
    expect(getClient).not.toHaveBeenCalled();
    expect(get(app.account)).toBeNull();
  });

  it('loads it when a sign-in redirect is under way, and stays quiet if there is no session', async () => {
    client = fakeClient(null);
    const app = makeApp();
    await app.init();
    expect(getClient).toHaveBeenCalled();
    expect(get(app.account)).toBeNull();
    expect(app.syncService).toBeNull();
  });

  it('keeps a linked device synced from its stored session, reloading what the pull changed', async () => {
    await setState(device, LINKED_ACCOUNT, 'u1');
    await serverHasBucket('theirs', 'Theirs');
    const app = makeApp({ hint: false });
    await started(app);
    expect(get(app.status)).toMatchObject({ state: 'idle' });
    expect(await device.buckets.get('theirs')).toBeTruthy();
    expect(reload).toHaveBeenCalled();
  });

  it('shows "sign in again" for a linked device whose session is gone, and keeps capturing', async () => {
    await setState(device, LINKED_ACCOUNT, 'u1');
    client = fakeClient(null);
    const app = makeApp({ hint: false });
    await app.init();
    expect(get(app.status)).toMatchObject({ state: 'auth' });
    await device.buckets.add(bucket('b1'));
    expect(await device.syncOutbox.get('buckets:b1')).toBeTruthy();
  });
});

describe('first sign-in', () => {
  it('links a device with data to an empty account and starts syncing', async () => {
    await device.buckets.add(bucket('b1'));
    const app = makeApp();
    await started(app);
    expect(get(app.account)).toEqual({ id: 'u1', email: 'me@example.com' });
    expect(server.live('buckets').map((r) => r.id)).toEqual(['b1']);
    expect(await getState(device, LINKED_ACCOUNT)).toBe('u1');
    expect(get(app.status)).toMatchObject({ state: 'idle', waiting: 0 });
  });

  it('asks before replacing a device when both sides hold data, and changes nothing', async () => {
    await device.buckets.add(bucket('mine'));
    await serverHasBucket('theirs', 'Theirs');
    const app = makeApp();
    await app.init();
    expect(get(app.prompt)).toEqual({ kind: 'conflict' });
    expect((await device.buckets.toArray()).map((b) => b.id)).toEqual(['mine']);
    expect(await getState(device, LINKED_ACCOUNT)).toBeUndefined();
    expect(app.syncService).toBeNull();
  });

  it('saves a backup of the device first, then uses the account\'s data, when the person chooses to', async () => {
    await device.buckets.add(bucket('mine'));
    await serverHasBucket('theirs', 'Theirs');
    const app = makeApp();
    await app.init();
    await app.resolvePrompt('useAccount');
    await app.syncService?.whenIdle();
    expect(saveFile).toHaveBeenCalledTimes(1);
    expect(saveFile).toHaveBeenCalledWith('{"backup":true}', 'budget-backup-before-sync-2026-10-21.json');
    expect((await device.buckets.toArray()).map((b) => b.id)).toEqual(['theirs']);
    expect(get(app.prompt)).toBeNull();
    expect(reload).toHaveBeenCalled();
    expect(await getState(device, LINKED_ACCOUNT)).toBe('u1');
  });

  it('keeps the device and signs out of the account when the person cancels', async () => {
    await device.buckets.add(bucket('mine'));
    await serverHasBucket('theirs', 'Theirs');
    const app = makeApp();
    await app.init();
    await app.resolvePrompt('cancel');
    expect(client.auth.signOut).toHaveBeenCalled();
    expect(saveFile).not.toHaveBeenCalled();
    expect((await device.buckets.toArray()).map((b) => b.id)).toEqual(['mine']);
    expect(get(app.account)).toBeNull();
    expect(get(app.prompt)).toBeNull();
  });

  it('shows an account that is not invited, without linking the device', async () => {
    server.allowed = false;
    await device.buckets.add(bucket('mine'));
    const app = makeApp();
    await app.init();
    expect(get(app.status)).toMatchObject({ state: 'notAllowed' });
    expect(await getState(device, LINKED_ACCOUNT)).toBeUndefined();
    expect(get(app.account)).toEqual({ id: 'u1', email: 'me@example.com' }); // still signed in, so they can sign out
  });

  it('retries a first sign-in that failed because the network was down', async () => {
    server.offline = true;
    await device.buckets.add(bucket('b1'));
    const app = makeApp();
    await app.init();
    expect(get(app.status)).toMatchObject({ state: 'offline' });
    expect([...timers.tasks.values()].map((t) => t.ms)).toEqual([30_000]);
    server.offline = false;
    timers.fireAll();
    await eventually(() => get(app.status)?.state === 'idle');
    await app.syncService?.whenIdle();
    expect(await getState(device, LINKED_ACCOUNT)).toBe('u1');
    expect(server.live('buckets')).toHaveLength(1);
    expect(get(app.status)).toMatchObject({ state: 'idle' });
  });

  it('waits and tries again while the database is out of date', async () => {
    server.schemaVersion = 0;
    const app = makeApp();
    await app.init();
    expect(get(app.status)).toMatchObject({ state: 'schema' });
    expect([...timers.tasks.values()].map((t) => t.ms)).toEqual([300_000]);
    expect(await getState(device, LINKED_ACCOUNT)).toBeUndefined();
    server.schemaVersion = 1;
    timers.fireAll();
    await eventually(() => get(app.status)?.state === 'idle');
    await app.syncService?.whenIdle();
    expect(await getState(device, LINKED_ACCOUNT)).toBe('u1');
  });

  it('runs the first sign-in once when the same sign-in is announced twice', async () => {
    const app = makeApp();
    await started(app);
    const before = makeServiceCalls;
    client.emit('SIGNED_IN', SESSION);
    client.emit('SIGNED_IN', SESSION);
    await new Promise((r) => setTimeout(r, 20));
    expect(makeServiceCalls).toBe(before);
  });
});

describe('the session', () => {
  it('shows "sign in again" when the session ends by itself, and resumes when it returns', async () => {
    const app = makeApp();
    await started(app);
    client.emit('SIGNED_OUT', null);
    expect(get(app.status)).toMatchObject({ state: 'auth' });
    client.emit('TOKEN_REFRESHED', SESSION);
    await app.syncService?.whenIdle();
    expect(get(app.status)).toMatchObject({ state: 'idle' });
  });

  it('asks Google to sign in, returning to the settings page', async () => {
    const app = makeApp({ hint: false });
    await app.signIn();
    expect(client.auth.signInWithOAuth).toHaveBeenCalledWith({ provider: 'google', options: { redirectTo: 'https://example.com/bdgt/settings' } });
  });

  it('shows why sign-in could not start', async () => {
    client.auth.signInWithOAuth.mockResolvedValueOnce({ error: { message: 'provider is not enabled' } });
    const app = makeApp({ hint: false });
    await app.signIn();
    expect(get(app.error)).toBe('provider is not enabled');
  });
});

describe('signing out', () => {
  it('uploads what is waiting and reports what could not go', async () => {
    const app = makeApp();
    await started(app);
    expect(await app.requestSignOut()).toEqual({ pending: 0 });
    server.offline = true;
    await device.buckets.add(bucket('late'));
    expect(await app.requestSignOut()).toEqual({ pending: 1 });
  });

  it('clears this device, ends the session, stops syncing and reloads the page', async () => {
    await device.buckets.add(bucket('b1'));
    const app = makeApp();
    await started(app);
    await app.confirmSignOut({ downloadBackup: false });
    expect(client.auth.signOut).toHaveBeenCalled();
    expect(await device.buckets.count()).toBe(0);
    expect(await getState(device, LINKED_ACCOUNT)).toBeUndefined();
    expect(reloadPage).toHaveBeenCalled();
    expect(saveFile).not.toHaveBeenCalled();
    expect(server.live('buckets')).toHaveLength(1); // the account keeps it
  });

  it('saves a backup first when asked to', async () => {
    const app = makeApp();
    await started(app);
    await app.confirmSignOut({ downloadBackup: true });
    expect(saveFile).toHaveBeenCalledWith('{"backup":true}', 'budget-backup-2026-10-21.json');
  });

  it('does not treat its own sign-out as a lost session', async () => {
    const app = makeApp();
    await started(app);
    const pending = app.confirmSignOut({ downloadBackup: false });
    client.emit('SIGNED_OUT', null);
    await pending;
    expect(get(app.status)?.state).not.toBe('auth');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/lib/sync/app.test.ts`
Expected: FAIL, module `$lib/sync/app` not found.

- [ ] **Step 3: Implement**

`src/lib/sync/app.ts`:

```ts
import { get, writable, type Readable } from 'svelte/store';
import type { BudgetDatabase } from '$lib/db';
import { setCaptureEnabled } from './capture';
import { runFirstSignIn, signOutLocal, pendingChanges, type FirstSignInResult } from './firstSignIn';
import { LINKED_ACCOUNT, getState } from './state';
import { SyncService, type SyncStatus } from './service';
import type { SyncContext } from './types';
import type { SyncTransport } from './transport';

// Who is signed in and what the person is being asked. The sync service keeps
// a linked device synced; this decides when there is one, runs the first
// sign-in, and handles the two dialogs (a choice at first sign-in, a warning
// before signing out). Everything it touches comes in through `deps`, so the
// flows can be tested without a browser or a network.

export interface SyncUser {
  id: string;
  email: string;
}

export type SyncPrompt = { kind: 'conflict' | 'otherAccount' };

// What the app needs from the supabase-js client.
export interface AuthClient {
  auth: {
    getSession(): Promise<{ data: { session: { user: { id: string; email?: string } } | null } }>;
    signInWithOAuth(args: { provider: 'google'; options: { redirectTo: string } }): Promise<{ error: { message: string } | null }>;
    signOut(): Promise<unknown>;
    onAuthStateChange(
      callback: (event: string, session: { user: { id: string; email?: string } } | null) => void
    ): { data: { subscription: { unsubscribe(): void } } };
  };
}

export interface SyncAppDeps<C extends AuthClient> {
  db: BudgetDatabase;
  // False when the build has no Supabase project: the whole feature is off.
  enabled: boolean;
  // Something suggests a session may exist (a stored one, or the sign-in redirect).
  hasSessionHint(): boolean;
  // Loads the library and makes the client (only called when needed).
  getClient(): Promise<C>;
  makeTransport(client: C): SyncTransport;
  makeService(ctx: SyncContext): SyncService;
  // Reload every store from the database (a sync changed it).
  reload(): Promise<void>;
  exportBackup(): Promise<string>;
  saveFile(text: string, filename: string): void;
  redirectTo(): string; // where Google returns to; read when sign-in starts
  reloadPage(): void;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  today(): string; // YYYY-MM-DD, for backup file names
  retryMs?: number; // between attempts to finish a first sign-in that failed offline
  schemaRetryMs?: number; // between attempts while the database is out of date
}

export class SyncApp<C extends AuthClient> {
  readonly account = writable<SyncUser | null>(null);
  readonly prompt = writable<SyncPrompt | null>(null);
  readonly error = writable('');
  readonly busy = writable(false);
  // This device is linked to an account (changes are being queued and synced).
  readonly linked = writable(false);
  private serviceStatus = writable<SyncStatus | null>(null);

  private client: C | null = null;
  private service: SyncService | null = null;
  private unsubscribeStatus: (() => void) | null = null;
  private user: SyncUser | null = null;
  private starting = false;
  private signingOut = false;
  private retryTimer: unknown = null;

  constructor(private deps: SyncAppDeps<C>) {}

  // The service's status, or null while there is no service.
  get status(): Readable<SyncStatus | null> {
    return { subscribe: this.serviceStatus.subscribe };
  }

  get syncService(): SyncService | null {
    return this.service;
  }

  // At start-up. Loads the library only when a sign-in is under way or this
  // device is linked; otherwise the app is exactly as it was before sync.
  async init(): Promise<void> {
    if (!this.deps.enabled) return;
    const linked = await getState<string>(this.deps.db, LINKED_ACCOUNT);
    if (linked === undefined && !this.deps.hasSessionHint()) return;
    await this.connect(linked !== undefined);
  }

  private async connect(linked: boolean): Promise<void> {
    const client = await this.deps.getClient();
    this.client = client;
    client.auth.onAuthStateChange((event, session) => void this.onAuthEvent(event, session));
    const { data } = await client.auth.getSession();
    if (data.session) {
      await this.handleSignedIn(toUser(data.session.user));
    } else if (linked) {
      // Linked, but the session is gone: capture continues, upload waits.
      this.linked.set(true);
      setCaptureEnabled(true);
      this.adopt(this.makeContext(client)).report({ status: 'auth', message: 'Your session ended' });
    }
  }

  private makeContext(client: C): SyncContext {
    return { db: this.deps.db, transport: this.deps.makeTransport(client) };
  }

  private adopt(ctx: SyncContext): SyncService {
    this.service?.stop();
    this.unsubscribeStatus?.();
    const service = this.deps.makeService(ctx);
    this.service = service;
    this.unsubscribeStatus = service.status.subscribe((s) => this.serviceStatus.set(s));
    return service;
  }

  private async onAuthEvent(event: string, session: { user: { id: string; email?: string } } | null): Promise<void> {
    if (event === 'SIGNED_IN' && session) {
      await this.handleSignedIn(toUser(session.user));
    } else if (event === 'SIGNED_OUT' && !this.signingOut) {
      // The session ended without the person asking (it could not be refreshed).
      this.service?.report({ status: 'auth', message: 'Your session ended' });
    } else if (event === 'TOKEN_REFRESHED') {
      this.service?.resume();
    }
  }

  // A session exists. Link the device to the account (first time), or just sync.
  private async handleSignedIn(user: SyncUser, choice?: 'useAccount' | 'cancel'): Promise<void> {
    if (!this.client) return;
    if (this.starting || (this.user?.id === user.id && this.service && !choice)) return; // already underway
    this.starting = true;
    this.user = user;
    this.account.set(user);
    this.error.set('');
    try {
      const ctx = this.makeContext(this.client);
      const result = await runFirstSignIn(ctx, user.id, choice);
      await this.finish(result, ctx, user);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Could not finish signing in');
    } finally {
      this.starting = false;
    }
  }

  private async finish(result: FirstSignInResult, ctx: SyncContext, user: SyncUser): Promise<void> {
    switch (result.status) {
      case 'done': {
        this.prompt.set(null);
        this.linked.set(true);
        const service = this.adopt(ctx);
        // Data may have been replaced or pulled: show it, then keep syncing.
        if (result.plan === 'download' || (result.sync.status === 'ok' && result.sync.changed)) await this.deps.reload();
        service.start();
        return;
      }
      case 'needsChoice':
        this.user = null; // nothing is linked yet; asking again will run it
        this.prompt.set({ kind: result.reason });
        return;
      case 'cancelled':
        this.prompt.set(null);
        await this.dropSession();
        return;
      default: {
        // offline, auth, notAllowed, schema: show it, and try again if it was only the network
        this.adopt(ctx).report(result);
        if (result.status === 'offline' || result.status === 'schema') {
          // Not a verdict on this account: look again later.
          this.user = null;
          this.scheduleRetry(user, result.status === 'offline' ? this.deps.retryMs ?? 30_000 : this.deps.schemaRetryMs ?? 300_000);
        }
      }
    }
  }

  private scheduleRetry(user: SyncUser, ms: number): void {
    if (this.retryTimer !== null) this.deps.clearTimer(this.retryTimer);
    this.retryTimer = this.deps.setTimer(() => {
      this.retryTimer = null;
      void this.handleSignedIn(user);
    }, ms);
  }

  // Forgets the session without touching this device's data.
  private async dropSession(): Promise<void> {
    this.signingOut = true;
    try {
      await this.client?.auth.signOut();
    } finally {
      this.signingOut = false;
    }
    this.user = null;
    this.account.set(null);
    this.linked.set(false);
    this.service?.stop();
    this.service = null;
    this.serviceStatus.set(null);
  }

  async signIn(): Promise<void> {
    if (!this.deps.enabled) return;
    this.error.set('');
    this.busy.set(true);
    try {
      const client = this.client ?? (await this.deps.getClient());
      this.client = client;
      const { error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: this.deps.redirectTo() } });
      if (error) this.error.set(error.message);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Could not start signing in');
    } finally {
      this.busy.set(false);
    }
  }

  // Development only: lets the screens be looked at in every state without a
  // real account (see the DEV hook in browser.ts).
  preview(state: { account?: SyncUser | null; status?: SyncStatus | null; linked?: boolean; prompt?: SyncPrompt | null }): void {
    if (state.account !== undefined) this.account.set(state.account);
    if (state.status !== undefined) this.serviceStatus.set(state.status);
    if (state.linked !== undefined) this.linked.set(state.linked);
    if (state.prompt !== undefined) this.prompt.set(state.prompt);
  }

  // The person answered the first-sign-in dialog.
  async resolvePrompt(choice: 'useAccount' | 'cancel'): Promise<void> {
    const user = get(this.account);
    if (!get(this.prompt) || !user) return;
    if (choice === 'useAccount') {
      // The device's own data is about to be replaced: keep a copy first.
      this.deps.saveFile(await this.deps.exportBackup(), `budget-backup-before-sync-${this.deps.today()}.json`);
    }
    this.prompt.set(null);
    await this.handleSignedIn(user, choice);
  }

  // Before signing out: upload what is waiting and say how much is left.
  async requestSignOut(): Promise<{ pending: number }> {
    await this.service?.syncNow();
    await this.service?.whenIdle();
    return { pending: await pendingChanges(this.deps.db) };
  }

  // Signing out clears this device; the data stays in the account.
  async confirmSignOut(options: { downloadBackup: boolean }): Promise<void> {
    this.busy.set(true);
    try {
      if (options.downloadBackup) {
        this.deps.saveFile(await this.deps.exportBackup(), `budget-backup-${this.deps.today()}.json`);
      }
      this.service?.stop();
      this.signingOut = true;
      await this.client?.auth.signOut();
      await signOutLocal(this.deps.db);
      this.deps.reloadPage();
    } finally {
      this.busy.set(false);
    }
  }
}

function toUser(u: { id: string; email?: string }): SyncUser {
  return { id: u.id, email: u.email ?? '' };
}
```

- [ ] **Step 4: Run the tests (three times, to catch timing), the whole suite and the type check**

Run: `for i in 1 2 3; do npx vitest run tests/lib/sync/app.test.ts; done && npx vitest run && npm run check`
Expected: 20 new tests PASS each time, the suite PASS, 0 type errors.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must print feat/cloud-sync-app
git add src/lib/sync/app.ts tests/lib/sync/app.test.ts
git commit --no-gpg-sign -m "feat(sync): sign-in, first sign-in choice, sign-out and session handling"
```

---

### Task 8: Real wiring and the screens

**Files:**
- Create: `src/lib/sync/browser.ts`, `src/lib/components/sync/SyncChip.svelte`, `src/lib/components/sync/SyncSection.svelte`, `src/lib/components/sync/SyncChoiceModal.svelte`
- Modify: `src/lib/components/layout/Nav.svelte`, `src/lib/components/layout/Layout.svelte`, `src/routes/+layout.svelte`, `src/routes/settings/+page.svelte`

**Interfaces:**
- Consumes: everything from Tasks 1–7, `SupabaseTransport`, `reloadAllStores`, `exportToJson`, `downloadFile`.
- Produces: the Sync section on Settings, the status chip in the side bar, the attention dot on the mobile Setup tab, the first-sign-in dialog, sync started in the background at app start, and import/reset confirmations that say so when signed in.

Svelte components have no unit tests in this repo; verification is `svelte-check`, the full suite, and the browser pass in Task 10.

- [ ] **Step 1: The browser wiring**

`src/lib/sync/browser.ts`:

```ts
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
```

- [ ] **Step 2: The status chip**

`src/lib/components/sync/SyncChip.svelte`:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import { syncEnabled, getSyncApp } from '$lib/sync/browser';
  import { describeSync } from '$lib/sync/statusText';

  const status = syncEnabled ? getSyncApp().status : null;

  // Relative times ("2 min ago") age even when nothing else changes.
  let now = Date.now();
  onMount(() => {
    const timer = setInterval(() => (now = Date.now()), 30_000);
    return () => clearInterval(timer);
  });

  $: shown = status && $status ? describeSync($status, now) : null;

  const dot: Record<string, string> = {
    ok: 'bg-success',
    quiet: 'bg-gray-400',
    warn: 'bg-warning',
    bad: 'bg-danger',
  };
</script>

{#if shown && shown.label}
  <a
    href="{base}/settings"
    class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition-colors
           hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800/50 dark:hover:text-gray-200"
    aria-label="Sync status: {shown.label}. Open settings"
  >
    <span class="h-2 w-2 flex-none rounded-full {dot[shown.tone]}" aria-hidden="true"></span>
    <span class="min-w-0 truncate">{shown.label}</span>
  </a>
{/if}
```

- [ ] **Step 3: The first-sign-in dialog**

`src/lib/components/sync/SyncChoiceModal.svelte`:

```svelte
<script lang="ts">
  import Modal from '$lib/components/shared/Modal.svelte';
  import { getSyncApp } from '$lib/sync/browser';
  import { openModal, closeModal } from '$lib/stores/uiStore';

  const app = getSyncApp();
  const { prompt, busy } = app;

  // Ask as soon as sign-in needs an answer. Closing the dialog leaves the
  // question open: the Sync section offers to ask again.
  $: if ($prompt) openModal('sync-choice');

  async function answer(choice: 'useAccount' | 'cancel') {
    closeModal();
    await app.resolvePrompt(choice);
  }
</script>

<Modal id="sync-choice" title="Use your account's data?">
  <div class="space-y-4 pt-4">
    {#if $prompt?.kind === 'otherAccount'}
      <p class="text-sm text-gray-700 dark:text-gray-200">
        This device still holds data from a different account. To sync with this one, that data will be replaced with this account's data.
      </p>
    {:else}
      <p class="text-sm text-gray-700 dark:text-gray-200">
        This device and your account both have budget data. To sync, this device's data will be replaced with your account's.
      </p>
    {/if}
    <p class="text-sm text-gray-700 dark:text-gray-200">A backup file of this device's data is downloaded first, so nothing is lost.</p>
    <div class="flex flex-col gap-2">
      <button type="button" class="btn-primary" disabled={$busy} on:click={() => answer('useAccount')}>Download backup and use account data</button>
      <button type="button" class="btn-secondary" disabled={$busy} on:click={() => answer('cancel')}>Cancel: keep this device's data and don't sync</button>
    </div>
  </div>
</Modal>
```

- [ ] **Step 4: The Sync section (with the sign-out dialog)**

`src/lib/components/sync/SyncSection.svelte`:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { db } from '$lib/db';
  import Modal from '$lib/components/shared/Modal.svelte';
  import { getSyncApp } from '$lib/sync/browser';
  import { describeSync } from '$lib/sync/statusText';
  import { listParked, retryParked, discardParked } from '$lib/sync/parked';
  import { openModal, closeModal } from '$lib/stores/uiStore';
  import type { SyncOutboxEntry } from '$lib/sync/types';

  const app = getSyncApp();
  const { account, status, prompt, error, busy } = app;

  let now = Date.now();
  onMount(() => {
    const timer = setInterval(() => (now = Date.now()), 30_000);
    return () => clearInterval(timer);
  });

  $: shown = $status ? describeSync($status, now) : null;
  $: tone = shown?.tone ?? 'quiet';

  // The changes the server refused, with why, whenever their number changes.
  let parkedEntries: SyncOutboxEntry[] = [];
  $: if ($status && $status.parked !== parkedEntries.length) void refreshParked();
  async function refreshParked() {
    parkedEntries = await listParked(db);
  }

  async function syncNow() {
    await app.syncService?.syncNow();
  }

  async function retry() {
    await retryParked(db);
    await refreshParked();
    await syncNow();
  }

  async function discard() {
    if (!confirm('Stop trying to sync these changes? They stay on this device but are not uploaded until you edit them again.')) return;
    await discardParked(db);
    await refreshParked();
    await app.syncService?.refreshCounts();
  }

  // Signing out: first upload what is waiting, then say what is left.
  let signOutStep: 'checking' | 'ready' = 'checking';
  let pending = 0;

  async function startSignOut() {
    signOutStep = 'checking';
    openModal('sync-signout');
    pending = (await app.requestSignOut()).pending;
    signOutStep = 'ready';
  }

  async function confirmSignOut(downloadBackup: boolean) {
    await app.confirmSignOut({ downloadBackup });
    closeModal();
  }

  const toneText: Record<string, string> = {
    ok: 'text-success dark:text-success-light',
    quiet: 'text-gray-600 dark:text-gray-300',
    warn: 'text-warning',
    bad: 'text-danger dark:text-danger-light',
  };
</script>

<div class="card">
  <div class="border-b border-gray-100 px-5 py-4 dark:border-border-dark">
    <h2 class="section-title">Sync</h2>
  </div>

  {#if !$account}
    <div class="space-y-3 px-5 py-4">
      <p class="text-sm text-gray-600 dark:text-gray-300">
        Sign in to back up your budget and use it on more than one device. Without signing in, everything stays on this device exactly as before.
      </p>
      <button type="button" class="btn-primary" disabled={$busy} on:click={() => app.signIn()}>
        {$busy ? 'Opening Google…' : 'Sign in with Google'}
      </button>
      {#if $error}<p class="text-sm text-danger dark:text-danger-light" role="alert">{$error}</p>{/if}
      <p class="text-sm text-muted">Syncing is by invitation. Your data is kept in a database controlled by whoever runs this app.</p>
    </div>
  {:else}
    <div class="space-y-4 px-5 py-4">
      <div>
        <p class="text-sm text-muted">Signed in as</p>
        <p class="font-medium text-gray-900 dark:text-gray-100">{$account.email}</p>
      </div>

      {#if $prompt}
        <div class="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
          <p class="text-gray-800 dark:text-gray-100">Syncing isn't set up yet: you need to choose what happens to the data on this device.</p>
          <button type="button" class="btn-primary mt-2" on:click={() => openModal('sync-choice')}>Choose</button>
        </div>
      {/if}

      {#if shown && shown.label}
        <p class="text-sm font-medium {toneText[tone]}" aria-live="polite">{shown.label}</p>
        {#if $status?.message && ($status.state === 'offline' || $status.state === 'auth' || $status.state === 'schema')}
          <p class="text-sm text-muted">{$status.message}</p>
        {/if}
      {/if}

      {#if $status?.state === 'auth'}
        <button type="button" class="btn-primary" disabled={$busy} on:click={() => app.signIn()}>Sign in with Google</button>
      {/if}

      {#if $error}<p class="text-sm text-danger dark:text-danger-light" role="alert">{$error}</p>{/if}

      {#if parkedEntries.length > 0}
        <div class="rounded-lg border border-danger/30 p-3 text-sm">
          <p class="font-medium text-danger dark:text-danger-light">
            {parkedEntries.length} {parkedEntries.length === 1 ? 'change' : 'changes'} the server refused
          </p>
          <ul class="mt-2 space-y-1 text-muted">
            {#each parkedEntries.slice(0, 5) as entry (entry.key)}
              <li class="break-words"><span class="font-mono text-xs">{entry.table}</span>: {entry.error ?? 'refused'}</li>
            {/each}
          </ul>
          {#if parkedEntries.length > 5}<p class="mt-1 text-muted">and {parkedEntries.length - 5} more</p>{/if}
          <div class="mt-3 flex flex-wrap gap-2">
            <button type="button" class="btn-secondary" on:click={retry}>Try again</button>
            <button type="button" class="btn-danger" on:click={discard}>Stop trying</button>
          </div>
        </div>
      {/if}

      <div class="flex flex-wrap gap-3">
        <button type="button" class="btn-secondary" disabled={!$status || $status.state === 'syncing'} on:click={syncNow}>Sync now</button>
        <button type="button" class="btn-secondary" disabled={$busy} on:click={startSignOut}>Sign out</button>
      </div>

      <p class="text-sm text-muted">
        Your data is stored in a database controlled by whoever runs this app. Signing out clears this device; your data stays in your account.
      </p>
    </div>
  {/if}
</div>

<Modal id="sync-signout" title="Sign out">
  <div class="space-y-4 pt-4">
    {#if signOutStep === 'checking'}
      <p class="text-sm text-gray-600 dark:text-gray-300">Uploading anything that is still waiting…</p>
    {:else if pending > 0}
      <p class="text-sm text-gray-700 dark:text-gray-200">
        {pending} {pending === 1 ? 'change has' : 'changes have'} not synced and will be lost on this device if you sign out now.
      </p>
      <div class="flex flex-col gap-2">
        <button type="button" class="btn-primary" disabled={$busy} on:click={() => confirmSignOut(true)}>Download backup and sign out</button>
        <button type="button" class="btn-secondary" on:click={closeModal}>Stay signed in</button>
      </div>
    {:else}
      <p class="text-sm text-gray-700 dark:text-gray-200">
        Signing out clears the budget data on this device. It stays in your account and comes back when you sign in again.
      </p>
      <div class="flex flex-col gap-2">
        <button type="button" class="btn-primary" disabled={$busy} on:click={() => confirmSignOut(false)}>Sign out</button>
        <button type="button" class="btn-secondary" on:click={closeModal}>Cancel</button>
      </div>
    {/if}
  </div>
</Modal>
```

- [ ] **Step 5: Mount everything**

Apply this change to `src/lib/components/layout/Nav.svelte` (save the block as a patch file and run `git apply <patch>`, or make the same edits by hand):

```diff
diff --git a/src/lib/components/layout/Nav.svelte b/src/lib/components/layout/Nav.svelte
index dad94f1..99fcde5 100644
--- a/src/lib/components/layout/Nav.svelte
+++ b/src/lib/components/layout/Nav.svelte
@@ -2,6 +2,11 @@
   import { page } from '$app/stores';
   import { base } from '$app/paths';
   import CurrencyChip from '$lib/components/shared/CurrencyChip.svelte';
+  import SyncChip from '$lib/components/sync/SyncChip.svelte';
+  import { syncAttention } from '$lib/sync/browser';
+
+  // A dot on the Setup tab when sync needs the person (mobile has no chip).
+  const attention = syncAttention();
 
   const iconPaths: Record<string, string> = {
     home: '<path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
@@ -67,6 +72,7 @@
 
   <div class="border-t border-border px-3 py-3 dark:border-border-dark">
     <CurrencyChip />
+    <SyncChip />
   </div>
 </nav>
 
@@ -81,9 +87,14 @@
           class="flex min-h-[44px] flex-col items-center justify-center gap-1 py-2 transition-colors
                  {active ? 'text-primary' : 'text-muted dark:text-muted-dark'}"
         >
-          <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
-            {@html iconPaths[item.icon]}
-          </svg>
+          <span class="relative">
+            <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
+              {@html iconPaths[item.icon]}
+            </svg>
+            {#if item.icon === 'cog' && $attention}
+              <span class="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-danger" role="img" aria-label="Sync needs attention"></span>
+            {/if}
+          </span>
           <span class="text-[11px] font-medium">{item.label}</span>
         </a>
       </li>
```

Apply this change to `src/lib/components/layout/Layout.svelte` (save the block as a patch file and run `git apply <patch>`, or make the same edits by hand):

```diff
diff --git a/src/lib/components/layout/Layout.svelte b/src/lib/components/layout/Layout.svelte
index 05b81e0..ee15697 100644
--- a/src/lib/components/layout/Layout.svelte
+++ b/src/lib/components/layout/Layout.svelte
@@ -3,6 +3,8 @@
   import Modal from '$lib/components/shared/Modal.svelte';
   import LogEntry from '$lib/components/shared/LogEntry.svelte';
   import CurrencyModal from '$lib/components/shared/CurrencyModal.svelte';
+  import SyncChoiceModal from '$lib/components/sync/SyncChoiceModal.svelte';
+  import { syncEnabled } from '$lib/sync/browser';
   import { currencyConfirmed, takeCurrencyPrompt } from '$lib/stores/currencyStore';
   import { openLog, openModal, closeModal, activeModal, logPreselectedBucketId } from '$lib/stores/uiStore';
 
@@ -64,3 +66,6 @@
 </Modal>
 
 <CurrencyModal />
+{#if syncEnabled}
+  <SyncChoiceModal />
+{/if}
```

Apply this change to `src/routes/+layout.svelte` (save the block as a patch file and run `git apply <patch>`, or make the same edits by hand):

```diff
diff --git a/src/routes/+layout.svelte b/src/routes/+layout.svelte
index b24bb27..25122b7 100644
--- a/src/routes/+layout.svelte
+++ b/src/routes/+layout.svelte
@@ -8,6 +8,7 @@
 	import { loadGoals } from '$lib/stores/goalsStore';
 	import { startClock } from '$lib/stores/uiStore';
 	import { loadCurrency, baseCurrency } from '$lib/stores/currencyStore';
+	import { initSync } from '$lib/sync/browser';
 	import '$lib/stores/themeStore';
 
 	let { children } = $props();
@@ -24,6 +25,8 @@
 		await loadRecurring();
 		await loadGoals();
 		await processRecurring();
+		// Sync is an extra: the app is already usable, so it starts in the background.
+		void initSync();
 	}
 </script>
 
```

Apply this change to `src/routes/settings/+page.svelte` (save the block as a patch file and run `git apply <patch>`, or make the same edits by hand):

```diff
diff --git a/src/routes/settings/+page.svelte b/src/routes/settings/+page.svelte
index 2d9d28c..2b7eebc 100644
--- a/src/routes/settings/+page.svelte
+++ b/src/routes/settings/+page.svelte
@@ -8,6 +8,11 @@
   import { loadCurrency } from '$lib/stores/currencyStore';
   import CurrencyChip from '$lib/components/shared/CurrencyChip.svelte';
   import SectionTabs from '$lib/components/shared/SectionTabs.svelte';
+  import SyncSection from '$lib/components/sync/SyncSection.svelte';
+  import { syncEnabled, getSyncApp } from '$lib/sync/browser';
+
+  // Signed in, import and reset reach the account on every device.
+  const linked = getSyncApp().linked;
 
   let fileInput: HTMLInputElement;
   let isExporting = false;
@@ -39,7 +44,7 @@
     const file = fileInput?.files?.[0];
     if (!file) return;
 
-    if (!confirm('This will replace all existing data. Continue?')) return;
+    if (!confirm($linked ? 'This replaces all data on this device and in your account, on every device that syncs. Continue?' : 'This will replace all existing data. Continue?')) return;
 
     isImporting = true;
     try {
@@ -61,7 +66,7 @@
   }
 
   async function handleReset() {
-    if (!confirm('Delete ALL data? This cannot be undone!')) return;
+    if (!confirm($linked ? 'Delete ALL data, including your synced data in your account on every device? This cannot be undone!' : 'Delete ALL data? This cannot be undone!')) return;
     if (!confirm('Are you really sure?')) return;
 
     await resetAllData();
@@ -113,6 +118,10 @@
     </div>
   </div>
 
+  {#if syncEnabled}
+    <SyncSection />
+  {/if}
+
   <div class="card">
     <div class="border-b border-gray-100 px-5 py-4 dark:border-border-dark">
       <h2 class="section-title">Export Data</h2>
```

- [ ] **Step 6: Type check and tests**

Run: `npm run check && npx vitest run`
Expected: 0 errors, all tests PASS.

- [ ] **Step 7: Commit**

```bash
git branch --show-current   # must print feat/cloud-sync-app
git add src/lib/sync/browser.ts src/lib/components/sync src/lib/components/layout/Nav.svelte src/lib/components/layout/Layout.svelte src/routes/+layout.svelte src/routes/settings/+page.svelte
git commit --no-gpg-sign -m "feat(sync): sign-in, status and sign-out screens, started in the background"
```

---

### Task 9: Deploy configuration and the setup guide, part 2

**Files:**
- Create: `.env.example`, `tests/docs/syncSetupPart2.test.ts`
- Modify: `.github/workflows/deploy.yml`, `docs/sync-setup.md`, `docs/deferred.md`

- [ ] **Step 1: Write the failing test**

`tests/docs/syncSetupPart2.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

const guide = Object.values(import.meta.glob('/docs/sync-setup.md', { query: '?raw', import: 'default', eager: true }))[0] as string;
const workflow = Object.values(import.meta.glob('/.github/workflows/deploy.yml', { query: '?raw', import: 'default', eager: true }))[0] as string;

// (.env.example is not checked here: Vite refuses to serve .env files, even to tests.)
describe('deployment configuration', () => {
  it('passes both variables to the deployed build, from repository variables not secrets', () => {
    expect(workflow).toMatch(/VITE_SUPABASE_URL: \$\{\{ vars\.VITE_SUPABASE_URL \}\}/);
    expect(workflow).toMatch(/VITE_SUPABASE_PUBLISHABLE_KEY: \$\{\{ vars\.VITE_SUPABASE_PUBLISHABLE_KEY \}\}/);
    expect(workflow).not.toMatch(/secrets\./);
  });
});

describe('docs/sync-setup.md part 2', () => {
  it('names the variables, the callback address and the workflow to run', () => {
    expect(guide).toContain('VITE_SUPABASE_URL');
    expect(guide).toContain('VITE_SUPABASE_PUBLISHABLE_KEY');
    expect(guide).toContain('/auth/v1/callback');
    expect(guide).toMatch(/Run workflow/);
  });

  it('gives the exact addresses Supabase and Google must allow', () => {
    expect(guide).toContain('https://pranjalagg.github.io/bdgt/**');
    expect(guide).toContain('http://localhost:5173/**');
    expect(guide).toContain('https://pranjalagg.github.io');
  });

  it('keeps the Google client secret out of the app and the repository', () => {
    expect(guide).toMatch(/secret goes only here/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/docs/syncSetupPart2.test.ts`
Expected: FAIL (the workflow does not pass the variables; the guide has no part 2).

- [ ] **Step 3: Configuration**

`.env.example`:

```
# Optional: connect cloud sync to a Supabase project (see docs/sync-setup.md).
# Leave both empty and the app works exactly as before, with no sync.
# Copy this file to .env for local development; .env is git-ignored.
# Only ever the project's public (publishable) key: never a secret or service_role key.
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

Apply this change to `.github/workflows/deploy.yml` (save the block as a patch file and run `git apply <patch>`, or make the same edits by hand):

```diff
diff --git a/.github/workflows/deploy.yml b/.github/workflows/deploy.yml
index ee1fe5d..327834f 100644
--- a/.github/workflows/deploy.yml
+++ b/.github/workflows/deploy.yml
@@ -25,6 +25,12 @@ jobs:
           cache: npm
       - run: npm ci
       - run: npm run build
+        env:
+          # Optional: set both as repository variables to turn cloud sync on
+          # (Settings > Secrets and variables > Actions > Variables). Public by
+          # design; never put a secret or service_role key here.
+          VITE_SUPABASE_URL: ${{ vars.VITE_SUPABASE_URL }}
+          VITE_SUPABASE_PUBLISHABLE_KEY: ${{ vars.VITE_SUPABASE_PUBLISHABLE_KEY }}
       - run: cp build/index.html build/404.html
       - uses: actions/upload-pages-artifact@v3
         with:
```

- [ ] **Step 4: The guide, part 2**

Apply this change to `docs/sync-setup.md` (save the block as a patch file and run `git apply <patch>`, or make the same edits by hand):

```diff
diff --git a/docs/sync-setup.md b/docs/sync-setup.md
index 9d52c17..af0eef1 100644
--- a/docs/sync-setup.md
+++ b/docs/sync-setup.md
@@ -3,7 +3,7 @@
 Cloud sync is optional. The app works exactly as before until a Supabase project is connected and someone signs in. This guide has two parts:
 
 1. **The database** (this part): create the Supabase project, apply the migrations, invite yourself, check it.
-2. **Sign-in and the deployed site** (added with the sign-in release): the Google login key, redirect addresses and the GitHub variables.
+2. **Sign-in and the deployed site** (part 2, further down): the Google login key, redirect addresses, the GitHub variables and trying it out.
 
 You do part 1 once. It takes about 15 minutes. Nothing in it can change or delete data in the app itself.
 
@@ -87,3 +87,60 @@ They hide deleted rows and the sync bookkeeping columns, show amounts in currenc
 ## When the schema changes
 
 Every change to the synced tables is a new numbered file in `supabase/migrations/` that you apply in the SQL editor, in order. The app checks the database's migration level (`select public.sync_schema_version()`) and pauses sync with a clear message if the database is behind, instead of failing row by row.
+
+## Part 2: Google sign-in and the deployed site
+
+Do part 1 first. Replace `<project-ref>` below with the part of your project's address before `.supabase.co`.
+
+### 1. Create a Google login key
+
+1. In Google Cloud Console choose or create a project, then open **Google Auth Platform → Clients → Create client**.
+2. Application type **Web application**.
+3. **Authorized JavaScript origins**: add `https://pranjalagg.github.io` and `http://localhost:5173`. (Origins have no path and no trailing slash.)
+4. **Authorized redirect URIs**: add `https://<project-ref>.supabase.co/auth/v1/callback`.
+5. Create it and copy the **Client ID** and **Client secret**.
+6. On the consent screen keep the default scopes (`openid`, email, profile) and publish the app (**In production**). Basic scopes need no Google verification. If you leave it in *Testing*, only the Google accounts you add as test users can sign in.
+
+### 2. Turn on Google in Supabase
+
+Open **Authentication → Sign In / Providers → Google**, switch it on, and paste the Client ID and Client secret. The secret goes only here, never into the app, this repository or GitHub.
+
+### 3. Allow the app's addresses
+
+Open **Authentication → URL Configuration**:
+
+- **Site URL**: `https://pranjalagg.github.io/bdgt/`
+- **Redirect URLs**: add `https://pranjalagg.github.io/bdgt/**` and `http://localhost:5173/**`
+
+### 4. Tell the app about the project
+
+- **Local development**: copy `.env.example` to `.env` and fill in the project address and the publishable key. `.env` is git-ignored.
+- **The deployed site**: in the GitHub repository open **Settings → Secrets and variables → Actions → Variables** and add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` as *variables* (not secrets: they are public by design). Then open the **Actions** tab, choose **Deploy to GitHub Pages** and press **Run workflow**.
+
+Without those two values the app builds and runs exactly as before, with no Sync section.
+
+### 5. Try it
+
+1. Open **Setup → Settings** and find the **Sync** section. Press **Sign in with Google** and choose the account whose email you put on the invite list.
+2. You return to Settings. The first time, one of three things happens:
+   - this device has data and the account is empty: the data uploads;
+   - this device is new and the account has data: the account's data downloads;
+   - both have data: a dialog asks whether to replace this device's data with the account's. A backup file of this device's data downloads first. **Cancel** keeps the device's data and does not sync.
+3. The sync status shows under the Sync heading and in the side bar ("Synced · 2 min ago"). Edits upload a couple of seconds after you make them and download when you return to the tab.
+4. **Sign out** clears the budget data on this device (your data stays in your account) and offers a backup first if anything has not synced.
+
+### If something goes wrong
+
+| What you see | What to check |
+|---|---|
+| Sign-in says the provider is not enabled | Step 2: Google is switched on and the Client ID and secret are saved. |
+| Google says `redirect_uri_mismatch` | The redirect URI in step 1 must be exactly `https://<project-ref>.supabase.co/auth/v1/callback`. |
+| You return to the app but are not signed in | Step 3: the address you came from is covered by a Redirect URL (`/bdgt/**` for the site, `http://localhost:5173/**` for local). |
+| "Sync isn't enabled for this account" | The Google account's email (lower case) is on the invite list from part 1, step 3. |
+| "Database needs update" | A newer migration in `supabase/migrations/` has not been applied yet (part 1, step 2). |
+| "Sign in again" | The session ended; press Sign in with Google. Nothing is lost: waiting changes are kept. |
+| "N changes couldn't sync" | Press **Try again**, or **Stop trying** if the reason shown cannot be fixed. The changes stay on this device either way. |
+
+### Privacy
+
+Everything you sync is stored in the Supabase project, which the project owner (you) controls and can read in the dashboard. Invited people's data is likewise readable by the owner. Browser-side encryption is not part of this release.
```

- [ ] **Step 5: Update the deferred list**

In `docs/deferred.md`, under "Cloud sync", replace the whole entry headed "Planned next: plan 4, sign-in, sync service and screens" with:

```markdown
### Sign-in release leftovers
- **Other open tabs are not told when this tab signs in or out.** They keep their old state until they regain focus or reload (the cross-tab lock only stops two tabs syncing at once). Size S–M; could share a `BroadcastChannel`.
- **There is no live view of another device's changes.** A change from another device arrives on the next cycle: when you return to the tab, regain the network, or within five minutes. Realtime is in the phase 2 list below.
- **Real Google sign-in is only checked by hand** (Google blocks automated sign-in); everything around it is tested with a fake client. Re-check after any change to `src/lib/sync/app.ts` or the Supabase client options.
- **A browser may block the backup download** that sign-out and the first-sign-in choice start (pop-up or multiple-download settings). The dialogs say what is happening, but do not detect a blocked download.
- **Import and Reset while signed in do not wait for the sync;** they reach the account in the background a couple of seconds later. Closing the tab in that window leaves them queued for the next time the device syncs.
```

- [ ] **Step 6: Run the tests, the whole suite and the type check**

Run: `npx vitest run tests/docs && npx vitest run && npm run check`
Expected: 8 tests in `tests/docs` PASS, the suite PASS, 0 type errors.

- [ ] **Step 7: Commit**

```bash
git branch --show-current   # must print feat/cloud-sync-app
git add .env.example .github/workflows/deploy.yml docs/sync-setup.md docs/deferred.md tests/docs/syncSetupPart2.test.ts
git commit --no-gpg-sign -m "docs(sync): deploy configuration and part 2 of the setup guide"
```

---

### Task 10: Verify in the browser and the build

**Files:** none unless a bug is found (then: a test where the code is pure, a fix, and its own commit). Playwright output goes under the scratchpad and is deleted afterwards; the local `.env` is never committed (`git check-ignore .env`).

- [ ] **Step 1: Full checks**

Run: `npx vitest run && npm run check && npm run build`
Expected: all PASS, 0 errors, build succeeds.

- [ ] **Step 2: The build with and without a project**

With `.env` present (the project's address and publishable key), run `npm run build`, then `grep -rl "code_challenge" build` (the Supabase library is in its own chunk). Move `.env` aside, rebuild, and run `grep -rl "supabase.co" build || echo "no project baked in"`. Expected: the second prints `no project baked in`. Put `.env` back.

- [ ] **Step 3: Without a project there is no sync at all**

With `.env` moved aside, run `npm run dev -- --port 5173`, open `http://localhost:5173/settings` in a fresh browser profile (`timezoneId: 'America/New_York'`, `locale: 'en-US'`), and check: there is no Sync section, no `a[aria-label^="Sync status"]`, no request to `supabase.co`, no console errors, and the page works as before. Stop the server and put `.env` back.

- [ ] **Step 4: With a project but signed out**

With `.env` present, open the same page in a fresh profile: the Sync section shows the explanation and **Sign in with Google**; the chip is absent; no request to `supabase.co` is made before pressing the button; the console is clean. `indexedDB.databases()` shows `BudgetDB` at version `130` and `syncOutbox`, `syncVersions` and `syncState` stay empty after logging a transaction.

- [ ] **Step 5: Every state, through the development hook**

In `npm run dev`, use `window.__bdgtSync.preview({account: {id: 'u1', email: 'me@example.com'}, linked: true, status: {...}})` to show each state and confirm the chip text and the Sync section: idle (`Synced · 2 min ago`), syncing, `2 waiting`, offline with a waiting count, `Sign in again` (with a **Sign in with Google** button), `Sync isn't enabled for this account`, `Database needs update`, and parked changes (add a real parked entry to `syncOutbox` first: the section lists why, with **Try again** and **Stop trying**). Set `prompt: {kind: 'conflict'}` and confirm the dialog opens, Escape closes it, and a **Choose** banner remains. At a 390 px wide window confirm the Setup tab shows a dot in the attention states and the Sync section does not overflow sideways.

- [ ] **Step 6: The real client's sign-in request**

Press **Sign in with Google** with the request to `**/auth/v1/authorize**` intercepted and aborted: confirm it targets the project, `provider=google`, `redirect_to=http://localhost:5173/settings`, `code_challenge_method=s256` and a `code_challenge`. (Whether Google is enabled on the project is checked in Task 11.)

- [ ] **Step 7: Import and Reset wording**

With a linked state previewed (`linked: true`), confirm the Import and Reset confirmations mention the account and every device; unlinked, they read as before.

- [ ] **Step 8: Clean up and commit any fixes**

Stop the dev server; delete scratchpad copies and Playwright output; confirm `git status --short` shows only `.claude/settings.local.json`.

```bash
git branch --show-current   # must print feat/cloud-sync-app
git add -A src tests docs
git commit --no-gpg-sign -m "fix(sync): <what was found>"
```

Skip the commit if nothing needed fixing.

---

### Task 11: Acceptance on the real project (done with the project owner; not part of the pull request)

The executor does not do this task alone: Google blocks automated sign-in, and it needs the owner's Google account. After the pull request is open and the Google steps in `docs/sync-setup.md` part 2 are done:

- [ ] **Local sign-in.** `npm run dev`, open Settings, press **Sign in with Google**, choose the invited account. Expect to return to Settings, signed in, with the first-sign-in outcome that matches the data on both sides (upload for an empty account).
- [ ] **The data arrives.** In the Supabase SQL editor run `select count(*) from public.transactions where deleted_at is null;` and `select * from analytics.monthly_cashflow order by month desc limit 3;` and compare with the app.
- [ ] **Edits sync.** Add a transaction; within a few seconds the status reads `Synced · just now` and the row is in Supabase.
- [ ] **A second device or browser profile.** Open the app there, sign in, and expect the first sign-in to download everything. Edit on one, return to the other tab, and see the change.
- [ ] **Offline.** In the browser's offline mode make an edit: the chip reads `Offline · 1 waiting`; go back online and it uploads.
- [ ] **Sign out.** Press **Sign out**; with nothing waiting expect the plain confirmation, then a cleared device with fresh default buckets; sign in again and the data returns.
- [ ] **The deployed site.** Add the two repository variables, run the **Deploy to GitHub Pages** workflow, and repeat the sign-in on `https://pranjalagg.github.io/bdgt/`.
- [ ] **Not invited.** Sign in with a Google account that is not on the invite list: expect `Sync isn't enabled for this account` and no data uploaded.

Any failure is reproduced first as a test (here, or in `tests/sql/`), then fixed. Record the outcome in `docs/deferred.md`.
