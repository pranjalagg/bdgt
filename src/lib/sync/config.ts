// Whether this build is connected to a Supabase project, and the few facts
// about the browser the sign-in code needs. Everything is a plain function of
// its inputs so it can be tested; `syncConfig()` reads the real environment.

export interface SyncConfig {
  url: string;
  key: string;
}

export const AUTH_STORAGE_KEY = 'bdgt-sync-auth';

const SUPABASE_URL = /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/;
const LOCAL_URL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function isServiceRoleJwt(key: string): boolean {
  const payload = key.split('.')[1];
  if (!payload) return false;
  try {
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return json?.role === 'service_role';
  } catch {
    return false;
  }
}

// The app only ever holds the public key. A secret or service-role key would
// bypass every access rule, so it is refused outright (sync stays off).
export function readSyncConfig(env: Record<string, unknown>): SyncConfig | null {
  const url = typeof env.VITE_SUPABASE_URL === 'string' ? env.VITE_SUPABASE_URL.trim().replace(/\/$/, '') : '';
  const key = typeof env.VITE_SUPABASE_PUBLISHABLE_KEY === 'string' ? env.VITE_SUPABASE_PUBLISHABLE_KEY.trim() : '';
  if (!url || !key) return null;
  if (!SUPABASE_URL.test(url) && !LOCAL_URL.test(url)) return null;
  if (key.startsWith('sb_secret_') || isServiceRoleJwt(key)) return null;
  return { url, key };
}

export function syncConfig(): SyncConfig | null {
  return readSyncConfig(import.meta.env as Record<string, unknown>);
}

const GOOGLE_CLIENT_ID = /^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/;

// The Google web client ID that Supabase signs people in with. Public (it is
// in every Google sign-in address); only the Android app needs it, to ask the
// phone's account picker for an ID token meant for Supabase.
export function readGoogleClientId(env: Record<string, unknown>): string | null {
  const id = typeof env.VITE_GOOGLE_WEB_CLIENT_ID === 'string' ? env.VITE_GOOGLE_WEB_CLIENT_ID.trim() : '';
  return GOOGLE_CLIENT_ID.test(id) ? id : null;
}

export function googleClientId(): string | null {
  return readGoogleClientId(import.meta.env as Record<string, unknown>);
}

// Google returns to the Settings page, where the Sync section lives.
export function signInRedirectUrl(origin: string, base: string): string {
  return `${origin}${base}/settings`;
}

// The page was opened by the sign-in redirect (a code to exchange, or an error).
export function hasAuthCallback(search: string): boolean {
  return /[?&](code|error|error_description)=/.test(search);
}

export function hasStoredSession(storage: Pick<Storage, 'getItem'> | undefined): boolean {
  try {
    return !!storage?.getItem(AUTH_STORAGE_KEY);
  } catch {
    return false;
  }
}

// Authorization-code flow with PKCE: the right flow for a site with no server.
export const supabaseAuthOptions = {
  flowType: 'pkce' as const,
  detectSessionInUrl: true,
  persistSession: true,
  autoRefreshToken: true,
  storageKey: AUTH_STORAGE_KEY,
};
