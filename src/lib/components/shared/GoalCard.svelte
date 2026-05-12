<script lang="ts">
  import { formatCurrency } from '$lib/utils/currency';
  import type { GoalStatusInfo } from '$lib/stores/goalsStore';

  export let status: GoalStatusInfo;
  export let onClick: (() => void) | undefined = undefined;

  $: statusStyle = {
    completed: 'bg-success/10 text-success',
    'on-track': 'bg-success/10 text-success',
    behind: 'bg-warning/10 text-warning',
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
  class="card w-full p-5 text-left transition-all hover:border-primary/30 hover:shadow-sm"
  on:click={onClick}
  type="button"
>
  <div class="mb-3 flex items-center justify-between">
    <div class="flex items-center gap-2.5">
      {#if status.bucket}
        <span class="h-3.5 w-3.5 rounded-full ring-2 ring-white dark:ring-surface-dark" style="background-color: {status.bucket.color}"></span>
      {/if}
      <h3 class="font-semibold text-gray-800 dark:text-gray-100">{status.goal.name}</h3>
    </div>
    <span class="rounded-full px-2.5 py-0.5 text-xs font-medium {statusStyle}">{statusLabel}</span>
  </div>

  <div class="mb-3 h-2.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700/50">
    <div class="h-full rounded-full bg-primary transition-all duration-300" style="width: {status.progress * 100}%"></div>
  </div>

  <div class="flex justify-between text-sm">
    <div>
      <p class="metric-label">Saved</p>
      <p class="font-semibold tabular-nums text-gray-800 dark:text-gray-100">{formatCurrency(status.currentAmount)}</p>
    </div>
    <div class="text-right">
      <p class="metric-label">Target</p>
      <p class="tabular-nums text-gray-700 dark:text-gray-300">{formatCurrency(status.goal.targetAmount)}</p>
    </div>
  </div>

  {#if status.status !== 'completed'}
    <div class="mt-2.5 text-xs text-muted">
      {#if status.goal.targetDate}
        Need {formatCurrency(status.monthlyNeeded)}/month to reach goal by {formatDate(status.goal.targetDate)}
      {:else if status.projectedDate}
        At {formatCurrency(status.goal.monthlyContribution || 0)}/month, goal reached by {formatDate(status.projectedDate)}
      {/if}
    </div>
  {/if}
</button>
