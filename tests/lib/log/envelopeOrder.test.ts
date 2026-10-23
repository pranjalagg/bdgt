import { describe, it, expect } from 'vitest';
import { orderByUse } from '$lib/log/envelopeOrder';

describe('orderByUse', () => {
  it('puts the most-used envelopes first and keeps the given order for ties', () => {
    const txs = [{ bucketId: 'c' }, { bucketId: 'b' }, { bucketId: 'c' }, { bucketId: 'x' }];
    expect(orderByUse(['a', 'b', 'c', 'd'], txs)).toEqual(['c', 'b', 'a', 'd']);
  });
  it('keeps the order with no history', () => {
    expect(orderByUse(['a', 'b'], [])).toEqual(['a', 'b']);
  });
});
