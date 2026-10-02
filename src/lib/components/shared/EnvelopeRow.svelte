<script lang="ts">
  // The card IS the meter. Fill is the bucket's own color at low opacity,
  // draining left to right as the envelope is spent, so a row's state
  // reads before any number does.
  import { formatCurrency } from '$lib/utils/currency';
  import type { BucketStatus } from '$lib/types';

  export let status: BucketStatus;
  export let onClick: (() => void) | undefined = undefined;

  $: ({ bucket, allocated, spent, rollover, remaining } = status);
  // The meter and sub-line judge THIS month against this month's plan;
  // rollover (past under/overspend) only moves the big "left" figure, so
  // old damage never hides whether the current month is on track.
  $: available = allocated;
  $: monthLeft = allocated - spent;
  // Spend beyond the envelope still caps the fill at 100% — the overspend
  // is carried by the figure turning brick, not by a bar that lies.
  $: fillPct = available > 0 ? Math.min(Math.max(spent, 0) / available, 1) * 100 : spent > 0 ? 100 : 0;
  $: isOver = remaining < 0;
  $: isEmpty = remaining === 0 && available > 0;
  $: unfunded = allocated + rollover === 0 && spent === 0;
</script>

<button
  type="button"
  on:click={onClick}
  class="group relative w-full overflow-hidden rounded border border-border bg-white px-3.5 py-2.5
         text-left transition-colors hover:border-rule focus:outline-none focus-visible:ring-2
         focus-visible:ring-primary dark:border-border-dark dark:bg-surface-dark dark:hover:border-white/20"
>
  <!-- Fades out at the leading edge so the meter reads as a level, not as
       a second block of color with a hard seam down the middle. -->
  <span
    class="pointer-events-none absolute inset-y-0 left-0 transition-[width] duration-500 ease-out"
    style="width:{fillPct}%;
           background:linear-gradient(90deg,{bucket.color} 0%,{bucket.color} 72%,transparent 100%);
           opacity:.16"
    aria-hidden="true"
  ></span>

  <span class="relative grid grid-cols-[1fr_auto_2.6rem] items-center gap-x-3 gap-y-0.5">
    <span class="flex items-center gap-2.5 text-[13.5px] font-medium text-gray-900 dark:text-gray-100">
      <span class="h-4 w-[3px] flex-none rounded-sm" style="background:{bucket.color}"></span>
      {bucket.name}
    </span>

    <!-- Figure and its unit are separate cells so the amounts form a real
         column; baking " left" into the string breaks the alignment mono
         is here to provide. -->
    <span
      class="money text-right text-[13px] font-medium
             {isOver ? 'text-danger dark:text-danger-light' : 'text-gray-900 dark:text-gray-100'}"
    >
      {#if unfunded}
        &mdash;
      {:else}
        {formatCurrency(Math.abs(remaining))}
      {/if}
    </span>
    <span class="text-[11.5px] text-muted dark:text-muted-dark">
      {#if unfunded}
        <!-- The sub-line already says "Nothing assigned yet"; repeating it
             here only overflows the column. -->
      {:else if isOver}
        <span class="text-danger dark:text-danger-light">over</span>
      {:else}
        left
      {/if}
    </span>

    <span class="text-[11.5px] text-muted dark:text-muted-dark">
      {#if unfunded}
        Nothing assigned yet
      {:else if spent === 0}
        Nothing spent yet
      {:else}
        <span class="money">{formatCurrency(Math.max(spent, 0))}</span> of
        <span class="money">{formatCurrency(available)}</span> spent this month
      {/if}
    </span>

    <span class="money text-right text-[11.5px] text-muted dark:text-muted-dark">
      {#if !unfunded && available > 0}
        {Math.round(fillPct)}%
      {/if}
    </span>
    <span aria-hidden="true"></span>

    {#if rollover !== 0 && allocated > 0}
      <!-- Past months are a balance to work down, not a verdict on this one. -->
      <span class="col-span-3 text-[11.5px] text-muted dark:text-muted-dark">
        <span class="font-medium {monthLeft >= 0 ? 'text-success dark:text-success-light' : 'text-danger dark:text-danger-light'}">
          {monthLeft >= 0 ? 'On plan this month' : 'Over plan this month'}
        </span>
        &middot; <span class="money">{formatCurrency(Math.abs(monthLeft))}</span> {monthLeft >= 0 ? 'left' : 'over'}
        &middot; {rollover > 0 ? '+' : '−'}<span class="money">{formatCurrency(Math.abs(rollover))}</span> carried from earlier
      </span>
    {/if}
  </span>
</button>
