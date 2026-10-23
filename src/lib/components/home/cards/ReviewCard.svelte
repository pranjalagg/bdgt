<script lang="ts">
  import { base } from '$app/paths';
  import { pendingCaptures, pendingTotal, suggestions } from '$lib/stores/captureStore';
  import { buckets } from '$lib/stores/budgetStore';
  import { formatCurrency, formatMoney } from '$lib/utils/currency';
  import Icon from '$lib/components/ui/Icon.svelte';

  // Payments the phone noticed, as a small stack of cards: tap to swipe
  // through them in Review.

  $: first = $pendingCaptures[0];
  $: suggested = first ? $suggestions.get(first.id) : null;
  $: suggestedName = suggested ? $buckets.find((b) => b.id === suggested.bucketId)?.name : null;
</script>

{#if first}
  <a href="{base}/review" class="stack relative mb-4 block focus:outline-none focus-visible:ring-2 focus-visible:ring-tint" aria-label="{$pendingCaptures.length} {$pendingCaptures.length === 1 ? 'payment' : 'payments'} to review">
    {#if $pendingCaptures.length > 2}<span class="layer l2" aria-hidden="true"></span>{/if}
    {#if $pendingCaptures.length > 1}<span class="layer" aria-hidden="true"></span>{/if}
    <span class="card relative grid gap-3 p-4">
      <span class="flex items-center gap-3">
        <span class="flex h-9 w-9 flex-none items-center justify-center rounded-[11px] bg-label text-page"><Icon name="inbox" size={19} /></span>
        <span class="min-w-0 flex-1">
          <span class="flex items-center gap-2 text-[16px] font-semibold text-label">Payments to review <span class="rounded-full bg-danger px-1.5 text-[12px] font-bold leading-5 text-white dark:text-black">{$pendingCaptures.length}</span></span>
          <span class="amt block text-[13px] text-label-2">{formatCurrency($pendingTotal)} noticed on your phone</span>
        </span>
        <span class="text-label-2/60"><Icon name="chevron-right" size={18} /></span>
      </span>
      <span class="flex items-center gap-3 rounded-[14px] bg-page px-3 py-2.5 dark:bg-raised">
        <span class="min-w-0 flex-1">
          <span class="block truncate text-[15px] font-medium text-label">{first.merchant}</span>
          <span class="block text-[13px] text-label-2">{suggestedName ? `${suggestedName}, suggested` : 'Needs an envelope'}</span>
        </span>
        <span class="money amt text-[15px] font-semibold text-label">{formatMoney(first.amount, first.currency)}</span>
      </span>
    </span>
  </a>
{/if}

<style>
  .stack .layer {
    position: absolute;
    left: 14px;
    right: 14px;
    bottom: -8px;
    height: 30px;
    border-radius: 22px;
    background: rgb(var(--c-surface));
    opacity: 0.6;
    box-shadow: var(--shadow-card);
  }

  .stack .layer.l2 {
    left: 28px;
    right: 28px;
    bottom: -16px;
    opacity: 0.32;
  }
</style>
