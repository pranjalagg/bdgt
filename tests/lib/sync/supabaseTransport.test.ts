import { describe, it, expect } from 'vitest';
import { SupabaseTransport, mapPostgrestError, normalizeTimestamp } from '$lib/sync/supabaseTransport';
import { SyncError } from '$lib/sync/transport';

// A client that records the calls made on it and answers with a canned result.
function fakeClient(result: unknown) {
  const calls: [string, ...unknown[]][] = [];
  const builder: Record<string, unknown> = {};
  for (const name of ['upsert', 'select', 'gte', 'order', 'limit']) {
    builder[name] = (...args: unknown[]) => {
      calls.push([name, ...args]);
      return builder;
    };
  }
  builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    (result instanceof Error ? Promise.reject(result) : Promise.resolve(result)).then(resolve, reject);
  const client = {
    from: (table: string) => {
      calls.push(['from', table]);
      return builder;
    },
    rpc: (fn: string) => {
      calls.push(['rpc', fn]);
      return builder;
    },
  };
  return { client: client as never, calls };
}

describe('mapPostgrestError', () => {
  const kind = (f: Parameters<typeof mapPostgrestError>[0]) => mapPostgrestError(f).kind;

  it('treats a bad or missing session as auth', () => {
    expect(kind({ status: 401, code: 'PGRST301', message: 'JWT expired' })).toBe('auth');
    expect(kind({ status: 401, code: '42501', message: 'permission denied for table' })).toBe('auth');
    expect(kind({ status: 400, code: '28000', message: 'not signed in' })).toBe('auth');
  });

  it('treats a row-level security refusal as not invited', () => {
    expect(kind({ status: 403, code: '42501', message: 'new row violates row-level security policy' })).toBe('notAllowed');
  });

  it('treats a missing column, table or function as an out-of-date database', () => {
    for (const code of ['PGRST204', 'PGRST205', 'PGRST202', '42703', '42P01', '42883']) {
      expect(kind({ status: 400, code, message: 'x' }), code).toBe('schema');
    }
  });

  it('treats failures to reach the server as network, so the queue is kept and retried', () => {
    expect(kind({ status: 0, message: 'TypeError: Failed to fetch' })).toBe('network');
    expect(kind({ status: 503, message: 'Service Unavailable' })).toBe('network');
    expect(kind({ status: 429, message: 'Too many requests' })).toBe('network');
    expect(kind({ status: 408, message: 'timeout' })).toBe('network');
  });

  it('treats a constraint or data error on a row as rejected', () => {
    expect(kind({ status: 400, code: '23514', message: 'violates check constraint' })).toBe('rejected');
    expect(kind({ status: 409, code: '23505', message: 'duplicate key' })).toBe('rejected');
    expect(kind({ status: 400, code: '22P02', message: 'invalid input syntax' })).toBe('rejected');
  });

  it('treats a request too large to store as rejected, so the batch is split instead of resent whole forever', () => {
    expect(kind({ status: 413, message: 'Payload Too Large' })).toBe('rejected');
    expect(kind({ status: 400, code: '54000', message: 'index row size exceeds maximum' })).toBe('rejected');
  });

  it('does not call a bare gateway 403 "not invited"; only the database refusal is', () => {
    expect(kind({ status: 403, message: 'Forbidden' })).toBe('network');
    expect(kind({ status: 403, code: '42501', message: 'row-level security' })).toBe('notAllowed');
  });

  it('treats a conflict target that no longer matches the table as an out-of-date database', () => {
    expect(kind({ status: 400, code: '42P10', message: 'there is no unique or exclusion constraint matching the ON CONFLICT specification' })).toBe('schema');
  });

  it('retries rather than parks anything it does not recognise', () => {
    expect(kind({ status: 418, code: 'XX999', message: 'teapot' })).toBe('network');
  });

  it('keeps the message', () => {
    expect(mapPostgrestError({ status: 400, code: '23514', message: 'bad row' }).message).toBe('bad row');
  });
});

describe('normalizeTimestamp', () => {
  it('writes every form Postgres produces as UTC milliseconds', () => {
    expect(normalizeTimestamp('2026-10-20T12:34:56.123456+00:00')).toBe('2026-10-20T12:34:56.123Z');
    expect(normalizeTimestamp('2026-10-20T12:34:56+00:00')).toBe('2026-10-20T12:34:56.000Z');
    expect(normalizeTimestamp('2026-10-20T12:34:56.1+00:00')).toBe('2026-10-20T12:34:56.100Z');
    expect(normalizeTimestamp('2026-10-20T14:34:56.5+02:00')).toBe('2026-10-20T12:34:56.500Z');
  });

  it('leaves null and anything unparseable alone', () => {
    expect(normalizeTimestamp(null)).toBeNull();
    expect(normalizeTimestamp('not a date')).toBe('not a date');
  });
});

describe('SupabaseTransport requests', () => {
  it('upserts on the primary key, never blanking missing columns, and asks for the stored rows back', async () => {
    const { client, calls } = fakeClient({ data: [{ id: 'a', updated_at: '2026-10-20T12:00:00.123456+00:00' }], error: null, status: 201 });
    const rows = [{ id: 'a', amount_cents: 1, updated_at: '2026-10-20T12:00:00.000Z', deleted_at: null }];

    const stored = await new SupabaseTransport(client).upsert('allocations', rows);

    expect(calls).toEqual([
      ['from', 'allocations'],
      ['upsert', rows, { onConflict: 'user_id,id', defaultToNull: false }],
      ['select', 'id,updated_at'],
    ]);
    expect(stored).toEqual([{ id: 'a', updated_at: '2026-10-20T12:00:00.123Z' }]);
  });

  it('pulls oldest first by write time then id, from the given time, up to the limit', async () => {
    const { client, calls } = fakeClient({ data: [], error: null, status: 200 });
    await new SupabaseTransport(client).pull('transactions', '2026-10-20T11:59:00.000Z', 500);
    expect(calls).toEqual([
      ['from', 'transactions'],
      ['select', '*'],
      ['gte', 'synced_at', '2026-10-20T11:59:00.000Z'],
      ['order', 'synced_at', { ascending: true }],
      ['order', 'id', { ascending: true }],
      ['limit', 500],
    ]);
  });

  it('pulls everything when there is no starting time, and normalizes the sync columns', async () => {
    const { client, calls } = fakeClient({
      data: [{ id: 'a', updated_at: '2026-10-20T12:00:00+00:00', synced_at: '2026-10-20T12:00:01.654321+00:00', deleted_at: null, amount_cents: 5 }],
      error: null, status: 200,
    });
    const rows = await new SupabaseTransport(client).pull('allocations', null, 1000);
    expect(calls.map((c) => c[0])).toEqual(['from', 'select', 'order', 'order', 'limit']);
    expect(rows[0]).toMatchObject({ updated_at: '2026-10-20T12:00:00.000Z', synced_at: '2026-10-20T12:00:01.654Z', deleted_at: null, amount_cents: 5 });
  });

  it('reads the account state from the RPC', async () => {
    const { client, calls } = fakeClient({
      data: { allowed: true, schemaVersion: 1, buckets: [{ id: 'b', updated_at: '2026-10-20T12:00:00+00:00', synced_at: '2026-10-20T12:00:00+00:00', deleted_at: null }], hasOtherRows: false },
      error: null, status: 200,
    });
    const state = await new SupabaseTransport(client).accountState();
    expect(calls).toEqual([['rpc', 'sync_account_state']]);
    expect(state).toMatchObject({ allowed: true, schemaVersion: 1, hasOtherRows: false });
    expect(state.buckets[0].updated_at).toBe('2026-10-20T12:00:00.000Z');
  });
});

describe('SupabaseTransport failures', () => {
  it('throws a SyncError mapped from the error PostgREST returned', async () => {
    const { client } = fakeClient({ data: null, error: { code: '23514', message: 'bad row' }, status: 400 });
    await expect(new SupabaseTransport(client).upsert('allocations', [{ id: 'a' }])).rejects.toMatchObject({ kind: 'rejected', message: 'bad row' });
  });

  it('throws a network error when the request itself fails', async () => {
    const { client } = fakeClient(new TypeError('Failed to fetch'));
    const error = await new SupabaseTransport(client).pull('allocations', null, 10).catch((e) => e);
    expect(error).toBeInstanceOf(SyncError);
    expect(error.kind).toBe('network');
  });

  it('treats an account check that returns nothing as an out-of-date database', async () => {
    const { client } = fakeClient({ data: null, error: null, status: 200 });
    await expect(new SupabaseTransport(client).accountState()).rejects.toMatchObject({ kind: 'schema' });
  });
});
