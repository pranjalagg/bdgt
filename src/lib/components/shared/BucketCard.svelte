<script lang="ts">
  import { formatCurrency } from '$lib/utils/currency';
  import { getBucketStatus } from '$lib/utils/calculations';
  import ProgressBar from './ProgressBar.svelte';
  import type { BucketStatus } from '$lib/types';

  export let status: BucketStatus;
  export let onClick: (() => void) | undefined = undefined;
  export let fixedIncome: number = 0;

  $: ({ bucket, allocated, spent, rollover, remaining } = status);
  $: incomePercent = fixedIncome > 0 && spent > 0
    ? (Math.max(spent, 0) / fixedIncome * 100).toFixed(1)
    : null;
  $: budgetStatus = getBucketStatus(allocated, spent);
  $: remainingColor = {
    success: 'text-success',
    warning: 'text-warning',
    danger: 'text-danger',
    credit: 'text-primary',
  }[budgetStatus];
</script>

<button
  class="card w-full p-5 text-left transition-all hover:border-primary/30 hover:shadow-sm"
  on:click={onClick}
  type="button"
>
  <div class="mb-3 flex items-center gap-2.5">
    <span class="h-3.5 w-3.5 rounded-full ring-2 ring-white dark:ring-surface-dark" style="background-color: {bucket.color}"></span>
    <h3 class="font-semibold text-gray-800 dark:text-gray-100">{bucket.name}</h3>
  </div>

  <div class="mb-1 flex items-center justify-between text-xs tabular-nums">
    <span class="text-muted">{formatCurrency(Math.max(spent, 0))} spent</span>
    <span class="font-medium text-gray-600 dark:text-gray-300">{formatCurrency(allocated)}</span>
  </div>
  <ProgressBar {allocated} {spent} showLabel={false} />

  {#if spent < 0}
    <div class="mt-2.5 flex items-center gap-1.5">
      <span class="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
        ↩ {formatCurrency(Math.abs(spent))} owed back
      </span>
    </div>
  {/if}

  <div class="mt-3">
    <p class="metric-label">Remaining</p>
    <p class="font-semibold tabular-nums {remainingColor}">{formatCurrency(remaining)}</p>
    {#if incomePercent}
      <p class="mt-0.5 text-xs text-muted">{incomePercent}% of fixed income</p>
    {/if}
  </div>

  {#if rollover !== 0}
    <p class="mt-2 text-xs text-muted">Rollover: {formatCurrency(rollover)}</p>
  {/if}
</button>
