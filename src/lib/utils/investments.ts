// All values in integer cents. Prices are entered manually per symbol.

export interface HoldingValuation {
  marketValue: number | null;
  unrealizedGain: number | null;
  unrealizedGainPct: number | null;
}

export function holdingValuation(
  totalShares: number,
  costBasis: number,
  currentPricePerShare: number | undefined
): HoldingValuation {
  if (currentPricePerShare === undefined || currentPricePerShare === null) {
    return { marketValue: null, unrealizedGain: null, unrealizedGainPct: null };
  }
  const marketValue = Math.round(totalShares * currentPricePerShare);
  const unrealizedGain = marketValue - costBasis;
  const unrealizedGainPct =
    costBasis > 0 ? Math.round((unrealizedGain / costBasis) * 1000) / 10 : null;
  return { marketValue, unrealizedGain, unrealizedGainPct };
}

// Proceeds above (or below) cost basis, summed over every sell.
export function realizedGain(
  sells: { lotId: string; shares: number; pricePerShare: number }[],
  lotCostBasisById: Record<string, number>
): number {
  return sells.reduce((sum, s) => {
    const basis = lotCostBasisById[s.lotId] ?? 0;
    return sum + Math.round((s.pricePerShare - basis) * s.shares);
  }, 0);
}
