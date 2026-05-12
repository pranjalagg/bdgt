<script lang="ts">
  import TransactionRow from '$lib/components/shared/TransactionRow.svelte';
  import QuickEntry from '$lib/components/shared/QuickEntry.svelte';
  import EditTransaction from '$lib/components/shared/EditTransaction.svelte';
  import Modal from '$lib/components/shared/Modal.svelte';
  import MonthPicker from '$lib/components/shared/MonthPicker.svelte';
  import { currentMonthTransactions, buckets } from '$lib/stores/budgetStore';
  import { openModal } from '$lib/stores/uiStore';
  import type { Transaction } from '$lib/types';

  let filterBucketId = '';
  let editingTransaction: Transaction | null = null;

  function handleEdit(transaction: Transaction) {
    editingTransaction = transaction;
    openModal('edit-transaction');
  }

  $: filteredTransactions = filterBucketId
    ? $currentMonthTransactions.filter((t) => t.bucketId === filterBucketId)
    : $currentMonthTransactions;

  $: sortedTransactions = [...filteredTransactions].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
</script>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <h1 class="page-title">Transactions</h1>
    <MonthPicker />
  </div>

  <div class="flex gap-3">
    <select bind:value={filterBucketId} class="select-base max-w-[200px]">
      <option value="">All Buckets</option>
      {#each $buckets as bucket}
        <option value={bucket.id}>{bucket.name}</option>
      {/each}
    </select>

    <button class="btn-primary" on:click={() => openModal('add-transaction')}>
      + Add
    </button>
  </div>

  {#if sortedTransactions.length === 0}
    <div class="card py-12 text-center text-muted">No transactions this month</div>
  {:else}
    <div class="space-y-2">
      {#each sortedTransactions as transaction (transaction.id)}
        <TransactionRow {transaction} onEdit={handleEdit} />
      {/each}
    </div>
  {/if}
</div>

<Modal id="add-transaction" title="Add Transaction">
  <QuickEntry />
</Modal>

<Modal id="edit-transaction" title="Edit Transaction">
  {#if editingTransaction}
    {#key editingTransaction.id}
      <EditTransaction transaction={editingTransaction} />
    {/key}
  {/if}
</Modal>
