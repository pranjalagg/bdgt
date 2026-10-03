<script lang="ts">
  // Same object as an envelope row: the card is the meter, filled with the
  // linked bucket's own color, so a goal and its bucket read as one family
  // instead of two different widgets.
  import { formatCurrency } from '$lib/utils/currency';
  import type { GoalStatusInfo } from '$lib/stores/goalsStore';

  export let status: GoalStatusInfo;
  export let onClick: (() => void) | undefined = undefined;

  $: color = status.bucket?.color ?? '#94a3b8';
  $: pct = Math.min(Math.max(status.progress, 0), 1) * 100;

  $: statusLabel = {
    completed: 'Completed',
    'on-track': 'On track',
    behind: 'Behind',
  }[status.status];

  $: statusColor = status.status === 'behind'
    ? 'text-warning'
    : 'text-success dark:text-success-light';

  function formatDate(date: Date | null): string {
    if (!date) return '';
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }
</script>

<button
  type="button"
  on:click={onClick}
  disabled={!onClick}
  class="group relative w-full overflow-hidden rounded border border-border bg-white px-3.5 py-2.5
         text-left transition-colors enabled:hover:border-rule focus:outline-none focus-visible:ring-2
         focus-visible:ring-primary disabled:cursor-default dark:border-border-dark dark:bg-surface-dark
         dark:enabled:hover:border-white/20"
>
  <span
    class="pointer-events-none absolute inset-y-0 left-0 transition-[width] duration-500 ease-out"
    style="width:{pct}%;
           background:linear-gradient(90deg,{color} 0%,{color} 72%,transparent 100%);
           opacity:.16"
    aria-hidden="true"
  ></span>

  <span class="relative grid grid-cols-[1fr_auto_2.6rem] items-center gap-x-3 gap-y-0.5">
    <span class="flex items-center gap-2.5 text-[13.5px] font-medium text-gray-900 dark:text-gray-100">
      <span class="h-4 w-[3px] flex-none rounded-sm" style="background:{color}"></span>
      {status.goal.name}
    </span>
    <span class="money text-right text-[13px] font-medium text-gray-900 dark:text-gray-100">
      {formatCurrency(status.currentAmount)}
    </span>
    <span class="text-[11.5px] text-muted dark:text-muted-dark">saved</span>

    <span class="text-[11.5px] text-muted dark:text-muted-dark">
      <span class="font-medium {statusColor}">{statusLabel}</span>
      &middot; of <span class="money">{formatCurrency(status.goal.targetAmount)}</span>
    </span>
    <span class="money text-right text-[11.5px] text-muted dark:text-muted-dark">{Math.round(pct)}%</span>
    <span aria-hidden="true"></span>

    {#if status.status !== 'completed' && (status.goal.targetDate || status.projectedDate)}
      <span class="col-span-3 text-[11.5px] text-muted dark:text-muted-dark">
        {#if status.goal.targetDate}
          Need <span class="money">{formatCurrency(status.monthlyNeeded)}</span>/month to reach it by {formatDate(status.goal.targetDate)}
        {:else if status.projectedDate}
          At <span class="money">{formatCurrency(status.goal.monthlyContribution || 0)}</span>/month, reached by {formatDate(status.projectedDate)}
        {/if}
      </span>
    {/if}
  </span>
</button>
