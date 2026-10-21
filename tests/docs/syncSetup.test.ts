import { describe, it, expect } from 'vitest';

// The setup guide tells a person to paste specific files into the dashboard.
// A renamed or missing file would send them to something that does not exist.
const sql = Object.keys(import.meta.glob('/supabase/**/*.sql', { query: '?raw', import: 'default', eager: true }));
const guide = Object.values(import.meta.glob('/docs/sync-setup.md', { query: '?raw', import: 'default', eager: true }))[0] as string;

describe('docs/sync-setup.md', () => {
  it('only mentions SQL files that exist', () => {
    const mentioned = [...guide.matchAll(/supabase\/[\w/.-]+\.sql/g)].map((m) => `/${m[0]}`);
    expect(mentioned.length).toBeGreaterThanOrEqual(3);
    for (const path of mentioned) expect(sql, path).toContain(path);
  });

  it('applies the migrations in file-name order', () => {
    const mentioned = [...guide.matchAll(/supabase\/migrations\/[\w.-]+\.sql/g)].map((m) => m[0]);
    expect(mentioned).toEqual([...mentioned].sort());
  });

  it('never tells anyone to put a secret key in the app', () => {
    expect(guide).toMatch(/Never put the secret key/);
    expect(guide).not.toMatch(/service_role['"` ]*=|sb_secret_[A-Za-z0-9]/);
  });
});
