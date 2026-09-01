import { writable, derived, get } from 'svelte/store';
import { db } from '$lib/db';
import { holdingValuation, realizedGain } from '$lib/utils/investments';
import type { InvestmentLot, InvestmentSell, InvestmentPrice } from '$lib/types';

export interface Holding {
  symbol: string;
  totalShares: number;
  avgCostBasis: number;
  totalCost: number;
  lots: InvestmentLot[];
  currentPrice: number | null;
  marketValue: number | null;
  unrealizedGain: number | null;
  unrealizedGainPct: number | null;
}

export interface PortfolioSummary {
  totalInvested: number;
  holdingsCount: number;
  topHoldings: Holding[];
  totalMarketValue: number | null;
  totalUnrealizedGain: number | null;
  totalUnrealizedGainPct: number | null;
  realizedGain: number;
  pricedHoldings: number;
}

export interface Activity {
  type: 'buy' | 'sell';
  symbol: string;
  shares: number;
  pricePerShare: number;
  date: Date;
  lotId?: string;
}

export const lots = writable<InvestmentLot[]>([]);
export const sells = writable<InvestmentSell[]>([]);
export const prices = writable<Record<string, number>>({});
export const isLoadingInvestments = writable(true);

export const holdings = derived([lots, prices], ([$lots, $prices]) => {
  const symbolMap = new Map<string, InvestmentLot[]>();

  for (const lot of $lots) {
    const existing = symbolMap.get(lot.symbol) || [];
    existing.push(lot);
    symbolMap.set(lot.symbol, existing);
  }

  const result: Holding[] = [];
  for (const [symbol, symbolLots] of symbolMap) {
    const totalShares = symbolLots.reduce((sum, l) => sum + (l.shares - l.soldShares), 0);
    if (totalShares <= 0) continue;

    const totalCost = symbolLots.reduce((sum, l) => {
      const remainingShares = l.shares - l.soldShares;
      return sum + remainingShares * l.pricePerShare;
    }, 0);

    const avgCostBasis = totalShares > 0 ? Math.round(totalCost / totalShares) : 0;
    const currentPrice = $prices[symbol] ?? null;
    const valuation = holdingValuation(totalShares, totalCost, currentPrice ?? undefined);

    result.push({
      symbol,
      totalShares,
      avgCostBasis,
      totalCost,
      lots: symbolLots.filter((l) => l.shares - l.soldShares > 0),
      currentPrice,
      ...valuation,
    });
  }

  return result.sort((a, b) => b.totalCost - a.totalCost);
});

export const portfolioSummary = derived([holdings, sells, lots], ([$holdings, $sells, $lots]): PortfolioSummary => {
  const totalInvested = $holdings.reduce((sum, h) => sum + h.totalCost, 0);
  const holdingsCount = $holdings.length;
  const topHoldings = $holdings.slice(0, 5);

  const priced = $holdings.filter((h) => h.marketValue !== null);
  const pricedHoldings = priced.length;
  const totalMarketValue = pricedHoldings > 0
    ? priced.reduce((sum, h) => sum + (h.marketValue ?? 0), 0)
    : null;
  const pricedCost = priced.reduce((sum, h) => sum + h.totalCost, 0);
  const totalUnrealizedGain = totalMarketValue === null ? null : totalMarketValue - pricedCost;
  const totalUnrealizedGainPct = totalUnrealizedGain !== null && pricedCost > 0
    ? Math.round((totalUnrealizedGain / pricedCost) * 1000) / 10
    : null;

  const lotBasis: Record<string, number> = {};
  for (const l of $lots) lotBasis[l.id] = l.pricePerShare;

  return {
    totalInvested,
    holdingsCount,
    topHoldings,
    totalMarketValue,
    totalUnrealizedGain,
    totalUnrealizedGainPct,
    realizedGain: realizedGain($sells, lotBasis),
    pricedHoldings,
  };
});

export const recentActivity = derived([lots, sells], ([$lots, $sells]): Activity[] => {
  const activities: Activity[] = [];

  for (const lot of $lots) {
    activities.push({
      type: 'buy',
      symbol: lot.symbol,
      shares: lot.shares,
      pricePerShare: lot.pricePerShare,
      date: new Date(lot.purchaseDate),
      lotId: lot.id,
    });
  }

  for (const sell of $sells) {
    const lot = $lots.find((l) => l.id === sell.lotId);
    if (lot) {
      activities.push({
        type: 'sell',
        symbol: lot.symbol,
        shares: sell.shares,
        pricePerShare: sell.pricePerShare,
        date: new Date(sell.sellDate),
        lotId: sell.lotId,
      });
    }
  }

  return activities
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 10);
});

export async function loadInvestments(): Promise<void> {
  isLoadingInvestments.set(true);
  const [loadedLots, loadedSells, loadedPrices] = await Promise.all([
    db.investmentLots.toArray(),
    db.investmentSells.toArray(),
    db.investmentPrices.toArray(),
  ]);
  lots.set(loadedLots);
  sells.set(loadedSells);
  prices.set(Object.fromEntries(loadedPrices.map((p) => [p.symbol, p.pricePerShare])));
  isLoadingInvestments.set(false);
}

// Manually set (or clear, with null) the current price for a symbol.
export async function setPrice(symbol: string, pricePerShare: number | null): Promise<void> {
  const sym = symbol.toUpperCase();
  if (pricePerShare === null || !Number.isFinite(pricePerShare) || pricePerShare <= 0) {
    await db.investmentPrices.delete(sym);
    prices.update((p) => {
      const next = { ...p };
      delete next[sym];
      return next;
    });
    return;
  }
  const record: InvestmentPrice = { symbol: sym, pricePerShare, updatedAt: new Date() };
  await db.investmentPrices.put(record);
  prices.update((p) => ({ ...p, [sym]: pricePerShare }));
}

export async function addLot(lot: Omit<InvestmentLot, 'id'>): Promise<string> {
  const id = crypto.randomUUID();
  const newLot: InvestmentLot = { ...lot, id, symbol: lot.symbol.toUpperCase() };
  await db.investmentLots.add(newLot);
  lots.update((l) => [...l, newLot]);
  return id;
}

export async function updateLot(id: string, updates: Partial<InvestmentLot>): Promise<void> {
  if (updates.symbol) {
    updates.symbol = updates.symbol.toUpperCase();
  }
  await db.investmentLots.update(id, updates);
  lots.update((l) => l.map((lot) => (lot.id === id ? { ...lot, ...updates } : lot)));
}

export async function deleteLot(id: string): Promise<void> {
  const sellsForLot = await db.investmentSells.where('lotId').equals(id).toArray();
  if (sellsForLot.length > 0) {
    throw new Error('Cannot delete lot with existing sells');
  }
  await db.investmentLots.delete(id);
  lots.update((l) => l.filter((lot) => lot.id !== id));
}

export async function sellFromLot(
  lotId: string,
  shares: number,
  pricePerShare: number,
  sellDate: Date,
  note?: string
): Promise<string> {
  const lot = await db.investmentLots.get(lotId);
  if (!lot) {
    throw new Error('Lot not found');
  }

  const availableShares = lot.shares - lot.soldShares;
  if (shares > availableShares) {
    throw new Error('Cannot sell more shares than available');
  }

  const id = crypto.randomUUID();
  const newSell: InvestmentSell = {
    id,
    lotId,
    shares,
    pricePerShare,
    sellDate,
    note,
  };

  await db.investmentSells.add(newSell);
  sells.update((s) => [...s, newSell]);

  const newSoldShares = lot.soldShares + shares;
  await db.investmentLots.update(lotId, { soldShares: newSoldShares });
  lots.update((l) => l.map((lt) => (lt.id === lotId ? { ...lt, soldShares: newSoldShares } : lt)));

  return id;
}
