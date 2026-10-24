<script lang="ts">
  import { segmentedPill } from '$lib/actions/segmentedPill';
  import Donut from '$lib/components/charts/Donut.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import ThresholdSheet from './ThresholdSheet.svelte';
  import { currentMonthFixedIncome } from '$lib/stores/budgetStore';
  import { openModal } from '$lib/stores/uiStore';
  import { bigSmall } from '$lib/insights/trends';
  import { formatCurrency } from '$lib/utils/currency';
  import { haptic } from '$lib/ui/haptics';
  import type { Bucket } from '$lib/types';

  // Big and small spending: an envelope is big when its month's total
  // reaches the threshold ($500 unless changed, for this visit). One donut
  // at a time; tapping a legend row hides its slice.

  export let rows: { bucket: Bucket; cents: number }[];

  let threshold = 50000;
  let view: 'big' | 'small' = 'big';
  let hidden = new Set<string>();

  $: split = bigSmall(rows.map((r) => ({ ...r, id: r.bucket.id })), threshold);
  $: all = split.bigTotal + split.smallTotal;
  $: group = view === 'big' ? split.big : split.small;
  $: groupTotal = view === 'big' ? split.bigTotal : split.smallTotal;
  // A new group or threshold shows every slice again.
  $: if (view || threshold) hidden = new Set();
  $: shownTotal = group.filter((g) => !hidden.has(g.id)).reduce((s, g) => s + g.cents, 0);
  const pct = (part: number, whole: number, digits = 0) => (whole > 0 ? ((part / whole) * 100).toFixed(digits) : (0).toFixed(digits));
  const whole = (c: number) => formatCurrency(c).replace(/\.00$/, '');

  function toggle(id: string) {
    const next = new Set(hidden);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    hidden = next;
    haptic('selection');
  }
</script>

<div class="card grid gap-3 p-4">
  <div class="flex items-center justify-between gap-3">
    <span class="text-[15px] text-label-2">Big means</span>
    <button type="button" class="flex h-9 items-center gap-1 rounded-full bg-fill px-3 text-[15px] font-semibold text-label focus:outline-none focus-visible:ring-2 focus-visible:ring-tint" on:click={() => openModal('threshold')}>
      <span class="amt">{whole(threshold)} or more</span><Icon name="chevron-down" size={14} strokeWidth={2.4} />
    </button>
  </div>

  <div class="flex h-3 gap-0.5 overflow-hidden rounded-full bg-fill" aria-hidden="true">
    {#if split.bigTotal > 0}<span class="bar bg-tint" style:flex-grow={split.bigTotal}></span>{/if}
    {#if split.smallTotal > 0}<span class="bar bg-tint/35" style:flex-grow={split.smallTotal}></span>{/if}
  </div>
  <div class="flex justify-between gap-3 text-[13px] text-label-2">
    <span class="amt flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-full bg-tint" aria-hidden="true"></span>Big {pct(split.bigTotal, all)}% · {whole(split.bigTotal)}</span>
    <span class="amt flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-full bg-tint/35" aria-hidden="true"></span>Small {pct(split.smallTotal, all)}% · {whole(split.smallTotal)}</span>
  </div>

  <div class="segmented" role="tablist" aria-label="Show" use:segmentedPill>
    <button type="button" role="tab" aria-selected={view === 'big'} class="segment" on:click={() => (view = 'big')}>Big</button>
    <button type="button" role="tab" aria-selected={view === 'small'} class="segment" on:click={() => (view = 'small')}>Small</button>
  </div>

  {#if group.length}
    <Donut slices={group.map((g) => ({ id: g.id, color: g.bucket.color, value: g.cents, hidden: hidden.has(g.id) }))} label="{view === 'big' ? 'Big' : 'Small'} purchases by envelope, {whole(shownTotal)} shown">
      <span class="money amt text-[24px] font-bold tracking-tight text-label">{whole(shownTotal)}</span>
      <span class="text-[13px] text-label-2">{view} purchases</span>
    </Donut>
    <div class="-mx-4 -mb-4">
      {#each group as g (g.id)}
        {@const on = !hidden.has(g.id)}
        <button type="button" class="leg group-row flex min-h-[50px] w-full items-center gap-2.5 px-4 py-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-tint" class:off={!on} style="--row-inset: 40px; --c: {g.bucket.color}" aria-pressed={on} on:click={() => toggle(g.id)}>
          <span class="dot h-3 w-3 flex-none rounded-full" aria-hidden="true"></span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-[15px] text-label">{g.bucket.name}</span>
            <span class="block text-[12px] text-label-2">{pct(g.cents, groupTotal)}% of {view}{#if $currentMonthFixedIncome > 0} · {pct(g.cents, $currentMonthFixedIncome, 1)}% of income{/if}</span>
          </span>
          <span class="money amt flex-none text-[15px] font-semibold text-label">{formatCurrency(g.cents)}</span>
        </button>
      {/each}
    </div>
  {:else}
    <p class="py-6 text-center text-[15px] text-label-2">No {view} purchases this month.</p>
  {/if}
</div>

<ThresholdSheet bind:threshold />

<style>
  .bar {
    transition: flex-grow 0.6s var(--ease-smooth, ease-out);
  }

  .leg {
    transition: opacity 0.2s;
  }

  .leg .dot {
    background: var(--c);
    transition: background-color 0.2s, box-shadow 0.2s;
  }

  .leg.off {
    opacity: 0.5;
  }

  .leg.off .dot {
    background: transparent;
    box-shadow: inset 0 0 0 2px var(--c);
  }
</style>
