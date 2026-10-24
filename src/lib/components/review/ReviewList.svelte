<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { buckets, transactions } from '$lib/stores/budgetStore';
  import { baseCurrency } from '$lib/stores/currencyStore';
  import { recordedDiffers } from '$lib/capture/queue';
  import { formatCurrency, formatMoney } from '$lib/utils/currency';
  import type { Capture } from '$lib/types';

  // Payments already decided: approved in the last week, or dismissed.
  // Either can go back to review.

  export let captures: Capture[];
  export let status: 'approved' | 'dismissed';

  const dispatch = createEventDispatcher<{ reopen: string }>();
  $: bucketById = new Map($buckets.map((b) => [b.id, b]));

  // "Into Dining Out", plus what went into the budget when that is not
  // simply the amount paid (part of a shared bill, or converted).
  function approvedText(c: Capture): string {
    const tx = $transactions.find((t) => t.id === c.transactionId);
    if (!tx) return 'Approved';
    const into = `Into ${bucketById.get(tx.bucketId)?.name ?? 'an envelope'}`;
    return recordedDiffers(c, tx, $baseCurrency) ? `${into} · recorded ${formatCurrency(tx.amount)}` : into;
  }
</script>

{#if status === 'approved'}
  <p class="px-1 text-[13px] text-label-2">The last 7 days. Older ones are in Activity like any other expense.</p>
{/if}
{#if captures.length === 0}
  <p class="py-12 text-center text-[15px] text-label-2">Nothing here.</p>
{:else}
  <div class="list">
    {#each captures as c (c.id)}
      <div class="row">
        <span class="min-w-0 flex-1">
          <span class="t-row block truncate">{c.merchant}</span>
          <span class="amt block truncate text-[13px] text-label-2">{status === 'approved' ? approvedText(c) : 'Dismissed'} · {formatMoney(c.amount, c.currency)}</span>
        </span>
        <button type="button" class="flex-none rounded-full bg-surface px-3.5 py-2 text-[13px] font-semibold text-tint shadow-[var(--shadow-card)] focus:outline-none focus-visible:ring-2 focus-visible:ring-tint" on:click={() => dispatch('reopen', c.id)}>Back to review</button>
      </div>
    {/each}
  </div>
{/if}
