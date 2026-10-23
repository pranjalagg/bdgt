import { describe, it, expect } from 'vitest';
import { backDecision } from '$lib/ui/backButton';
import { tabRootOf } from '$lib/ui/routes';

describe('Android back button', () => {
  it('closes the top sheet first', () => {
    expect(backDecision({ openSheets: 1, atTabRoot: true, canGoBack: true })).toBe('close-sheet');
  });
  it('goes back a page inside a tab', () => {
    expect(backDecision({ openSheets: 0, atTabRoot: false, canGoBack: true })).toBe('back');
  });
  it('a page opened directly goes to its tab root, not out of the app', () => {
    expect(backDecision({ openSheets: 0, atTabRoot: false, canGoBack: false })).toBe('to-root');
  });
  it('leaves the app from a tab root', () => {
    expect(backDecision({ openSheets: 0, atTabRoot: true, canGoBack: true })).toBe('exit');
  });
});

describe('tabRootOf', () => {
  it('finds the tab a path belongs to', () => {
    expect(tabRootOf('/insights/spending')).toBe('/insights');
    expect(tabRootOf('/budget/groc')).toBe('/budget');
    expect(tabRootOf('/')).toBe('/');
    expect(tabRootOf('/review')).toBe('/activity');
    expect(tabRootOf('/settings/sync')).toBe('/');
  });
});
