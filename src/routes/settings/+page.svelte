<script lang="ts">
  import { base } from '$app/paths';
  import { browser } from '$app/environment';
  import NavBar from '$lib/components/layout/NavBar.svelte';
  import CloseButton from '$lib/components/layout/CloseButton.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import IconMark from '$lib/components/ui/IconMark.svelte';
  import Switch from '$lib/components/ui/Switch.svelte';
  import EditHomeSheet from '$lib/components/home/EditHomeSheet.svelte';
  import { segmentedPill } from '$lib/actions/segmentedPill';
  import { exportToJson, exportToCsv, importFromJson, resetAllData, downloadFile } from '$lib/utils/export';
  import { loadData } from '$lib/stores/budgetStore';
  import { loadRecurring } from '$lib/stores/recurringStore';
  import { loadGoals } from '$lib/stores/goalsStore';
  import { loadCaptures, captureRules } from '$lib/stores/captureStore';
  import { loadInvestments } from '$lib/stores/investmentStore';
  import { loadHomeLayout } from '$lib/stores/homeLayoutStore';
  import { themePreference, setTheme, type ThemePreference } from '$lib/stores/themeStore';
  import { hideAmounts } from '$lib/stores/privacyStore';
  import { baseCurrency, loadCurrency } from '$lib/stores/currencyStore';
  import { currencyInfo } from '$lib/currency/currencies';
  import { openModal } from '$lib/stores/uiStore';
  import { syncEnabled, getSyncApp } from '$lib/sync/browser';
  import { describeSync } from '$lib/sync/statusText';
  import { isAndroidApp } from '$lib/capture/native';
  import type { IconName } from '$lib/ui/icons';

  // Settings slides up over the app. Sync, automatic capture and capture
  // rules each open a page of their own; everything else is here.

  const androidApp = browser && isAndroidApp();
  const app = getSyncApp();
  // Signed in, import and reset reach the account on every device.
  const { linked, account, status } = app;

  $: syncLine = !$account ? 'Back up and use more than one device' : ($status && describeSync($status, Date.now()).label) || $account.email;

  let fileInput: HTMLInputElement;
  let isExporting = false;
  let isImporting = false;

  const today = () => new Date().toISOString().split('T')[0];

  async function exportJson() {
    isExporting = true;
    try {
      downloadFile(await exportToJson(), `budget-backup-${today()}.json`, 'application/json');
    } finally {
      isExporting = false;
    }
  }

  async function exportCsv() {
    isExporting = true;
    try {
      downloadFile(await exportToCsv(), `transactions-${today()}.csv`, 'text/csv');
    } finally {
      isExporting = false;
    }
  }

  async function reloadAll() {
    await loadCurrency();
    await loadData();
    await loadRecurring();
    await loadGoals();
    await loadCaptures();
    await loadInvestments();
    await loadHomeLayout();
  }

  async function handleImport() {
    const file = fileInput?.files?.[0];
    if (!file) return;
    if (!confirm($linked ? 'This replaces all data on this device and in your account, on every device that syncs. Continue?' : 'This will replace all existing data. Continue?')) return;
    isImporting = true;
    try {
      await importFromJson(await file.text());
      await reloadAll();
      alert('Data imported successfully!');
    } catch (e) {
      alert('Import failed: ' + (e instanceof Error ? e.message : 'Unknown error'));
    } finally {
      isImporting = false;
      // loadData remounts the page after a successful import, so the input may be gone.
      if (fileInput) fileInput.value = '';
    }
  }

  async function handleReset() {
    if (!confirm($linked ? 'Delete ALL data, including your synced data in your account on every device? This cannot be undone!' : 'Delete ALL data? This cannot be undone!')) return;
    if (!confirm('Are you really sure?')) return;
    await resetAllData();
    await reloadAll();
    alert('All data has been reset.');
  }

  const THEMES: [ThemePreference, string][] = [
    ['system', 'System'],
    ['light', 'Light'],
    ['dark', 'Dark'],
  ];

  const row = 'group-row flex min-h-[52px] w-full items-center gap-3 px-4 py-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-tint';
</script>

<NavBar title="Settings">
  <svelte:fragment slot="leading"><CloseButton label="Done" /></svelte:fragment>
</NavBar>

<div class="mx-auto max-w-2xl space-y-6 pb-8">
  {#if syncEnabled}
    <section aria-labelledby="s-account">
      <h2 id="s-account" class="settings-label">Account</h2>
      <div class="group">
        <a href="{base}/settings/sync" class={row} style="--row-inset: 58px">
          <IconMark icon="repeat" size={34} />
          <span class="min-w-0 flex-1">
            <span class="block text-[16px] text-label">{$account ? 'Sync' : 'Sign in to sync'}</span>
            <span class="block truncate text-[13px] text-label-2">{syncLine}</span>
          </span>
          <span class="text-label-2/60" aria-hidden="true"><Icon name="chevron-right" size={18} /></span>
        </a>
      </div>
    </section>
  {/if}

  <section aria-labelledby="s-payments">
    <h2 id="s-payments" class="settings-label">Payments</h2>
    <div class="group">
      {#if androidApp}
        <a href="{base}/settings/capture" class={row} style="--row-inset: 58px">
          <IconMark icon="inbox" size={34} />
          <span class="min-w-0 flex-1 text-[16px] text-label">Automatic capture</span>
          <span class="text-label-2/60" aria-hidden="true"><Icon name="chevron-right" size={18} /></span>
        </a>
      {/if}
      <a href="{base}/settings/rules" class={row} style="--row-inset: 58px">
        <IconMark icon="list" size={34} />
        <span class="min-w-0 flex-1 text-[16px] text-label">Capture rules</span>
        <span class="text-[15px] text-label-2">{$captureRules.length || 'None yet'}</span>
        <span class="text-label-2/60" aria-hidden="true"><Icon name="chevron-right" size={18} /></span>
      </a>
    </div>
  </section>

  <section aria-labelledby="s-display">
    <h2 id="s-display" class="settings-label">Display</h2>
    <div class="group">
      <div class="group-row flex flex-wrap items-center justify-between gap-3 px-4 py-2.5" style="--row-inset: 58px">
        <span class="flex items-center gap-3">
          <IconMark icon="settings" size={34} />
          <span id="theme-label" class="text-[16px] text-label">Appearance</span>
        </span>
        <div id="theme" class="segmented !w-auto" role="group" aria-labelledby="theme-label" use:segmentedPill>
          {#each THEMES as [value, label]}
            <button type="button" class="segment" aria-pressed={$themePreference === value} on:click={() => setTheme(value)}>{label}</button>
          {/each}
        </div>
      </div>
      <div class="group-row flex min-h-[52px] items-center gap-3 px-4 py-2" style="--row-inset: 58px">
        <IconMark icon="eye-off" size={34} />
        <label for="hide-amounts" class="min-w-0 flex-1 text-[16px] text-label">Hide amounts</label>
        <Switch id="hide-amounts" bind:checked={$hideAmounts} label="Hide amounts" />
      </div>
      <button type="button" class={row} style="--row-inset: 58px" on:click={() => openModal('edit-home')}>
        <IconMark icon="house" size={34} />
        <span class="min-w-0 flex-1 text-[16px] text-label">Home screen</span>
        <span class="text-label-2/60" aria-hidden="true"><Icon name="chevron-right" size={18} /></span>
      </button>
      <button type="button" class={row} style="--row-inset: 58px" on:click={() => openModal('currency')}>
        <IconMark icon="wallet" size={34} />
        <span class="min-w-0 flex-1">
          <span class="block text-[16px] text-label">Currency</span>
          <span class="block text-[13px] text-label-2">Changing it relabels amounts; it does not convert them.</span>
        </span>
        <span class="flex-none text-[15px] text-label-2">{currencyInfo($baseCurrency).code} ({currencyInfo($baseCurrency).symbol})</span>
        <span class="text-label-2/60" aria-hidden="true"><Icon name="chevron-right" size={18} /></span>
      </button>
    </div>
  </section>

  <section aria-labelledby="s-data">
    <h2 id="s-data" class="settings-label">Data</h2>
    <div class="group">
      <button type="button" class={row} style="--row-inset: 58px" disabled={isExporting} on:click={exportJson}>
        <IconMark icon="arrow-up" size={34} />
        <span class="min-w-0 flex-1">
          <span class="block text-[16px] text-tint">Export JSON</span>
          <span class="block text-[13px] text-label-2">A full backup you can import later</span>
        </span>
      </button>
      <button type="button" class={row} style="--row-inset: 58px" disabled={isExporting} on:click={exportCsv}>
        <IconMark icon="list" size={34} />
        <span class="min-w-0 flex-1">
          <span class="block text-[16px] text-tint">Export CSV</span>
          <span class="block text-[13px] text-label-2">Your expenses, for a spreadsheet</span>
        </span>
      </button>
      <button type="button" class={row} style="--row-inset: 58px" disabled={isImporting} on:click={() => fileInput.click()}>
        <IconMark icon="arrow-down" size={34} />
        <span class="min-w-0 flex-1">
          <span class="block text-[16px] text-tint">{isImporting ? 'Importing…' : 'Import a backup'}</span>
          <span class="block text-[13px] text-label-2">Replaces everything with a JSON backup</span>
        </span>
      </button>
    </div>
    <input type="file" accept=".json" bind:this={fileInput} on:change={handleImport} class="hidden" aria-label="Backup file" />
  </section>

  <section aria-labelledby="s-reset">
    <h2 id="s-reset" class="sr-only">Reset</h2>
    <div class="group">
      <button type="button" class="{row} justify-center" on:click={handleReset}>
        <span class="text-[16px] font-medium text-danger">Reset all data</span>
      </button>
    </div>
    <p class="px-4 pt-1.5 text-[13px] text-label-2">Deletes everything on this device{$linked ? ' and in your account' : ''}. Asks first; it cannot be undone.</p>
  </section>
</div>

<EditHomeSheet />
