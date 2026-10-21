import type { SyncStatus } from './status';

// What the status chip and the Settings screen say, as plain data so the
// wording can be tested. `tone` picks the colour: ok (green), quiet (grey),
// warn (amber: will fix itself) or bad (needs the person).
export type SyncTone = 'ok' | 'quiet' | 'warn' | 'bad';

export function relativeTime(then: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function describeSync(status: SyncStatus, now: number): { label: string; tone: SyncTone } {
  switch (status.state) {
    case 'off':
      return { label: '', tone: 'quiet' };
    case 'syncing':
      return { label: 'Syncing…', tone: 'quiet' };
    case 'offline':
      return { label: status.waiting > 0 ? `Offline · ${status.waiting} waiting` : 'Offline', tone: 'warn' };
    case 'auth':
      return { label: 'Sign in again', tone: 'bad' };
    case 'notAllowed':
      return { label: "Sync isn't enabled for this account", tone: 'bad' };
    case 'schema':
      return { label: 'Database needs update', tone: 'bad' };
    case 'idle':
      if (status.parked > 0) return { label: `${plural(status.parked, 'change', 'changes')} couldn't sync`, tone: 'bad' };
      if (status.waiting > 0) return { label: `${status.waiting} waiting`, tone: 'quiet' };
      return {
        label: status.lastSyncedAt === null ? 'Connected' : `Synced · ${relativeTime(status.lastSyncedAt, now)}`,
        tone: 'ok',
      };
  }
}
