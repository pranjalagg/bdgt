import { describe, it, expect } from 'vitest';
import { envelopeIcon, ICONS } from '$lib/ui/icons';

describe('envelopeIcon', () => {
  it.each([
    ['Rent/Mortgage', 'house'],
    ['Grocery', 'cart'],
    ['Groceries', 'cart'],
    ['Dining Out', 'utensils'],
    ['Transportation', 'car'],
    ['Utilities', 'zap'],
    ['Subscriptions', 'repeat'],
    ['Entertainment', 'film'],
    ['Savings', 'piggy'],
    ['Investments', 'trend'],
    ['Emergency Fund', 'shield'],
    ['Misc', 'bag'],
    ['Pocket money', 'tag'],
  ])('%s → %s', (name, icon) => {
    expect(envelopeIcon(name)).toBe(icon);
  });

  it('the system Unsorted envelope gets the inbox icon', () => {
    expect(envelopeIcon('Unsorted', true)).toBe('inbox');
  });

  it('every icon it can return has artwork', () => {
    for (const name of ['house', 'cart', 'utensils', 'car', 'zap', 'repeat', 'film', 'piggy', 'trend', 'shield', 'bag', 'tag', 'inbox'] as const) {
      expect(ICONS[name]).toMatch(/<(path|circle|rect|polyline)/);
    }
  });
});
