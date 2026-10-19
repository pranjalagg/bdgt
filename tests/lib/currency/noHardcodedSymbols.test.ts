import { describe, it, expect } from 'vitest';

const components = import.meta.glob('/src/**/*.svelte', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

// A literal "$" in markup shows dollars to a rupee user. Money prefixes and
// placeholders must come from currencySymbol().
describe('no hard-coded dollar sign in money UI', () => {
  it('scans the components', () => {
    expect(Object.keys(components).length).toBeGreaterThan(20);
  });

  it('has no literal $ prefix span or $ placeholder in any component', () => {
    const offenders = Object.entries(components)
      .filter(([, source]) => /<span[^>]*>\$<\/span>|placeholder="\$/.test(source))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });
});
