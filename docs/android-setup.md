# Android test build

The test build is the normal budget app plus one extra: in **Setup → Settings → Payment capture (test)** it can record the notifications that Google Wallet, UPI apps (Google Pay, PhonePe, Paytm) and bank SMS show. Nothing is added to the budget; the recordings are samples for building the automatic capture.

## Getting the app

1. On GitHub, open **Actions → Android test build**, pick the latest green run, and download the artifact `bdgt-test-build-N` (a zip holding `app-debug.apk`).
2. Send the APK to the phone and open it. Android asks to allow installing from that app (Files, Drive, a browser); allow it.
3. Later builds install over the earlier one, keeping your data. If Android ever refuses the update ("package conflicts"), export a backup in Settings, uninstall, install the new build and import the backup.

The app keeps its own budget data, separate from the website. Sign-in is not available in the app yet.

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

Needs JDK 21 and the Android SDK (or open `android/` in Android Studio). The APK lands in `android/app/build/outputs/apk/debug/`.
