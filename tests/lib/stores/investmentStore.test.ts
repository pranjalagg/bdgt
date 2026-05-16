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
      where: vi.fn().mockReturnValue({
        equals: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue([]),
        }),
      }),
    },
  },
}));

import { lots, sells, addLot, updateLot, deleteLot, sellFromLot, loadInvestments } from '$lib/stores/investmentStore';
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

  describe('updateLot', () => {
    it('updates lot in database and store', async () => {
      const lot = {
        symbol: 'AAPL',
        shares: 10,
        pricePerShare: 15000,
        purchaseDate: new Date('2026-05-01'),
        soldShares: 0,
      };
      const id = await addLot(lot);

      await updateLot(id, { shares: 15 });

      expect(db.investmentLots.update).toHaveBeenCalledWith(id, { shares: 15 });
      expect(get(lots)[0].shares).toBe(15);
    });
  });

  describe('deleteLot', () => {
    it('deletes lot from database and store', async () => {
      const lot = {
        symbol: 'AAPL',
        shares: 10,
        pricePerShare: 15000,
        purchaseDate: new Date('2026-05-01'),
        soldShares: 0,
      };
      const id = await addLot(lot);

      await deleteLot(id);

      expect(db.investmentLots.delete).toHaveBeenCalledWith(id);
      expect(get(lots)).toHaveLength(0);
    });

    it('throws error if lot has sells', async () => {
      const lot = {
        symbol: 'AAPL',
        shares: 10,
        pricePerShare: 15000,
        purchaseDate: new Date('2026-05-01'),
        soldShares: 0,
      };
      const id = await addLot(lot);

      // Mock sells exist for this lot
      vi.mocked(db.investmentSells.where).mockReturnValue({
        equals: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue([{ id: 'sell-1', lotId: id }]),
        }),
      } as any);

      await expect(deleteLot(id)).rejects.toThrow('Cannot delete lot with existing sells');
    });
  });

  describe('sellFromLot', () => {
    it('creates sell record and updates lot soldShares', async () => {
      vi.mocked(db.investmentLots.get).mockResolvedValue({
        id: 'lot-1',
        symbol: 'AAPL',
        shares: 10,
        pricePerShare: 15000,
        purchaseDate: new Date('2026-05-01'),
        soldShares: 0,
      });

      const lot = {
        symbol: 'AAPL',
        shares: 10,
        pricePerShare: 15000,
        purchaseDate: new Date('2026-05-01'),
        soldShares: 0,
      };
      const lotId = await addLot(lot);

      vi.mocked(db.investmentLots.get).mockResolvedValue({
        ...lot,
        id: lotId,
      });

      await sellFromLot(lotId, 3, 16000, new Date('2026-05-10'));

      expect(db.investmentSells.add).toHaveBeenCalledWith(expect.objectContaining({
        lotId,
        shares: 3,
        pricePerShare: 16000,
      }));
      expect(db.investmentLots.update).toHaveBeenCalledWith(lotId, { soldShares: 3 });
      expect(get(sells)).toHaveLength(1);
      expect(get(lots)[0].soldShares).toBe(3);
    });

    it('throws error if selling more than available', async () => {
      const lot = {
        symbol: 'AAPL',
        shares: 10,
        pricePerShare: 15000,
        purchaseDate: new Date('2026-05-01'),
        soldShares: 8,
      };
      const lotId = await addLot(lot);

      vi.mocked(db.investmentLots.get).mockResolvedValue({
        ...lot,
        id: lotId,
      });

      await expect(sellFromLot(lotId, 5, 16000, new Date('2026-05-10'))).rejects.toThrow('Cannot sell more shares than available');
    });
  });
});
