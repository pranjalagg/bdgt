<script lang="ts">
  import { formatCurrency } from '$lib/utils/currency';
  import type { PortfolioSummary } from '$lib/stores/investmentStore';

  export let summary: PortfolioSummary;
</script>

<div class="card p-5">
  <h2 class="section-title mb-4">Portfolio Summary</h2>
  <div class="flex flex-wrap gap-6">
    <div>
      <p class="metric-label">Total Invested</p>
      <p class="text-2xl font-bold tabular-nums text-gray-800 dark:text-gray-100">
        {formatCurrency(summary.totalInvested)}
      </p>
    </div>
    <div>
      <p class="metric-label">Holdings</p>
      <p class="text-2xl font-bold tabular-nums text-gray-800 dark:text-gray-100">
        {summary.holdingsCount}
      </p>
    </div>
  </div>
  {#if summary.topHoldings.length > 0}
    <div class="mt-4">
      <p class="metric-label mb-2">Top Holdings</p>
      <div class="flex flex-wrap gap-2">
        {#each summary.topHoldings.slice(0, 3) as holding}
          <span class="rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
            {holding.symbol}
          </span>
        {/each}
      </div>
    </div>
  {/if}
</div>
