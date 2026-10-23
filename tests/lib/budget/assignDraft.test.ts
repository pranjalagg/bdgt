import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Bucket } from '$lib/types';
import { draftFrom, draftTotal, leftToAssign, restTarget, dollarsText } from '$lib/budget/assignDraft';

const sampleBuckets: Bucket[] = JSON.parse(readFileSync('scripts/ui-check/sample-backup.json', 'utf8')).data.buckets;

describe('assign draft', () => {
  it('starts from what fixed envelopes already have, blank for nothing', () => {
    const draft = draftFrom([
      { bucket: { ...sampleBuckets[2], allocationType: 'fixed' }, allocated: 50000 },
      { bucket: { ...sampleBuckets[3], allocationType: 'fixed' }, allocated: 0 },
      { bucket: { ...sampleBuckets[4], allocationType: 'percentage' }, allocated: 9000 },
    ]);
    expect(draft).toEqual({ groc: '500', trans: '' });
  });
  it('totals the fields, expressions included', () => {
    expect(draftTotal({ groc: '500', dine: '250+50' }, 0)).toBe(80000);
    expect(draftTotal({ groc: '', dine: '1.5' }, 1000)).toBe(1150);
  });
  it('has no total while a field is not an amount', () => {
    expect(draftTotal({ groc: 'abc' }, 0)).toBeNull();
    expect(draftTotal({ groc: '-5' }, 0)).toBeNull();
  });
  it('can go below zero when more is assigned than earned', () => {
    expect(leftToAssign(520000, 530000)).toBe(-10000);
  });
  it('puts the rest in the first savings envelope, if there is one', () => {
    expect(restTarget(sampleBuckets)?.id).toBe('save');
    expect(restTarget(sampleBuckets.filter((b) => !b.isSavings))).toBeNull();
  });
  it('writes dollars without cents when they are whole', () => {
    expect(dollarsText(50000)).toBe('500');
    expect(dollarsText(1250)).toBe('12.50');
    expect(dollarsText(0)).toBe('');
  });
});
