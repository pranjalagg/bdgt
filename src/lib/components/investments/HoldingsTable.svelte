<script lang="ts">
  import { formatCurrency, parseCurrency, isValidCurrency } from '$lib/utils/currency';
  import { setPrice, type Holding } from '$lib/stores/investmentStore';
  import Icon from '$lib/components/ui/Icon.svelte';
  import IconMark from '$lib/components/ui/IconMark.svelte';
  import SectionHeading from '$lib/components/ui/SectionHeading.svelte';

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
    if (n === null || n === 0) return 'text-label-2';
    return n > 0 ? 'text-success' : 'text-danger';
  }
</script>

<section aria-labelledby="inv-holdings">
  <SectionHeading strong="Holdings" id="inv-holdings">
    <button slot="action" type="button" class="flex items-center gap-1 rounded-full px-1 text-[15px] font-semibold text-tint focus:outline-none focus-visible:ring-2 focus-visible:ring-tint" on:click={onAddPurchase}>
      <Icon name="plus" size={16} strokeWidth={2.4} />Add purchase
    </button>
  </SectionHeading>

  {#if holdings.length === 0}
    <p class="py-6 text-center text-[15px] text-label-2">No holdings yet. Add your first purchase to get started.</p>
  {:else}
    <div class="list">
      {#each holdings as holding (holding.symbol)}
        {@const open = expandedSymbol === holding.symbol}
        <div>
          <div class="row">
            <button type="button" class="flex min-w-0 flex-1 items-center gap-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-tint" aria-expanded={open} on:click={() => toggleExpand(holding.symbol)}>
              <IconMark icon="trend" />
              <span class="min-w-0 flex-1">
                <span class="t-row flex items-center gap-1">{holding.symbol}<span class="chev text-label-2" class:open aria-hidden="true"><Icon name="chevron-down" size={14} strokeWidth={2.4} /></span></span>
                <span class="block text-[13px] text-label-2">{formatShares(holding.totalShares)} shares · <span class="amt">{formatCurrency(holding.totalCost)}</span> cost</span>
              </span>
            </button>
            <span class="flex-none text-right">
              <span class="money amt block text-[16px] font-semibold text-label">{holding.marketValue != null ? formatCurrency(holding.marketValue) : '—'}</span>
              {#if holding.unrealizedGain != null}
                <span class="money amt block text-[12px] {gainClass(holding.unrealizedGain)}">{holding.unrealizedGain > 0 ? '+' : ''}{formatCurrency(holding.unrealizedGain)}{#if holding.unrealizedGainPct != null} · {holding.unrealizedGainPct > 0 ? '+' : ''}{holding.unrealizedGainPct}%{/if}</span>
              {/if}
            </span>
          </div>
          <div class="flex items-center justify-between gap-3 pb-3 pl-[58px] text-[13px]">
            <span class="text-label-2">Price</span>
            {#if editingPriceSymbol === holding.symbol}
              <span class="text-right">
                <!-- svelte-ignore a11y_autofocus -->
                <input
                  type="text"
                  inputmode="decimal"
                  aria-label="Price of {holding.symbol}"
                  bind:value={priceDraft}
                  autofocus
                  on:blur={() => commitPrice(holding.symbol)}
                  on:keydown={(e) => { if (e.key === 'Enter') commitPrice(holding.symbol); if (e.key === 'Escape') cancelEditPrice(); }}
                  class="money h-8 w-28 rounded-[10px] bg-fill px-2.5 text-right text-[15px] text-label focus:outline-none focus:ring-2 {priceError ? 'focus:ring-danger' : 'focus:ring-tint'}"
                  placeholder="0.00"
                />
                {#if priceError}<span class="mt-0.5 block text-[12px] text-danger">{priceError}</span>{/if}
              </span>
            {:else}
              <button type="button" class="money amt rounded-full bg-surface px-3 py-1 text-[13px] font-semibold text-tint shadow-[var(--shadow-card)] focus:outline-none focus-visible:ring-2 focus-visible:ring-tint" on:click={() => startEditPrice(holding)}>
                {holding.currentPrice != null ? `${formatCurrency(holding.currentPrice)} each` : 'Set price'}
              </button>
            {/if}
          </div>

          {#if open}
            <div class="pb-3 pl-[58px]">
              <p class="pb-1.5 text-[12px] font-medium uppercase tracking-wide text-label-2">Lots</p>
              <div class="grid gap-1.5">
                {#each holding.lots as lot (lot.id)}
                  {@const remainingShares = lot.shares - lot.soldShares}
                  <div class="flex items-center justify-between gap-3 rounded-[12px] bg-fill px-3 py-2">
                    <span class="min-w-0">
                      <span class="block text-[15px] text-label">{formatShares(remainingShares)} shares at <span class="amt">{formatCurrency(lot.pricePerShare)}</span></span>
                      <span class="block text-[12px] text-label-2">Bought {new Date(lot.purchaseDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    </span>
                    {#if remainingShares > 0}
                      <button type="button" class="flex-none rounded-full bg-surface px-3 py-1 text-[13px] font-semibold text-tint dark:bg-raised" on:click|stopPropagation={() => onSellFromLot(lot.id)}>Sell</button>
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
</section>

<style>
  .chev {
    transition: transform var(--ms-smooth, 300ms) var(--ease-smooth, ease-out);
  }

  .chev.open {
    transform: rotate(180deg);
  }
</style>
