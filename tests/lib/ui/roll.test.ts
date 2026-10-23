import { describe, it, expect } from 'vitest';
import { rollPlan } from '$lib/ui/roll';

describe('rollPlan', () => {
  it('reuses the digit columns when the shape is the same', () => {
    expect(rollPlan('$234.47', '$211.84').reuse).toBe(true);
  });
  it('rebuilds when a digit or separator appears', () => {
    expect(rollPlan('$999.99', '$1,000.00').reuse).toBe(false);
  });
  it('rebuilds when the sign changes', () => {
    expect(rollPlan('$12.40', '-$12.40').reuse).toBe(false);
  });
  it('splits the new text into characters', () => {
    expect(rollPlan(null, '$1,234,567.89').chars).toHaveLength(13);
    expect(rollPlan(null, '$5').reuse).toBe(false);
  });
});
