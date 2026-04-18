<!-- src/routes/recurring/+page.svelte -->
<script lang="ts">
  import { recurringTransactions, addRecurring, updateRecurring, deleteRecurring, toggleRecurring } from '$lib/stores/recurringStore';
  import { buckets } from '$lib/stores/budgetStore';
  import { formatCurrency, parseCurrency } from '$lib/utils/currency';
  import { formatDate } from '$lib/utils/dates';
  import Modal from '$lib/components/shared/Modal.svelte';
  import { openModal, closeModal } from '$lib/stores/uiStore';
  import type { RecurringTransaction } from '$lib/types';

  let editingId: string | null = null;
  let amount = '';
  let bucketId = '';
  let frequency: RecurringTransaction['frequency'] = 'monthly';
  let nextDueDate = new Date().toISOString().split('T')[0];
  let note = '';

  function resetForm() {
    editingId = null;
    amount = '';
    bucketId = '';
    frequency = 'monthly';
    nextDueDate = new Date().toISOString().split('T')[0];
    note = '';
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
    nextDueDate = new Date(rec.nextDueDate).toISOString().split('T')[0];
    note = rec.note || '';
    openModal('recurring-form');
  }

  async function handleSubmit() {
    if (!amount || !bucketId) return;

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
    <h1 class="text-2xl font-bold text-gray-800">Recurring</h1>
    <button
      class="rounded-lg bg-primary px-4 py-2 text-white hover:bg-blue-600"
      on:click={handleAdd}
    >
      + Add Recurring
    </button>
  </div>

  {#if sortedRecurring.length === 0}
    <p class="py-8 text-center text-gray-500">No recurring transactions</p>
  {:else}
    <div class="space-y-3">
      {#each sortedRecurring as rec}
        {@const bucket = $buckets.find((b) => b.id === rec.bucketId)}
        <div class="flex items-center gap-4 rounded-lg bg-white p-4 shadow" class:opacity-50={!rec.isActive}>
          <span
            class="h-3 w-3 rounded-full"
            style="background-color: {bucket?.color || '#ccc'}"
          />
          <div class="flex-1">
            <p class="font-medium">{formatCurrency(rec.amount)}</p>
            <p class="text-sm text-gray-500">
              {bucket?.name || 'Unknown'} &middot; {rec.frequency}
              {#if rec.note} &middot; {rec.note}{/if}
            </p>
          </div>
          <div class="text-right">
            <p class="text-sm text-gray-600">Next due</p>
            <p class="text-sm font-medium">{formatDate(new Date(rec.nextDueDate))}</p>
          </div>
          <div class="flex gap-1">
            <button
              class="rounded px-2 py-1 text-sm hover:bg-gray-100"
              on:click={() => toggleRecurring(rec.id)}
            >
              {rec.isActive ? 'Pause' : 'Resume'}
            </button>
            <button
              class="rounded px-2 py-1 text-sm hover:bg-gray-100"
              on:click={() => handleEdit(rec)}
            >
              Edit
            </button>
            <button
              class="rounded px-2 py-1 text-sm text-danger hover:bg-red-50"
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
      <label class="block text-sm font-medium text-gray-700">Amount</label>
      <input type="text" bind:value={amount} class="mt-1 w-full rounded-lg border px-3 py-2" required />
    </div>
    <div>
      <label class="block text-sm font-medium text-gray-700">Bucket</label>
      <select bind:value={bucketId} class="mt-1 w-full rounded-lg border px-3 py-2" required>
        <option value="">Select bucket</option>
        {#each $buckets as bucket}
          <option value={bucket.id}>{bucket.name}</option>
        {/each}
      </select>
    </div>
    <div>
      <label class="block text-sm font-medium text-gray-700">Frequency</label>
      <select bind:value={frequency} class="mt-1 w-full rounded-lg border px-3 py-2">
        <option value="weekly">Weekly</option>
        <option value="biweekly">Bi-weekly</option>
        <option value="monthly">Monthly</option>
      </select>
    </div>
    <div>
      <label class="block text-sm font-medium text-gray-700">Next Due Date</label>
      <input type="date" bind:value={nextDueDate} class="mt-1 w-full rounded-lg border px-3 py-2" required />
    </div>
    <div>
      <label class="block text-sm font-medium text-gray-700">Note (optional)</label>
      <input type="text" bind:value={note} class="mt-1 w-full rounded-lg border px-3 py-2" />
    </div>
    <button type="submit" class="w-full rounded-lg bg-primary px-4 py-2 text-white hover:bg-blue-600">
      {editingId ? 'Update' : 'Add'} Recurring
    </button>
  </form>
</Modal>
