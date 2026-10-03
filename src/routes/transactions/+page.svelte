<script lang="ts">
  import EditTransaction from '$lib/components/shared/EditTransaction.svelte';
  import Modal from '$lib/components/shared/Modal.svelte';
  import MonthPicker from '$lib/components/shared/MonthPicker.svelte';
  import { page } from '$app/stores';
  import { currentMonthTransactions, transactions, buckets, deleteTransaction } from '$lib/stores/budgetStore';
  import { UNSORTED_BUCKET_ID } from '$lib/utils/unsorted';
  import { groupTransactionsByDay } from '$lib/utils/calculations';
  import { formatCurrency } from '$lib/utils/currency';
  import { openModal, openLog } from '$lib/stores/uiStore';
  import type { Transaction } from '$lib/types';

  // Arrives from the dashboard's "needs a bucket" banner.
  let filterBucketId = $page.url.searchParams.get('bucket') ?? '';
  let query = '';
  let editingTransaction: Transaction | null = null;

  function handleEdit(transaction: Transaction) {
    editingTransaction = transaction;
    openModal('edit-transaction');
  }

  async function handleDelete(t: Transaction) {
    if (!confirm(`Delete this ${formatCurrency(t.amount)} transaction?`)) return;
    await deleteTransaction(t.id);
  }

  $: bucketById = new Map($buckets.map((b) => [b.id, b]));
  $: savingsBucketIds = new Set($buckets.filter((b) => b.isSavings).map((b) => b.id));

  // Unsorted ignores the month: they are spread across whenever the old
  // bucket was used, and the point is to clear them all.
  $: source = filterBucketId === UNSORTED_BUCKET_ID ? $transactions : $currentMonthTransactions;

  $: filtered = source.filter((t) => {
    if (filterBucketId && t.bucketId !== filterBucketId) return false;
    if (!query.trim()) return true;
    // Free-text over note and bucket name — "what did I spend at Costco"
    // was impossible with a bucket-only filter.
    const needle = query.trim().toLowerCase();
    const note = (t.note ?? '').toLowerCase();
    const bucketName = (bucketById.get(t.bucketId)?.name ?? '').toLowerCase();
    return note.includes(needle) || bucketName.includes(needle);
  });

  $: days = groupTransactionsByDay(filtered, savingsBucketIds);
  $: monthSpent = days.reduce((sum, d) => sum + d.total, 0);
  $: monthSetAside = days.reduce((sum, d) => sum + d.setAside, 0);

  const dayLabel = (d: Date) =>
    d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'long' });
</script>

<div class="space-y-5">
  <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
    <h1 class="page-title">Transactions</h1>
    <MonthPicker />
  </div>

  <div class="flex flex-wrap items-center gap-2">
    <div class="relative min-w-[180px] flex-1">
      <svg
        class="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted dark:text-muted-dark"
        viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        type="search"
        bind:value={query}
        placeholder="Search notes and buckets"
        aria-label="Search transactions"
        class="input-base pl-8"
      />
    </div>
    <select bind:value={filterBucketId} class="select-base max-w-[190px]" aria-label="Filter by bucket">
      <option value="">All buckets</option>
      {#each $buckets as bucket}
        <option value={bucket.id}>{bucket.name}</option>
      {/each}
    </select>
    <button class="btn-primary" on:click={() => openLog()}>Add</button>
  </div>

  {#if days.length === 0}
    <div class="card px-5 py-12 text-center">
      <p class="text-sm text-muted dark:text-muted-dark">
        {#if query || filterBucketId}
          Nothing matches that filter this month.
        {:else}
          No transactions yet this month. Add one and it lands here.
        {/if}
      </p>
    </div>
  {:else}
    <!-- The column gets a sum. -->
    <div class="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-border pb-2 dark:border-border-dark">
      <span class="eyebrow">{filtered.length} transaction{filtered.length === 1 ? '' : 's'}</span>
      <span class="text-sm text-muted dark:text-muted-dark">
        <span class="money font-semibold text-gray-900 dark:text-gray-50">{formatCurrency(monthSpent)}</span> spent
        {#if monthSetAside > 0}
          &middot; <span class="money font-semibold text-success dark:text-success-light">{formatCurrency(monthSetAside)}</span> set aside
        {/if}
      </span>
    </div>

    <div>
      {#each days as day (day.key)}
        <div class="flex items-baseline justify-between gap-4 border-b border-border pb-1.5 pt-5 dark:border-border-dark">
          <h2 class="eyebrow">{dayLabel(day.date)}</h2>
          <span class="money text-xs text-muted dark:text-muted-dark">{formatCurrency(day.total)}</span>
        </div>

        {#each day.transactions as t (t.id)}
          {@const bucket = bucketById.get(t.bucketId)}
          {@const isSetAside = savingsBucketIds.has(t.bucketId)}
          <div
            class="group grid grid-cols-[3px_1fr_auto_auto] items-center gap-x-3 border-b border-border
                   py-2 dark:border-border-dark"
          >
            <span class="h-7 w-[3px] rounded-sm" style="background:{bucket?.color ?? '#cbd4c9'}"></span>

            <div class="min-w-0">
              <p class="truncate text-[13.5px] leading-tight text-gray-900 dark:text-gray-100">
                {t.note || bucket?.name || 'Transaction'}
              </p>
              <p class="truncate text-[11.5px] text-muted dark:text-muted-dark">
                {bucket?.name ?? 'Unknown bucket'}{#if bucket?.isSystem}<span class="ml-1 text-warning">· needs a bucket, tap edit</span>{/if}{#if isSetAside}<span class="ml-1 text-success dark:text-success-light">· set aside</span>{/if}
              </p>
            </div>

            <span
              class="money text-[13.5px] font-medium
                     {isSetAside ? 'text-success dark:text-success-light' : 'text-gray-900 dark:text-gray-100'}"
            >
              {formatCurrency(t.amount)}
            </span>

            <!-- Controls stay keyboard-reachable; they only fade in on
                 hover for pointer users. -->
            <span class="flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
              <button class="btn-icon !p-1.5" on:click={() => handleEdit(t)} aria-label="Edit transaction">
                <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
              </button>
              <button
                class="btn-icon !p-1.5 hover:!bg-danger/10 hover:!text-danger"
                on:click={() => handleDelete(t)}
                aria-label="Delete transaction"
              >
                <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
              </button>
            </span>
          </div>
        {/each}
      {/each}
    </div>
  {/if}
</div>

<Modal id="edit-transaction" title="Edit Transaction">
  {#if editingTransaction}
    {#key editingTransaction.id}
      <EditTransaction transaction={editingTransaction} />
    {/key}
  {/if}
</Modal>
