import { describe, it, expect } from 'vitest';
import { isModalRoot, inModal, isTabRoot, tabRootOf } from '$lib/ui/routes';

describe('routes', () => {
  it('knows the pages that slide up, but not the pages inside them', () => {
    expect(isModalRoot('/review')).toBe(true);
    expect(isModalRoot('/settings')).toBe(true);
    expect(isModalRoot('/settings/sync')).toBe(false);
    expect(isModalRoot('/budget')).toBe(false);
  });
  it('knows every page that lives in a slide-up page', () => {
    expect(inModal('/settings/sync')).toBe(true);
    expect(inModal('/review')).toBe(true);
    expect(inModal('/reviewer')).toBe(false);
    expect(inModal('/activity')).toBe(false);
  });
  it('knows the tab roots', () => {
    expect(isTabRoot('/')).toBe(true);
    expect(isTabRoot('/budget/')).toBe(true);
    expect(isTabRoot('/budget/groc')).toBe(false);
  });
  it('maps a modal page to the tab it opens from', () => {
    expect(tabRootOf('/review')).toBe('/activity');
    expect(tabRootOf('/settings/capture')).toBe('/');
  });
});
