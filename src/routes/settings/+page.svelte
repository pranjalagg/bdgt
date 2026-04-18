<script lang="ts">
  import { exportToJson, exportToCsv, importFromJson, resetAllData, downloadFile } from '$lib/utils/export';
  import { loadData } from '$lib/stores/budgetStore';
  import { loadRecurring } from '$lib/stores/recurringStore';

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
</script>

<div class="space-y-8">
  <h1 class="text-2xl font-bold text-gray-800">Settings</h1>

  <section class="space-y-4">
    <h2 class="text-lg font-semibold text-gray-700">Export Data</h2>
    <div class="flex flex-wrap gap-3">
      <button
        class="rounded-lg bg-primary px-4 py-2 text-white hover:bg-blue-600 disabled:opacity-50"
        on:click={handleExportJson}
        disabled={isExporting}
      >
        Export JSON (Full Backup)
      </button>
      <button
        class="rounded-lg border border-gray-300 px-4 py-2 hover:bg-gray-50 disabled:opacity-50"
        on:click={handleExportCsv}
        disabled={isExporting}
      >
        Export CSV (Transactions)
      </button>
    </div>
  </section>

  <section class="space-y-4">
    <h2 class="text-lg font-semibold text-gray-700">Import Data</h2>
    <div class="flex items-center gap-3">
      <input
        type="file"
        accept=".json"
        bind:this={fileInput}
        on:change={handleImport}
        class="hidden"
      />
      <button
        class="rounded-lg border border-gray-300 px-4 py-2 hover:bg-gray-50 disabled:opacity-50"
        on:click={() => fileInput.click()}
        disabled={isImporting}
      >
        {isImporting ? 'Importing...' : 'Import JSON Backup'}
      </button>
    </div>
    <p class="text-sm text-gray-500">Import a previously exported JSON backup file.</p>
  </section>

  <section class="space-y-4 border-t pt-6">
    <h2 class="text-lg font-semibold text-danger">Danger Zone</h2>
    <button
      class="rounded-lg border border-danger px-4 py-2 text-danger hover:bg-red-50"
      on:click={handleReset}
    >
      Reset All Data
    </button>
    <p class="text-sm text-gray-500">Permanently delete all your data. This cannot be undone.</p>
  </section>
</div>
