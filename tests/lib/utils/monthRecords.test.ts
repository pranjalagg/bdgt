import { describe, it, expect } from 'vitest';
import {
  allocationId,
  allocationRow,
  splitSnapshots,
  composeSnapshots,
  updateMonth,
  replaceNote,
  removeNote,
} from '$lib/utils/monthRecords';
import type { MonthSnapshot } from '$lib/types';

const month = (m: string, over: Partial<MonthSnapshot> = {}): MonthSnapshot => ({
  month: m, incomeTotal: 0, allocations: {}, spent: {}, rollovers: {}, ...over,
});
const note = (id: string, createdAt: number, text = id) => ({ id, text, effect: 'none' as const, createdAt });

describe('allocation rows', () => {
  it('ids an allocation by month and bucket', () => {
    expect(allocationId('2026-09', 'b1')).toBe('2026-09:b1');
    expect(allocationRow('2026-09', 'b1', 500)).toEqual({ id: '2026-09:b1', month: '2026-09', bucketId: 'b1', amount: 500 });
  });
});

describe('splitSnapshots', () => {
  it('turns each allocation and note into its own row', () => {
    const { allocations, notes } = splitSnapshots([
      month('2026-09', { allocations: { b1: 50000, b2: 0 }, notes: [note('n1', 5, 'Trip')] }),
    ]);
    expect(allocations).toEqual([
      { id: '2026-09:b1', month: '2026-09', bucketId: 'b1', amount: 50000 },
      { id: '2026-09:b2', month: '2026-09', bucketId: 'b2', amount: 0 },
    ]);
    expect(notes).toEqual([{ id: 'n1', text: 'Trip', effect: 'none', createdAt: 5, month: '2026-09' }]);
  });

  it('ignores the never-read incomeTotal, spent and rollovers', () => {
    const { allocations, notes } = splitSnapshots([
      month('2026-06', { incomeTotal: 736817, spent: { b1: 1234 }, rollovers: { b1: 9 } }),
    ]);
    expect(allocations).toEqual([]);
    expect(notes).toEqual([]);
  });

  it('drops a non-finite allocation and malformed notes, keeping the rest', () => {
    const { allocations, notes } = splitSnapshots([
      month('2026-09', {
        allocations: { ok: 100, nan: Number.NaN, inf: Infinity, str: '5' as unknown as number },
        notes: [note('n1', 1), { text: 'no id' } as never, note('n2', 2, '   ')],
      }),
    ]);
    expect(allocations.map((a) => a.bucketId)).toEqual(['ok']);
    expect(notes.map((n) => n.id)).toEqual(['n1']);
  });

  it('skips months that are not a real YYYY-MM, which would hang the rollover range or alias ids', () => {
    const bad = ['__proto__', 'Jan 2024', '10000-01', '2024-13', '2024-00', '2024-1', '2024-01:a', ''];
    const { allocations, notes } = splitSnapshots(
      bad.map((m) => month(m, { allocations: { b1: 1 }, notes: [note(`n-${m}`, 1)] }))
    );
    expect(allocations).toEqual([]);
    expect(notes).toEqual([]);
    expect(splitSnapshots([month('2024-12', { allocations: { b1: 1 } })]).allocations).toHaveLength(1);
  });

  it('skips records without a month and non-objects', () => {
    expect(splitSnapshots([null, 5, { allocations: { b1: 1 } }])).toEqual({ allocations: [], notes: [] });
  });
});

describe('composeSnapshots', () => {
  it('rebuilds one month record per month, in month order, with the old shape', () => {
    const snapshots = composeSnapshots(
      [allocationRow('2026-10', 'b1', 60000), allocationRow('2026-09', 'b1', 50000), allocationRow('2026-09', 'b2', 1)],
      [{ ...note('n2', 9), month: '2026-09' }, { ...note('n1', 5), month: '2026-09' }]
    );
    expect(snapshots).toEqual([
      month('2026-09', { allocations: { b1: 50000, b2: 1 }, notes: [note('n1', 5), note('n2', 9)] }),
      month('2026-10', { allocations: { b1: 60000 } }),
    ]);
    expect(snapshots[1]).not.toHaveProperty('notes');
  });

  it('keeps a month that has only notes, so it still anchors the rollover range', () => {
    expect(composeSnapshots([], [{ ...note('n1', 1), month: '2026-02' }])).toEqual([
      month('2026-02', { notes: [note('n1', 1)] }),
    ]);
  });

  it('round-trips clean month records through split and compose', () => {
    const original = [
      month('2026-08', { notes: [note('a', 1)] }),
      month('2026-09', { allocations: { b1: 1, b2: 2 }, notes: [note('b', 2), note('c', 3)] }),
    ];
    const { allocations, notes } = splitSnapshots(original);
    expect(composeSnapshots(allocations, notes)).toEqual(original);
  });
});

describe('updateMonth', () => {
  it('creates the month when it has no record yet', () => {
    const next = updateMonth([], '2026-03', (s) => ({ ...s, allocations: { b1: 5 } }));
    expect(next).toEqual([month('2026-03', { allocations: { b1: 5 } })]);
  });

  it('replaces only the named month', () => {
    const before = [month('2026-02', { allocations: { b1: 1 } }), month('2026-03', { allocations: { b1: 2 } })];
    const next = updateMonth(before, '2026-03', (s) => ({ ...s, allocations: { ...s.allocations, b2: 3 } }));
    expect(next).toEqual([month('2026-02', { allocations: { b1: 1 } }), month('2026-03', { allocations: { b1: 2, b2: 3 } })]);
  });

  it('removes a month left with no allocations and no notes, as a reload would', () => {
    const before = [month('2026-03', { notes: [note('n1', 1)] })];
    expect(updateMonth(before, '2026-03', (s) => ({ ...s, notes: [] }))).toEqual([]);
  });

  it('adds nothing for a no-op change on a month without a record', () => {
    expect(updateMonth([], '2026-03', (s) => s)).toEqual([]);
  });
});

describe('replaceNote and removeNote', () => {
  const before = [
    month('2026-02', { allocations: { b1: 1 }, notes: [note('n1', 1)] }),
    month('2026-03', { notes: [note('n2', 2), note('n3', 3)] }),
  ];

  it('edits the named note wherever it is', () => {
    const next = replaceNote(before, 'n3', { text: 'Bonus', effect: 'up' });
    expect(next[1].notes).toEqual([note('n2', 2), { id: 'n3', text: 'Bonus', effect: 'up', createdAt: 3 }]);
    expect(next[0]).toBe(before[0]);
  });

  it('removes the named note and keeps a month that still has allocations', () => {
    const next = removeNote(before, 'n1');
    expect(next[0]).toEqual(month('2026-02', { allocations: { b1: 1 }, notes: [] }));
  });

  it('removes a month whose last note went and which has no allocations', () => {
    const once = removeNote(before, 'n2');
    expect(removeNote(once, 'n3').map((s) => s.month)).toEqual(['2026-02']);
  });

  it('leaves everything alone for an unknown id', () => {
    expect(replaceNote(before, 'nope', { text: 'x', effect: 'none' })).toBe(before);
    expect(removeNote(before, 'nope')).toBe(before);
  });
});
