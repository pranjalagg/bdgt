import { COLLECTIONS, toRow, type CollectionDef, type Row } from './registry';
import { SyncError, type StoredStamp, type SyncTransport } from './transport';
import type { SyncContext, SyncOutboxEntry } from './types';

export interface PushResult {
  sent: number; // stored by the server
  skipped: number; // the server held a newer edit
  parked: number; // the server refused the row
}

const iso = (ms: number) => new Date(ms).toISOString();

interface BatchOutcome {
  stored: StoredStamp[];
  rejected: { id: string; message: string }[];
}

// A refused batch is split until the single bad row is found, so one bad row
// never blocks the rest.
async function sendBatch(transport: SyncTransport, remote: string, rows: Row[]): Promise<BatchOutcome> {
  try {
    return { stored: await transport.upsert(remote, rows), rejected: [] };
  } catch (e) {
    if (!(e instanceof SyncError) || e.kind !== 'rejected') throw e;
    if (rows.length === 1) return { stored: [], rejected: [{ id: String(rows[0].id), message: e.message }] };
    const mid = rows.length >> 1;
    const first = await sendBatch(transport, remote, rows.slice(0, mid));
    const second = await sendBatch(transport, remote, rows.slice(mid));
    return { stored: [...first.stored, ...second.stored], rejected: [...first.rejected, ...second.rejected] };
  }
}

async function pushChunk(ctx: SyncContext, def: CollectionDef, entries: SyncOutboxEntry[]): Promise<PushResult> {
  const { db, transport } = ctx;
  const table = db.table(def.table);

  const upserts = entries.filter((e) => e.op === 'upsert');
  const found = await table.bulkGet(upserts.map((e) => e.id));
  const recordById = new Map(upserts.map((e, i) => [e.id, found[i] as Record<string, unknown> | undefined]));

  const saves: Row[] = [];
  const deletes: Row[] = [];
  for (const entry of entries) {
    const record = entry.op === 'upsert' ? recordById.get(entry.id) : undefined;
    if (record) saves.push({ ...toRow(def, record), updated_at: iso(entry.at), deleted_at: null });
    else deletes.push({ id: entry.id, updated_at: iso(entry.at), deleted_at: iso(entry.at) });
  }

  const stored = new Map<string, number>();
  const rejected = new Map<string, string>();
  // Separate requests: a bulk upsert needs the same columns in every row.
  for (const rows of [saves, deletes]) {
    if (rows.length === 0) continue;
    const outcome = await sendBatch(transport, def.remote, rows);
    for (const s of outcome.stored) stored.set(s.id, Date.parse(s.updated_at));
    for (const r of outcome.rejected) rejected.set(r.id, r.message);
  }

  const result: PushResult = { sent: 0, skipped: 0, parked: 0 };
  await db.transaction('rw', [db.syncOutbox, db.syncVersions], async () => {
    for (const entry of entries) {
      const current = await db.syncOutbox.get(entry.key);
      // Edited again since it was read: leave the newer entry queued.
      if (!current || current.at !== entry.at) continue;
      if (rejected.has(entry.id)) {
        await db.syncOutbox.put({ ...current, parked: true, error: rejected.get(entry.id) });
        result.parked++;
        continue;
      }
      await db.syncOutbox.delete(entry.key);
      const at = stored.get(entry.id);
      if (at === undefined) {
        result.skipped++; // the server holds a newer edit; the next pull brings it
        continue;
      }
      await db.syncVersions.put({ key: entry.key, at });
      result.sent++;
    }
  });
  return result;
}

export async function pushPending(ctx: SyncContext, batchSize = 500): Promise<PushResult> {
  const total: PushResult = { sent: 0, skipped: 0, parked: 0 };
  const waiting = (await ctx.db.syncOutbox.toArray()).filter((e) => !e.parked);
  for (const def of COLLECTIONS) {
    const entries = waiting.filter((e) => e.table === def.table).sort((a, b) => a.key.localeCompare(b.key));
    for (let i = 0; i < entries.length; i += batchSize) {
      const part = await pushChunk(ctx, def, entries.slice(i, i + batchSize));
      total.sent += part.sent;
      total.skipped += part.skipped;
      total.parked += part.parked;
    }
  }
  return total;
}
