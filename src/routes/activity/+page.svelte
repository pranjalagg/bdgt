<script lang="ts">
  import { slide } from 'svelte/transition';
  import { page } from '$app/stores';
  import { base } from '$app/paths';
  import NavBar from '$lib/components/layout/NavBar.svelte';
  import MonthMenu from '$lib/components/layout/MonthMenu.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import IconMark from '$lib/components/ui/IconMark.svelte';
  import SwipeRow from '$lib/components/activity/SwipeRow.svelte';
  import TransactionRow from '$lib/components/activity/TransactionRow.svelte';
  import TransactionSheet from '$lib/components/activity/TransactionSheet.svelte';
  import MoveSheet from '$lib/components/activity/MoveSheet.svelte';
  import FilterChips from '$lib/components/activity/FilterChips.svelte';
  import { currentMonthTransactions, transactions, buckets, deleteTransaction, restoreTransaction } from '$lib/stores/budgetStore';
  import { captures, pendingCaptures } from '$lib/stores/captureStore';
  import { baseCurrency } from '$lib/stores/currencyStore';
  import { openModal, currentMonthKey, today } from '$lib/stores/uiStore';
  import { showToast } from '$lib/stores/toastStore';
  import { UNSORTED_BUCKET_ID } from '$lib/utils/unsorted';
  import { groupTransactionsByDay } from '$lib/utils/calculations';
  import { formatCurrency } from '$lib/utils/currency';
  import { parseMonthKey } from '$lib/utils/dates';
  import { captureIdOf, recordedDiffers } from '$lib/capture/queue';
  import { haptic } from '$lib/ui/haptics';
  import type { Transaction } from '$lib/types';

  // Every expense this month by day, newest first. Search, filter by
  // envelope, swipe left to delete or right to move, tap to edit.

  // A link can choose a chip (?bucket=…), as Home's Unsorted card does.
  let filter = '';
  let lastParam: string | null = null;
  $: {
    const param = $page.url.searchParams.get('bucket') ?? '';
    if (param !== lastParam) {
      lastParam = param;
      filter = param;
    }
  }

  let query = '';
  let editing: Transaction | null = null;
  let moving: Transaction | null = null;

  $: bucketById = new Map($buckets.map((b) => [b.id, b]));
  $: savingsIds = new Set($buckets.filter((b) => b.isSavings).map((b) => b.id));
  $: envelopes = $buckets.filter((b) => !b.isSystem);
  $: hasUnsorted = $transactions.some((t) => t.bucketId === UNSORTED_BUCKET_ID);
  $: captureById = new Map($captures.map((c) => [c.id, c]));

  // Unsorted ignores the month: they are spread across whenever the old
  // envelope was used, and the point is to clear them all.
  $: source = filter === UNSORTED_BUCKET_ID ? $transactions : $currentMonthTransactions;
  $: needle = query.trim().toLowerCase();
  $: filtered = source.filter((t) => {
    if (filter === 'auto' ? !captureIdOf(t.id) : filter && t.bucketId !== filter) return false;
    if (!needle) return true;
    // Free text over the note and the envelope's name.
    return (t.note ?? '').toLowerCase().includes(needle) || (bucketById.get(t.bucketId)?.name ?? '').toLowerCase().includes(needle);
  });
  $: days = groupTransactionsByDay(filtered, savingsIds);
  $: spent = days.reduce((sum, d) => sum + d.total, 0);
  $: setAside = days.reduce((sum, d) => sum + d.setAside, 0);
  $: monthName = parseMonthKey($currentMonthKey).toLocaleDateString('en-US', { month: 'long' });

  const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  function dayLabel(d: Date, now: Date) {
    if (sameDay(d, now)) return 'Today';
    if (sameDay(d, new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))) return 'Yesterday';
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function tagOf(t: Transaction): 'Auto' | 'Recurring' | null {
    return captureIdOf(t.id) ? 'Auto' : t.recurringId ? 'Recurring' : null;
  }
  function partOf(t: Transaction): number | null {
    const id = captureIdOf(t.id);
    const c = id ? captureById.get(id) : undefined;
    return c && c.currency === $baseCurrency && recordedDiffers(c, t, $baseCurrency) ? c.amount : null;
  }

  function open(t: Transaction) {
    editing = t;
    openModal('edit-transaction');
  }

  async function remove(t: Transaction) {
    haptic('warning');
    await deleteTransaction(t.id);
    showToast({ message: `Deleted ${formatCurrency(t.amount)}`, action: { label: 'Undo', run: () => restoreTransaction(t) } });
  }

  function move(t: Transaction) {
    moving = t;
    openModal('move-transaction');
  }

  const reduced = () => typeof document !== 'undefined' && document.documentElement.classList.contains('rm');
</script>

<NavBar title="Activity">
  <svelte:fragment slot="leading"><MonthMenu /></svelte:fragment>
</NavBar>

<div class="space-y-5">
  <div class="relative">
    <span class="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-label-2"><Icon name="search" size={18} /></span>
    <input type="search" bind:value={query} placeholder="Search" aria-label="Search expenses" class="h-11 w-full rounded-full bg-fill pl-10 pr-4 text-[16px] text-label placeholder:text-label-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-tint" />
  </div>

  <FilterChips selected={filter} {envelopes} {hasUnsorted} on:change={(e) => (filter = e.detail)} />

  {#if $pendingCaptures.length > 0}
    <a href="{base}/review" class="row row-tap focus:outline-none focus-visible:ring-2 focus-visible:ring-tint">
      <IconMark icon="inbox" />
      <span class="t-row min-w-0 flex-1">{$pendingCaptures.length} {$pendingCaptures.length === 1 ? 'payment' : 'payments'} <span class="font-medium text-label-2">to review</span></span>
      <span class="text-label-2" aria-hidden="true"><Icon name="chevron-right" size={18} /></span>
    </a>
  {/if}

  {#if days.length === 0}
    <p class="py-12 text-center text-[15px] text-label-2">
      {query || filter ? 'Nothing matches.' : `No expenses in ${monthName} yet. Log one with +.`}
    </p>
  {:else}
    <p class="text-[13px] text-label-2">
      {filtered.length} {filtered.length === 1 ? 'expense' : 'expenses'}{filter === UNSORTED_BUCKET_ID ? ', all months' : ` in ${monthName}`} ·
      <span class="money amt">{formatCurrency(spent)}</span> spent{#if setAside > 0}{' · '}<span class="money amt text-success">{formatCurrency(setAside)}</span> set aside{/if}
    </p>

    {#each days as day (day.key)}
      <section aria-labelledby="day-{day.key}" class="pt-2">
        <div class="flex items-baseline justify-between gap-4 pb-1">
          <h2 id="day-{day.key}" class="text-[15px] font-semibold text-label">{dayLabel(day.date, $today)}</h2>
          <span class="money amt text-[13px] text-label-2">{formatCurrency(day.total)}</span>
        </div>
        <div class="list">
          {#each day.transactions as t (t.id)}
            <div out:slide={{ duration: reduced() ? 0 : 220 }}>
              <SwipeRow label={t.note || bucketById.get(t.bucketId)?.name || 'expense'} onDelete={() => remove(t)} onMove={() => move(t)}>
                <TransactionRow transaction={t} bucket={bucketById.get(t.bucketId)} tag={tagOf(t)} partOf={partOf(t)} onOpen={() => open(t)} />
              </SwipeRow>
            </div>
          {/each}
        </div>
      </section>
    {/each}
  {/if}
</div>

<TransactionSheet transaction={editing} />
<MoveSheet transaction={moving} />
