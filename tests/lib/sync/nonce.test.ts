import { describe, it, expect } from 'vitest';
import { randomNonce, sha256Hex } from '$lib/sync/nonce';

describe('nonce', () => {
  it('makes a fresh 64-character hex value each time', () => {
    const a = randomNonce();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(randomNonce()).not.toBe(a);
  });

  it('hashes with SHA-256 to lower-case hex, as Supabase compares it', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(await sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
});
