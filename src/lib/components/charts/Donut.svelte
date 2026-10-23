<script lang="ts">
  import { donutSegments } from '$lib/charts/scale';

  // Slices as dashes on a ring; hiding one lets the others grow into its
  // place. The figure in the middle is passed in.

  export let slices: { id: string; color: string; value: number; hidden?: boolean }[];
  export let label: string;
  export let size = 184;

  const R = 66;
  const C = 2 * Math.PI * R;
  $: segments = donutSegments(slices.map((s) => (s.hidden ? 0 : s.value)), C, 3);
</script>

<div class="relative mx-auto" style:width="{size}px" style:height="{size}px" role="img" aria-label={label}>
  <svg viewBox="0 0 184 184" class="h-full w-full -rotate-90" aria-hidden="true">
    <circle cx="92" cy="92" r={R} fill="none" stroke="rgb(var(--c-fill) / var(--fill-alpha))" stroke-width="24" />
    {#each slices as s, i (s.id)}
      <circle class="seg" cx="92" cy="92" r={R} fill="none" stroke={s.color} stroke-width="24" stroke-dasharray="{segments[i].length} {C}" stroke-dashoffset={segments[i].offset} />
    {/each}
  </svg>
  <div class="absolute inset-0 grid place-content-center text-center">
    <slot />
  </div>
</div>

<style>
  .seg {
    transition: stroke-dasharray 0.6s var(--ease-smooth, ease-out), stroke-dashoffset 0.6s var(--ease-smooth, ease-out);
  }

  :global(.rm) .seg {
    transition: none;
  }
</style>
