<script lang="ts">
  import { fitText } from '$lib/ui/fit';
  import RollingNumber from '$lib/components/ui/RollingNumber.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import { formatCurrency, splitFraction } from '$lib/utils/currency';

  // The figure Home exists for. Its label, amount and the line under it
  // change while the pace chart is scrubbed.

  export let label: string;
  // The quiet end of the label: "Safe to spend today".
  export let soft = '';
  export let amount: number; // cents
  export let pill: { good: boolean; text: string } | null = null;
  export let sub = '';

  $: [whole, cents] = splitFraction(formatCurrency(amount));
</script>

<section class="pt-2" aria-label="Safe to spend">
  <p class="flex items-center gap-1.5 text-[17px] font-semibold text-label">
    <span>{label}{#if soft}{' '}<span class="font-medium text-label-2">{soft}</span>{/if}</span>
    <slot name="info" />
  </p>
  <p class="t-figure amt mt-3 text-label" use:fitText={{ text: whole + cents, max: 56, min: 32 }}>
    <RollingNumber text={whole} /><span class="cents"><RollingNumber text={cents} /></span>
  </p>
  <p class="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[15px] text-label-2">
    {#if pill}
      <span class="amt pill {pill.good ? 'pill-good' : 'pill-bad'}">
        <Icon name={pill.good ? 'arrow-down' : 'arrow-up'} size={14} strokeWidth={2.4} />{pill.text}
      </span>
    {/if}
    {#if sub}<span class="amt">{sub}</span>{/if}
  </p>
</section>

<style>
  /* Cents half size and quiet, as in the references ("$8,822.89"). */
  .cents {
    font-size: 0.5em;
    color: rgb(var(--c-label-2));
    font-weight: 600;
    margin-left: 0.04em;
  }
</style>
