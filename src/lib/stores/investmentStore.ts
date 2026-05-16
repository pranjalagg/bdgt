import { writable, derived, get } from 'svelte/store';
import { db } from '$lib/db';
import type { InvestmentLot, InvestmentSell } from '$lib/types';

export interface Holding {
  symbol: string;
  totalShares: number;
  avgCostBasis: number;
  totalCost: number;
  lots: InvestmentLot[];
}

export interface PortfolioSummary {
  totalInvested: number;
  holdingsCount: number;
  topHoldings: Holding[];
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
export const isLoadingInvestments = writable(true);

export const holdings = derived(lots, ($lots) => {
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

    result.push({
      symbol,
      totalShares,
      avgCostBasis,
      totalCost,
      lots: symbolLots.filter((l) => l.shares - l.soldShares > 0),
    });
  }

  return result.sort((a, b) => b.totalCost - a.totalCost);
});

export const portfolioSummary = derived(holdings, ($holdings): PortfolioSummary => {
  const totalInvested = $holdings.reduce((sum, h) => sum + h.totalCost, 0);
  const holdingsCount = $holdings.length;
  const topHoldings = $holdings.slice(0, 5);

  return { totalInvested, holdingsCount, topHoldings };
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
  const [loadedLots, loadedSells] = await Promise.all([
    db.investmentLots.toArray(),
    db.investmentSells.toArray(),
  ]);
  lots.set(loadedLots);
  sells.set(loadedSells);
  isLoadingInvestments.set(false);
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
