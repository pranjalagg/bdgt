<script lang="ts">
  import { formatCurrency, splitFraction } from '$lib/utils/currency';

  // A bright summary tile: a title, a figure and what the figure means.
  // Always dark text on the tile colour (measured at 6.9:1 or better).

  export let tone: 'bills' | 'saved';
  export let title: string;
  export let caption: string;
  export let amount: number; // cents
  export let href: string | undefined = undefined;
  export let onClick: (() => void) | undefined = undefined;

  $: [whole, cents] = splitFraction(formatCurrency(amount));

  const base =
    'pressable flex min-h-[9.5rem] flex-col justify-between rounded-2xl p-4 text-left text-tile-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:focus-visible:ring-offset-background-dark';
  $: fill = tone === 'bills' ? 'bg-tile-bills' : 'bg-tile-saved';
</script>

{#if href}
  <a {href} class="{base} {fill}">
    <span class="flex items-start justify-between gap-2">
      <span class="text-[15px] font-semibold leading-snug">{title}</span>
      <span class="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-black/10" aria-hidden="true"><slot name="icon" /></span>
    </span>
    <span>
      <span class="block text-[13px] font-medium opacity-80">{caption}</span>
      <span class="display amt block text-[24px] font-semibold leading-tight tracking-tight">{whole}<span class="text-[15px]">{cents}</span></span>
    </span>
  </a>
{:else}
  <button type="button" on:click={onClick} class="{base} {fill}">
    <span class="flex items-start justify-between gap-2">
      <span class="text-[15px] font-semibold leading-snug">{title}</span>
      <span class="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-black/10" aria-hidden="true"><slot name="icon" /></span>
    </span>
    <span>
      <span class="block text-[13px] font-medium opacity-80">{caption}</span>
      <span class="display amt block text-[24px] font-semibold leading-tight tracking-tight">{whole}<span class="text-[15px]">{cents}</span></span>
    </span>
  </button>
{/if}
