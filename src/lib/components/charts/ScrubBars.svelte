<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { barCap, heightsFrom } from '$lib/charts/scale';
  import { scrub } from '$lib/charts/scrub';
  import { highlightIndex } from '$lib/charts/highlight';

  // Bars you can press and slide across. The bars are pale and one is in the
  // accent: the latest so far, or the one under your finger, with its value
  // in a bubble above it. A bar far taller than the rest is capped and
  // marked; future days are drawn empty; a dashed line can mark the average.

  export let values: number[];
  export let axis: [string, string];
  export let label: string; // what the chart shows, for screen readers
  export let avg: number | null = null;
  export let futureFrom: number | null = null;
  export let color = 'rgb(var(--c-tint))';
  export let height = 170;
  // Writes a bar's value for its bubble while scrubbing.
  export let format: ((v: number) => string) | null = null;

  const dispatch = createEventDispatcher<{ scrub: { index: number }; scrubend: null }>();

  let hot = -1;
  $: cap = barCap(avg ? [...values, avg] : values);
  $: heights = heightsFrom(values, cap);
  $: lit = highlightIndex(values, hot, futureFrom);
  // The bubble's place, kept inside the chart at either edge.
  $: bubbleLeft = Math.min(88, Math.max(12, ((hot + 0.5) / Math.max(1, values.length)) * 100));
</script>

<div class="relative">
  <div
    class="bars relative flex items-end gap-1 px-1"
    style:height="{height}px"
    role="img"
    aria-label={label}
    use:scrub={{ count: values.length, onIndex: (i) => { hot = i; dispatch('scrub', { index: i }); }, onEnd: () => { hot = -1; dispatch('scrubend', null); } }}
  >
    {#each heights as h, i (i)}
      {@const future = futureFrom !== null && i >= futureFrom}
      <div class="flex h-full flex-1 items-end">
        <span
          class="bar block w-full rounded-t-[4px] rounded-b-[2px]"
          class:capped={values[i] > cap}
          style:background={future ? 'rgb(var(--c-fill) / var(--fill-alpha))' : i === lit ? color : 'rgb(var(--c-label-2) / 0.22)'}
          style:height="100%"
          style:transform="scaleY({future ? 0.02 : Math.max(0.02, h)})"
          style:transition-delay="{Math.round((i * 300) / Math.max(1, values.length))}ms"
        ></span>
      </div>
    {/each}
    {#if hot >= 0 && format}
      <span class="bubble money amt pointer-events-none absolute -translate-x-1/2 rounded-full bg-surface px-2.5 py-1 text-[12px] font-semibold text-label" style:left="{bubbleLeft}%" style:bottom="{Math.min(height - 22, Math.max(0.02, heights[hot] ?? 0) * height + 8)}px">{format(values[hot] ?? 0)}</span>
    {/if}
    {#if avg}
      <div class="avg pointer-events-none absolute inset-x-0 border-t-[1.5px] border-dashed border-label-2/60" style:bottom="{Math.min(1, avg / cap) * height}px">
        <span class="absolute -top-[19px] right-0 rounded bg-page px-1 text-[11px] text-label-2">average</span>
      </div>
    {/if}
  </div>
  <div class="mt-1.5 flex justify-between px-1 text-[11px] text-label-2"><span>{axis[0]}</span><span>{axis[1]}</span></div>
</div>

<style>
  .bar {
    transform-origin: bottom;
    transition: transform 0.6s var(--ease-smooth, ease-out), opacity 0.2s;
    min-height: 2px;
    position: relative;
  }

  .bubble {
    box-shadow: 0 4px 14px -4px rgb(0 0 0 / 0.25);
  }

  .bar.capped::after {
    content: '';
    position: absolute;
    left: -2px;
    right: -2px;
    top: 14px;
    height: 3px;
    background: rgb(var(--c-page));
    transform: skewY(-18deg);
  }

  .avg {
    transition: bottom 0.6s var(--ease-smooth, ease-out);
  }

  :global(.rm) .bar,
  :global(.rm) .avg {
    transition: none;
  }
</style>
