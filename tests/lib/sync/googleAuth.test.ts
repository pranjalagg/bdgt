import { describe, it, expect, vi } from 'vitest';
import { phoneIdToken, type GoogleAuthPlugin } from '$lib/sync/googleAuth';

const ID = '611442995663-s1fb80ks2pqbv6isg7o0avebg6idirmo.apps.googleusercontent.com';
const rejecting = (code: string, message: string): GoogleAuthPlugin => ({
  idToken: async () => {
    throw Object.assign(new Error(message), { code });
  },
});

describe('phoneIdToken', () => {
  it('asks for a token for the web client, carrying the hashed nonce', async () => {
    const plugin = { idToken: vi.fn(async () => ({ idToken: 'tok' })) };
    expect(await phoneIdToken(plugin, ID, 'abc123')).toBe('tok');
    expect(plugin.idToken).toHaveBeenCalledWith({ serverClientId: ID, nonce: 'abc123' });
  });

  it('treats a closed picker as no answer, not an error', async () => {
    expect(await phoneIdToken(rejecting('canceled', 'Sign-in was cancelled'), ID, 'n')).toBeNull();
  });

  it('explains a missing account and passes other failures on', async () => {
    await expect(phoneIdToken(rejecting('no-account', 'No credentials available'), ID, 'n')).rejects.toThrow(/no account to sign in with/);
    await expect(phoneIdToken(rejecting('failed', '[28444] Developer console is not set up correctly.'), ID, 'n')).rejects.toThrow(
      'Google sign-in failed: [28444] Developer console is not set up correctly.'
    );
  });
});
