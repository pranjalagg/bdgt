<script lang="ts">
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
  <p class="text-[15px] font-semibold text-label-2">{label}</p>
  <p class="figure amt mt-1 text-[44px] leading-none text-label" style="letter-spacing: -0.035em">
    <RollingNumber text={whole} />{#if frac}<span class="text-[22px]"><RollingNumber text={frac} /></span>{/if}
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
