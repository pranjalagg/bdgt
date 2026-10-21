// A one-time value for native Google sign-in. Google puts the SHA-256 of it
// (hex) into the ID token; Supabase hashes the raw value it is given and
// compares the two, so an ID token obtained elsewhere cannot be replayed.

export function randomNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export { sha256Hex } from '$lib/utils/hash';
