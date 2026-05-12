<script lang="ts">
  import { exportToJson, exportToCsv, importFromJson, resetAllData, downloadFile } from '$lib/utils/export';
  import { loadData } from '$lib/stores/budgetStore';
  import { loadRecurring } from '$lib/stores/recurringStore';
  import { themePreference, setTheme, type ThemePreference } from '$lib/stores/themeStore';

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

    if (!confirm('This will replace all existing data. Continue?')) return;

    isImporting = true;
    try {
      const text = await file.text();
      await importFromJson(text);
      await loadData();
      await loadRecurring();
      alert('Data imported successfully!');
    } catch (e) {
      alert('Import failed: ' + (e instanceof Error ? e.message : 'Unknown error'));
    } finally {
      isImporting = false;
      fileInput.value = '';
    }
  }

  async function handleReset() {
    if (!confirm('Delete ALL data? This cannot be undone!')) return;
    if (!confirm('Are you really sure?')) return;

    await resetAllData();
    await loadData();
    await loadRecurring();
    alert('All data has been reset.');
  }

  function handleThemeChange(e: Event) {
    const value = (e.target as HTMLSelectElement).value as ThemePreference;
    setTheme(value);
  }
</script>

<div class="space-y-6">
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
