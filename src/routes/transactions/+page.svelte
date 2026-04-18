<script lang="ts">
  import TransactionRow from '$lib/components/shared/TransactionRow.svelte';
  import QuickEntry from '$lib/components/shared/QuickEntry.svelte';
  import Modal from '$lib/components/shared/Modal.svelte';
  import MonthPicker from '$lib/components/shared/MonthPicker.svelte';
  import { currentMonthTransactions, buckets } from '$lib/stores/budgetStore';
  import { openModal } from '$lib/stores/uiStore';

  let filterBucketId = '';

  $: filteredTransactions = filterBucketId
    ? $currentMonthTransactions.filter((t) => t.bucketId === filterBucketId)
    : $currentMonthTransactions;

  $: sortedTransactions = [...filteredTransactions].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
</script>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <h1 class="text-2xl font-bold text-gray-800 dark:text-gray-100">Transactions</h1>
    <MonthPicker />
  </div>

  <div class="flex gap-4">
    <select bind:value={filterBucketId} class="rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-border-dark dark:bg-surface-dark dark:text-gray-100">
      <option value="">All Buckets</option>
      {#each $buckets as bucket}
        <option value={bucket.id}>{bucket.name}</option>
      {/each}
    </select>

    <button class="rounded-lg bg-primary px-4 py-2 text-white hover:bg-blue-600" on:click={() => openModal('add-transaction')}>
      + Add
    </button>
  </div>

  {#if sortedTransactions.length === 0}
    <p class="py-8 text-center text-gray-500 dark:text-gray-400">No transactions this month</p>
  {:else}
    <div class="space-y-2">
      {#each sortedTransactions as transaction (transaction.id)}
        <TransactionRow {transaction} />
      {/each}
    </div>
  {/if}
</div>

<Modal id="add-transaction" title="Add Transaction">
  <QuickEntry />
</Modal>
