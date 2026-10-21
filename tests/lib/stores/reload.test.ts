import { describe, it, expect, vi, beforeEach } from 'vitest';

const calls: string[] = [];
vi.mock('$lib/stores/currencyStore', () => ({ loadCurrency: vi.fn(async (o?: unknown) => void calls.push(`currency ${JSON.stringify(o)}`)) }));
vi.mock('$lib/stores/budgetStore', () => ({ loadData: vi.fn(async (o?: unknown) => void calls.push(`data ${JSON.stringify(o)}`)) }));
vi.mock('$lib/stores/recurringStore', () => ({
  loadRecurring: vi.fn(async () => void calls.push('recurring')),
  processRecurring: vi.fn(async () => void calls.push('process')),
}));
vi.mock('$lib/stores/goalsStore', () => ({ loadGoals: vi.fn(async () => void calls.push('goals')) }));
vi.mock('$lib/stores/investmentStore', () => ({ loadInvestments: vi.fn(async () => void calls.push('investments')) }));

import { reloadAllStores } from '$lib/stores/reload';

beforeEach(() => {
  calls.length = 0;
});

describe('reloadAllStores', () => {
  it('reloads every store quietly, then creates any recurring items now due', async () => {
    await reloadAllStores();
    expect(calls).toEqual(['currency {"keepPrompt":true}', 'data {"background":true}', 'recurring', 'goals', 'investments', 'process']);
  });
});
