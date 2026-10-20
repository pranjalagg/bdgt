import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { db } from '$lib/db';
import { loadData, monthSnapshots, setAllocation, setAllocations, addMonthNote, deleteMonthNote } from '$lib/stores/budgetStore';
import { currentMonthKey } from '$lib/stores/uiStore';
import { resetRealDb } from '../../helpers/realDb';

describe('month records in the real database', () => {
  beforeEach(async () => {
    await resetRealDb();
    currentMonthKey.set('2026-03');
    monthSnapshots.set([]);
  });

  it('persists allocations and notes as rows and rebuilds the month on load', async () => {
    await setAllocations({ b1: 50000 });
    await setAllocation('b2', 25000);
    await addMonthNote('Trip', 'down');

    expect(await db.allocations.count()).toBe(2);
    expect(await db.monthNotes.count()).toBe(1);

    monthSnapshots.set([]);
    await loadData();

    const march = get(monthSnapshots).find((s) => s.month === '2026-03');
    expect(march?.allocations).toEqual({ b1: 50000, b2: 25000 });
    expect(march?.notes?.map((n) => n.text)).toEqual(['Trip']);
  });

  it('forgets a month once its only note is deleted, before and after a reload', async () => {
    await addMonthNote('Trip', 'down');
    const id = get(monthSnapshots)[0].notes![0].id;

    await deleteMonthNote(id);
    expect(get(monthSnapshots)).toEqual([]);

    await loadData();
    expect(get(monthSnapshots)).toEqual([]);
  });
});
