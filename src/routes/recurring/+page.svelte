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
    <h1 class="page-title">Recurring</h1>
    <button class="btn-primary" on:click={handleAdd}>
      + Add Recurring
    </button>
  </div>

  {#if sortedRecurring.length === 0}
    <div class="card py-12 text-center text-muted">No recurring transactions</div>
  {:else}
    <div class="space-y-2">
      {#each sortedRecurring as rec}
        {@const bucket = $buckets.find((b) => b.id === rec.bucketId)}
        <div class="card flex items-center gap-4 p-4 transition-colors hover:border-gray-300 dark:hover:border-gray-600" class:opacity-50={!rec.isActive}>
          <span
            class="h-3.5 w-3.5 rounded-full ring-2 ring-white dark:ring-surface-dark"
            style="background-color: {bucket?.color || '#ccc'}"
          ></span>
          <div class="flex-1 min-w-0">
            <p class="font-semibold tabular-nums dark:text-gray-100">{formatCurrency(rec.amount)}</p>
            <p class="text-sm text-muted">
              {bucket?.name || 'Unknown'} &middot; {rec.frequency}
              {#if rec.note} &middot; {rec.note}{/if}
            </p>
          </div>
          <div class="text-right">
            <p class="text-xs text-muted">Next due</p>
            <p class="text-sm font-medium tabular-nums dark:text-gray-200">{formatDate(new Date(rec.nextDueDate))}</p>
          </div>
          <div class="flex gap-1">
            <button
              class="rounded-md px-2.5 py-1 text-xs font-medium transition-colors {rec.isActive ? 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700' : 'bg-primary/10 text-primary hover:bg-primary/20'}"
              on:click={() => toggleRecurring(rec.id)}
            >
              {rec.isActive ? 'Pause' : 'Resume'}
            </button>
            <button
              class="btn-icon !p-1.5"
              on:click={() => handleEdit(rec)}
              aria-label="Edit recurring"
            >
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
            </button>
            <button
              class="btn-icon !p-1.5 hover:!bg-red-50 hover:!text-danger dark:hover:!bg-red-900/30"
              on:click={() => handleDelete(rec.id)}
              aria-label="Delete recurring"
            >
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
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
      <label class="label">Amount</label>
      <div class="relative mt-1.5">
        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-muted">$</span>
        <input
          type="text"
          inputmode="decimal"
          bind:value={amount}
          on:input={handleAmountInput}
          placeholder="0.00"
          class="input-base pl-7 {amountError ? '!border-danger !focus:border-danger !focus:ring-danger/20' : ''}"
          required
        />
      </div>
      {#if amountError}
        <p class="mt-1 text-sm text-danger">{amountError}</p>
      {:else if showPreview && previewValue !== null}
        <p class="mt-1 text-sm text-muted">= ${previewValue.toFixed(2)}</p>
      {/if}
    </div>
    <div>
      <label class="label">Bucket</label>
      <select bind:value={bucketId} class="mt-1.5 select-base" required>
        <option value="">Select bucket</option>
        {#each $buckets as bucket}
          <option value={bucket.id}>{bucket.name}</option>
        {/each}
      </select>
    </div>
    <div>
      <label class="label">Frequency</label>
      <select bind:value={frequency} class="mt-1.5 select-base">
        <option value="weekly">Weekly</option>
        <option value="biweekly">Bi-weekly</option>
        <option value="monthly">Monthly</option>
      </select>
    </div>
    <div>
      <label class="label">Next Due Date</label>
      <input type="date" bind:value={nextDueDate} class="mt-1.5 input-base" required />
    </div>
    <div>
      <label class="label">Note (optional)</label>
      <input type="text" bind:value={note} class="mt-1.5 input-base" />
    </div>
    <button
      type="submit"
      disabled={!canSubmit}
      class="w-full btn-primary"
    >
      {editingId ? 'Update' : 'Add'} Recurring
    </button>
  </form>
</Modal>
