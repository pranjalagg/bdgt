import { describe, it, expect } from 'vitest';
import { cleanNoteText, normalizeMonthNotes, MAX_NOTE_LENGTH } from '$lib/utils/monthNotes';

describe('cleanNoteText', () => {
  it('trims and rejects empty text', () => {
    expect(cleanNoteText('  Labor Day  ')).toBe('Labor Day');
    expect(cleanNoteText('   ')).toBeNull();
  });

  it('caps the length', () => {
    expect(cleanNoteText('x'.repeat(MAX_NOTE_LENGTH + 50))).toHaveLength(MAX_NOTE_LENGTH);
  });
});

describe('normalizeMonthNotes', () => {
  it('returns [] for anything that is not a list', () => {
    expect(normalizeMonthNotes(undefined)).toEqual([]);
    expect(normalizeMonthNotes({})).toEqual([]);
  });

  it('defaults an unknown effect to none and a missing timestamp to 0', () => {
    expect(normalizeMonthNotes([{ id: 'a', text: 'Trip', effect: 'weird' }])).toEqual([
      { id: 'a', text: 'Trip', effect: 'none', createdAt: 0 },
    ]);
  });
});
