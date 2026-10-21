import type { SupabaseClient } from '@supabase/supabase-js';
import type { Row } from './registry';
import { SyncError, type AccountState, type PulledRow, type StoredStamp, type SyncTransport } from './transport';

// The sync transport over Supabase: PostgREST for the tables, one RPC for
// the account check. Everything the engine needs from the server, in terms
// of the SyncTransport interface, so the engine never sees Supabase.

export interface PostgrestFailure {
  status?: number;
  code?: string;
  message?: string;
}

const SCHEMA_CODES = new Set([
  'PGRST202', // function not found
  'PGRST204', // column not found in the schema cache
  'PGRST205', // table not found in the schema cache
  '42703', // undefined column
  '42P01', // undefined table
  '42883', // undefined function
]);

const NETWORK_MESSAGE = /fetch|network|load failed|timeout|timed out|abort/i;

// Maps what PostgREST or Postgres says to what the engine can act on.
// Order matters: a permission problem for an anonymous caller arrives as
// 42501 with HTTP 401, and that one is about the session, not the invite.
export function mapPostgrestError(failure: PostgrestFailure): SyncError {
  const message = failure.message || 'Request failed';
  const status = failure.status ?? 0;
  const code = failure.code ?? '';

  if (status === 401 || code.startsWith('PGRST30') || code.startsWith('28')) return new SyncError('auth', message);
  if (code === '42501' || status === 403) return new SyncError('notAllowed', message);
  if (SCHEMA_CODES.has(code)) return new SyncError('schema', message);
  if (status === 0 || status === 408 || status === 429 || (status >= 500 && !code) || NETWORK_MESSAGE.test(message)) {
    return new SyncError('network', message);
  }
  // A constraint or data problem with a row: the batch is refused for good.
  if (/^(21|22|23)/.test(code) || code === 'P0001' || [400, 409, 422].includes(status)) {
    return new SyncError('rejected', message);
  }
  // Unknown: retry later rather than park the person's data.
  return new SyncError('network', message);
}

interface Result<T> {
  data: T | null;
  error: { code?: string; message?: string } | null;
  status: number;
}

// Postgres writes a timestamp as 2026-10-20T12:34:56.123456+00:00, with a
// varying number of fraction digits. The engine compares these as strings
// and parses them with Date.parse, so give it one fixed form: UTC,
// milliseconds, 'Z'.
export function normalizeTimestamp(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const ms = Date.parse(value.replace(/(\.\d{3})\d+/, '$1'));
  return Number.isNaN(ms) ? value : new Date(ms).toISOString();
}

const SYNC_TIME_COLUMNS = ['updated_at', 'deleted_at', 'synced_at'];

function normalizeRow<T extends Row>(row: T): T {
  const out: Row = { ...row };
  for (const col of SYNC_TIME_COLUMNS) if (col in out) out[col] = normalizeTimestamp(out[col]);
  return out as T;
}

type Client = Pick<SupabaseClient, 'from' | 'rpc'>;

export class SupabaseTransport implements SyncTransport {
  constructor(private client: Client) {}

  private async run<T>(request: PromiseLike<Result<T>>): Promise<T | null> {
    let result: Result<T>;
    try {
      result = await request;
    } catch (e) {
      throw new SyncError('network', e instanceof Error ? e.message : 'Network request failed');
    }
    if (result.error) throw mapPostgrestError({ ...result.error, status: result.status });
    return result.data;
  }

  async accountState(): Promise<AccountState> {
    const data = await this.run<Record<string, unknown>>(this.client.rpc('sync_account_state') as unknown as PromiseLike<Result<Record<string, unknown>>>);
    if (!data || typeof data !== 'object') throw new SyncError('schema', 'The sync account check returned nothing');
    return {
      allowed: data.allowed === true,
      schemaVersion: Number(data.schemaVersion),
      buckets: ((data.buckets as PulledRow[] | undefined) ?? []).map(normalizeRow),
      hasOtherRows: data.hasOtherRows === true,
    };
  }

  async upsert(remote: string, rows: Row[]): Promise<StoredStamp[]> {
    // onConflict names the primary key; defaultToNull false so a column a row
    // does not mention is never blanked. Only the rows actually stored come
    // back: one the server skipped (it held a newer edit) is absent.
    const request = this.client
      .from(remote)
      .upsert(rows as never, { onConflict: 'user_id,id', defaultToNull: false })
      .select('id,updated_at');
    const data = await this.run<{ id: string; updated_at: string }[]>(request as unknown as PromiseLike<Result<{ id: string; updated_at: string }[]>>);
    return (data ?? []).map((r) => ({ id: String(r.id), updated_at: String(normalizeTimestamp(r.updated_at)) }));
  }

  async pull(remote: string, since: string | null, limit: number): Promise<PulledRow[]> {
    let query = this.client.from(remote).select('*');
    if (since !== null) query = query.gte('synced_at', since);
    const request = query.order('synced_at', { ascending: true }).order('id', { ascending: true }).limit(limit);
    const data = await this.run<PulledRow[]>(request as unknown as PromiseLike<Result<PulledRow[]>>);
    return (data ?? []).map(normalizeRow);
  }
}
