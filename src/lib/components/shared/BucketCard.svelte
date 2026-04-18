<script lang="ts">
  import { formatCurrency } from '$lib/utils/currency';
  import { getBucketStatus } from '$lib/utils/calculations';
  import ProgressBar from './ProgressBar.svelte';
  import type { BucketStatus } from '$lib/types';

  export let status: BucketStatus;
  export let onClick: (() => void) | undefined = undefined;

  $: ({ bucket, allocated, spent, rollover, remaining } = status);
  $: budgetStatus = getBucketStatus(allocated, spent);
  $: remainingColor = {
    success: 'text-success',
    warning: 'text-warning',
    danger: 'text-danger',
  }[budgetStatus];
</script>

<button
  class="w-full rounded-lg bg-white p-4 text-left shadow transition hover:shadow-md dark:bg-surface-dark"
  on:click={onClick}
  type="button"
>
  <div class="mb-2 flex items-center gap-2">
    <span class="h-3 w-3 rounded-full" style="background-color: {bucket.color}" />
    <h3 class="font-medium text-gray-800 dark:text-gray-100">{bucket.name}</h3>
  </div>

  <ProgressBar {allocated} {spent} showLabel={false} />

  <div class="mt-3 flex justify-between text-sm">
    <div>
      <p class="text-gray-500 dark:text-gray-400">Remaining</p>
      <p class="font-semibold {remainingColor}">{formatCurrency(remaining)}</p>
    </div>
    <div class="text-right">
      <p class="text-gray-500 dark:text-gray-400">Spent</p>
      <p class="text-gray-700 dark:text-gray-200">{formatCurrency(spent)}</p>
    </div>
  </div>

  {#if rollover !== 0}
    <p class="mt-2 text-xs text-gray-400 dark:text-gray-500">Rollover: {formatCurrency(rollover)}</p>
  {/if}
</button>
