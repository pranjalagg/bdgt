import { describe, it, expect } from 'vitest';
import { findDuplicate } from '$lib/capture/dedupe';
import type { Capture } from '$lib/types';

const T = Date.UTC(2026, 9, 21, 9);
const capture = (id: string, over: Partial<Capture> = {}): Capture => ({
  id, status: 'pending', source: 'sms', sourceLabel: 'HDFC Bank SMS', postedAt: T, date: new Date(2026, 9, 21),
  amount: 25000, currency: 'INR', merchant: 'Swiggy', ...over,
});

describe('findDuplicate', () => {
  it('matches the same payment seen by another source within 15 minutes, whatever its status', () => {
    const incoming = capture('new', { source: 'upi-app', postedAt: T + 60_000 });
    expect(findDuplicate(incoming, undefined, [{ capture: capture('sms') }])).toBe('sms');
    expect(findDuplicate(incoming, undefined, [{ capture: capture('sms', { status: 'approved' }) }])).toBe('sms');
  });

  it('never merges two payments from the same source, or ones that differ', () => {
    const incoming = capture('new', { postedAt: T + 60_000 });
    expect(findDuplicate(incoming, undefined, [{ capture: capture('a') }])).toBeNull();
    const fromApp = { ...incoming, source: 'upi-app' as const };
    expect(findDuplicate(fromApp, undefined, [{ capture: capture('a', { amount: 25100 }) }])).toBeNull();
    expect(findDuplicate(fromApp, undefined, [{ capture: capture('a', { currency: 'USD' }) }])).toBeNull();
    expect(findDuplicate(fromApp, undefined, [{ capture: capture('a', { postedAt: T - 16 * 60_000 }) }])).toBeNull();
    expect(findDuplicate(fromApp, undefined, [{ capture: capture('a', { status: 'duplicate' }) }])).toBeNull();
  });

  it('lets UPI references decide when both sides have one', () => {
    const incoming = capture('new', { source: 'upi-app' });
    expect(findDuplicate(incoming, 'R1', [{ capture: capture('a'), reference: 'R2' }, { capture: capture('b'), reference: 'R1' }])).toBe('b');
    expect(findDuplicate(incoming, 'R1', [{ capture: capture('a'), reference: 'R2' }])).toBeNull();
  });

  it('trusts only a single match otherwise', () => {
    const incoming = capture('new', { source: 'wallet' });
    expect(findDuplicate(incoming, undefined, [{ capture: capture('a') }, { capture: capture('b', { source: 'upi-app' }) }])).toBeNull();
    expect(findDuplicate(incoming, 'R1', [{ capture: capture('a') }])).toBe('a');
  });
});
