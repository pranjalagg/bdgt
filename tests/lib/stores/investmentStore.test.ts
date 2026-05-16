import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

vi.mock('$lib/db', () => ({
  db: {
    investmentLots: {
      add: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      toArray: vi.fn().mockResolvedValue([]),
      get: vi.fn(),
    },
    investmentSells: {
      add: vi.fn(),
      toArray: vi.fn().mockResolvedValue([]),
      where: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
    },
  },
}));

import { lots, sells, addLot, loadInvestments } from '$lib/stores/investmentStore';
import { db } from '$lib/db';

describe('investmentStore', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await loadInvestments();
  });

  describe('addLot', () => {
    it('adds lot to database and store', async () => {
      const lot = {
        symbol: 'AAPL',
        shares: 10,
        pricePerShare: 15000,
        purchaseDate: new Date('2026-05-01'),
        soldShares: 0,
      };

      const id = await addLot(lot);

      expect(id).toBeDefined();
      expect(db.investmentLots.add).toHaveBeenCalledWith(expect.objectContaining({
        symbol: 'AAPL',
        shares: 10,
        pricePerShare: 15000,
      }));
      expect(get(lots)).toHaveLength(1);
      expect(get(lots)[0].symbol).toBe('AAPL');
    });
  });
});
