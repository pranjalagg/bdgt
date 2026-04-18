<script lang="ts">
  import { formatCurrency } from '$lib/utils/currency';
  import type { GoalStatusInfo } from '$lib/stores/goalsStore';

  export let status: GoalStatusInfo;
  export let onClick: (() => void) | undefined = undefined;

  $: statusColor = {
    completed: 'text-success',
    'on-track': 'text-success',
    behind: 'text-warning',
  }[status.status];

  $: statusLabel = {
    completed: 'Completed!',
    'on-track': 'On track',
    behind: 'Behind',
  }[status.status];

  function formatDate(date: Date | null): string {
    if (!date) return '';
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }
</script>

<button
  class="w-full rounded-lg bg-white dark:bg-surface-dark p-4 text-left shadow transition hover:shadow-md"
  on:click={onClick}
  type="button"
>
  <div class="mb-2 flex items-center justify-between">
    <div class="flex items-center gap-2">
      {#if status.bucket}
        <span class="h-3 w-3 rounded-full" style="background-color: {status.bucket.color}" />
      {/if}
      <h3 class="font-medium text-gray-800 dark:text-gray-100">{status.goal.name}</h3>
    </div>
    <span class="text-sm font-medium {statusColor}">{statusLabel}</span>
  </div>

  <div class="mb-2 h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
    <div class="h-full rounded-full bg-primary transition-all" style="width: {status.progress * 100}%" />
  </div>

  <div class="flex justify-between text-sm">
    <div>
      <p class="text-gray-500 dark:text-gray-400">Saved</p>
      <p class="font-semibold text-gray-800 dark:text-gray-100">{formatCurrency(status.currentAmount)}</p>
    </div>
    <div class="text-right">
      <p class="text-gray-500 dark:text-gray-400">Target</p>
      <p class="text-gray-700 dark:text-gray-300">{formatCurrency(status.goal.targetAmount)}</p>
    </div>
  </div>

  {#if status.status !== 'completed'}
    <div class="mt-2 text-xs text-gray-500 dark:text-gray-400">
      {#if status.goal.targetDate}
        Need {formatCurrency(status.monthlyNeeded)}/month to reach goal by {formatDate(status.goal.targetDate)}
      {:else if status.projectedDate}
        At {formatCurrency(status.goal.monthlyContribution || 0)}/month, goal reached by {formatDate(status.projectedDate)}
      {/if}
    </div>
  {/if}
</button>
