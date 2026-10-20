import Dexie, { type DBCore, type DBCoreMutateRequest, type DBCoreTable, type DBCoreTransaction } from 'dexie';
import { autoStamp, editStamp } from './clock';
import { isSyncedTable } from './registry';

// Records every write to a synced table so it can be uploaded later. Hooked
// in at Dexie's lowest level (DBCore) so no store code has to change: the
// queue entry is written in the same IndexedDB transaction as the data, so
// either both exist or neither does.

export type WriteKind = 'edit' | 'auto' | 'remote' | 'reset';

const kinds = new WeakMap<object, WriteKind>();
let enabled = false;

// Off until a device is linked to an account; signed-out use is unchanged.
export function setCaptureEnabled(value: boolean): void {
  enabled = value;
}

export function isCaptureEnabled(): boolean {
  return enabled;
}

// Tags the Dexie transaction the caller is in. Untagged writes are edits.
export function markTransaction(kind: WriteKind): void {
  const trans = Dexie.currentTransaction;
  if (trans) kinds.set(trans, kind);
}

export function currentWriteKind(): WriteKind {
  const trans = Dexie.currentTransaction;
  return (trans && kinds.get(trans)) || 'edit';
}

async function record(
  down: DBCore,
  trans: DBCoreTransaction,
  table: string,
  ids: string[],
  op: 'upsert' | 'delete',
  kind: WriteKind
): Promise<void> {
  const keys = ids.map((id) => `${table}:${id}`);
  const versions = await down.table('syncVersions').getMany({ trans, keys });
  const stamps = keys.map((_, i) => (kind === 'auto' ? autoStamp(versions[i]?.at) : editStamp(versions[i]?.at)));
  await down.table('syncOutbox').mutate({
    trans,
    type: 'put',
    values: ids.map((id, i) => ({ key: keys[i], table, id, op, at: stamps[i] })),
  });
  await down.table('syncVersions').mutate({
    trans,
    type: 'put',
    values: keys.map((key, i) => ({ key, at: stamps[i] })),
  });
}

async function capturedMutate(down: DBCore, table: DBCoreTable, name: string, req: DBCoreMutateRequest) {
  const idb = req.trans as unknown as IDBTransaction;
  const kind = currentWriteKind();
  const capture =
    enabled &&
    kind !== 'remote' &&
    kind !== 'reset' &&
    idb.mode !== 'versionchange' && // upgrades run before the sync tables may exist
    idb.objectStoreNames.contains('syncOutbox'); // the transaction started before capture was on
  if (!capture) return table.mutate(req);

  let keys: unknown[] = [];
  let op: 'upsert' | 'delete' = 'upsert';
  if (req.type === 'deleteRange') {
    op = 'delete';
    keys = (await table.query({ trans: req.trans, values: false, query: { index: table.schema.primaryKey, range: req.range } })).result;
  }

  const res = await table.mutate(req);

  if (req.type === 'add' || req.type === 'put') {
    keys = (res.results ?? []).filter((_key: unknown, i: number) => !(i in res.failures));
  } else if (req.type === 'delete') {
    op = 'delete';
    keys = req.keys;
  }
  if (keys.length > 0) await record(down, req.trans, name, keys.map(String), op, kind);
  return res;
}

export function installSyncCapture(db: Dexie): void {
  db.use({
    stack: 'dbcore',
    name: 'bdgt-sync-capture',
    create(down: DBCore): DBCore {
      return {
        ...down,
        transaction(stores, mode, options) {
          const widened =
            enabled && mode === 'readwrite' && stores.some(isSyncedTable)
              ? [...new Set([...stores, 'syncOutbox', 'syncVersions'])]
              : stores;
          return down.transaction(widened, mode, options);
        },
        table(name) {
          const table = down.table(name);
          if (!isSyncedTable(name)) return table;
          return { ...table, mutate: (req) => capturedMutate(down, table, name, req) };
        },
      };
    },
  });
}
