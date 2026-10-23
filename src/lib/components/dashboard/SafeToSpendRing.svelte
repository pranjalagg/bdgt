<script lang="ts">
  import { onMount } from 'svelte';
  import { formatCurrency, splitFraction } from '$lib/utils/currency';

  // The number this app exists to answer: what is free to spend today. The
  // ring is how much of this month's everyday money is still left; the
  // figure in the middle is that money spread over the days remaining.

  export let perDay: number; // cents
  export let left: number; // everyday money left this month, cents
  export let pool: number; // everyday money this month (assigned plus carried over), cents
  export let daysLeft: number;
  export let pending = 0; // payments waiting for review, already counted

  const R = 92;
  const C = 2 * Math.PI * R;

  $: share = pool > 0 ? Math.min(Math.max(left / pool, 0), 1) : 0;
  $: [whole, cents] = splitFraction(formatCurrency(perDay));
  $: over = perDay < 0;

  // The arc draws in once when the dashboard first appears.
  let drawn = false;
  onMount(() => requestAnimationFrame(() => (drawn = true)));
</script>

<section class="card flex flex-col items-center px-5 pb-6 pt-5" aria-labelledby="safe-to-spend-label">
  <div class="relative aspect-square w-full max-w-[16rem]">
    <svg class="h-full w-full -rotate-90" viewBox="0 0 220 220" aria-hidden="true">
      <circle cx="110" cy="110" r={R} fill="none" stroke-width="12" class="stroke-raised dark:stroke-raised-dark" />
      <circle
        cx="110"
        cy="110"
        r={R}
        fill="none"
        stroke-width="12"
        stroke-linecap="round"
        stroke-dasharray={C}
        stroke-dashoffset={drawn ? C * (1 - share) : C}
        class="ring-arc {over ? 'stroke-danger dark:stroke-danger-light' : 'stroke-gray-950 dark:stroke-white'}"
        style:opacity={share > 0 ? 1 : 0}
      />
    </svg>

    <div class="absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
      <p class="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-200">
        <span id="safe-to-spend-label">Safe to spend</span>
        <slot name="info" />
      </p>
      <p class="display amt mt-1 text-[40px] font-semibold leading-none tracking-tight {over ? 'text-danger dark:text-danger-light' : 'text-gray-950 dark:text-white'}">
        {whole}<span class="text-[22px]">{cents}</span>
      </p>
      <p class="mt-1.5 text-sm font-semibold {over ? 'text-danger dark:text-danger-light' : 'text-success dark:text-success-light'}">per day</p>
      <p class="mt-3 rounded-full bg-raised px-3 py-1 text-xs font-medium text-gray-700 dark:bg-raised-dark dark:text-gray-200">
        {daysLeft} day{daysLeft === 1 ? '' : 's'} left
      </p>
    </div>
  </div>

  <p class="mt-1 text-center text-[13px] text-muted dark:text-muted-dark">
    <span class="money amt">{formatCurrency(left)}</span> left in everyday envelopes{#if pending > 0}, including
      <span class="money amt">{formatCurrency(pending)}</span> waiting for review{/if}
  </p>
</section>

<style>
  @media (prefers-reduced-motion: no-preference) {
    .ring-arc {
      transition: stroke-dashoffset 900ms cubic-bezier(0.2, 0, 0, 1);
    }
  }
</style>
