<script lang="ts">
  import { formatCurrency } from '$lib/utils/currency';
  import type { Activity } from '$lib/stores/investmentStore';

  export let activities: Activity[];

  function formatShares(shares: number): string {
    return shares % 1 === 0 ? shares.toString() : shares.toFixed(4);
  }
</script>

<div class="card">
  <div class="border-b border-gray-100 px-5 py-4 dark:border-border-dark">
    <h2 class="section-title">Recent Activity</h2>
  </div>

  {#if activities.length === 0}
    <div class="px-5 py-8 text-center text-muted">
      No activity yet.
    </div>
  {:else}
    <ul class="divide-y divide-gray-100 dark:divide-border-dark">
      {#each activities as activity}
        <li class="flex items-center gap-3 px-5 py-3">
          <span
            class="flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium
                   {activity.type === 'buy' ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}"
          >
            {activity.type === 'buy' ? '↓' : '↑'}
          </span>
          <div class="flex-1">
            <p class="text-sm font-medium text-gray-800 dark:text-gray-100">
              {activity.type === 'buy' ? 'Bought' : 'Sold'} {formatShares(activity.shares)} {activity.symbol}
            </p>
            <p class="text-xs text-muted">
              @ {formatCurrency(activity.pricePerShare)} · {activity.date.toLocaleDateString()}
            </p>
          </div>
          <p class="font-medium tabular-nums {activity.type === 'buy' ? 'text-gray-800 dark:text-gray-100' : 'text-success'}">
            {activity.type === 'buy' ? '' : '+'}{formatCurrency(activity.shares * activity.pricePerShare)}
          </p>
        </li>
      {/each}
    </ul>
  {/if}
</div>
