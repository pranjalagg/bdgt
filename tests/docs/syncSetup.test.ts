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

  it('tells the owner to turn off every sign-in method except Google, and about the Max rows setting and the expected advisor messages', () => {
    expect(guide).toMatch(/Turn off the other sign-in methods/);
    expect(guide).toMatch(/Email/);
    expect(guide).toMatch(/anonymous/i);
    expect(guide).toMatch(/Max rows/);
    expect(guide).toMatch(/Security Advisor/);
    expect(guide).toMatch(/highlighted/);
  });

  it('never tells anyone to put a secret key in the app', () => {
    expect(guide).toMatch(/Never put the secret key/);
    expect(guide).not.toMatch(/service_role['"` ]*=|sb_secret_[A-Za-z0-9]/);
  });
});

describe('docs/sync-setup.md part 2', () => {
  it('gives the exact addresses Google and Supabase must allow', () => {
    expect(guide).toContain('https://<project-ref>.supabase.co/auth/v1/callback');
    expect(guide).toContain('https://pranjalagg.github.io/bdgt/**');
    expect(guide).toContain('http://localhost:5173/**');
    expect(guide).toContain('https://pranjalagg.github.io');
    expect(guide).toContain('https://pranjalagg.github.io/bdgt/');
  });

  it('names the two variables and the workflow to run', () => {
    expect(guide).toContain('VITE_SUPABASE_URL');
    expect(guide).toContain('VITE_SUPABASE_PUBLISHABLE_KEY');
    expect(guide).toMatch(/Run workflow/);
  });

  it('keeps the Google client secret out of the app, the repository and GitHub', () => {
    expect(guide).toMatch(/Client secret/);
    expect(guide).toMatch(/Supabase only/);
    expect(guide).toMatch(/Never in the app, this repository, GitHub or a chat/);
  });

  it('has the troubleshooting entries for the failures people actually hit', () => {
    for (const text of ['provider is not enabled', 'redirect_uri_mismatch', 'access_denied', "Sync isn't enabled for this account", 'Database needs update']) {
      expect(guide).toContain(text);
    }
  });
});
