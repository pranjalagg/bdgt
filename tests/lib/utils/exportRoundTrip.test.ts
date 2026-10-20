import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '$lib/db';
import { exportToJson, importFromJson, resetAllData } from '$lib/utils/export';
import { allocationRow } from '$lib/utils/monthRecords';
import { resetRealDb } from '../../helpers/realDb';

const byId = <T extends { id: string }>(rows: T[]) => [...rows].sort((a, b) => a.id.localeCompare(b.id));

function backup(monthSnapshots: unknown[]): string {
  return JSON.stringify({
    version: 1,
    exportedAt: '2026-10-20T00:00:00.000Z',
    data: {
      buckets: [], transactions: [], recurringTransactions: [], incomes: [],
      monthSnapshots, savingsGoals: [], investmentLots: [], investmentSells: [], investmentPrices: [],
    },
  });
}

describe('backups with split month records', () => {
  beforeEach(resetRealDb);

  it('exports month records in the old shape, rebuilt from the rows', async () => {
    await db.allocations.bulkPut([allocationRow('2026-09', 'b1', 50000), allocationRow('2026-10', 'b1', 60000)]);
    await db.monthNotes.bulkPut([{ id: 'n1', month: '2026-09', text: 'Trip', effect: 'down', createdAt: 5 }]);

    const parsed = JSON.parse(await exportToJson());

    expect(parsed.version).toBe(1);
    expect(parsed.data.monthSnapshots).toEqual([
      {
        month: '2026-09', incomeTotal: 0, allocations: { b1: 50000 }, spent: {}, rollovers: {},
        notes: [{ id: 'n1', text: 'Trip', effect: 'down', createdAt: 5 }],
      },
      { month: '2026-10', incomeTotal: 0, allocations: { b1: 60000 }, spent: {}, rollovers: {} },
    ]);
  });

  it('round-trips through export, reset and import', async () => {
    await db.allocations.bulkPut([allocationRow('2026-09', 'b1', 50000), allocationRow('2026-09', 'b2', 0)]);
    await db.monthNotes.bulkPut([{ id: 'n1', month: '2026-08', text: 'Trip', effect: 'down', createdAt: 5 }]);
    const json = await exportToJson();

    await resetAllData();
    expect(await db.allocations.count()).toBe(0);
    expect(await db.monthNotes.count()).toBe(0);

    await importFromJson(json);
    expect(byId(await db.allocations.toArray())).toEqual([
      allocationRow('2026-09', 'b1', 50000),
      allocationRow('2026-09', 'b2', 0),
    ]);
    expect(await db.monthNotes.toArray()).toEqual([
      { id: 'n1', month: '2026-08', text: 'Trip', effect: 'down', createdAt: 5 },
    ]);
  });

  it('splits an older backup, dropping stale figures and empty months', async () => {
    await importFromJson(backup([
      { month: '2026-06', incomeTotal: 0, allocations: { b1: 1 }, spent: { b1: 999 }, rollovers: {} },
      { month: '2025-01', incomeTotal: 0, allocations: {}, spent: {}, rollovers: {}, notes: [] },
    ]));

    expect(await db.allocations.toArray()).toEqual([allocationRow('2026-06', 'b1', 1)]);
    expect(await db.monthNotes.count()).toBe(0);
  });

  it('imports a hand-edited backup with a repeated month and a repeated note id without failing', async () => {
    await importFromJson(backup([
      { month: '2026-06', incomeTotal: 0, allocations: { b1: 1 }, spent: {}, rollovers: {}, notes: [{ id: 'n1', text: 'A', effect: 'none', createdAt: 1 }] },
      { month: '2026-06', incomeTotal: 0, allocations: { b1: 2 }, spent: {}, rollovers: {}, notes: [{ id: 'n1', text: 'B', effect: 'none', createdAt: 2 }] },
    ]));

    expect(await db.allocations.toArray()).toEqual([allocationRow('2026-06', 'b1', 2)]);
    expect((await db.monthNotes.toArray()).map((n) => n.text)).toEqual(['B']);
  });
});
