import { describe, it, expect } from 'vitest';
import { recurringFormData } from '$lib/budget/recurringForm';

const values = { amount: '10 + 5.25', bucketId: 'subs', frequency: 'monthly' as const, nextDueDate: '2026-11-01', note: '' };

describe('recurringFormData', () => {
  it('a new item starts active', () => {
    expect(recurringFormData(values).isActive).toBe(true);
  });
  it('editing a paused item keeps it paused', () => {
    expect(recurringFormData(values, { isActive: false }).isActive).toBe(false);
  });
  it('works out the amount and reads the date as a local day', () => {
    const data = recurringFormData(values);
    expect(data.amount).toBe(1525);
    expect([data.nextDueDate.getFullYear(), data.nextDueDate.getMonth(), data.nextDueDate.getDate()]).toEqual([2026, 10, 1]);
    expect(data.note).toBeUndefined();
  });
});
