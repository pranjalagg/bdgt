<script lang="ts">
  import { onMount } from 'svelte';
  import { getCapture, type CapturePlugin, type CaptureStatus, type InstalledSource, type KeptItem } from '$lib/capture/native';
  import { buildLogFile, logFilename } from '$lib/capture/logExport';
  import { describeItem } from '$lib/capture/describe';
  import { baseCurrency } from '$lib/stores/currencyStore';
  import { getSyncApp, syncEnabled } from '$lib/sync/browser';
  import { logScope } from '$lib/capture/runner';

  // Android app only. Reads payment notifications on this phone and sends
  // each payment to Review. On a build with sync, payments wait on the phone
  // until this device is signed in (see capture/runner.ts).

  const { linked } = getSyncApp();
  $: queueing = !syncEnabled || $linked;
  // Signing in or out changes whose recordings are shown.
  $: void $linked, refresh();

  let plugin: CapturePlugin | null = null;
  let status: CaptureStatus | null = null;
  let sources: InstalledSource[] = [];
  let items: KeptItem[] = [];
  let error = '';
  let sharing = false;

  $: labels = new Map(sources.map((s) => [s.packageName, s.label]));
  $: appSources = sources.filter((s) => s.kind === 'app');
  $: smsApps = sources.filter((s) => s.kind === 'sms');
  $: notRunning = !!status && status.enabled && status.accessGranted && !status.listenerConnected;

  // What the app makes of an item: shown in the log and written into the shared file.
  const describe = (item: KeptItem) => describeItem(item, $baseCurrency);

  async function refresh() {
    if (!plugin) return;
    try {
      const scope = await logScope();
      const [s, found, log] = await Promise.all([plugin.getStatus(scope), plugin.installedSources(), plugin.list({ limit: 200, ...scope })]);
      status = s;
      sources = found.sources;
      items = log.items;
      error = '';
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

  // Turning on without notification access goes straight to the system
  // switch; the section refreshes when the person comes back.
  function toggle() {
    if (!plugin || !status) return;
    const on = !status.enabled;
    const needsAccess = on && !status.accessGranted;
    const p = plugin;
    void run(async () => {
      await p.setConfig({ enabled: on });
      if (needsAccess) await p.openAccessSettings();
    });
  }

  function appOn(s: InstalledSource): boolean {
    return !status?.packages || status.packages.includes(s.packageName);
  }

  function setApp(packageName: string, on: boolean) {
    if (!plugin || !status) return;
    const current = status.packages ?? appSources.map((s) => s.packageName);
    const packages = on ? [...new Set([...current, packageName])] : current.filter((p) => p !== packageName);
    const p = plugin;
    void run(() => p.setConfig({ packages }));
  }

  function setSms(on: boolean) {
    const p = plugin;
    if (p) void run(() => p.setConfig({ sms: on }));
  }

  async function shareLog() {
    if (!plugin || !status) return;
    sharing = true;
    try {
      const { items: all } = await plugin.list({ limit: 10_000, ...(await logScope()) });
      const file = buildLogFile(all, status.appVersion, new Date(), describe);
      await plugin.share({ filename: logFilename(), text: JSON.stringify(file, null, 2), mimeType: 'application/json' });
    } catch (e) {
      error = message(e);
    } finally {
      sharing = false;
    }
  }

  function clearLog() {
    const p = plugin;
    if (!p || !confirm('Delete these recorded notifications from this phone? Payments already in Review stay there.')) return;
    void run(async () => p.clear(await logScope()));
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

<!-- The Automatic capture page under Settings. -->
<div class="card">

  <div class="space-y-4 px-5 py-4">
    <p class="text-sm text-label-2">
      Reads payment notifications from Google Wallet, UPI apps and bank SMS on this phone, and puts each payment in Review for you to approve. Every other notification is ignored and never stored.
    </p>

    {#if status}
      <dl class="space-y-2 text-sm">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <dt class="text-label-2">Notification access</dt>
          <dd class="flex items-center gap-3">
            <span class="font-medium {status.accessGranted ? 'text-success' : 'text-warning'}">{status.accessGranted ? 'On' : 'Off'}</span>
            {#if !status.accessGranted}
              <button type="button" class="btn-secondary" on:click={() => plugin && run(() => plugin!.openAccessSettings())}>Open settings</button>
            {/if}
          </dd>
        </div>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <dt class="text-label-2">Capture</dt>
          <dd class="font-medium text-label">{status.enabled ? 'On' : 'Off'}</dd>
        </div>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <dt class="text-label-2">Last payment notification</dt>
          <dd class="text-label">{status.lastKeptAt ? when(status.lastKeptAt) : 'None yet'}</dd>
        </div>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <dt class="text-label-2">Build</dt>
          <dd class="font-mono text-label">{status.appVersion}</dd>
        </div>
      </dl>

      {#if notRunning}
        <div class="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
          <p class="font-medium text-label">Capture is on but not running.</p>
          <p class="mt-1 text-label">The phone may have stopped it to save battery. Reconnect it, and let the app run in the background in battery settings.</p>
          <div class="mt-3 flex flex-wrap gap-2">
            <button type="button" class="btn-secondary" on:click={() => plugin && run(() => plugin!.requestRebind())}>Reconnect</button>
            <button type="button" class="btn-secondary" on:click={() => plugin && run(() => plugin!.openBatterySettings())}>Battery settings</button>
          </div>
        </div>
      {/if}

      {#if status.enabled && !queueing}
        <div class="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-label">
          Sign in under <span class="font-medium">Sync</span> to send payments to Review. Until then they wait on this phone{status.waiting ? ` (${status.waiting} so far)` : ''}.
        </div>
      {/if}

      <button type="button" class="btn-primary" on:click={toggle}>{status.enabled ? 'Turn off' : 'Turn on'}</button>

      {#if appSources.length || smsApps.length}
        <fieldset class="space-y-2">
          <legend class="text-sm font-medium text-label">Read from</legend>
          {#each appSources as s (s.packageName)}
            <label class="flex items-center gap-2 text-sm text-label">
              <input type="checkbox" checked={appOn(s)} on:change={(e) => setApp(s.packageName, e.currentTarget.checked)} />
              {s.label}
            </label>
          {/each}
          {#if smsApps.length}
            <label class="flex items-center gap-2 text-sm text-label">
              <input type="checkbox" checked={status.sms} on:change={(e) => setSms(e.currentTarget.checked)} />
              Bank SMS (in {smsApps.map((s) => s.label).join(', ')})
            </label>
          {/if}
        </fieldset>
      {/if}

      <p class="text-sm text-label-2">
        Keep notifications on for these apps: the phone can only pass on what it shows. The full message text stays on this phone; the amount, date, merchant and card digits sync to your account, which the app's owner can see.
      </p>

      <details class="rounded-lg border border-border dark:border-border-dark">
        <summary class="cursor-pointer px-3 py-2 text-sm font-medium text-label">Recorded notifications ({status.count})</summary>
        <div class="space-y-3 border-t border-border px-3 py-3 dark:border-border-dark">
          {#if items.length === 0}
            <p class="text-sm text-label-2">Nothing yet. Pay with Google Wallet or a UPI app, or wait for a bank SMS.</p>
          {:else}
            <ul class="divide-y divide-sep">
              {#each items as item (item.id)}
                {@const outcome = describe(item)}
                <li class="py-3">
                  <p class="text-xs text-label-2">
                    {labels.get(item.packageName) ?? item.packageName} · {when(item.postedAt)}{#if item.sender} · {item.sender}{/if}
                  </p>
                  {#if item.title && item.title !== item.sender}
                    <p class="amt mt-1 text-sm font-medium text-label">{item.title}</p>
                  {/if}
                  <p class="amt mt-1 whitespace-pre-wrap break-words text-sm text-label">{item.text}</p>
                  <p class="amt mt-1 text-xs font-medium {outcome.startsWith('Payment') ? 'text-success' : 'text-label-2'}">{outcome}</p>
                </li>
              {/each}
            </ul>
            {#if status.count > items.length}
              <p class="text-sm text-label-2">Showing the latest {items.length}; sharing includes all of them.</p>
            {/if}
          {/if}
          <div class="flex flex-wrap gap-3">
            <button type="button" class="btn-secondary" disabled={sharing || status.count === 0} on:click={shareLog}>{sharing ? 'Preparing…' : 'Share log'}</button>
            <button type="button" class="btn-danger" disabled={status.count === 0} on:click={clearLog}>Clear log</button>
          </div>
          <p class="text-sm text-label-2">
            If a payment was read wrongly or missed, share the log and say which one. Long numbers are masked; names are not, so look through the file first.{#if syncEnabled} Only this account's recordings are shown: they are hidden while signed out and come back when you sign in.{/if}
          </p>
        </div>
      </details>
    {/if}

    {#if error}<p class="text-sm text-danger" role="alert">{error}</p>{/if}
  </div>
</div>
