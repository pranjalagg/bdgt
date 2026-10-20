import { describe, it, expect, vi } from 'vitest';
import { fetchRate, RateFetchError, RATES_URL } from '$lib/currency/fetchRate';

const respond = (body: unknown, init: { ok?: boolean; status?: number } = {}) =>
  vi.fn(async (_input: RequestInfo | URL) => ({ ok: init.ok ?? true, status: init.status ?? 200, json: async () => body }) as Response);

describe('fetchRate', () => {
  it('requests the v2 endpoint with base and quote and returns the rate', async () => {
    const fetchImpl = respond([{ date: '2026-10-19', base: 'USD', quote: 'INR', rate: 94.85 }]);
    await expect(fetchRate('USD', 'INR', fetchImpl)).resolves.toBe(94.85);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe(`${RATES_URL}?base=USD&quotes=INR`);
    expect(RATES_URL).toBe('https://api.frankfurter.dev/v2/rates');
  });

  it('throws RateFetchError on a non-OK status, including 422 for an unknown currency', async () => {
    await expect(fetchRate('USD', 'INR', respond({ status: 422 }, { ok: false, status: 422 }))).rejects.toBeInstanceOf(RateFetchError);
    await expect(fetchRate('USD', 'INR', respond({}, { ok: false, status: 500 }))).rejects.toBeInstanceOf(RateFetchError);
  });

  it('throws on an empty array or a body that is not an array', async () => {
    await expect(fetchRate('USD', 'INR', respond([]))).rejects.toBeInstanceOf(RateFetchError);
    await expect(fetchRate('USD', 'INR', respond({ rate: 1 }))).rejects.toBeInstanceOf(RateFetchError);
  });

  it('throws on a bad, zero, negative or non-numeric rate', async () => {
    for (const rate of [0, -1, Infinity, '94.85', null]) {
      await expect(fetchRate('USD', 'INR', respond([{ base: 'USD', quote: 'INR', rate }])), String(rate)).rejects.toBeInstanceOf(RateFetchError);
    }
  });

  it('throws when the answer is for a different pair than asked', async () => {
    await expect(fetchRate('USD', 'INR', respond([{ base: 'USD', quote: 'EUR', rate: 0.9 }]))).rejects.toBeInstanceOf(RateFetchError);
  });

  it('throws RateFetchError when the network fails', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL): Promise<Response> => {
      throw new TypeError('Failed to fetch');
    });
    await expect(fetchRate('USD', 'INR', fetchImpl)).rejects.toBeInstanceOf(RateFetchError);
  });

  it('throws when the body is not JSON', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL) => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('x'); } }) as unknown as Response);
    await expect(fetchRate('USD', 'INR', fetchImpl)).rejects.toBeInstanceOf(RateFetchError);
  });
});
