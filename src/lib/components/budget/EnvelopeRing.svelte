<script lang="ts">
  import { onMount } from 'svelte';
  import { formatCurrency } from '$lib/utils/currency';
  import type { BucketStatus } from '$lib/types';

  // How much of this month's money is left, as a ring that draws in. A
  // savings envelope shows what was set aside, with a full ring.

  export let status: BucketStatus;

  const R = 92;
  const C = 2 * Math.PI * R;
  $: ({ bucket, allocated, spent, rollover, remaining } = status);
  $: available = allocated + rollover;
  $: share = bucket.isSavings ? 1 : available > 0 ? Math.min(1, Math.max(0, remaining) / available) : 0;
  let drawn = false;
  onMount(() => requestAnimationFrame(() => (drawn = true)));
  const whole = (c: number) => formatCurrency(c).replace(/\.00$/, '');
</script>

<div class="relative mx-auto h-[210px] w-[210px]">
  <svg viewBox="0 0 210 210" class="h-full w-full -rotate-90" aria-hidden="true">
    <circle cx="105" cy="105" r={R} fill="none" stroke-width="14" stroke="rgb(var(--c-fill) / var(--fill-alpha))" />
    <circle class="arc" cx="105" cy="105" r={R} fill="none" stroke-width="14" stroke-linecap="round" stroke={bucket.color} stroke-dasharray={C} stroke-dashoffset={drawn ? C * (1 - share) : C} style:opacity={share > 0 ? 1 : 0} />
  </svg>
  <div class="absolute inset-0 grid place-content-center gap-0.5 text-center">
    {#if bucket.isSavings}
      <span class="figure amt text-[36px] text-success">{whole(spent)}</span>
      <span class="text-[13px] text-label-2">set aside this month</span>
    {:else}
      <span class="figure amt text-[36px] {remaining < 0 ? 'text-danger' : 'text-label'}">{whole(Math.abs(remaining))}</span>
      <span class="text-[13px] {remaining < 0 ? 'text-danger' : 'text-label-2'}">{remaining < 0 ? 'over this month' : 'left this month'}</span>
    {/if}
  </div>
</div>

<style>
  @media (prefers-reduced-motion: no-preference) {
    .arc {
      transition: stroke-dashoffset 1s var(--ease-smooth, ease-out);
    }
  }
</style>
