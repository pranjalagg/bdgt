import { describe, it, expect } from 'vitest';
import { headline, watchingNote, confidenceLabel, steadierLine } from '$lib/insights/copy';
import type { BucketRelation } from '$lib/insights';

const rel = (over: Partial<BucketRelation> = {}): BucketRelation => ({
  a: { id: 'e', name: 'Eating Out', color: '#f00' },
  b: { id: 'g', name: 'Groceries', color: '#0f0' },
  months: 6, rho: -0.7, relation: 'trade-off', steadierBy: 18, confidence: 'early',
  series: { months: [], a: [], b: [] },
  ...over,
});

describe('copy', () => {
  it('words a trade-off without claiming cause', () => {
    expect(headline(rel())).toBe('When Eating Out is high, Groceries tends to be low.');
  });

  it('words buckets that rise together', () => {
    expect(headline(rel({ relation: 'move-together', rho: 0.8 }))).toBe('Eating Out and Groceries tend to rise together.');
  });

  it('writes a watching note that names the months', () => {
    expect(watchingNote(rel({ confidence: 'watching' }))).toBe(
      "Eating Out and Groceries lean opposite, but 6 months isn't enough to be sure."
    );
    expect(watchingNote(rel({ confidence: 'watching', relation: 'move-together', months: 7 }))).toBe(
      "Eating Out and Groceries lean the same way, but 7 months isn't enough to be sure."
    );
  });

  it('labels confidence with the month count', () => {
    expect(confidenceLabel(rel({ confidence: 'early', months: 6 }))).toBe('Early signal · 6 months');
    expect(confidenceLabel(rel({ confidence: 'likely', months: 9 }))).toBe('Likely · 9 months');
    expect(confidenceLabel(rel({ confidence: 'strong', months: 12 }))).toBe('Strong · 12 months');
  });

  it('describes the steadier-together benefit with no dollar amounts', () => {
    const line = steadierLine(18);
    expect(line).toBe('Together they vary 18% less than separately. A combined budget may fit better than two separate ones.');
    expect(line).not.toMatch(/\$/);
  });
});
