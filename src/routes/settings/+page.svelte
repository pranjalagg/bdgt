<script lang="ts">
  import { segmentedPill } from '$lib/actions/segmentedPill';
  import { exportToJson, exportToCsv, importFromJson, resetAllData, downloadFile } from '$lib/utils/export';
  import { loadData } from '$lib/stores/budgetStore';
  import { loadRecurring } from '$lib/stores/recurringStore';
  import { loadGoals } from '$lib/stores/goalsStore';
  import { loadCaptures } from '$lib/stores/captureStore';
  import { loadInvestments } from '$lib/stores/investmentStore';
  import { themePreference, setTheme, type ThemePreference } from '$lib/stores/themeStore';
  import { loadCurrency } from '$lib/stores/currencyStore';
  import CurrencyChip from '$lib/components/shared/CurrencyChip.svelte';
  import SectionTabs from '$lib/components/shared/SectionTabs.svelte';
  import SyncSection from '$lib/components/sync/SyncSection.svelte';
  import CaptureSection from '$lib/components/capture/CaptureSection.svelte';
  import CaptureRulesSection from '$lib/components/capture/CaptureRulesSection.svelte';
  import { syncEnabled, getSyncApp } from '$lib/sync/browser';
  import { isAndroidApp } from '$lib/capture/native';
  import { browser } from '$app/environment';

  const androidApp = browser && isAndroidApp();

  // Signed in, import and reset reach the account on every device.
  const linked = getSyncApp().linked;

  let fileInput: HTMLInputElement;
  let isExporting = false;
  let isImporting = false;

  async function handleExportJson() {
    isExporting = true;
    try {
      const json = await exportToJson();
      const date = new Date().toISOString().split('T')[0];
      downloadFile(json, `budget-backup-${date}.json`, 'application/json');
    } finally {
      isExporting = false;
    }
  }

  async function handleExportCsv() {
    isExporting = true;
    try {
      const csv = await exportToCsv();
      const date = new Date().toISOString().split('T')[0];
      downloadFile(csv, `transactions-${date}.csv`, 'text/csv');
    } finally {
      isExporting = false;
    }
  }

  async function handleImport() {
    const file = fileInput?.files?.[0];
    if (!file) return;

    if (!confirm($linked ? 'This replaces all data on this device and in your account, on every device that syncs. Continue?' : 'This will replace all existing data. Continue?')) return;

    isImporting = true;
    try {
      const text = await file.text();
      await importFromJson(text);
      await loadCurrency();
      await loadData();
      await loadRecurring();
      await loadGoals();
      await loadCaptures();
      await loadInvestments();
      alert('Data imported successfully!');
    } catch (e) {
      alert('Import failed: ' + (e instanceof Error ? e.message : 'Unknown error'));
    } finally {
      isImporting = false;
      // loadData remounts the page after a successful import, so the input is gone.
      if (fileInput) fileInput.value = '';
    }
  }

  async function handleReset() {
    if (!confirm($linked ? 'Delete ALL data, including your synced data in your account on every device? This cannot be undone!' : 'Delete ALL data? This cannot be undone!')) return;
    if (!confirm('Are you really sure?')) return;

    await resetAllData();
    await loadCurrency();
    await loadData();
    await loadRecurring();
    await loadGoals();
    await loadCaptures();
    await loadInvestments();
    alert('All data has been reset.');
  }

  const THEMES: [ThemePreference, string][] = [
    ['system', 'System'],
    ['light', 'Light'],
    ['dark', 'Dark'],
  ];
</script>

<div class="space-y-6">
  <SectionTabs tabs={[{ href: '/budget', label: 'Buckets' }, { href: '/budget/bills', label: 'Recurring' }, { href: '/settings', label: 'Settings' }]} />

  <h1 class="page-title">Settings</h1>

  <section>
    <h2 class="settings-label">Appearance</h2>
    <div class="card">
    <div class="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
      <span id="theme-label" class="text-[15px] font-medium text-gray-900 dark:text-gray-100">Theme</span>
      <div id="theme" class="segmented !w-auto" role="group" aria-labelledby="theme-label" use:segmentedPill>
        {#each THEMES as [value, label]}
          <button type="button" class="segment" aria-pressed={$themePreference === value} on:click={() => setTheme(value)}>{label}</button>
        {/each}
      </div>
    </div>
    </div>
  </section>

  <section>
    <h2 class="settings-label">Currency</h2>
    <div class="card">
    <div class="flex flex-wrap items-center gap-4 px-5 py-4">
      <CurrencyChip />
      <p class="text-sm text-muted dark:text-muted-dark">Changing it only relabels amounts; it does not convert them.</p>
    </div>
    </div>
  </section>

  {#if syncEnabled}
    <SyncSection />
  {/if}

  {#if androidApp}
    <CaptureSection />
  {/if}

  <CaptureRulesSection />

  <section>
    <h2 class="settings-label">Export data</h2>
    <div class="card">
    <div class="flex flex-wrap gap-3 px-5 py-4">
      <button
        class="btn-primary"
        on:click={handleExportJson}
        disabled={isExporting}
      >
        Export JSON (Full Backup)
      </button>
      <button
        class="btn-secondary"
        on:click={handleExportCsv}
        disabled={isExporting}
      >
        Export CSV (Transactions)
      </button>
    </div>
    </div>
  </section>

  <section>
    <h2 class="settings-label">Import data</h2>
    <div class="card">
    <div class="px-5 py-4">
      <input
        type="file"
        accept=".json"
        bind:this={fileInput}
        on:change={handleImport}
        class="hidden"
      />
      <button
        class="btn-secondary"
        on:click={() => fileInput.click()}
        disabled={isImporting}
      >
        {isImporting ? 'Importing...' : 'Import JSON Backup'}
      </button>
      <p class="mt-2 text-sm text-muted dark:text-muted-dark">Import a previously exported JSON backup file.</p>
    </div>
    </div>
  </section>

  <section>
    <h2 class="settings-label">Danger zone</h2>
    <div class="card">
    <div class="px-5 py-4">
      <button class="btn-danger" on:click={handleReset}>
        Reset All Data
      </button>
      <p class="mt-2 text-sm text-muted dark:text-muted-dark">Permanently delete all your data. This cannot be undone.</p>
    </div>
    </div>
  </section>
</div>
