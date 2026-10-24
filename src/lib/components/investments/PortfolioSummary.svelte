<script lang="ts">
  import Figure from '$lib/components/insights/Figure.svelte';
  import { formatCurrency } from '$lib/utils/currency';
  import type { PortfolioSummary } from '$lib/stores/investmentStore';

  // What the portfolio is worth, what went in, and the gains so far.

  export let summary: PortfolioSummary;

  const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${formatCurrency(Math.abs(n))}`;
  const tone = (n: number | null) => (n === null || n === 0 ? 'text-label' : n > 0 ? 'text-success' : 'text-danger');

  $: gain = summary.totalUnrealizedGain;
  $: pill =
    gain !== null && gain !== 0
      ? { good: gain > 0, up: gain > 0, text: `${formatCurrency(Math.abs(gain))}${summary.totalUnrealizedGainPct !== null ? ` · ${Math.abs(summary.totalUnrealizedGainPct)}%` : ''}` }
      : null;
</script>

<div class="space-y-4">
  {#if summary.totalMarketValue !== null}
    <Figure label="Market value" cents={summary.totalMarketValue} {pill} sub="on {formatCurrency(summary.totalInvested)} invested{summary.pricedHoldings < summary.holdingsCount ? ` · ${summary.pricedHoldings} of ${summary.holdingsCount} priced` : ''}" />
  {:else}
    <Figure label="Invested" cents={summary.totalInvested} sub={summary.holdingsCount ? 'Set a price on a holding to see its value' : ''} />
  {/if}

  <div class="card grid grid-cols-3 divide-x divide-sep py-3.5">
    <div class="min-w-0 px-3.5">
      <p class="text-[13px] font-medium text-label-2">Invested</p>
      <p class="money amt mt-0.5 truncate text-[17px] font-semibold text-label">{formatCurrency(summary.totalInvested)}</p>
    </div>
    <div class="min-w-0 px-3.5">
      <p class="text-[13px] font-medium text-label-2">Unrealised</p>
      <p class="money amt mt-0.5 truncate text-[17px] font-semibold {tone(gain)}">{gain === null ? '—' : signed(gain)}</p>
    </div>
    <div class="min-w-0 px-3.5">
      <p class="text-[13px] font-medium text-label-2">Realised</p>
      <p class="money amt mt-0.5 truncate text-[17px] font-semibold {tone(summary.realizedGain)}">{summary.realizedGain === 0 ? formatCurrency(0) : signed(summary.realizedGain)}</p>
    </div>
  </div>

  {#if summary.topHoldings.length > 1}
    <p class="px-1 text-[13px] text-label-2">Largest: {summary.topHoldings.slice(0, 3).map((h) => h.symbol).join(', ')}</p>
  {/if}
</div>
