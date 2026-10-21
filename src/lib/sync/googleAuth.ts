// Native Google sign-in in the Android app (the GoogleAuth plugin, built on
// Android's Credential Manager). Google refuses to sign in inside a web view,
// so the phone's own account picker supplies an ID token instead.

export interface GoogleAuthPlugin {
  // Rejects with code 'canceled', 'no-account' or 'failed'.
  idToken(options: { serverClientId: string; nonce: string }): Promise<{ idToken: string }>;
}

// The ID token, or null when the person closed the picker. Other failures
// become messages the Sync section can show as they are.
export async function phoneIdToken(plugin: GoogleAuthPlugin, serverClientId: string, hashedNonce: string): Promise<string | null> {
  try {
    return (await plugin.idToken({ serverClientId, nonce: hashedNonce })).idToken;
  } catch (e) {
    const code = (e as { code?: unknown }).code;
    if (code === 'canceled') return null;
    if (code === 'no-account') {
      throw new Error('Google found no account to sign in with. Add your Google account under the phone\'s Settings → Accounts, then try again.');
    }
    throw new Error(`Google sign-in failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}
