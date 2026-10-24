import { describe, it, expect } from 'vitest';
import { tileColors } from '$lib/ui/tiles';

describe('tileColors', () => {
  it('mixes an envelope colour softly into white in light mode', () => {
    expect(tileColors('#5856d6', false).background).toBe('rgb(225, 225, 248)');
  });
  it('mixes it a little stronger into the charcoal card in dark mode', () => {
    expect(tileColors('#5856d6', true).background).toBe('rgb(44, 44, 82)');
  });
  it('keeps the theme label colour for text', () => {
    expect(tileColors('#5856d6', false).text).toBe('rgb(var(--c-label))');
    expect(tileColors('#ffcc00', true).text).toBe('rgb(var(--c-label))');
  });
  it('accepts a short hex and falls back to neutral grey for anything unreadable', () => {
    expect(tileColors('#fff', false).background).toBe('rgb(255, 255, 255)');
    expect(tileColors('not a colour', false).background).toBe(tileColors('#8e8e93', false).background);
  });
});
