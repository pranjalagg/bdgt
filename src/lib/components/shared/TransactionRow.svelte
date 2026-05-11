<script lang="ts">
  import { formatCurrency } from '$lib/utils/currency';
  import { formatDate } from '$lib/utils/dates';
  import { buckets, deleteTransaction } from '$lib/stores/budgetStore';
  import type { Transaction } from '$lib/types';

  export let transaction: Transaction;
  export let showBucket = true;
  export let onEdit: ((transaction: Transaction) => void) | undefined = undefined;

  $: bucket = $buckets.find((b) => b.id === transaction.bucketId);

  let isDeleting = false;

  async function handleDelete() {
    if (!confirm('Delete this transaction?')) return;
    isDeleting = true;
    await deleteTransaction(transaction.id);
  }
</script>

<div class="flex items-center justify-between rounded-lg bg-white p-3 shadow-sm dark:bg-surface-dark">
  <div class="flex items-center gap-3">
    {#if showBucket && bucket}
      <span class="h-2 w-2 rounded-full" style="background-color: {bucket.color}" />
    {/if}
    <div>
      <p class="font-medium text-gray-800 dark:text-gray-100">{formatCurrency(transaction.amount)}</p>
      <p class="text-sm text-gray-500 dark:text-gray-400">
        {formatDate(new Date(transaction.date))}
        {#if transaction.note}
          &middot; {transaction.note}
        {/if}
      </p>
    </div>
  </div>

  <div class="flex items-center gap-2">
    {#if showBucket && bucket}
      <span class="rounded bg-gray-100 px-2 py-1 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-300">{bucket.name}</span>
    {/if}
    {#if onEdit}
      <button
        class="rounded p-1 text-gray-400 hover:bg-blue-50 hover:text-primary dark:hover:bg-blue-900/30"
        on:click={() => onEdit?.(transaction)}
        aria-label="Edit transaction"
      >
        <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
      </button>
    {/if}
    <button
      class="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-danger disabled:opacity-50 dark:hover:bg-red-900/30"
      on:click={handleDelete}
      disabled={isDeleting}
      aria-label="Delete transaction"
    >
      <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
      </svg>
    </button>
  </div>
</div>
