<script lang="ts">
  import { formatCurrency, parseCurrency, isValidCurrency } from '$lib/utils/currency';
  import { setPrice, type Holding } from '$lib/stores/investmentStore';

  export let holdings: Holding[];
  export let onAddPurchase: () => void;
  export let onSellFromLot: (lotId: string) => void;

  let expandedSymbol: string | null = null;
  let editingPriceSymbol: string | null = null;
  let priceDraft = '';
  let priceError = '';

  function toggleExpand(symbol: string) {
    expandedSymbol = expandedSymbol === symbol ? null : symbol;
  }

  function formatShares(shares: number): string {
    return shares % 1 === 0 ? shares.toString() : shares.toFixed(4);
  }

  function startEditPrice(h: Holding) {
    editingPriceSymbol = h.symbol;
    priceDraft = h.currentPrice != null ? (h.currentPrice / 100).toFixed(2) : '';
    priceError = '';
  }

  async function commitPrice(symbol: string) {
    const trimmed = priceDraft.trim();
    try {
      if (trimmed === '') {
        await setPrice(symbol, null);
      } else if (isValidCurrency(trimmed) && parseCurrency(trimmed) > 0) {
        await setPrice(symbol, parseCurrency(trimmed));
      } else {
        priceError = 'Enter a positive price';
        return;
      }
      editingPriceSymbol = null;
      priceError = '';
    } catch (e) {
      priceError = e instanceof Error ? e.message : 'Failed to save price';
    }
  }

  function cancelEditPrice() {
    editingPriceSymbol = null;
    priceError = '';
  }

  function gainClass(n: number | null): string {
    if (n === null || n === 0) return 'text-muted';
    return n > 0 ? 'text-success' : 'text-danger';
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
          <div class="flex w-full items-center gap-4 px-5 py-4">
            <button
              class="flex flex-1 items-center gap-3 text-left"
              on:click={() => toggleExpand(holding.symbol)}
            >
              <svg
                class="h-4 w-4 flex-shrink-0 text-gray-400 transition-transform {expandedSymbol === holding.symbol ? 'rotate-180' : ''}"
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
              <span class="font-semibold text-gray-800 dark:text-gray-100">{holding.symbol}</span>
              <span class="text-sm text-muted">{formatShares(holding.totalShares)} sh</span>
            </button>

            <div class="hidden text-right sm:block">
              <p class="text-xs text-muted">Cost</p>
              <p class="text-sm font-medium tabular-nums text-gray-700 dark:text-gray-200">{formatCurrency(holding.totalCost)}</p>
            </div>

            <div class="text-right">
              <p class="text-xs text-muted">Price</p>
              {#if editingPriceSymbol === holding.symbol}
                <!-- svelte-ignore a11y_autofocus -->
                <input
                  type="text"
                  inputmode="decimal"
                  bind:value={priceDraft}
                  autofocus
                  on:blur={() => commitPrice(holding.symbol)}
                  on:keydown={(e) => { if (e.key === 'Enter') commitPrice(holding.symbol); if (e.key === 'Escape') cancelEditPrice(); }}
                  class="w-20 rounded border {priceError ? 'border-danger' : 'border-gray-300'} px-1.5 py-0.5 text-right text-sm dark:border-border-dark dark:bg-gray-800"
                  placeholder="0.00"
                />
                {#if priceError}
                  <p class="mt-0.5 text-xs text-danger">{priceError}</p>
                {/if}
              {:else}
                <button class="text-sm font-medium tabular-nums text-primary hover:underline" on:click={() => startEditPrice(holding)}>
                  {holding.currentPrice != null ? formatCurrency(holding.currentPrice) : 'Set'}
                </button>
              {/if}
            </div>

            <div class="w-24 text-right">
              <p class="text-xs text-muted">Value</p>
              <p class="text-sm font-medium tabular-nums text-gray-800 dark:text-gray-100">
                {holding.marketValue != null ? formatCurrency(holding.marketValue) : '—'}
              </p>
              {#if holding.unrealizedGain != null}
                <p class="text-xs tabular-nums {gainClass(holding.unrealizedGain)}">
                  {holding.unrealizedGain > 0 ? '+' : ''}{formatCurrency(holding.unrealizedGain)}{#if holding.unrealizedGainPct != null} ({holding.unrealizedGainPct > 0 ? '+' : ''}{holding.unrealizedGainPct}%){/if}
                </p>
              {/if}
            </div>
          </div>

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
