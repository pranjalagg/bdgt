<script lang="ts">
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
  import CaptureLogSection from '$lib/components/capture/CaptureLogSection.svelte';
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

  function handleThemeChange(e: Event) {
    const value = (e.target as HTMLSelectElement).value as ThemePreference;
    setTheme(value);
  }
</script>

<div class="space-y-6">
  <SectionTabs tabs={[{ href: '/buckets', label: 'Buckets' }, { href: '/recurring', label: 'Recurring' }, { href: '/settings', label: 'Settings' }]} />

  <h1 class="page-title">Settings</h1>

  <div class="card">
    <div class="border-b border-gray-100 px-5 py-4 dark:border-border-dark">
      <h2 class="section-title">Appearance</h2>
    </div>
    <div class="flex items-center gap-4 px-5 py-4">
      <label for="theme" class="label">Theme</label>
      <select
        id="theme"
        value={$themePreference}
        on:change={handleThemeChange}
        class="select-base max-w-[160px]"
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </div>
  </div>

  <div class="card">
    <div class="border-b border-gray-100 px-5 py-4 dark:border-border-dark">
      <h2 class="section-title">Currency</h2>
    </div>
    <div class="flex flex-wrap items-center gap-4 px-5 py-4">
      <CurrencyChip />
      <p class="text-sm text-muted">Changing it only relabels amounts; it does not convert them.</p>
    </div>
  </div>

  {#if syncEnabled}
    <SyncSection />
  {/if}

  {#if androidApp}
    <CaptureLogSection />
  {/if}

  <CaptureRulesSection />

  <div class="card">
    <div class="border-b border-gray-100 px-5 py-4 dark:border-border-dark">
      <h2 class="section-title">Export Data</h2>
    </div>
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

  <div class="card">
    <div class="border-b border-gray-100 px-5 py-4 dark:border-border-dark">
      <h2 class="section-title">Import Data</h2>
    </div>
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
      <p class="mt-2 text-sm text-muted">Import a previously exported JSON backup file.</p>
    </div>
  </div>

  <div class="card border-danger/20">
    <div class="border-b border-danger/10 px-5 py-4">
      <h2 class="text-lg font-semibold text-danger">Danger Zone</h2>
    </div>
    <div class="px-5 py-4">
      <button class="btn-danger" on:click={handleReset}>
        Reset All Data
      </button>
      <p class="mt-2 text-sm text-muted">Permanently delete all your data. This cannot be undone.</p>
    </div>
  </div>
</div>
