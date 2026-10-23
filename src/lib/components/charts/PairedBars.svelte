<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { scrub } from '$lib/charts/scrub';

  // Two bars per month side by side (income and spending, or two
  // envelopes in a pattern). Press and slide to read a month.

  export let a: { color: string; values: number[] };
  export let b: { color: string; values: number[] };
  export let months: string[];
  export let label: string;
  export let height = 196;
  export let interactive = true;

  const dispatch = createEventDispatcher<{ scrub: { index: number }; scrubend: null }>();
  let hot = -1;
  $: top = Math.max(1, ...a.values, ...b.values) * 1.08;
  const h = (v: number) => Math.max(0, Math.min(1, v / top));
  const noop = { count: 0, onIndex: () => {}, onEnd: () => {} };
</script>

<div
  class="flex items-end gap-2 px-1"
  style:height="{height}px"
  role="img"
  aria-label={label}
  use:scrub={interactive ? { count: months.length, onIndex: (i) => { hot = i; dispatch('scrub', { index: i }); }, onEnd: () => { hot = -1; dispatch('scrubend', null); } } : noop}
>
  {#each months as _, i}
    <div class="flex h-full flex-1 items-end justify-center gap-[3px]" class:dim={hot >= 0 && hot !== i}>
      <span class="bar w-[40%] rounded-t-[5px]" style:background={a.color} style:height="100%" style:transform="scaleY({h(a.values[i])})" style:transition-delay="{i * 50}ms"></span>
      <span class="bar w-[40%] rounded-t-[5px]" style:background={b.color} style:height="100%" style:transform="scaleY({h(b.values[i])})" style:transition-delay="{i * 50 + 25}ms"></span>
    </div>
  {/each}
</div>
<div class="mt-1.5 flex justify-around text-[11px] text-label-2">
  {#each months as m}<span>{m}</span>{/each}
</div>

<style>
  .bar {
    transform-origin: bottom;
    transition: transform 0.6s var(--ease-smooth, ease-out);
    min-height: 2px;
  }

  .dim {
    opacity: 0.35;
  }

  :global(.rm) .bar {
    transition: none;
  }
</style>
