import { describe, it, expect } from 'vitest';
import { readSyncConfig, signInRedirectUrl, hasAuthCallback, hasStoredSession, supabaseAuthOptions, AUTH_STORAGE_KEY } from '$lib/sync/config';

const URL = 'https://kcggqvilbckwgvgaixwn.supabase.co';

describe('readSyncConfig', () => {
  it('reads a project address and publishable key', () => {
    expect(readSyncConfig({ VITE_SUPABASE_URL: `${URL}/`, VITE_SUPABASE_PUBLISHABLE_KEY: ' sb_publishable_abc ' })).toEqual({ url: URL, key: 'sb_publishable_abc' });
  });

  it('is off when either is missing, empty or not a string', () => {
    expect(readSyncConfig({})).toBeNull();
    expect(readSyncConfig({ VITE_SUPABASE_URL: URL })).toBeNull();
    expect(readSyncConfig({ VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abc' })).toBeNull();
    expect(readSyncConfig({ VITE_SUPABASE_URL: 5, VITE_SUPABASE_PUBLISHABLE_KEY: true })).toBeNull();
  });

  it('refuses an address that is not a Supabase project (or a local one)', () => {
    expect(readSyncConfig({ VITE_SUPABASE_URL: 'https://evil.example.com', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abc' })).toBeNull();
    expect(readSyncConfig({ VITE_SUPABASE_URL: 'http://kcggqvilbckwgvgaixwn.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abc' })).toBeNull();
    expect(readSyncConfig({ VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abc' })).not.toBeNull();
  });

  it('refuses a secret key, and a legacy service-role key, however they got there', () => {
    expect(readSyncConfig({ VITE_SUPABASE_URL: URL, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_abc' })).toBeNull();
    const jwt = (role: string) => `h.${btoa(JSON.stringify({ role })).replace(/=+$/, '')}.s`;
    expect(readSyncConfig({ VITE_SUPABASE_URL: URL, VITE_SUPABASE_PUBLISHABLE_KEY: jwt('service_role') })).toBeNull();
    expect(readSyncConfig({ VITE_SUPABASE_URL: URL, VITE_SUPABASE_PUBLISHABLE_KEY: jwt('anon') })).not.toBeNull();
  });
});

describe('sign-in helpers', () => {
  it('returns to the Settings page under the site\'s base path', () => {
    expect(signInRedirectUrl('https://pranjalagg.github.io', '/bdgt')).toBe('https://pranjalagg.github.io/bdgt/settings');
    expect(signInRedirectUrl('http://localhost:5173', '')).toBe('http://localhost:5173/settings');
  });

  it('recognizes a page opened by the sign-in redirect', () => {
    expect(hasAuthCallback('?code=abc123')).toBe(true);
    expect(hasAuthCallback('?foo=1&error_description=access_denied')).toBe(true);
    expect(hasAuthCallback('?month=2026-10')).toBe(false);
    expect(hasAuthCallback('')).toBe(false);
  });

  it('knows whether a session is stored, and survives storage being unavailable', () => {
    expect(hasStoredSession({ getItem: (k) => (k === AUTH_STORAGE_KEY ? '{}' : null) })).toBe(true);
    expect(hasStoredSession({ getItem: () => null })).toBe(false);
    expect(hasStoredSession(undefined)).toBe(false);
    expect(hasStoredSession({ getItem: () => { throw new Error('blocked'); } })).toBe(false);
  });

  it('uses the code-exchange flow and keeps the session in this browser', () => {
    expect(supabaseAuthOptions).toMatchObject({ flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true, storageKey: AUTH_STORAGE_KEY });
  });
});
