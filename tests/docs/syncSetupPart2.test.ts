import { describe, it, expect } from 'vitest';

const guide = Object.values(import.meta.glob('/docs/sync-setup.md', { query: '?raw', import: 'default', eager: true }))[0] as string;
const workflow = Object.values(import.meta.glob('/.github/workflows/deploy.yml', { query: '?raw', import: 'default', eager: true }))[0] as string;
const androidWorkflow = Object.values(import.meta.glob('/.github/workflows/android.yml', { query: '?raw', import: 'default', eager: true }))[0] as string;

// (.env.example is not checked here: Vite refuses to serve .env files, even to tests.)
describe('deployment configuration', () => {
  it('passes both variables to the deployed build, from repository variables not secrets', () => {
    expect(workflow).toMatch(/VITE_SUPABASE_URL: \$\{\{ vars\.VITE_SUPABASE_URL \}\}/);
    expect(workflow).toMatch(/VITE_SUPABASE_PUBLISHABLE_KEY: \$\{\{ vars\.VITE_SUPABASE_PUBLISHABLE_KEY \}\}/);
    expect(workflow).not.toMatch(/secrets\./);
  });
});

describe('development helpers', () => {
  it('are checked out of both builds', () => {
    for (const w of [workflow, androidWorkflow]) expect(w).toContain("grep -rlE '__bdgt[A-Za-z]+' build/");
  });
});

describe('Android build configuration', () => {
  it('passes the sync variables and the Google client ID from repository variables, never secrets', () => {
    expect(androidWorkflow).toMatch(/VITE_SUPABASE_URL: \$\{\{ vars\.VITE_SUPABASE_URL \}\}/);
    expect(androidWorkflow).toMatch(/VITE_SUPABASE_PUBLISHABLE_KEY: \$\{\{ vars\.VITE_SUPABASE_PUBLISHABLE_KEY \}\}/);
    expect(androidWorkflow).toMatch(/VITE_GOOGLE_WEB_CLIENT_ID: \$\{\{ vars\.VITE_GOOGLE_WEB_CLIENT_ID \}\}/);
    // The only secret is the signing key.
    expect(androidWorkflow.match(/secrets\.\w+/g)).toEqual(['secrets.ANDROID_DEBUG_KEYSTORE_BASE64']);
  });
});

describe('docs/sync-setup.md part 2', () => {
  it('names the variables, the callback address and the workflow to run', () => {
    expect(guide).toContain('VITE_SUPABASE_URL');
    expect(guide).toContain('VITE_SUPABASE_PUBLISHABLE_KEY');
    expect(guide).toContain('/auth/v1/callback');
    expect(guide).toMatch(/Run workflow/);
  });

  it('gives the exact addresses Supabase and Google must allow', () => {
    expect(guide).toContain('https://pranjalagg.github.io/bdgt/**');
    expect(guide).toContain('http://localhost:5173/**');
    expect(guide).toContain('https://pranjalagg.github.io');
  });

  it('keeps the Google client secret out of the app, the repository and GitHub', () => {
    expect(guide).toMatch(/Supabase only/);
    expect(guide).toMatch(/Never in the app, this repository, GitHub or a chat/);
  });
});
