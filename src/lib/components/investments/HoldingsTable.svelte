<script lang="ts">
  import { formatCurrency } from '$lib/utils/currency';
  import type { Holding } from '$lib/stores/investmentStore';

  export let holdings: Holding[];
  export let onAddPurchase: () => void;
  export let onSellFromLot: (lotId: string) => void;

  let expandedSymbol: string | null = null;

  function toggleExpand(symbol: string) {
    expandedSymbol = expandedSymbol === symbol ? null : symbol;
  }

  function formatShares(shares: number): string {
    return shares % 1 === 0 ? shares.toString() : shares.toFixed(4);
  }
</script>

<div class="card">
  <div class="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-border-dark">
    <h2 class="section-title">Holdings</h2>
    <button class="btn-primary text-sm" on:click={onAddPurchase}>
      + Add Purchase
    </button>
  </div>

  {#if holdings.length === 0}
    <div class="px-5 py-8 text-center text-muted">
      No holdings yet. Add your first purchase to get started.
    </div>
  {:else}
    <div class="divide-y divide-gray-100 dark:divide-border-dark">
      {#each holdings as holding}
        <div>
          <button
            class="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50"
            on:click={() => toggleExpand(holding.symbol)}
          >
            <div class="flex items-center gap-3">
              <span class="font-semibold text-gray-800 dark:text-gray-100">{holding.symbol}</span>
              <span class="text-sm text-muted">{formatShares(holding.totalShares)} shares</span>
            </div>
            <div class="flex items-center gap-4">
              <div class="text-right">
                <p class="font-medium tabular-nums text-gray-800 dark:text-gray-100">
                  {formatCurrency(holding.totalCost)}
                </p>
                <p class="text-xs text-muted">
                  avg {formatCurrency(holding.avgCostBasis)}/share
                </p>
              </div>
              <svg
                class="h-5 w-5 text-gray-400 transition-transform {expandedSymbol === holding.symbol ? 'rotate-180' : ''}"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </button>

          {#if expandedSymbol === holding.symbol}
            <div class="border-t border-gray-100 bg-gray-50/50 px-5 py-3 dark:border-border-dark dark:bg-gray-800/30">
              <p class="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Lots</p>
              <div class="space-y-2">
                {#each holding.lots as lot}
                  {@const remainingShares = lot.shares - lot.soldShares}
                  <div class="flex items-center justify-between rounded-lg bg-white p-3 dark:bg-surface-dark">
                    <div>
                      <p class="text-sm font-medium text-gray-800 dark:text-gray-100">
                        {formatShares(remainingShares)} shares @ {formatCurrency(lot.pricePerShare)}
                      </p>
                      <p class="text-xs text-muted">
                        Purchased {new Date(lot.purchaseDate).toLocaleDateString()}
                      </p>
                    </div>
                    {#if remainingShares > 0}
                      <button
                        class="btn-secondary text-xs"
                        on:click|stopPropagation={() => onSellFromLot(lot.id)}
                      >
                        Sell
                      </button>
                    {/if}
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>
