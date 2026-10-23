import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Bucket } from '$lib/types';
import { groupEnvelopes } from '$lib/budget/groups';

const sampleBuckets: Bucket[] = JSON.parse(readFileSync('scripts/ui-check/sample-backup.json', 'utf8')).data.buckets;
const statuses = sampleBuckets.map((bucket) => ({ bucket }));

describe('groupEnvelopes', () => {
  it('puts everyday envelopes together, in their order', () => {
    expect(groupEnvelopes(statuses).everyday.map((s) => s.bucket.id)).toEqual(['groc', 'trans', 'dine', 'ent', 'misc']);
  });
  it('treats the rest of the spending envelopes as bills', () => {
    expect(groupEnvelopes(statuses).bills.map((s) => s.bucket.id)).toEqual(['rent', 'util', 'subs']);
  });
  it('keeps savings envelopes apart', () => {
    expect(groupEnvelopes(statuses).savings.map((s) => s.bucket.id)).toEqual(['save', 'inv', 'emer']);
  });
  it('holds the system Unsorted envelope separately', () => {
    const unsorted = { bucket: { ...sampleBuckets[0], id: 'unsorted', name: 'Unsorted', isSystem: true, isEveryday: true } };
    const g = groupEnvelopes([...statuses, unsorted]);
    expect(g.unsorted?.bucket.id).toBe('unsorted');
    expect(g.everyday.map((s) => s.bucket.id)).not.toContain('unsorted');
  });
});
