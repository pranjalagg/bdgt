import type { PGlite } from '@electric-sql/pglite';

// Just enough of PostgREST/supabase-js to run SupabaseTransport against a
// real Postgres: .from(t).upsert(rows, {onConflict}).select(cols),
// .from(t).select('*').gte().order().order().limit(), and .rpc(fn). Each call
// runs the statement PostgREST would run, as the role the test has set, and
// answers with {data, error, status} the way supabase-js does. Anything the
// transport does that is not supported here throws, so a change in the
// transport's requests fails the parity tests instead of passing quietly.

interface Failure {
  code?: string;
  message: string;
}

// PostgREST's HTTP status for a Postgres error (the cases that can occur).
function statusFor(code: string | undefined, role: string): number {
  if (code === '42501') return role === 'anon' ? 401 : 403;
  if (!code) return 500;
  if (code === '23505' || code === '23503') return 409;
  if (code.startsWith('28')) return 403;
  if (code === '42P01' || code === '42883') return 404;
  return 400;
}

async function currentRole(pg: PGlite): Promise<string> {
  return (await pg.query<{ r: string }>('select current_user as r')).rows[0].r;
}

async function execute<T>(pg: PGlite, run: () => Promise<T>): Promise<{ data: T | null; error: Failure | null; status: number }> {
  try {
    return { data: await run(), error: null, status: 200 };
  } catch (e) {
    const err = e as { code?: string; message?: string };
    return { data: null, error: { code: err.code, message: err.message ?? 'error' }, status: statusFor(err.code, await currentRole(pg)) };
  }
}

class TableBuilder implements PromiseLike<unknown> {
  private op: 'select' | 'upsert' = 'select';
  private rows: Record<string, unknown>[] = [];
  private returning = '';
  private filters: { column: string; value: unknown }[] = [];
  private orders: { column: string; ascending: boolean }[] = [];
  private max: number | null = null;

  constructor(private pg: PGlite, private table: string) {}

  upsert(rows: Record<string, unknown>[], options: { onConflict?: string; defaultToNull?: boolean }): this {
    if (options.onConflict !== 'user_id,id') throw new Error('unsupported onConflict');
    if (options.defaultToNull !== false) throw new Error('the transport must pass defaultToNull: false');
    this.op = 'upsert';
    this.rows = rows;
    return this;
  }

  select(columns: string): this {
    if (this.op === 'upsert') this.returning = columns;
    else if (columns !== '*') throw new Error('unsupported select');
    return this;
  }

  gte(column: string, value: unknown): this {
    if (column !== 'synced_at') throw new Error('unsupported filter');
    this.filters.push({ column, value });
    return this;
  }

  order(column: string, options: { ascending: boolean }): this {
    this.orders.push({ column, ascending: options.ascending });
    return this;
  }

  limit(n: number): this {
    this.max = n;
    return this;
  }

  then<R1, R2>(onfulfilled?: (v: unknown) => R1 | PromiseLike<R1>, onrejected?: (e: unknown) => R2 | PromiseLike<R2>) {
    return this.run().then(onfulfilled, onrejected);
  }

  private async run() {
    const t = `public."${this.table}"`;
    return execute(this.pg, async () => {
      if (this.op === 'upsert') {
        // What PostgREST sends: the union of the payload's keys as the column
        // list, rows from json_populate_recordset, merge on the primary key.
        const columns = [...new Set(this.rows.flatMap((r) => Object.keys(r)))];
        const list = columns.map((c) => `"${c}"`).join(', ');
        const set = columns.filter((c) => c !== 'id').map((c) => `"${c}" = excluded."${c}"`).join(', ');
        const returning = this.returning.split(',').map((c) => `"${c.trim()}"`).join(', ');
        const { rows } = await this.pg.query<{ r: unknown }>(
          `with stored as (
             insert into ${t} (${list})
             select ${list} from json_populate_recordset(null::${t}, $1::json)
             on conflict (user_id, id) do update set ${set}
             returning ${returning}
           ) select to_jsonb(stored) as r from stored`,
          [JSON.stringify(this.rows)]
        );
        return rows.map((x) => x.r);
      }
      const params: unknown[] = this.filters.map((f) => f.value);
      const where = this.filters.map((f, i) => `"${f.column}" >= $${i + 1}::timestamptz`).join(' and ');
      const order = this.orders.map((o) => `"${o.column}" ${o.ascending ? 'asc' : 'desc'}`).join(', ');
      const { rows } = await this.pg.query<{ r: unknown }>(
        `select to_jsonb(t) as r from ${t} t ${where ? `where ${where}` : ''} ${order ? `order by ${order}` : ''} ${this.max ? `limit ${this.max}` : ''}`,
        params
      );
      return rows.map((x) => x.r);
    });
  }
}

class RpcBuilder implements PromiseLike<unknown> {
  constructor(private pg: PGlite, private fn: string) {}

  then<R1, R2>(onfulfilled?: (v: unknown) => R1 | PromiseLike<R1>, onrejected?: (e: unknown) => R2 | PromiseLike<R2>) {
    return execute(this.pg, async () => {
      const { rows } = await this.pg.query<{ r: unknown }>(`select public.${this.fn}() as r`);
      return rows[0].r;
    }).then(onfulfilled, onrejected);
  }
}

export class PostgrestOverPglite {
  constructor(private pg: PGlite) {}
  from(table: string) {
    return new TableBuilder(this.pg, table);
  }
  rpc(fn: string) {
    return new RpcBuilder(this.pg, fn);
  }
}
