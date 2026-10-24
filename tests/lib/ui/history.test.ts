import { describe, it, expect } from 'vitest';
import { nextStack, backTarget, closeSteps, parentOf, stepsBackTo } from '$lib/ui/history';

describe('nextStack', () => {
  it('starts over when the app opens', () => {
    expect(nextStack(['/a'], 'enter', '/x')).toEqual(['/x']);
  });
  it('pushes a page opened by a link or goto', () => {
    expect(nextStack(['/'], 'link', '/settings')).toEqual(['/', '/settings']);
    expect(nextStack(['/'], 'goto', '/budget')).toEqual(['/', '/budget']);
  });
  it('replaces the top page for a replacing navigation', () => {
    expect(nextStack(['/', '/review'], 'goto', '/activity', true)).toEqual(['/', '/activity']);
  });
  it('pops back to the page gone back to, however many steps that was', () => {
    expect(nextStack(['/', '/settings', '/settings/rules'], 'popstate', '/settings')).toEqual(['/', '/settings']);
    expect(nextStack(['/', '/settings', '/settings/rules'], 'popstate', '/')).toEqual(['/']);
  });
  it('treats a popstate to a page not behind it as forward', () => {
    expect(nextStack(['/'], 'popstate', '/budget')).toEqual(['/', '/budget']);
  });
});

describe('backTarget', () => {
  it('is the page behind the current one', () => {
    expect(backTarget(['/', '/settings', '/settings/rules'])).toBe('/settings');
  });
  it('is nothing for a page opened directly', () => {
    expect(backTarget(['/budget/groc'])).toBeNull();
  });
});

describe('closeSteps', () => {
  it('goes back past every page inside Settings to the page it opened over', () => {
    // Settings, then Capture rules, then "‹ Settings" as a link: Done must
    // land on Home, not on Capture rules.
    expect(closeSteps(['/', '/settings', '/settings/rules', '/settings'])).toBe(3);
    expect(closeSteps(['/activity', '/review'])).toBe(1);
  });
  it('is nothing when Settings or Review was opened directly', () => {
    expect(closeSteps(['/review'])).toBeNull();
    expect(closeSteps(['/settings', '/settings/sync'])).toBeNull();
  });
});

describe('parentOf', () => {
  it('is the page one level up', () => {
    expect(parentOf('/settings/rules')).toBe('/settings');
    expect(parentOf('/budget/groc')).toBe('/budget');
    expect(parentOf('/insights/spending')).toBe('/insights');
    expect(parentOf('/budget')).toBe('/');
  });
});

describe('stepsBackTo', () => {
  it('counts the steps back to a tab when only its own pages are on top', () => {
    expect(stepsBackTo(['/', '/budget', '/budget/groc'], '/budget')).toBe(1);
    expect(stepsBackTo(['/budget', '/budget/groc', '/budget/bills'], '/budget')).toBe(2);
  });
  it('is nothing when the tab is not behind, or another tab sits in between', () => {
    expect(stepsBackTo(['/', '/budget/groc'], '/budget')).toBeNull();
    expect(stepsBackTo(['/budget', '/activity', '/budget/groc'], '/budget')).toBeNull();
    expect(stepsBackTo(['/budget'], '/budget')).toBeNull();
  });
});
