<script lang="ts">
  import { onMount } from 'svelte';
  import { db } from '$lib/db';
  import Modal from '$lib/components/shared/Modal.svelte';
  import { getSyncApp } from '$lib/sync/browser';
  import { isAndroidPlatform } from '$lib/android';
  import { describeSync } from '$lib/sync/statusText';
  import { listParked, retryParked, discardParked } from '$lib/sync/parked';
  import { openModal, closeModal } from '$lib/stores/uiStore';
  import type { SyncOutboxEntry } from '$lib/sync/types';

  const app = getSyncApp();
  const androidApp = isAndroidPlatform();
  const { account, status, prompt, error, busy, linked } = app;

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
  let wasLinked = true;

  async function startSignOut() {
    signOutStep = 'checking';
    openModal('sync-signout');
    const result = await app.requestSignOut();
    pending = result.pending;
    wasLinked = result.linked;
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

<section>
  <h2 class="settings-label">Sync</h2>
  <div class="card">

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
        <button type="button" class="btn-secondary" disabled={!$linked || !$status || $status.state === 'syncing'} on:click={syncNow}>Sync now</button>
        <button type="button" class="btn-secondary" disabled={$busy} on:click={startSignOut}>Sign out</button>
      </div>

      <p class="text-sm text-muted">
        Your data is stored in a database controlled by whoever runs this app. Signing out of a synced device clears it; your data stays in your account.{#if androidApp} Automatic capture keeps recording; new payments wait on this phone until you sign in again.{/if}
      </p>
    </div>
  {/if}
</div>
</section>

<Modal id="sync-signout" title="Sign out">
  <div class="space-y-4 pt-4">
    {#if signOutStep === 'checking'}
      <p class="text-sm text-gray-600 dark:text-gray-300">Uploading anything that is still waiting…</p>
    {:else if !wasLinked}
      <p class="text-sm text-gray-700 dark:text-gray-200">
        This device was never synced, so nothing is cleared: your budget data stays here and signing out only ends the session.
      </p>
      <div class="flex flex-col gap-2">
        <button type="button" class="btn-primary" disabled={$busy} on:click={() => confirmSignOut(false)}>Sign out</button>
        <button type="button" class="btn-secondary" on:click={closeModal}>Cancel</button>
      </div>
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
