<script lang="ts">
  // A goal as an open row (as in the owner's references): a ring in the
  // linked envelope's colour shows how far along it is, around a neutral
  // icon; what is saved and the share on the right.
  import { formatCurrency } from '$lib/utils/currency';
  import Icon from '$lib/components/ui/Icon.svelte';
  import type { GoalStatusInfo } from '$lib/stores/goalsStore';

  export let status: GoalStatusInfo;
  export let onClick: (() => void) | undefined = undefined;

  $: color = status.bucket?.color ?? '#94a3b8';
  $: pct = Math.min(Math.max(status.progress, 0), 1) * 100;
  const R = 20;
  const C = 2 * Math.PI * R;

  $: statusLabel = {
    completed: 'Completed',
    'on-track': 'On track',
    behind: 'Behind',
  }[status.status];

  $: statusColor = status.status === 'behind'
    ? 'text-warning'
    : 'text-success';

  function formatDate(date: Date | null): string {
    if (!date) return '';
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }
</script>

<button
  type="button"
  on:click={onClick}
  disabled={!onClick}
  class="row row-tap w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-tint disabled:cursor-default disabled:hover:bg-transparent"
>
  <span class="relative flex h-11 w-11 flex-none items-center justify-center text-label" aria-hidden="true">
    <svg viewBox="0 0 44 44" class="absolute inset-0 -rotate-90">
      <circle cx="22" cy="22" r={R} fill="none" stroke="rgb(var(--c-fill) / var(--fill-alpha))" stroke-width="3" />
      <circle cx="22" cy="22" r={R} fill="none" stroke={color} stroke-width="3" stroke-linecap="round" stroke-dasharray="{(pct / 100) * C} {C}" />
    </svg>
    <Icon name="piggy" size={18} strokeWidth={1.75} />
  </span>
  <span class="min-w-0 flex-1">
    <span class="t-row block truncate">{status.goal.name}</span>
    <span class="block text-[13px] text-label-2">
      <span class="font-medium {statusColor}">{statusLabel}</span> · of <span class="money amt">{formatCurrency(status.goal.targetAmount)}</span>
    </span>
    {#if status.status !== 'completed' && (status.goal.targetDate || status.projectedDate)}
      <span class="block text-[12px] text-label-2">
        {#if status.goal.targetDate}
          Need <span class="money amt">{formatCurrency(status.monthlyNeeded)}</span>/month to reach it by {formatDate(status.goal.targetDate)}
        {:else if status.projectedDate}
          At <span class="money amt">{formatCurrency(status.goal.monthlyContribution || 0)}</span>/month, reached by {formatDate(status.projectedDate)}
        {/if}
      </span>
    {/if}
  </span>
  <span class="flex-none text-right">
    <span class="money amt block text-[16px] font-semibold text-label">{formatCurrency(status.currentAmount)}</span>
    <span class="block text-[12px] text-label-2">{Math.round(pct)}% saved</span>
  </span>
</button>
