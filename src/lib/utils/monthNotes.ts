import type { MonthNote, MonthNoteEffect } from '$lib/types';

export const MAX_NOTE_LENGTH = 140;

export const NOTE_EFFECTS: { value: MonthNoteEffect; label: string }[] = [
  { value: 'down', label: 'Lowered savings' },
  { value: 'up', label: 'Raised savings' },
  { value: 'none', label: 'No effect' },
];

const EFFECTS = new Set<string>(NOTE_EFFECTS.map((e) => e.value));

// Trimmed text, or null when it is empty -- callers decide how to react.
export function cleanNoteText(text: string): string | null {
  const trimmed = text.trim().slice(0, MAX_NOTE_LENGTH);
  return trimmed === '' ? null : trimmed;
}

// Notes come back from storage and from imported files; keep only the
// well-formed ones instead of letting one bad row break the month.
export function normalizeMonthNotes(raw: unknown): MonthNote[] {
  if (!Array.isArray(raw)) return [];
  const notes: MonthNote[] = [];
  for (const n of raw) {
    if (!n || typeof n !== 'object') continue;
    const { id, text, effect, createdAt } = n as Record<string, unknown>;
    if (typeof id !== 'string' || typeof text !== 'string') continue;
    const cleaned = cleanNoteText(text);
    if (cleaned === null) continue;
    notes.push({
      id,
      text: cleaned,
      effect: typeof effect === 'string' && EFFECTS.has(effect) ? (effect as MonthNoteEffect) : 'none',
      createdAt: typeof createdAt === 'number' && Number.isFinite(createdAt) ? createdAt : 0,
    });
  }
  return notes;
}
