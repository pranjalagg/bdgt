import { writable, get } from 'svelte/store';
import { db } from '$lib/db';
import type { InvestmentLot, InvestmentSell } from '$lib/types';

export const lots = writable<InvestmentLot[]>([]);
export const sells = writable<InvestmentSell[]>([]);
export const isLoadingInvestments = writable(true);

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
