// A one-time value for native Google sign-in. Google puts the SHA-256 of it
// (hex) into the ID token; Supabase hashes the raw value it is given and
// compares the two, so an ID token obtained elsewhere cannot be replayed.

export function randomNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
