import { describe, it, expect } from 'vitest';
import { moveCard, DEFAULT_LAYOUT, HOME_CARDS, parseHomeLayout, serializeHomeLayout } from '$lib/home/layout';

describe('Home layout', () => {
  it('starts with review, envelopes and recent on, the rest off', () => {
    expect(DEFAULT_LAYOUT).toEqual([
      { id: 'review', on: true },
      { id: 'envelopes', on: true },
      { id: 'recent', on: true },
      { id: 'bills', on: false },
      { id: 'goals', on: false },
      { id: 'savingsRate', on: false },
      { id: 'notes', on: false },
    ]);
    expect(HOME_CARDS.map((c) => c.id)).toEqual(DEFAULT_LAYOUT.map((c) => c.id));
  });
  it('falls back to the default for anything unreadable', () => {
    expect(parseHomeLayout('not json')).toEqual(DEFAULT_LAYOUT);
    expect(parseHomeLayout(null)).toEqual(DEFAULT_LAYOUT);
    expect(parseHomeLayout('{"a":1}')).toEqual(DEFAULT_LAYOUT);
  });
  it('keeps a saved order, drops unknown cards and adds new ones at the end', () => {
    const parsed = parseHomeLayout(JSON.stringify([{ id: 'goals', on: true }, { id: 'nope', on: true }, { id: 'goals', on: false }]));
    expect(parsed.map((c) => c.id)).toEqual(['goals', 'review', 'envelopes', 'recent', 'bills', 'savingsRate', 'notes']);
    expect(parsed[0].on).toBe(true);
    expect(parsed.find((c) => c.id === 'review')?.on).toBe(true);
  });
  it('round-trips', () => {
    const l = [...DEFAULT_LAYOUT].reverse().map((c) => ({ ...c, on: !c.on }));
    expect(parseHomeLayout(serializeHomeLayout(l))).toEqual(l);
  });
  it('moves a card, clamping at either end and leaving the original alone', () => {
    const ids = (l: typeof DEFAULT_LAYOUT) => l.map((c) => c.id);
    expect(ids(moveCard(DEFAULT_LAYOUT, 2, 1))).toEqual(['review', 'recent', 'envelopes', 'bills', 'goals', 'savingsRate', 'notes']);
    expect(ids(moveCard(DEFAULT_LAYOUT, 0, 6))).toEqual(['envelopes', 'recent', 'bills', 'goals', 'savingsRate', 'notes', 'review']);
    expect(ids(moveCard(DEFAULT_LAYOUT, 0, -1))).toEqual(ids(DEFAULT_LAYOUT));
    expect(ids(moveCard(DEFAULT_LAYOUT, 6, 99))).toEqual(ids(DEFAULT_LAYOUT));
    expect(ids(DEFAULT_LAYOUT)[0]).toBe('review');
  });
});
