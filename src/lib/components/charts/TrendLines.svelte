<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { linear, linePath } from '$lib/charts/scale';
  import { scrub } from '$lib/charts/scrub';

  // One line per series across months, the newest point marked. Press and
  // slide to read a month. Missing values (null) break the line.

  export let series: { id: string; color: string; values: (number | null)[]; hidden?: boolean }[];
  export let months: string[];
  export let label: string;
  export let min: number | null = null;
  export let max: number | null = null;
  export let avg: number | null = null;
  export let height = 196;

  const dispatch = createEventDispatcher<{ scrub: { index: number }; scrubend: null }>();
  let width = 358;
  let hot = -1;

  $: shown = series.filter((s) => !s.hidden);
  $: all = shown.flatMap((s) => s.values.filter((v): v is number => v !== null));
  $: lo = min ?? Math.min(0, ...all);
  $: hi = Math.max(max ?? -Infinity, ...all, avg ?? -Infinity) * 1.08 || 1;
  $: slot = width / Math.max(1, months.length);
  $: x = (i: number) => i * slot + slot / 2;
  $: y = linear([lo, hi], [height - 6, 16]);
  $: segments = (values: (number | null)[]) => {
    const runs: [number, number][][] = [[]];
    values.forEach((v, i) => (v === null ? runs.push([]) : runs[runs.length - 1].push([x(i), y(v)])));
    return runs.filter((r) => r.length > 0);
  };
</script>

<div
  class="relative"
  bind:clientWidth={width}
  style:height="{height}px"
  role="img"
  aria-label={label}
  use:scrub={{ count: months.length, onIndex: (i) => { hot = i; dispatch('scrub', { index: i }); }, onEnd: () => { hot = -1; dispatch('scrubend', null); } }}
>
  <svg viewBox="0 0 {width} {height}" width="100%" height={height} class="overflow-visible" aria-hidden="true">
    {#if avg !== null}
      <line x1="0" x2={width} y1={y(avg)} y2={y(avg)} stroke="rgb(var(--c-label-2))" stroke-opacity="0.6" stroke-width="1.5" stroke-dasharray="4 5" />
    {/if}
    {#each shown as s (s.id)}
      {#each segments(s.values) as run}
        <path class="line" d={linePath(run)} pathLength="1" fill="none" stroke={s.color} stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
      {/each}
      {#each s.values as v, i}
        {#if v !== null}
          <circle cx={x(i)} cy={y(v)} r={i === s.values.length - 1 || i === hot ? 4.5 : 3} fill={s.color} stroke="rgb(var(--c-page))" stroke-width="2" />
        {/if}
      {/each}
    {/each}
    {#if hot >= 0}
      <line x1={x(hot)} x2={x(hot)} y1="6" y2={height - 6} stroke="rgb(var(--c-label-2))" stroke-width="1" />
    {/if}
  </svg>
</div>
<div class="mt-1.5 flex justify-around text-[11px] text-label-2">
  {#each months as m}<span>{m}</span>{/each}
</div>

<style>
  @media (prefers-reduced-motion: no-preference) {
    .line {
      stroke-dasharray: 1;
      stroke-dashoffset: 1;
      animation: draw-line 1s cubic-bezier(0.2, 0, 0, 1) 0.1s forwards;
    }
  }

  @keyframes draw-line {
    to {
      stroke-dashoffset: 0;
    }
  }
</style>
