<script lang="ts">
  import { fitText } from '$lib/ui/fit';
  import RollingNumber from '$lib/components/ui/RollingNumber.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import { formatCurrency, splitFraction } from '$lib/utils/currency';

  // A chart's headline figure: a label, the number (rolling as you scrub),
  // and a line under it, sometimes led by an up/down pill.

  export let label: string;
  export let cents: number | null = null;
  // A figure that isn't money (a percentage).
  export let text: string | null = null;
  export let pill: { good: boolean; up: boolean; text: string } | null = null;
  export let sub = '';

  $: [whole, frac] = text !== null ? [text, ''] : splitFraction(formatCurrency(cents ?? 0));
</script>

<div>
  <p class="text-[17px] font-semibold text-label">{label}</p>
  <p class="t-figure amt mt-3 text-label" use:fitText={{ text: whole + frac, max: 48, min: 26 }}>
    <RollingNumber text={whole} />{#if frac}<span class="cents"><RollingNumber text={frac} /></span>{/if}
  </p>
  {#if pill || sub}
    <p class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] text-label-2">
      {#if pill}
        <span class="amt pill {pill.good ? 'pill-good' : 'pill-bad'}">
          <Icon name={pill.up ? 'arrow-up' : 'arrow-down'} size={14} strokeWidth={2.4} />{pill.text}
        </span>
      {/if}
      {#if sub}<span class="amt">{sub}</span>{/if}
    </p>
  {/if}
</div>

<style>
  .cents {
    font-size: 0.5em;
    color: rgb(var(--c-label-2));
    font-weight: 600;
    margin-left: 0.04em;
  }
</style>
