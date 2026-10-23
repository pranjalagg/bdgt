import { describe, it, expect } from 'vitest';
import { navDirection } from '$lib/ui/navDirection';
import { edgeSwipeDecision } from '$lib/ui/edgeSwipe';

describe('navDirection', () => {
  it('switching tabs fades', () => {
    expect(navDirection('/', '/budget')).toBe('tab');
    expect(navDirection('/budget/groc', '/activity')).toBe('tab');
  });
  it('going deeper pushes, coming back pops', () => {
    expect(navDirection('/budget', '/budget/groc')).toBe('push');
    expect(navDirection('/budget/groc', '/budget')).toBe('pop');
    expect(navDirection('/settings', '/settings/sync')).toBe('push');
  });
  it('Review and Settings slide up and back down', () => {
    expect(navDirection('/activity', '/review')).toBe('up');
    expect(navDirection('/review', '/activity')).toBe('down');
    expect(navDirection('/', '/settings')).toBe('up');
  });
  it('the first page of a visit does not slide', () => {
    expect(navDirection(null, '/budget/groc')).toBe('tab');
  });
});

describe('edgeSwipeDecision', () => {
  it('goes back past a third of the width', () => {
    expect(edgeSwipeDecision(140, 390, 0.1)).toBe(true);
  });
  it('springs back on a short slow drag', () => {
    expect(edgeSwipeDecision(80, 390, 0.2)).toBe(false);
  });
  it('goes back on a quick flick', () => {
    expect(edgeSwipeDecision(40, 390, 0.9)).toBe(true);
  });
});
