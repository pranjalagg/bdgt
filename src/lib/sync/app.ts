import { get, writable, type Readable } from 'svelte/store';
import type { BudgetDatabase } from '$lib/db';
import { setCaptureEnabled } from './capture';
import { runFirstSignIn, signOutLocal, pendingChanges, type FirstSignInResult } from './firstSignIn';
import { LINKED_ACCOUNT, getState } from './state';
import { SyncService, type SyncStatus } from './service';
import { randomNonce, sha256Hex } from './nonce';
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
    signInWithIdToken(args: { provider: 'google'; token: string; nonce: string }): Promise<{ error: { message: string } | null }>;
    signOut(options?: { scope: 'local' | 'global' | 'others' }): Promise<{ error: unknown } | void>;
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
  // Inside the Android app, where Google refuses to sign in within a web
  // view: asks the phone's account picker for an ID token carrying the hashed
  // nonce. Null when the person closed the picker.
  googleIdToken?(hashedNonce: string): Promise<string | null>;
  reloadPage(): void;
  // Before a signed-out device's data is cleared: stop anything else that
  // writes it (payment capture on Android).
  beforeSignOutClear?(): Promise<void>;
  // Forget the stored session when signing out could not (the session is the only thing that signs the person back in).
  clearStoredSession(): void;
  // Tell other open tabs the device was linked or unlinked (they reload, so they capture or stop capturing).
  broadcast(kind: 'linked' | 'unlinked'): void;
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
  private listening = false;
  private service: SyncService | null = null;
  private unsubscribeStatus: (() => void) | null = null;
  private user: SyncUser | null = null;
  private starting = false;
  private startingRun: Promise<void> | null = null;
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
    if (linked !== undefined) this.linked.set(true); // true whatever happens next (offline, signed out, not allowed)
    if (linked === undefined && !this.deps.hasSessionHint()) return;
    await this.connect(linked !== undefined);
  }

  private async connect(linked: boolean): Promise<void> {
    const client = await this.deps.getClient();
    this.client = client;
    this.listen(client);
    const { data } = await client.auth.getSession();
    if (data.session) {
      await this.handleSignedIn(toUser(data.session.user));
    } else if (linked) {
      // Linked, but the session is gone: capture continues, upload waits.
      setCaptureEnabled(true);
      this.adopt(this.makeContext(client)).suspend({ status: 'auth', message: 'Your session ended' });
    }
  }

  private listen(client: C): void {
    if (this.listening) return;
    this.listening = true;
    client.auth.onAuthStateChange((event, session) => void this.onAuthEvent(event, session));
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
      // The same person signing in again after their session ended (no page
      // reload in the Android app): pick up where the device left off.
      if (this.service && this.user?.id === session.user.id) this.service.resume();
      else await this.handleSignedIn(toUser(session.user));
    } else if (event === 'SIGNED_OUT' && !this.signingOut) {
      // The session ended without the person asking (it could not be refreshed).
      this.service?.suspend({ status: 'auth', message: 'Your session ended' });
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
    const run = (async () => {
      try {
        const ctx = this.makeContext(this.client!);
        const wasLinked = (await getState<string>(this.deps.db, LINKED_ACCOUNT)) !== undefined;
        const result = await runFirstSignIn(ctx, user.id, choice);
        await this.finish(result, ctx, user);
        // Other tabs opened before this one linked the device do not capture
        // changes: tell them, once, when it first happens.
        if (result.status === 'done' && !wasLinked) this.deps.broadcast('linked');
      } catch (e) {
        this.error.set(e instanceof Error ? e.message : 'Could not finish signing in');
      } finally {
        this.starting = false;
      }
    })();
    this.startingRun = run;
    await run;
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
        // offline, auth, notAllowed, schema: show it, and try again if it was only the network.
        // A device that was already linked stays the service's responsibility; one
        // that is not linked yet must never sync until the person has chosen.
        const service = this.adopt(ctx);
        if ((await getState<string>(this.deps.db, LINKED_ACCOUNT)) !== undefined) service.suspend(result);
        else service.report(result);
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

  // Ends this device's session (not the person's other devices') without
  // touching its data. If the library cannot, the stored session is removed
  // directly: left behind, it would sign the person straight back in.
  private async endSession(): Promise<void> {
    this.signingOut = true;
    try {
      const result = await this.client?.auth.signOut({ scope: 'local' });
      if (result && result.error) this.deps.clearStoredSession();
    } catch {
      this.deps.clearStoredSession();
    } finally {
      this.signingOut = false;
    }
  }

  // Forgets the session without touching this device's data.
  private async dropSession(): Promise<void> {
    if (this.retryTimer !== null) this.deps.clearTimer(this.retryTimer);
    this.retryTimer = null;
    await this.endSession();
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
      if (this.deps.googleIdToken) {
        await this.signInOnPhone(client, this.deps.googleIdToken);
      } else {
        const { error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: this.deps.redirectTo() } });
        if (error) this.error.set(error.message);
      }
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Could not start signing in');
    } finally {
      this.busy.set(false);
    }
  }

  // No redirect inside the Android app: the phone hands over a Google ID token
  // and Supabase exchanges it for a session. The library then announces
  // SIGNED_IN, which links the device exactly as after a redirect.
  private async signInOnPhone(client: C, googleIdToken: (hashedNonce: string) => Promise<string | null>): Promise<void> {
    const nonce = randomNonce();
    const token = await googleIdToken(await sha256Hex(nonce));
    if (!token) return; // the person closed the account picker
    this.listen(client);
    const { error } = await client.auth.signInWithIdToken({ provider: 'google', token, nonce });
    if (error) this.error.set(error.message);
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
  // `linked` false means nothing of this device was ever synced, so signing
  // out only ends the session and the data stays.
  async requestSignOut(): Promise<{ pending: number; linked: boolean }> {
    const linked = (await getState<string>(this.deps.db, LINKED_ACCOUNT)) !== undefined;
    if (!linked) return { pending: 0, linked: false };
    await this.service?.syncNow();
    await this.service?.whenIdle();
    return { pending: await pendingChanges(this.deps.db), linked: true };
  }

  // A linked device is cleared (its data stays in the account); a device that
  // was never linked keeps everything and only ends the session.
  async confirmSignOut(options: { downloadBackup: boolean }): Promise<void> {
    this.busy.set(true);
    try {
      const linked = (await getState<string>(this.deps.db, LINKED_ACCOUNT)) !== undefined;
      if (!linked) {
        this.prompt.set(null);
        await this.dropSession();
        return;
      }
      if (options.downloadBackup) {
        this.deps.saveFile(await this.deps.exportBackup(), `budget-backup-${this.deps.today()}.json`);
      }
      // Let anything already running finish first: a pull that lands after the
      // clear would leave a half-filled device.
      this.service?.stop();
      await this.service?.whenIdle();
      await this.startingRun?.catch(() => {});
      await this.endSession();
      await this.deps.beforeSignOutClear?.().catch((e) => console.error('Could not stop payment capture', e));
      await signOutLocal(this.deps.db);
      this.deps.broadcast('unlinked');
      this.deps.reloadPage();
    } finally {
      this.busy.set(false);
    }
  }
}

function toUser(u: { id: string; email?: string }): SyncUser {
  return { id: u.id, email: u.email ?? '' };
}
