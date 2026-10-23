<script lang="ts">
  import RollingNumber from '$lib/components/ui/RollingNumber.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import { formatCurrency, splitFraction } from '$lib/utils/currency';

  // The figure Home exists for. Its label, amount and the line under it
  // change while the pace chart is scrubbed.

  export let label: string;
  export let amount: number; // cents
  export let pill: { good: boolean; text: string } | null = null;
  export let sub = '';

  $: [whole, cents] = splitFraction(formatCurrency(amount));
</script>

<section class="pt-1" aria-label="Safe to spend">
  <p class="flex items-center gap-1.5 text-[15px] font-semibold text-label-2">
    <span>{label}</span>
    <slot name="info" />
  </p>
  <p class="figure amt mt-1.5 text-[60px] text-label" style="letter-spacing: -0.04em">
    <RollingNumber text={whole} /><span class="text-[30px]"><RollingNumber text={cents} /></span>
  </p>
  <p class="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[15px] text-label-2">
    {#if pill}
      <span class="amt inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[13px] font-semibold {pill.good ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'}">
        <Icon name={pill.good ? 'arrow-down' : 'arrow-up'} size={14} strokeWidth={2.4} />{pill.text}
      </span>
    {/if}
    {#if sub}<span class="amt">{sub}</span>{/if}
  </p>
</section>
