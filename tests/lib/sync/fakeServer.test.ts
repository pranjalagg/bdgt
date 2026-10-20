import { describe, it, expect } from 'vitest';
import { FakeServer } from '../../helpers/fakeServer';
import { SyncError } from '$lib/sync/transport';

const at = (ms: number) => new Date(ms).toISOString();
const row = (id: string, updatedMs: number, over: Record<string, unknown> = {}) => ({ id, amount_cents: 1, updated_at: at(updatedMs), deleted_at: null, extra: {}, ...over });

describe('FakeServer write rules', () => {
  it('stores rows and returns their stamps', async () => {
    const server = new FakeServer(() => 2_000_000);
    const stored = await server.upsert('transactions', [row('a', 1000)]);
    expect(stored).toEqual([{ id: 'a', updated_at: at(1000) }]);
    expect(server.live('transactions').map((r) => r.id)).toEqual(['a']);
  });

  it('skips an update older than the stored row, and returns nothing for it', async () => {
    const server = new FakeServer(() => 2_000_000);
    await server.upsert('transactions', [row('a', 5000, { amount_cents: 5 })]);
    const stored = await server.upsert('transactions', [row('a', 4000, { amount_cents: 4 })]);
    expect(stored).toEqual([]);
    expect(server.live('transactions')[0].amount_cents).toBe(5);
  });

  it('applies an update with the same or a newer time', async () => {
    const server = new FakeServer(() => 2_000_000);
    await server.upsert('transactions', [row('a', 5000, { amount_cents: 5 })]);
    expect(await server.upsert('transactions', [row('a', 5000, { amount_cents: 6 })])).toHaveLength(1);
    expect(await server.upsert('transactions', [row('a', 6000, { amount_cents: 7 })])).toHaveLength(1);
    expect(server.live('transactions')[0].amount_cents).toBe(7);
  });

  it('caps a time in the future at the server clock plus one minute', async () => {
    const server = new FakeServer(() => 1_000_000);
    const stored = await server.upsert('transactions', [row('a', 99_000_000)]);
    expect(Date.parse(stored[0].updated_at)).toBe(1_060_000);
  });

  it('keeps a deleted row as a tombstone that a stale save cannot revive', async () => {
    const server = new FakeServer(() => 2_000_000);
    await server.upsert('transactions', [row('a', 1000)]);
    await server.upsert('transactions', [{ id: 'a', updated_at: at(3000), deleted_at: at(3000) }]);
    expect(server.live('transactions')).toEqual([]);
    expect(server.all('transactions')).toHaveLength(1);
    expect(await server.upsert('transactions', [row('a', 2000)])).toEqual([]);
    expect(await server.upsert('transactions', [row('a', 4000)])).toHaveLength(1);
    expect(server.live('transactions')).toHaveLength(1);
  });

  it('merges a delete over the stored columns', async () => {
    const server = new FakeServer(() => 2_000_000);
    await server.upsert('transactions', [row('a', 1000, { amount_cents: 9 })]);
    await server.upsert('transactions', [{ id: 'a', updated_at: at(2000), deleted_at: at(2000) }]);
    expect(server.all('transactions')[0].amount_cents).toBe(9);
  });

  it('gives every write a strictly later synced_at', async () => {
    const server = new FakeServer(() => 2_000_000);
    await server.upsert('transactions', [row('a', 1), row('b', 1)]);
    const [a, b] = server.all('transactions');
    expect(String(b.synced_at) > String(a.synced_at)).toBe(true);
  });
});

describe('FakeServer pull', () => {
  async function seeded() {
    const server = new FakeServer(() => 2_000_000);
    for (const id of ['a', 'b', 'c', 'd']) await server.upsert('transactions', [row(id, 1000)]);
    return server;
  }

  it('returns rows in write order and honours the limit', async () => {
    const server = await seeded();
    expect((await server.pull('transactions', null, 3)).map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('returns rows at or after since', async () => {
    const server = await seeded();
    const all = await server.pull('transactions', null, 10);
    const since = all[2].synced_at;
    expect((await server.pull('transactions', since, 10)).map((r) => r.id)).toEqual(['c', 'd']);
  });

  it('includes tombstones', async () => {
    const server = await seeded();
    await server.upsert('transactions', [{ id: 'a', updated_at: at(2000), deleted_at: at(2000) }]);
    const rows = await server.pull('transactions', null, 10);
    expect(rows.find((r) => r.id === 'a')?.deleted_at).toBe(at(2000));
  });
});

describe('FakeServer failures and account state', () => {
  it('throws a network error while offline', async () => {
    const server = new FakeServer();
    server.offline = true;
    await expect(server.upsert('transactions', [row('a', 1)])).rejects.toMatchObject({ kind: 'network' });
    await expect(server.pull('transactions', null, 5)).rejects.toBeInstanceOf(SyncError);
    await expect(server.accountState()).rejects.toMatchObject({ kind: 'network' });
  });

  it('rejects a whole batch that contains a rejected id, storing nothing from it', async () => {
    const server = new FakeServer(() => 2_000_000);
    server.rejectIds.add('bad');
    await expect(server.upsert('transactions', [row('ok', 1), row('bad', 1)])).rejects.toMatchObject({ kind: 'rejected' });
    expect(server.all('transactions')).toEqual([]);
  });

  it('refuses writes and reads for an account that is not allowed, but reports it', async () => {
    const server = new FakeServer();
    server.allowed = false;
    await expect(server.upsert('transactions', [row('a', 1)])).rejects.toMatchObject({ kind: 'notAllowed' });
    await expect(server.pull('transactions', null, 5)).rejects.toMatchObject({ kind: 'notAllowed' });
    expect(await server.accountState()).toMatchObject({ allowed: false, buckets: [], hasOtherRows: false });
  });

  it('fails one pull of a named table once', async () => {
    const server = new FakeServer();
    server.failNextPull('buckets');
    await expect(server.pull('buckets', null, 5)).rejects.toMatchObject({ kind: 'network' });
    await expect(server.pull('buckets', null, 5)).resolves.toEqual([]);
  });

  it('reports live buckets and whether any other table holds rows', async () => {
    const server = new FakeServer(() => 2_000_000);
    await server.upsert('buckets', [row('b1', 1000, { name: 'Rent' })]);
    let state = await server.accountState();
    expect(state).toMatchObject({ allowed: true, schemaVersion: 1, hasOtherRows: false });
    expect(state.buckets.map((b) => b.id)).toEqual(['b1']);
    await server.upsert('settings', [row('baseCurrency', 1000)]);
    expect((await server.accountState()).hasOtherRows).toBe(false);
    await server.upsert('transactions', [row('t1', 1000)]);
    state = await server.accountState();
    expect(state.hasOtherRows).toBe(true);
  });
});
