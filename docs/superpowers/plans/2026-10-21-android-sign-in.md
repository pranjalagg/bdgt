# Android Sign-in Implementation Plan

> Stage 3 of 4 of automatic payment capture. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Signing in with Google works inside the Android app, so the review queue can sync from the phone. Google refuses its sign-in page in a WebView; the phone's account picker supplies an ID token instead, which Supabase exchanges for a session.

**Spec:** `docs/superpowers/specs/2026-10-21-android-payment-capture-design.md`: "Sign-in on Android", "Rollout".

## Global Constraints

- Same as stages 1 and 2: branch `claude/intelligent-davinci-7qblqz`, no pull requests, `git commit --no-gpg-sign` without attribution lines, never run the Pages deploy from this branch.
- The website's sign-in (OAuth redirect) is unchanged.
- Native sign-in cannot run in CI (Credential Manager needs a phone with Google Play services): it is checked by hand with the owner.

## Rulings made while planning

- **Our own `GoogleAuth` plugin** (Kotlin, `androidx.credentials` 1.6.0 and `googleid` 1.2.1) instead of a third-party Capacitor sign-in plugin. It uses `GetSignInWithGoogleOption`, the sheet meant for an explicit sign-in button, and parses any custom credential into a Google ID token rather than matching its type (the sheet and one-tap label theirs differently).
- **The page owns the nonce:** a random 32-byte hex value; its SHA-256 (hex) goes to Google, the value itself to Supabase, which hashes and compares.
- **One sign-in path after the token:** `SyncApp` subscribes to auth events once and lets the library's `SIGNED_IN` run the existing first-sign-in flow, as after a redirect.
- **A closed account picker is not an error;** a missing account and other failures show a message in the Sync section.
- **The Android app has no Sync section** unless the build has the Supabase settings and `VITE_GOOGLE_WEB_CLIENT_ID` (repository variables, all public).
- **Signing key in a repository secret** (`ANDROID_DEBUG_KEYSTORE_BASE64`), with the Actions cache as a fallback until the secret exists. CI prints the key's SHA-1 for the Android OAuth client.
- **Capture tied to sign-in moves to stage 4,** with the Automatic capture switch and the inbox it guards.
- **No `clearCredentialState` on sign-out:** the sheet asks every time (see `docs/deferred.md`).

## Tasks

- [x] `src/lib/android.ts`: platform check and plugin loader shared by capture and sign-in.
- [x] `src/lib/sync/nonce.ts`, `readGoogleClientId` in `config.ts`, `src/lib/sync/googleAuth.ts` (plugin answers to messages), with tests.
- [x] `SyncApp`: `signInWithIdToken` in `AuthClient`, optional `googleIdToken` dependency, subscribe once, tests with a fake client that announces `SIGNED_IN` like supabase-js.
- [x] `browser.ts`: native path inside the Android app; Sync hidden there without the client ID.
- [x] `GoogleAuthPlugin.kt`, dependencies, registration in `MainActivity`.
- [x] CI: the three variables, the signing key from the secret, the SHA-1 in the run summary; test that the workflow takes no other secret.
- [x] `docs/android-setup.md` one-time setup and troubleshooting; `docs/sync-setup.md` and `.env.example` updated.
- [ ] With the owner: secret, variable, Android client, then sign in on a phone (first sign-in with data on both sides, sign out, sign in again).
