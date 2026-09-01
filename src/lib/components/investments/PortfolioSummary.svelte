<script lang="ts">
  import { formatCurrency } from '$lib/utils/currency';
  import type { PortfolioSummary } from '$lib/stores/investmentStore';

  export let summary: PortfolioSummary;

  function gainClass(n: number | null): string {
    if (n === null || n === 0) return 'text-gray-800 dark:text-gray-100';
    return n > 0 ? 'text-success' : 'text-danger';
  }

  function signed(n: number): string {
    return (n > 0 ? '+' : '') + formatCurrency(n);
  }
</script>

<div class="card p-5">
  <h2 class="section-title mb-4">Portfolio Summary</h2>
  <div class="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
    <div>
      <p class="metric-label">Cost Basis</p>
      <p class="text-2xl font-bold tabular-nums text-gray-800 dark:text-gray-100">
        {formatCurrency(summary.totalInvested)}
      </p>
    </div>
    <div>
      <p class="metric-label">Market Value</p>
      <p class="text-2xl font-bold tabular-nums text-gray-800 dark:text-gray-100">
        {summary.totalMarketValue === null ? '—' : formatCurrency(summary.totalMarketValue)}
      </p>
      {#if summary.totalMarketValue !== null && summary.pricedHoldings < summary.holdingsCount}
        <p class="text-xs text-muted">{summary.pricedHoldings} of {summary.holdingsCount} priced</p>
      {/if}
    </div>
    <div>
      <p class="metric-label">Unrealised</p>
      {#if summary.totalUnrealizedGain === null}
        <p class="text-2xl font-bold text-muted">—</p>
      {:else}
        <p class="text-2xl font-bold tabular-nums {gainClass(summary.totalUnrealizedGain)}">
          {signed(summary.totalUnrealizedGain)}
        </p>
        {#if summary.totalUnrealizedGainPct !== null}
          <p class="text-xs {gainClass(summary.totalUnrealizedGain)}">
            {summary.totalUnrealizedGainPct > 0 ? '+' : ''}{summary.totalUnrealizedGainPct}%
          </p>
        {/if}
      {/if}
    </div>
    <div>
      <p class="metric-label">Realised</p>
      <p class="text-2xl font-bold tabular-nums {gainClass(summary.realizedGain)}">
        {summary.realizedGain === 0 ? formatCurrency(0) : signed(summary.realizedGain)}
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
