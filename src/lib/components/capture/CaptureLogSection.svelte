<script lang="ts">
  import { onMount } from 'svelte';
  import { getCapture, type CapturePlugin, type CaptureStatus, type InstalledSource, type KeptItem } from '$lib/capture/native';
  import { buildLogFile, logFilename } from '$lib/capture/logExport';

  // Test build only: records payment notifications so their wording can be
  // studied. Nothing here touches the budget.

  let plugin: CapturePlugin | null = null;
  let status: CaptureStatus | null = null;
  let sources: InstalledSource[] = [];
  let items: KeptItem[] = [];
  let error = '';
  let sharing = false;

  $: labels = new Map(sources.map((s) => [s.packageName, s.label]));
  $: notRunning = !!status && status.enabled && status.accessGranted && !status.listenerConnected;

  async function refresh() {
    if (!plugin) return;
    try {
      const [s, found, log] = await Promise.all([plugin.getStatus(), plugin.installedSources(), plugin.list({ limit: 200 })]);
      status = s;
      sources = found.sources;
      items = log.items;
      error = '';
    } catch (e) {
      error = message(e);
    }
  }

  // Turning recording on without notification access goes straight to the
  // system switch; the section refreshes when the person comes back.
  async function toggleRecording() {
    if (!plugin || !status) return;
    try {
      const turningOn = !status.enabled;
      await plugin.setConfig({ enabled: turningOn });
      if (turningOn && !status.accessGranted) await plugin.openAccessSettings();
      await refresh();
    } catch (e) {
      error = message(e);
    }
  }

  async function run(action: () => Promise<void>) {
    try {
      await action();
      await refresh();
    } catch (e) {
      error = message(e);
    }
  }

  async function shareLog() {
    if (!plugin || !status) return;
    sharing = true;
    try {
      const { items: all } = await plugin.list({ limit: 10_000 });
      const file = buildLogFile(all, status.appVersion);
      await plugin.share({ filename: logFilename(), text: JSON.stringify(file, null, 2), mimeType: 'application/json' });
    } catch (e) {
      error = message(e);
    } finally {
      sharing = false;
    }
  }

  async function clearLog() {
    if (!plugin) return;
    if (!confirm('Delete every recorded notification from this phone?')) return;
    await run(() => plugin!.clear());
  }

  function message(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
  }

  function when(ms: number): string {
    return new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  }

  onMount(() => {
    let stopped = false;
    let listener: { remove: () => Promise<void> } | undefined;
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };

    void (async () => {
      const capture = await getCapture();
      if (!capture || stopped) return;
      plugin = capture.plugin;
      await refresh();
      const added = await plugin.addListener('itemKept', () => void refresh());
      if (stopped) void added.remove();
      else listener = added;
    })();
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', onVisible);
      void listener?.remove();
    };
  });
</script>

<div class="card">
  <div class="border-b border-gray-100 px-5 py-4 dark:border-border-dark">
    <h2 class="section-title">Payment capture (test)</h2>
  </div>

  <div class="space-y-4 px-5 py-4">
    <p class="text-sm text-gray-600 dark:text-gray-300">
      This test build records the notifications that Google Wallet, UPI apps and bank SMS show, so their wording can be studied. Nothing is added to your budget.
    </p>

    {#if status}
      <dl class="space-y-2 text-sm">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <dt class="text-muted">Notification access</dt>
          <dd class="flex items-center gap-3">
            <span class="font-medium {status.accessGranted ? 'text-success dark:text-success-light' : 'text-warning'}">{status.accessGranted ? 'On' : 'Off'}</span>
            {#if !status.accessGranted}
              <button type="button" class="btn-secondary" on:click={() => run(() => plugin!.openAccessSettings())}>Open settings</button>
            {/if}
          </dd>
        </div>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <dt class="text-muted">Recording</dt>
          <dd class="font-medium text-gray-900 dark:text-gray-100">{status.enabled ? 'On' : 'Off'}</dd>
        </div>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <dt class="text-muted">Apps found</dt>
          <dd class="text-right text-gray-900 dark:text-gray-100">{sources.length ? sources.map((s) => s.label).join(', ') : 'None'}</dd>
        </div>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <dt class="text-muted">Build</dt>
          <dd class="font-mono text-gray-900 dark:text-gray-100">{status.appVersion}</dd>
        </div>
      </dl>

      {#if notRunning}
        <div class="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
          <p class="font-medium text-gray-800 dark:text-gray-100">Recording is on but not running.</p>
          <p class="mt-1 text-gray-700 dark:text-gray-200">The phone may have stopped it to save battery. Reconnect it, and let the app run in the background in battery settings.</p>
          <div class="mt-3 flex flex-wrap gap-2">
            <button type="button" class="btn-secondary" on:click={() => run(() => plugin!.requestRebind())}>Reconnect</button>
            <button type="button" class="btn-secondary" on:click={() => run(() => plugin!.openBatterySettings())}>Battery settings</button>
          </div>
        </div>
      {/if}

      <button type="button" class="btn-primary" on:click={toggleRecording}>{status.enabled ? 'Stop recording' : 'Start recording'}</button>

      <div>
        <h3 class="text-sm font-medium text-gray-900 dark:text-gray-100">Recorded ({status.count})</h3>
        {#if items.length === 0}
          <p class="mt-1 text-sm text-muted">Nothing yet. Pay with Google Wallet or a UPI app, or wait for a bank SMS.</p>
        {:else}
          <ul class="mt-2 divide-y divide-gray-100 dark:divide-border-dark">
            {#each items as item (item.id)}
              <li class="py-3">
                <p class="text-xs text-muted">
                  {labels.get(item.packageName) ?? item.packageName} · {when(item.postedAt)}{#if item.sender} · {item.sender}{/if}
                </p>
                {#if item.title && item.title !== item.sender}
                  <p class="amt mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">{item.title}</p>
                {/if}
                <p class="amt mt-1 whitespace-pre-wrap break-words text-sm text-gray-700 dark:text-gray-200">{item.text}</p>
              </li>
            {/each}
          </ul>
          {#if status.count > items.length}
            <p class="mt-1 text-sm text-muted">Showing the latest {items.length}; sharing includes all of them.</p>
          {/if}
        {/if}
      </div>

      <div class="flex flex-wrap gap-3">
        <button type="button" class="btn-secondary" disabled={sharing || status.count === 0} on:click={shareLog}>{sharing ? 'Preparing…' : 'Share log'}</button>
        <button type="button" class="btn-danger" disabled={status.count === 0} on:click={clearLog}>Clear log</button>
      </div>
      <p class="text-sm text-muted">
        Sharing masks long numbers such as reference, account and phone numbers. Names are not masked, so look through the file before you send it.
      </p>
    {/if}

    {#if error}<p class="text-sm text-danger dark:text-danger-light" role="alert">{error}</p>{/if}
  </div>
</div>
