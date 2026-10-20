import { COLLECTIONS, fromRow, rowsMatch, toRow, type CollectionDef } from './registry';
import { cursorKey, getState, setState } from './state';
import { remoteTransaction } from './transactions';
import type { PulledRow } from './transport';
import type { SyncContext } from './types';

// A write can commit out of synced_at order (a slower statement finishes
// after a faster one that started later), so each pull starts a little
// before the saved cursor. Re-applying a row is harmless.
const OVERLAP_MS = 60_000;

export interface PullResult {
  changed: boolean;
  rows: number;
}

function sinceFor(cursor: string | undefined): string | null {
  if (!cursor) return null;
  const ms = Date.parse(cursor.replace(/(\.\d{3})\d+/, '$1')); // JS dates keep milliseconds
  return Number.isNaN(ms) ? null : new Date(ms - OVERLAP_MS).toISOString();
}

interface Fetched {
  def: CollectionDef;
  rows: PulledRow[];
  cursor: string | undefined;
}

async function fetchTable(ctx: SyncContext, def: CollectionDef, pageSize: number): Promise<Fetched> {
  const saved = await getState<string>(ctx.db, cursorKey(def.remote));
  let since = sinceFor(saved);
  const byId = new Map<string, PulledRow>();
  for (;;) {
    const page = await ctx.transport.pull(def.remote, since, pageSize);
    let fresh = 0;
    for (const row of page) {
      const previous = byId.get(row.id);
      if (!previous || row.synced_at > previous.synced_at) {
        byId.set(row.id, row);
        fresh++;
      }
    }
    // The next page starts at the last row's time, so that row comes again:
    // stop when a page brings nothing we have not seen.
    if (page.length < pageSize || fresh === 0) break;
    since = page[page.length - 1].synced_at;
  }
  const rows = [...byId.values()];
  const cursor = rows.reduce<string | undefined>((max, r) => (max === undefined || r.synced_at > max ? r.synced_at : max), saved);
  return { def, rows, cursor };
}

export async function pullAll(ctx: SyncContext, pageSize = 1000): Promise<PullResult> {
  const { db } = ctx;

  // Fetch everything first: if any request fails, nothing has been applied.
  const fetched: Fetched[] = [];
  for (const def of COLLECTIONS) fetched.push(await fetchTable(ctx, def, pageSize));

  let changed = false;
  const tables = [...COLLECTIONS.map((c) => db.table(c.table)), db.syncOutbox, db.syncVersions, db.syncState];
  await remoteTransaction(db, tables, async () => {
    for (const { def, rows, cursor } of fetched) {
      if (rows.length > 0) {
        const table = db.table(def.table);
        const keys = rows.map((r) => `${def.table}:${r.id}`);
        const [versions, current, queued] = await Promise.all([
          db.syncVersions.bulkGet(keys),
          table.bulkGet(rows.map((r) => r.id)),
          db.syncOutbox.bulkGet(keys),
        ]);

        const puts: Record<string, unknown>[] = [];
        const deletes: string[] = [];
        const newVersions: { key: string; at: number }[] = [];
        const drop: string[] = [];
        rows.forEach((row, i) => {
          const remoteAt = Date.parse(row.updated_at);
          const localAt = versions[i]?.at;
          if (localAt !== undefined && remoteAt < localAt) return; // this device holds a newer edit
          if (row.deleted_at) {
            if (current[i] !== undefined) deletes.push(row.id);
          } else if (current[i] === undefined || !rowsMatch(def, toRow(def, current[i]), row)) {
            puts.push(fromRow(def, row));
          }
          newVersions.push({ key: keys[i], at: remoteAt });
          if (queued[i] && queued[i]!.at <= remoteAt) drop.push(keys[i]);
        });

        if (puts.length > 0) await table.bulkPut(puts);
        if (deletes.length > 0) await table.bulkDelete(deletes);
        if (newVersions.length > 0) await db.syncVersions.bulkPut(newVersions);
        if (drop.length > 0) await db.syncOutbox.bulkDelete(drop);
        if (puts.length > 0 || deletes.length > 0) changed = true;
      }
      if (cursor) await setState(db, cursorKey(def.remote), cursor);
    }
  });

  return { changed, rows: fetched.reduce((n, f) => n + f.rows.length, 0) };
}
