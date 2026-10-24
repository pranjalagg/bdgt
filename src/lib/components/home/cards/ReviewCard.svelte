<script lang="ts">
  import { base } from '$app/paths';
  import { pendingCaptures, pendingTotal } from '$lib/stores/captureStore';
  import { formatCurrency } from '$lib/utils/currency';
  import IconMark from '$lib/components/ui/IconMark.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';

  // Payments the phone noticed, as a quiet card with a hint of the stack
  // behind it: tap to swipe through them in Review.

  $: count = $pendingCaptures.length;
</script>

{#if count}
  <a href="{base}/review" class="stack relative block pb-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-tint" aria-label="{count} {count === 1 ? 'payment' : 'payments'} to review">
    {#if count > 1}<span class="layer" aria-hidden="true"></span>{/if}
    <span class="card relative flex items-center gap-3.5 p-4" style="--mark-ring: rgb(var(--c-surface))">
      <IconMark icon="inbox" />
      <span class="min-w-0 flex-1">
        <span class="t-row block">{count} {count === 1 ? 'payment' : 'payments'} <span class="font-medium text-label-2">to review</span></span>
        <span class="amt block text-[13px] text-label-2">{formatCurrency($pendingTotal)} noticed on your phone</span>
      </span>
      <span class="text-label-2" aria-hidden="true"><Icon name="chevron-right" size={18} /></span>
    </span>
  </a>
{/if}

<style>
  .stack .layer {
    position: absolute;
    left: 16px;
    right: 16px;
    bottom: 0;
    height: 24px;
    border-radius: 20px;
    background: rgb(var(--c-surface));
    opacity: 0.55;
    box-shadow: var(--shadow-card);
  }
</style>
