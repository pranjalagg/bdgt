import { SyncError, type AccountState, type PulledRow, type Row, type StoredStamp, type SyncTransport } from '$lib/sync/transport';

const BASE = Date.UTC(2026, 0, 1);

// One user's slice of the future Postgres database, with the same write
// rules as the SQL trigger: skip older updates, merge newer ones, cap future
// edit times at the server clock + 1 minute, stamp synced_at strictly
// increasing.
export class FakeServer implements SyncTransport {
  offline = false;
  allowed = true;
  schemaVersion = 1;
  rejectIds = new Set<string>();
  upsertCalls: { remote: string; rows: Row[] }[] = [];
  private tables = new Map<string, Map<string, Row>>();
  private failPull = new Set<string>();
  private tick = 0;

  constructor(private now: () => number = Date.now) {}

  failNextPull(remote: string): void {
    this.failPull.add(remote);
  }

  private table(remote: string): Map<string, Row> {
    let t = this.tables.get(remote);
    if (!t) {
      t = new Map();
      this.tables.set(remote, t);
    }
    return t;
  }

  private guard(): void {
    if (this.offline) throw new SyncError('network', 'offline');
    if (!this.allowed) throw new SyncError('notAllowed', 'this account is not on the invite list');
  }

  private nextSyncedAt(): string {
    this.tick += 1;
    // Microsecond precision, like Postgres.
    return new Date(BASE + this.tick).toISOString().replace('Z', '000+00:00');
  }

  all(remote: string): Row[] {
    return [...this.table(remote).values()];
  }

  live(remote: string): Row[] {
    return this.all(remote).filter((r) => !r.deleted_at);
  }

  async accountState(): Promise<AccountState> {
    if (this.offline) throw new SyncError('network', 'offline');
    if (!this.allowed) return { allowed: false, schemaVersion: this.schemaVersion, buckets: [], hasOtherRows: false };
    const buckets = this.live('buckets') as PulledRow[];
    // Settings do not count: every account has them, and an account with only settings is still empty.
    const hasOtherRows = [...this.tables.keys()].some((name) => name !== 'buckets' && name !== 'settings' && this.live(name).length > 0);
    return { allowed: true, schemaVersion: this.schemaVersion, buckets, hasOtherRows };
  }

  async upsert(remote: string, rows: Row[]): Promise<StoredStamp[]> {
    this.guard();
    this.upsertCalls.push({ remote, rows });
    for (const row of rows) {
      if (this.rejectIds.has(String(row.id))) throw new SyncError('rejected', `row ${row.id} rejected`);
    }
    const table = this.table(remote);
    const stored: StoredStamp[] = [];
    for (const row of rows) {
      const id = String(row.id);
      const updatedMs = Math.min(Date.parse(String(row.updated_at)), this.now() + 60_000);
      const existing = table.get(id);
      if (existing && updatedMs < Date.parse(String(existing.updated_at))) continue;
      const next: Row = { ...(existing ?? {}), ...row, updated_at: new Date(updatedMs).toISOString(), synced_at: this.nextSyncedAt() };
      table.set(id, next);
      stored.push({ id, updated_at: next.updated_at as string });
    }
    return stored;
  }

  async pull(remote: string, since: string | null, limit: number): Promise<PulledRow[]> {
    this.guard();
    if (this.failPull.delete(remote)) throw new SyncError('network', 'pull failed');
    const from = since === null ? -Infinity : Date.parse(since);
    return (this.all(remote) as PulledRow[])
      .filter((r) => Date.parse(r.synced_at) >= from)
      .sort((a, b) => Date.parse(a.synced_at) - Date.parse(b.synced_at) || a.id.localeCompare(b.id))
      .slice(0, limit);
  }
}
