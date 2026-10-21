# Android test build

The test build is the normal budget app plus two things:

- **Setup → Settings → Payment capture (test)** records the notifications that Google Wallet, UPI apps (Google Pay, PhonePe, Paytm) and bank SMS show. Nothing is added to the budget; the recordings are samples for building the automatic capture.
- **Setup → Settings → Sync** signs in with Google, like the website, once the owner has done the one-time setup below.

## Getting the app

1. On GitHub, open **Actions → Android test build**, pick the latest green run, and download the artifact `bdgt-test-build-N` (a zip holding `app-debug.apk`).
2. Send the APK to the phone and open it. Android asks to allow installing from that app (Files, Drive, a browser); allow it.
3. Later builds install over the earlier one, keeping your data. If Android ever refuses the update ("package conflicts"), export a backup in Settings, uninstall, install the new build and import the backup.

The app keeps its own budget data, separate from the website, until you sign in to the same account on both.

## Sign-in: one-time setup (owner)

Google does not allow its sign-in page inside an app, so the app asks the phone's own Google account picker instead. Google only answers apps it knows by name and signing key, and the app needs to know which Google client to ask for. Four steps, about 15 minutes. Part 2 of `docs/sync-setup.md` (the website's Google sign-in) must be done already.

### 1. Keep the app's signing key in GitHub

Every test build must be signed with the same key: Android only installs an update over the app when the key matches, and Google recognises the app by it. Until this step is done the builds use a key kept in GitHub's cache, which GitHub deletes after 7 days without a build.

On your Mac, in any folder outside the repository:

```sh
keytool -genkeypair -keystore bdgt-debug.keystore -storepass android -alias androiddebugkey \
  -keypass android -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Android Debug,O=Android,C=US"
base64 -i bdgt-debug.keystore | gh secret set ANDROID_DEBUG_KEYSTORE_BASE64 -R pranjalagg/bdgt
```

Keep `bdgt-debug.keystore` somewhere safe (a password manager or private backup) and out of the repository. It is a test key, but whoever has it can sign an update to your app. The next build is signed with it, so a phone that has an earlier build needs one uninstall and reinstall (export a backup first).

### 2. Tell the build which Google client to use

The app asks Google for a sign-in token meant for the website's client (`bdgt web` in Google Cloud, the one Supabase uses). Its Client ID is public: it appears in every Google sign-in address.

```sh
gh variable set VITE_GOOGLE_WEB_CLIENT_ID -R pranjalagg/bdgt --body "<the bdgt web Client ID>"
```

Or on GitHub: **Settings → Secrets and variables → Actions → Variables → New repository variable**. `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are already there for the website; the Android build uses them too. Without all three, the app has no Sync section.

### 3. Register the app with Google

1. Run the build: push to the branch, or **Actions → Android test build → Run workflow**.
2. When it finishes, open the run. Its summary shows **Signing key SHA-1** (also in the log of the step *Signing key fingerprint*). Copy it.
3. In Google Cloud Console, select the same project as `bdgt web`, open **Google Auth Platform → Clients → Create client**.
4. **Application type**: **Android**. Name it `bdgt android`.
5. **Package name**: `io.github.pranjalagg.bdgt`
6. **SHA-1 certificate fingerprint**: the SHA-1 from the run summary.
7. **Create.** Nothing from this client goes anywhere else: the app keeps asking for tokens for `bdgt web`, and Google checks the app against this client. Changes can take a few minutes to apply.

### 4. Check Supabase and sign in

1. In Supabase, **Authentication → Sign In / Providers → Google**: *Client IDs* contains the `bdgt web` Client ID (it does if part 2 of the sync guide was followed) and *Skip nonce checks* is **off**. Nothing else changes.
2. Install the build from step 3, open **Setup → Settings → Sync** and tap **Sign in with Google**. The phone shows its Google accounts; pick the invited one.
3. The first sign-in works as on the website: data uploads, downloads, or (when both have data) the app asks first. The backup of this phone's data opens the share sheet; save it to Drive or Files.

Friends sign in the same way. As for the website, add each friend's Google email as a **test user** in Google Cloud (**Audience → Test users**) and to the Supabase invite list.

### If sign-in goes wrong

| What you see | What to check |
|---|---|
| There is no Sync section in the app | Step 2: all three variables are set, then a new build was installed. |
| *Google sign-in failed: [28444] Developer console is not set up correctly* | Step 3: the Android client exists in the **same** Google Cloud project as `bdgt web`, the package name is exactly `io.github.pranjalagg.bdgt`, and its SHA-1 is the one from the run that built the installed app. Wait a few minutes after changing it. |
| *Google found no account to sign in with* | The phone has a Google account (**Settings → Accounts**). If it does, check step 3 as above: Google gives this answer too when it does not recognise the app. |
| *Unacceptable audience in id_token* | Step 4.1: Supabase's *Client IDs* must contain the `bdgt web` Client ID, and step 2's variable must be that same ID (not the Android client's). |
| *Access blocked* or *access_denied* | The account is not a test user (sync guide, part 2, step 1d). |
| *Sync isn't enabled for this account* | The account's email is not on the invite list (sync guide, part 1, step 3). |
| Android refuses to install the new build | The signing key changed (step 1, or GitHub deleted the cached key). Export a backup, uninstall, install, import. |
| Anything else | Copy the exact message and tell me. |

## Turning recording on

1. Open **Setup → Settings → Payment capture (test)** and tap **Start recording**. Android opens the Notification access screen.
2. Turn on **bdgt payment capture**. On Android 13 and later the switch may be greyed out for an app installed from a file. If so, open **Settings → Apps → bdgt**, tap the ⋮ menu, choose **Allow restricted settings**, and try again.
3. Back in the app, Notification access shows **On**.
4. If the section later says **Recording is on but not running**, tap **Reconnect**, then **Battery settings** and set bdgt to unrestricted. Samsung, Xiaomi, OnePlus and others stop background apps aggressively; https://dontkillmyapp.com has the steps for each make.

Keep notifications on for Google Wallet, your UPI apps and your messaging app: the app can only see what the phone actually shows.

## What is recorded

- Only notifications from Google Wallet, Google Pay, PhonePe, Paytm and your messaging apps.
- From payment apps: notifications that mention an amount.
- From messaging apps: only messages with an amount and a banking word (debited, credited, UPI, A/c, …). Personal messages are dropped as they arrive.
- One-time passwords are never kept.
- Everything stays on the phone until you share it.

## Sharing the log

After about a week of normal spending, tap **Share log** and send the file (email, WhatsApp, Drive). Reference, account and phone numbers are masked to their last two digits; amounts and dates are kept. Names are not masked, so look through the file first. **Clear log** deletes the recordings from the phone.

## Building it yourself

```sh
npm ci
BASE_PATH= npm run build
npx cap sync android
cd android && ./gradlew testDebugUnitTest assembleDebug
```

Needs JDK 21 and the Android SDK (or open `android/` in Android Studio). The APK lands in `android/app/build/outputs/apk/debug/`. For sign-in, put the three `VITE_` values in `.env` (see `.env.example`) before building, and register your own debug key as a second Android client (step 3, with the SHA-1 from `keytool -list -v -keystore ~/.android/debug.keystore -storepass android`).
