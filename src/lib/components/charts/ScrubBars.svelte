<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { barCap, heightsFrom } from '$lib/charts/scale';
  import { scrub } from '$lib/charts/scrub';

  // Bars you can press and slide across. A bar far taller than the rest is
  // capped and marked; future days are drawn empty; an optional dashed line
  // marks the average.

  export let values: number[];
  export let axis: [string, string];
  export let label: string; // what the chart shows, for screen readers
  export let avg: number | null = null;
  export let futureFrom: number | null = null;
  export let color = 'rgb(var(--c-tint))';
  export let height = 170;

  const dispatch = createEventDispatcher<{ scrub: { index: number }; scrubend: null }>();

  let hot = -1;
  $: cap = barCap(avg ? [...values, avg] : values);
  $: heights = heightsFrom(values, cap);
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
          class:dim={hot >= 0 && hot !== i}
          class:capped={values[i] > cap}
          style:background={future ? 'rgb(var(--c-fill) / var(--fill-alpha))' : color}
          style:height="100%"
          style:transform="scaleY({future ? 0.02 : Math.max(0.02, h)})"
          style:transition-delay="{Math.round((i * 300) / Math.max(1, values.length))}ms"
        ></span>
      </div>
    {/each}
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

  .bar.dim {
    opacity: 0.35;
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
