# Android test build

The Android app is the normal budget app plus two things:

- **Setup → Settings → Automatic capture** reads the payment notifications that Google Wallet, UPI apps (Google Pay, PhonePe, Paytm) and bank SMS show, and puts each payment in **Review** for you to approve. Nothing reaches a bucket until you approve it.
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

## Turning automatic capture on

1. Open **Setup → Settings → Automatic capture** and tap **Turn on**. Android opens the Notification access screen.
2. Turn on **bdgt payment capture**. On Android 13 and later the switch may be greyed out for an app installed from a file. If so, open **Settings → Apps → bdgt**, tap the ⋮ menu, choose **Allow restricted settings**, and try again.
3. Back in the app, Notification access shows **On**. Under **Read from**, untick any app you do not want read.
4. If you are not signed in (Sync), payments wait on the phone and go to Review as soon as you sign in. The section says how many are waiting.
5. If the section later says **Capture is on but not running**, tap **Reconnect**, then **Battery settings** and set bdgt to unrestricted. Samsung, Xiaomi, OnePlus and others stop background apps aggressively; https://dontkillmyapp.com has the steps for each make.

Keep notifications on for Google Wallet, your UPI apps and your messaging app: the app can only see what the phone actually shows. Notifications recorded by an earlier test build are not sent to Review; only new ones are.

## Trying it

1. Pay with Google Wallet or a UPI app, or wait for a bank SMS about a payment.
2. Open the app. The dashboard shows **N payments to review**, and Activity has a count. The payment is already counted in safe to spend.
3. Open **Review**: approve it into the suggested bucket, edit it (amount with tip, bucket, date, note) or dismiss it. Approving teaches the app that payee's bucket.
4. Signed in, the same queue is on every device: approve on the laptop if you prefer (until the merge, that means `npm run dev` from this branch; the live site does not have Review yet).

When the same payment shows up twice (the bank's SMS and the UPI app), the second is folded under the first as **Also seen**. Money coming in, refunds, failed payments, payment requests, offers, due-date reminders and upcoming debits are skipped.

## What is read and what is kept

- Only notifications from the apps ticked under **Read from**.
- From payment apps: notifications that mention an amount.
- From messaging apps: only messages from banks (sender IDs such as `VM-HDFCBK`, short codes, or names with a bank word) that mention an amount and a banking word. Messages from contacts and phone numbers are never kept, whatever they say.
- One-time passwords are never kept.
- The full text stays on the phone. Amount, date, merchant and card digits sync to your account (the owner of the Supabase project can see them); UPI IDs sync only as a scrambled key.

## When a payment is read wrongly or missed

Open **Recorded notifications** at the bottom of the section: under each notification it says what the app made of it (**Payment: …** or **Skipped: …**). Tap **Share log**, send the file, and say which one is wrong. Reference, account and phone numbers are masked to their last two digits; amounts and dates are kept. Names are not masked, so look through the file first. **Clear log** deletes the recordings from the phone; payments already in Review stay. Signing out leaves capture on and keeps the log; payments that arrive while signed out wait on the phone and go to Review when you sign in again.

## Checking real messages without paying (development only)

Copy a notification or SMS word for word and see what the app makes of it, in a browser on your Mac. These helpers exist only under `npm run dev`: the website and the Android app are built without them, and CI fails the build if one ever appears in it.

1. Start the app with sync off, so nothing reaches your account: `VITE_SUPABASE_URL= npm run dev`. (Signed in, the fake phone refuses to start.)
2. Open it in the browser and open the developer console (⌥⌘J in Chrome).
3. Ask the parser, which changes nothing:
   ```js
   __bdgtParse('sms', 'VM-HDFCBK', 'Rs.250.00 debited from A/c XX1234 on 21-10-26 to VPA swiggy@icici. UPI Ref 612345678902')
   // → 'Payment: ₹250.00 · swiggy@icici (card or account ••1234)'
   __bdgtParse('wallet', 'Starbucks', '$5.45 with Visa •••• 1234')
   ```
   The first argument is the source: `'wallet'`, `'gpay'`, `'phonepe'`, `'paytm'` (then the notification's title and text) or `'sms'` (then the sender as the Messages app shows it, such as `VM-HDFCBK` or `HDFC Bank`, and the message). Copy the sender exactly: messages from contacts and phone numbers are never read. The answer is a payment, *Skipped: …* with the reason, or *The phone would not keep this: …* when the phone itself would drop it.
4. For the whole flow, start a fake phone and send it notifications; payments appear in Review, the dashboard and Settings → Automatic capture, as on the phone:
   ```js
   await __bdgtFakePhone()
   __bdgtNotify('sms', 'VM-SBIUPI', 'Dear UPI user A/C X1234 debited by 250.0 on date 21Oct26 trf to SWIGGY Refno 612345678904')
   __bdgtNotify('phonepe', 'Paid ₹250 to Swiggy', 'UPI transaction successful', 1) // optional: minutes ago
   ```
   Move between pages with the app's menu: reloading the page turns the fake phone off (payments already in Review stay).

## Changing what is read

Everything below has tests in `tests/lib/capture/`. When a message is read wrongly: add it to `tests/lib/capture/parse.test.ts` with what it should give (copy a test next to it), run `npx vitest run tests/lib/capture/parse.test.ts`, change the pattern until it passes, then run all tests (`npx vitest run`).

| To change | Where |
|---|---|
| Amounts and currencies (`Rs.`, `₹`, `INR`, `$`, …), and which amounts are balances or limits | `src/lib/capture/parse.ts`: `AMOUNT`, `BALANCE_BEFORE`, `currencyFor` |
| Payment or not: money out, money in, refunds, failures, requests, offers, upcoming debits and statements | `parse.ts`: `OUT`, `IN`, `SENT`, `CREDIT`, `REFUND`, `FAILED`, `REQUEST`, `UPCOMING`, `PROMO`, and the order they are checked in `classify` |
| The payee | `parse.ts`: `SPECIFIC` (one bank's own shape, such as SBI's `trf to SWIGGY Refno`), `GENERIC` (`to X`, `at X`, `transaction with X`), `NOT_A_PAYEE` (words that are never a payee) |
| Card or account digits, UPI reference | `parse.ts`: `ACCOUNT`, `MASKED`, `REFERENCE`, `P2M_REFERENCE` |
| Card bill, cash withdrawal, UPI Lite top-up, own-account transfer | `parse.ts`: `findHint` |
| Bank names from sender IDs (`HDFCBK` → HDFC Bank), which senders count as banks | `parse.ts`: `BANK_SENDERS`, `isBusinessSender` |
| Supported apps and their names; Wallet titles that are not a merchant | `parse.ts`: `APPS`, `GENERIC_TITLE` |
| Merchant kinds behind first suggestions (Swiggy → Dining Out) | `src/lib/capture/payee.ts`: `KINDS` |
| When two payees are the same (`SQ *BLUE BOTTLE #12` = `Blue Bottle`) | `payee.ts`: `normalizeName` |
| When two notifications are the same payment | `src/lib/capture/dedupe.ts` |
| What the phone keeps at all (before any of the above) | `android/app/src/main/java/io/github/pranjalagg/bdgt/capture/KeepRules.kt`, mirrored for the fake phone in `src/lib/capture/devPhone.ts` (change both). Tests: `android/app/src/test/.../KeepRulesTest.kt`, run by CI |

Changes in `src/` reach the phone with the next build: push to the branch and install the new APK from the run. `KeepRules.kt` changes are checked only by CI (no Android tools on the Mac).

## Building it yourself

```sh
npm ci
BASE_PATH= npm run build
npx cap sync android
cd android && ./gradlew testDebugUnitTest assembleDebug
```

Needs JDK 21 and the Android SDK (or open `android/` in Android Studio). The APK lands in `android/app/build/outputs/apk/debug/`. For sign-in, put the three `VITE_` values in `.env` (see `.env.example`) before building, and register your own debug key as a second Android client (step 3, with the SHA-1 from `keytool -list -v -keystore ~/.android/debug.keystore -storepass android`).
