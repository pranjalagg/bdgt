<!-- src/routes/recurring/+page.svelte -->
<script lang="ts">
  import { recurringTransactions, addRecurring, updateRecurring, deleteRecurring, toggleRecurring } from '$lib/stores/recurringStore';
  import { buckets } from '$lib/stores/budgetStore';
  import { formatCurrency, parseCurrency, isValidCurrency, isExpression, evaluateExpression } from '$lib/utils/currency';
  import { formatDate } from '$lib/utils/dates';
  import Modal from '$lib/components/shared/Modal.svelte';
  import { openModal, closeModal } from '$lib/stores/uiStore';
  import type { RecurringTransaction } from '$lib/types';

  let editingId: string | null = null;
  let amount = '';
  let bucketId = '';
  let frequency: RecurringTransaction['frequency'] = 'monthly';
  let nextDueDate = formatLocalDate(new Date());
  let note = '';
  let amountTouched = false;

  function formatLocalDate(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  $: amountError = amountTouched && amount && !isValidCurrency(amount)
    ? 'Please enter a valid amount (e.g. 12.50, -5, or 10 + 5.25)'
    : '';

  $: canSubmit = !!amount && !!bucketId && !amountError && isValidCurrency(amount);

  $: showPreview = isExpression(amount) && isValidCurrency(amount);
  $: previewValue = showPreview ? evaluateExpression(amount) : null;

  function handleAmountInput() {
    amountTouched = true;
  }

  function resetForm() {
    editingId = null;
    amount = '';
    bucketId = '';
    frequency = 'monthly';
    nextDueDate = formatLocalDate(new Date());
    note = '';
    amountTouched = false;
  }

  function handleAdd() {
    resetForm();
    openModal('recurring-form');
  }

  function handleEdit(rec: RecurringTransaction) {
    editingId = rec.id;
    amount = (rec.amount / 100).toFixed(2);
    bucketId = rec.bucketId;
    frequency = rec.frequency;
    nextDueDate = formatLocalDate(new Date(rec.nextDueDate));
    note = rec.note || '';
    openModal('recurring-form');
  }

  async function handleSubmit() {
    amountTouched = true;
    if (!canSubmit) return;

    const data = {
      amount: parseCurrency(amount),
      bucketId,
      frequency,
      nextDueDate: new Date(nextDueDate),
      note: note || undefined,
      isActive: true,
    };

    if (editingId) {
      await updateRecurring(editingId, data);
    } else {
      await addRecurring(data);
    }
    closeModal();
    resetForm();
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this recurring transaction?')) return;
    await deleteRecurring(id);
  }

  $: sortedRecurring = [...$recurringTransactions].sort(
    (a, b) => new Date(a.nextDueDate).getTime() - new Date(b.nextDueDate).getTime()
  );
</script>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <h1 class="text-2xl font-bold text-gray-800 dark:text-gray-100">Recurring</h1>
    <button
      class="rounded-lg bg-primary px-4 py-2 text-white hover:bg-blue-600"
      on:click={handleAdd}
    >
      + Add Recurring
    </button>
  </div>

  {#if sortedRecurring.length === 0}
    <p class="py-8 text-center text-gray-500 dark:text-gray-400">No recurring transactions</p>
  {:else}
    <div class="space-y-3">
      {#each sortedRecurring as rec}
        {@const bucket = $buckets.find((b) => b.id === rec.bucketId)}
        <div class="flex items-center gap-4 rounded-lg bg-white p-4 shadow dark:bg-surface-dark" class:opacity-50={!rec.isActive}>
          <span
            class="h-3 w-3 rounded-full"
            style="background-color: {bucket?.color || '#ccc'}"
          />
          <div class="flex-1">
            <p class="font-medium dark:text-gray-100">{formatCurrency(rec.amount)}</p>
            <p class="text-sm text-gray-500 dark:text-gray-400">
              {bucket?.name || 'Unknown'} &middot; {rec.frequency}
              {#if rec.note} &middot; {rec.note}{/if}
            </p>
          </div>
          <div class="text-right">
            <p class="text-sm text-gray-600 dark:text-gray-400">Next due</p>
            <p class="text-sm font-medium dark:text-gray-200">{formatDate(new Date(rec.nextDueDate))}</p>
          </div>
          <div class="flex gap-1">
            <button
              class="rounded px-2 py-1 text-sm hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
              on:click={() => toggleRecurring(rec.id)}
            >
              {rec.isActive ? 'Pause' : 'Resume'}
            </button>
            <button
              class="rounded px-2 py-1 text-sm hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
              on:click={() => handleEdit(rec)}
            >
              Edit
            </button>
            <button
              class="rounded px-2 py-1 text-sm text-danger hover:bg-red-50 dark:hover:bg-red-900/30"
              on:click={() => handleDelete(rec.id)}
            >
              Delete
            </button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<Modal id="recurring-form" title={editingId ? 'Edit Recurring' : 'Add Recurring'}>
  <form on:submit|preventDefault={handleSubmit} class="space-y-4">
    <div>
      <label class="block text-sm font-medium text-gray-700 dark:text-gray-200">Amount</label>
      <div class="relative mt-1">
        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400">$</span>
        <input
          type="text"
          inputmode="decimal"
          bind:value={amount}
          on:input={handleAmountInput}
          placeholder="0.00"
          class="w-full rounded-lg border bg-white py-2 pl-7 pr-3 focus:outline-none focus:ring-1 dark:bg-gray-800 dark:text-gray-100 {amountError ? 'border-danger focus:border-danger focus:ring-danger' : 'border-gray-300 focus:border-primary focus:ring-primary dark:border-border-dark'}"
          required
        />
      </div>
      {#if amountError}
        <p class="mt-1 text-sm text-danger">{amountError}</p>
      {:else if showPreview && previewValue !== null}
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">= ${previewValue.toFixed(2)}</p>
      {/if}
    </div>
    <div>
      <label class="block text-sm font-medium text-gray-700 dark:text-gray-200">Bucket</label>
      <select bind:value={bucketId} class="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-border-dark dark:bg-gray-800 dark:text-gray-100" required>
        <option value="">Select bucket</option>
        {#each $buckets as bucket}
          <option value={bucket.id}>{bucket.name}</option>
        {/each}
      </select>
    </div>
    <div>
      <label class="block text-sm font-medium text-gray-700 dark:text-gray-200">Frequency</label>
      <select bind:value={frequency} class="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-border-dark dark:bg-gray-800 dark:text-gray-100">
        <option value="weekly">Weekly</option>
        <option value="biweekly">Bi-weekly</option>
        <option value="monthly">Monthly</option>
      </select>
    </div>
    <div>
      <label class="block text-sm font-medium text-gray-700 dark:text-gray-200">Next Due Date</label>
      <input type="date" bind:value={nextDueDate} class="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-border-dark dark:bg-gray-800 dark:text-gray-100" required />
    </div>
    <div>
      <label class="block text-sm font-medium text-gray-700 dark:text-gray-200">Note (optional)</label>
      <input type="text" bind:value={note} class="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-border-dark dark:bg-gray-800 dark:text-gray-100" />
    </div>
    <button
      type="submit"
      disabled={!canSubmit}
      class="w-full rounded-lg bg-primary px-4 py-2 text-white transition hover:bg-blue-600 disabled:opacity-50"
    >
      {editingId ? 'Update' : 'Add'} Recurring
    </button>
  </form>
</Modal>
