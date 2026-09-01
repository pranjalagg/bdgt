import { describe, it, expect } from 'vitest';
import { shouldSeedDefaults } from '$lib/db';

describe('shouldSeedDefaults', () => {
  it('seeds when the db is empty and has never been seeded', () => {
    expect(shouldSeedDefaults(0, false)).toBe(true);
  });

  it('does not seed when buckets already exist', () => {
    expect(shouldSeedDefaults(5, false)).toBe(false);
  });

  it('does not re-seed an empty db the user deliberately cleared', () => {
    expect(shouldSeedDefaults(0, true)).toBe(false);
  });
});
