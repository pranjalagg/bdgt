import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { editStamp, autoStamp, resetClockForTests } from '$lib/sync/clock';

beforeEach(() => {
  resetClockForTests();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-20T12:00:00.000Z'));
});

afterEach(() => vi.useRealTimers());

describe('editStamp', () => {
  it('is the current time for a record this device has not seen', () => {
    expect(editStamp(undefined)).toBe(Date.parse('2026-10-20T12:00:00.000Z'));
  });

  it('keeps increasing when the clock does not move', () => {
    const a = editStamp(undefined);
    const b = editStamp(undefined);
    const c = editStamp(undefined);
    expect([b - a, c - b]).toEqual([1, 1]);
  });

  it('never goes backwards when the clock does', () => {
    const a = editStamp(undefined);
    vi.setSystemTime(new Date('2026-10-20T11:00:00.000Z'));
    expect(editStamp(undefined)).toBe(a + 1);
  });

  it('is newer than the version this device already holds, even if its clock is behind', () => {
    const farFuture = Date.parse('2027-01-01T00:00:00.000Z');
    expect(editStamp(farFuture)).toBe(farFuture + 1);
  });

  it('ignores an old version when the clock is ahead of it', () => {
    expect(editStamp(5)).toBe(Date.parse('2026-10-20T12:00:00.000Z'));
  });
});

describe('autoStamp', () => {
  it('is 1 ms after the epoch for a record with no version, so any real edit beats it', () => {
    expect(autoStamp(undefined)).toBe(1);
  });

  it('is exactly one more than the version it replaces', () => {
    expect(autoStamp(1790000000000)).toBe(1790000000001);
  });

  it('is the same on every device for the same input, so repeated automatic writes converge', () => {
    expect(autoStamp(undefined)).toBe(autoStamp(undefined));
  });
});
