import { normalizeMonthNotes } from './monthNotes';
import type { AllocationRow, MonthNote, MonthNoteRow, MonthSnapshot } from '$lib/types';

// Month records used to be one row per month holding every allocation and
// note. Sync needs finer rows (two devices assigning different buckets in
// the same month must not overwrite each other), so they are stored as one
// row per allocation and one per note. The app keeps whole month records in
// memory; these helpers convert between the two shapes.

// A real month key. Anything else (from a hand-edited backup) would stretch
// the rollover range without end or make two allocation ids collide.
const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;

export function allocationId(month: string, bucketId: string): string {
  return `${month}:${bucketId}`;
}

export function allocationRow(month: string, bucketId: string, amount: number): AllocationRow {
  return { id: allocationId(month, bucketId), month, bucketId, amount };
}

// From stored or imported month records. Only allocations and notes carry
// meaning: incomeTotal, spent and rollovers were never read (and are stale
// in some older records). A non-finite allocation is dropped, and a month
// with neither allocations nor notes produces no rows.
export function splitSnapshots(snapshots: unknown[]): { allocations: AllocationRow[]; notes: MonthNoteRow[] } {
  const allocations: AllocationRow[] = [];
  const notes: MonthNoteRow[] = [];
  for (const raw of snapshots) {
    if (!raw || typeof raw !== 'object') continue;
    const { month, allocations: rawAllocations, notes: rawNotes } = raw as Record<string, unknown>;
    if (typeof month !== 'string' || !MONTH_KEY.test(month)) continue;
    if (rawAllocations && typeof rawAllocations === 'object') {
      for (const [bucketId, amount] of Object.entries(rawAllocations as Record<string, unknown>)) {
        if (typeof amount === 'number' && Number.isFinite(amount)) {
          allocations.push(allocationRow(month, bucketId, amount));
        }
      }
    }
    for (const note of normalizeMonthNotes(rawNotes)) notes.push({ ...note, month });
  }
  return { allocations, notes };
}

function blankMonth(month: string): MonthSnapshot {
  return { month, incomeTotal: 0, allocations: {}, spent: {}, rollovers: {} };
}

function isEmptyMonth(s: MonthSnapshot): boolean {
  return Object.keys(s.allocations).length === 0 && (s.notes?.length ?? 0) === 0;
}

// Back to whole month records: one per month that has an allocation or a
// note, in month order, notes in entry order.
export function composeSnapshots(allocations: AllocationRow[], notes: MonthNoteRow[]): MonthSnapshot[] {
  const byMonth = new Map<string, MonthSnapshot>();
  const monthOf = (m: string): MonthSnapshot => {
    let s = byMonth.get(m);
    if (!s) {
      s = blankMonth(m);
      byMonth.set(m, s);
    }
    return s;
  };
  for (const a of allocations) monthOf(a.month).allocations[a.bucketId] = a.amount;
  for (const { month, ...note } of notes) (monthOf(month).notes ??= []).push(note);
  for (const s of byMonth.values()) {
    s.notes?.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  }
  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
}

// Applies `change` to one month (a blank one when it has no record yet). A
// month left with no allocations and no notes is removed, which is what
// composeSnapshots produces on the next load.
export function updateMonth(
  snapshots: MonthSnapshot[],
  month: string,
  change: (s: MonthSnapshot) => MonthSnapshot
): MonthSnapshot[] {
  const idx = snapshots.findIndex((s) => s.month === month);
  const next = change(idx >= 0 ? snapshots[idx] : blankMonth(month));
  if (isEmptyMonth(next)) return snapshots.filter((s) => s.month !== month);
  if (idx < 0) return [...snapshots, next];
  const copy = [...snapshots];
  copy[idx] = next;
  return copy;
}

function monthOfNote(snapshots: MonthSnapshot[], id: string): string | undefined {
  return snapshots.find((s) => s.notes?.some((n) => n.id === id))?.month;
}

export function replaceNote(
  snapshots: MonthSnapshot[],
  id: string,
  changes: Pick<MonthNote, 'text' | 'effect'>
): MonthSnapshot[] {
  const month = monthOfNote(snapshots, id);
  if (month === undefined) return snapshots;
  return updateMonth(snapshots, month, (s) => ({
    ...s,
    notes: s.notes?.map((n) => (n.id === id ? { ...n, ...changes } : n)),
  }));
}

export function removeNote(snapshots: MonthSnapshot[], id: string): MonthSnapshot[] {
  const month = monthOfNote(snapshots, id);
  if (month === undefined) return snapshots;
  return updateMonth(snapshots, month, (s) => ({ ...s, notes: s.notes?.filter((n) => n.id !== id) }));
}
