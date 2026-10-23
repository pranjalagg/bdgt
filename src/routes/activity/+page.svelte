<script lang="ts">
  import NavBar from '$lib/components/layout/NavBar.svelte';
  import EditTransaction from '$lib/components/shared/EditTransaction.svelte';
  import Modal from '$lib/components/shared/Modal.svelte';
  import MonthPicker from '$lib/components/shared/MonthPicker.svelte';
  import ReviewBanner from '$lib/components/shared/ReviewBanner.svelte';
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { currentMonthTransactions, transactions, buckets } from '$lib/stores/budgetStore';
  import { UNSORTED_BUCKET_ID } from '$lib/utils/unsorted';
  import { groupTransactionsByDay } from '$lib/utils/calculations';
  import { formatCurrency, formatMoney, splitFraction } from '$lib/utils/currency';
  import { parseMonthKey } from '$lib/utils/dates';
  import { baseCurrency } from '$lib/stores/currencyStore';
  import { shouldShowForeignNote } from '$lib/currency/conversion';
  import { openModal, currentMonthKey, today } from '$lib/stores/uiStore';
  import { captures } from '$lib/stores/captureStore';
  import { captureIdOf, recordedDiffers } from '$lib/capture/queue';
  import type { Transaction } from '$lib/types';

  // Arrives from the dashboard's "needs a bucket" banner.
  let filterBucketId = $page.url.searchParams.get('bucket') ?? '';
  let query = '';
  let editingTransaction: Transaction | null = null;

  function handleEdit(transaction: Transaction) {
    editingTransaction = transaction;
    openModal('edit-transaction');
  }

  // Arriving with a bucket picked (from the dashboard), its chip may sit
  // past the right edge; bring it into view.
  let chipRow: HTMLDivElement | undefined;
  onMount(() => chipRow?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest' }));

  $: bucketById = new Map($buckets.map((b) => [b.id, b]));
  $: savingsBucketIds = new Set($buckets.filter((b) => b.isSavings).map((b) => b.id));

  // Unsorted ignores the month: they are spread across whenever the old
  // bucket was used, and the point is to clear them all.
  // The payment behind each transaction approved from Review.
  $: captureById = new Map($captures.map((c) => [c.id, c]));
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

  $: [spentWhole, spentCents] = splitFraction(formatCurrency(monthSpent));
  $: spentLabel =
    filterBucketId === UNSORTED_BUCKET_ID
      ? 'Spent, all months'
      : `Spent in ${parseMonthKey($currentMonthKey).toLocaleDateString('en-US', { month: 'long' })}`;

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  function dayLabel(d: Date, now: Date) {
    if (sameDay(d, now)) return 'Today';
    if (sameDay(d, new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))) return 'Yesterday';
    return d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'long' });
  }

  // First character, not first code unit, so a name that starts with an
  // emoji keeps it whole.
  const initial = (name: string | undefined) => (name ? Array.from(name)[0].toUpperCase() : '?');
</script>

<NavBar title="Activity" />

<div class="space-y-4">
  <MonthPicker />

  <ReviewBanner />

  <div class="relative">
    <svg
      class="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted dark:text-muted-dark"
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
      class="input-base !rounded-full pl-11"
    />
  </div>

  <!-- Bleeds to the screen edge on phones, so chips scroll out from under
       the margin instead of being cut at it. Wider screens wrap them: a
       mouse wheel can't scroll sideways. -->
  <div bind:this={chipRow} class="scroll-row -mx-4 px-4 py-1 sm:-mx-6 sm:px-6 md:flex-wrap md:overflow-visible" role="group" aria-label="Filter by bucket">
    <button type="button" class="chip" aria-pressed={filterBucketId === ''} on:click={() => (filterBucketId = '')}>All</button>
    {#each $buckets as bucket (bucket.id)}
      <button
        type="button"
        class="chip"
        aria-pressed={filterBucketId === bucket.id}
        on:click={() => (filterBucketId = filterBucketId === bucket.id ? '' : bucket.id)}
      >
        <span class="h-2.5 w-2.5 flex-none rounded-full" style="background:{bucket.color}" aria-hidden="true"></span>
        {bucket.name}
      </button>
    {/each}
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
    <div class="px-1 pt-1">
      <p class="text-sm font-medium text-muted dark:text-muted-dark">{spentLabel}</p>
      <p class="display amt mt-0.5 text-[32px] font-semibold leading-tight tracking-tight text-gray-950 dark:text-white">
        {spentWhole}<span class="text-[20px]">{spentCents}</span>
      </p>
      <p class="mt-0.5 text-sm text-muted dark:text-muted-dark">
        {filtered.length} transaction{filtered.length === 1 ? '' : 's'}{#if monthSetAside > 0}{' '}&middot;
          <span class="money amt font-medium text-success dark:text-success-light">{formatCurrency(monthSetAside)}</span> set aside{/if}
      </p>
    </div>

    {#each days as day (day.key)}
      <section aria-labelledby="day-{day.key}">
        <div class="flex items-baseline justify-between gap-4 px-1 pb-2 pt-3">
          <h2 id="day-{day.key}" class="eyebrow">{dayLabel(day.date, $today)}</h2>
          <span class="money text-[13px] text-muted dark:text-muted-dark amt">{formatCurrency(day.total)}</span>
        </div>

        <div class="card overflow-hidden">
          {#each day.transactions as t, i (t.id)}
            {@const bucket = bucketById.get(t.bucketId)}
            {@const isSetAside = savingsBucketIds.has(t.bucketId)}
            {@const capture = captureIdOf(t.id) ? captureById.get(captureIdOf(t.id) ?? '') : undefined}
            {@const partOf = capture && capture.currency === $baseCurrency && recordedDiffers(capture, t, $baseCurrency) ? capture.amount : null}
            <!-- The whole row opens the edit sheet; delete lives there. -->
            <button
              type="button"
              data-row
              on:click={() => handleEdit(t)}
              class="relative flex w-full items-center gap-3 px-4 py-3 text-left transition-colors
                     hover:bg-black/[0.02] active:bg-black/[0.05] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary
                     dark:hover:bg-white/[0.03] dark:active:bg-white/[0.06]"
            >
              {#if i > 0}
                <span class="pointer-events-none absolute left-[4.25rem] right-0 top-0 h-px bg-border dark:bg-border-dark" aria-hidden="true"></span>
              {/if}

              <!-- The bucket's colour, tinted, behind an ink initial: legible
                   whatever colour the bucket was given. -->
              <span class="relative flex h-10 w-10 flex-none items-center justify-center overflow-hidden rounded-full" aria-hidden="true">
                <span class="absolute inset-0 opacity-25 dark:opacity-35" style="background:{bucket?.color ?? '#cbd4c9'}"></span>
                <span class="relative text-[15px] font-semibold text-gray-900 dark:text-white">{initial(bucket?.name)}</span>
              </span>

              <span class="min-w-0 flex-1">
                <span class="flex min-w-0 items-center gap-1.5 text-[15px] font-medium leading-snug text-gray-950 dark:text-gray-50">
                  <span class="truncate">{t.note || bucket?.name || 'Transaction'}</span>
                  <!-- Added without typing: approved from Review, or made by a recurring item. -->
                  {#if captureIdOf(t.id)}
                    <span class="flex-none rounded-full bg-raised px-1.5 py-px text-[10.5px] font-semibold uppercase tracking-wide text-gray-700 dark:bg-raised-dark dark:text-gray-200" title={capture ? `Added from ${capture.sourceLabel}` : 'Added from a payment notification'}>Auto</span>
                  {:else if t.recurringId}
                    <span class="flex-none rounded-full bg-raised px-1.5 py-px text-[10.5px] font-semibold uppercase tracking-wide text-gray-700 dark:bg-raised-dark dark:text-gray-200" title="Added by a recurring item">Recurring</span>
                  {/if}
                </span>
                <span class="block truncate text-[13px] text-muted dark:text-muted-dark">
                  {bucket?.name ?? 'Unknown bucket'}{#if bucket?.isSystem}<span class="ml-1 text-warning">· needs a bucket, tap to pick one</span>{/if}{#if isSetAside}<span class="ml-1 text-success dark:text-success-light">· set aside</span>{/if}{#if t.foreign && shouldShowForeignNote(t.foreign, $baseCurrency)}<span class="amt ml-1">· {formatMoney(t.foreign.amount, t.foreign.currency)} @ {t.foreign.rate}</span>{/if}
                </span>
              </span>

              <span class="flex-none text-right">
                <span class="money amt block text-[15px] font-semibold {isSetAside ? 'text-success dark:text-success-light' : 'text-gray-950 dark:text-gray-50'}">
                  {formatCurrency(t.amount)}
                </span>
                <!-- Only part of the payment was this person's (a shared bill). -->
                {#if partOf !== null}
                  <span class="money amt block text-[12px] text-muted dark:text-muted-dark">of {formatCurrency(partOf)}</span>
                {/if}
              </span>
            </button>
          {/each}
        </div>
      </section>
    {/each}
  {/if}
</div>

<Modal id="edit-transaction" title="Edit Transaction">
  {#if editingTransaction}
    {#key editingTransaction.id}
      <EditTransaction transaction={editingTransaction} />
    {/key}
  {/if}
</Modal>
