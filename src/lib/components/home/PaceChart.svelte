<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { scrub } from '$lib/charts/scrub';
  import { linear, linePath } from '$lib/charts/scale';

  // Everyday spending added up through the month (solid, filled) against
  // the plan spread evenly (dashed). Press and slide to read any day.

  export let cumulative: number[]; // day 1..n, cents
  export let planTotal: number;
  export let daysInMonth: number;
  export let showToday = true;

  const dispatch = createEventDispatcher<{ scrub: { day: number }; scrubend: null }>();
  const H = 150;
  const PAD = 20;
  let width = 390;
  let hot = 0;

  $: last = cumulative.length;
  $: top = Math.max(planTotal, cumulative[last - 1] ?? 0, 1) * 1.05;
  $: x = linear([1, daysInMonth], [PAD, width - PAD]);
  $: y = linear([0, top], [H - 10, 12]);
  $: points = cumulative.map((v, i) => [x(i + 1), y(v)] as [number, number]);
  $: line = linePath(points);
  $: area = points.length ? `${line} L${points[points.length - 1][0]} ${H - 10} L${points[0][0]} ${H - 10} Z` : '';
  $: end = points[points.length - 1];

  function onIndex(i: number) {
    hot = Math.min(last, i + 1);
    dispatch('scrub', { day: hot });
  }
</script>

<div
  class="pace relative -mx-4 sm:-mx-6"
  bind:clientWidth={width}
  style:height="{H}px"
  role="img"
  aria-label="Everyday spending so far this month against the plan"
  use:scrub={{ count: daysInMonth, onIndex, onEnd: () => { hot = 0; dispatch('scrubend', null); } }}
>
  <svg viewBox="0 0 {width} {H}" width="100%" height={H} class="overflow-visible" aria-hidden="true">
    <defs>
      <linearGradient id="pace-fill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="rgb(var(--c-tint))" stop-opacity="0.22" />
        <stop offset="1" stop-color="rgb(var(--c-tint))" stop-opacity="0" />
      </linearGradient>
    </defs>
    <line x1={x(1)} y1={y(0)} x2={x(daysInMonth)} y2={y(planTotal)} stroke="rgb(var(--c-label-2))" stroke-opacity="0.6" stroke-width="1.5" stroke-dasharray="3 5" stroke-linecap="round" />
    {#if points.length}
      <path d={area} fill="url(#pace-fill)" />
      <path class="spend" d={line} pathLength="1" fill="none" stroke="rgb(var(--c-tint))" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
      {#if hot}
        <line x1={x(hot)} x2={x(hot)} y1="4" y2={H - 10} stroke="rgb(var(--c-label-2))" stroke-width="1" />
        <circle cx={x(hot)} cy={y(cumulative[hot - 1])} r="6" fill="rgb(var(--c-tint))" stroke="rgb(var(--c-page))" stroke-width="3" />
      {:else if showToday && end}
        <circle class="pulse" cx={end[0]} cy={end[1]} r="5" fill="rgb(var(--c-tint))" />
        <circle cx={end[0]} cy={end[1]} r="5" fill="rgb(var(--c-tint))" stroke="rgb(var(--c-page))" stroke-width="2.5" />
      {/if}
    {/if}
  </svg>
  <div class="absolute inset-x-5 -bottom-4 flex justify-between text-[11px] text-label-2" aria-hidden="true">
    <span>1</span><span>{showToday ? 'Today' : ''}</span><span>{daysInMonth}</span>
  </div>
</div>

<style>
  @media (prefers-reduced-motion: no-preference) {
    .spend {
      stroke-dasharray: 1;
      stroke-dashoffset: 1;
      animation: pace-draw 1.1s cubic-bezier(0.2, 0, 0, 1) 0.15s forwards;
    }

    .pulse {
      transform-box: fill-box;
      transform-origin: center;
      animation: pace-pulse 2.4s ease-out infinite;
    }
  }

  @keyframes pace-draw {
    to {
      stroke-dashoffset: 0;
    }
  }

  @keyframes pace-pulse {
    0% {
      transform: scale(1);
      opacity: 0.5;
    }
    70%,
    100% {
      transform: scale(3.2);
      opacity: 0;
    }
  }
</style>
