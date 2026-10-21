# Setting up cloud sync

Cloud sync is optional. The app works exactly as before until a Supabase project is connected and someone signs in. This guide has two parts:

1. **The database** (this part): create the Supabase project, apply the migrations, invite yourself, check it.
2. **Sign-in and the deployed site** (part 2, below): the Google login key, Supabase's Google provider and redirect addresses, and the app's two settings.

You do each part once. Part 1 takes about 15 minutes and part 2 about 25. Nothing in either can change or delete data in the app itself.

## Before you start

- A Supabase account. The Free plan is enough: two active projects (the other is your existing one), 500 MB per project, 50,000 monthly active users.
- Free projects **pause after a week of inactivity** and have **no automatic backups**. While a project is paused the app keeps working on the device and syncs again once the project is resumed from the dashboard. Keep exporting JSON backups from Settings.
- The email of the Google account you will sign in with, in lowercase.

## Part 1: the database

### 1. Create the project

1. Open the Supabase dashboard and choose **New project**.
2. Name it `bdgt`. Pick the region closest to you (syncing happens in the background, so the choice barely matters).
3. Set a database password and store it in your password manager. The app never uses it.
4. Wait for the project to finish provisioning.

### 2. Apply the migrations

Open **SQL Editor → New query** and run each file below, in this order, one at a time. Copy the whole file from this repository, paste it in, and press **Run** with **nothing highlighted**: when text is highlighted the editor runs only the highlighted part, which would leave tables half-created. Each should end with *Success. No rows returned*.

1. `supabase/migrations/20261021000000_sync_core.sql` — the tables, the write rules and the access rules.
2. `supabase/migrations/20261021000100_analytics.sql` — the views for studying your data.

If a run fails, copy the error text and tell me before running anything again. The files create tables without `if not exists` on purpose: running one twice fails loudly instead of silently overwriting something.

### 3. Invite yourself

Only emails on the invite list can sync. In a new SQL query run (use your own address, lowercase):

```sql
insert into public.allowed_users (email, note) values ('you@gmail.com', 'me');
```

To invite someone else later, add their email the same way. To stop someone syncing, delete their row; their data stays in the database until you delete it.

### 4. Check the setup

In a new query paste the whole of `supabase/tests/verify_setup.sql` and run it. Every row in the result must say `true`. The last row is `true` only after step 3.

Supabase's **Security Advisor** may then list two findings. Both are intended; do not "fix" them: *RLS enabled, no policy* on `allowed_users` (no policy is what keeps everyone but you out of the invite list), and *function can be executed by signed-in users* on `sync_account_state` (it only ever returns the caller's own data).

### 5. Check the API settings

1. Open **Project Settings → Data API** (shown as *API* in older dashboards).
2. Under **Exposed schemas**, only `public` (and `graphql_public`) should be listed. `analytics` and `private` must **not** be: they hold helper functions and every user's analysis views.
3. Leave **Max rows** at its default of 1000. The app downloads in pages of 1000; a lower limit can leave newer rows undelivered.

### 6. Turn off the other sign-in methods

The invite list matches the email on a person's login, and Supabase offers email-and-password, phone and anonymous sign-up by default. Sync is meant to be reached with Google only, so close the others:

1. Open **Authentication → Sign In / Providers** (menu names move around; look for the list of providers). Turn **off** *Email* and *Phone*. Google is set up in part 2.
2. Turn **off** *Allow anonymous sign-ins*.
3. If you ever turn Email back on for testing, keep *Confirm email* on, and turn it off again afterwards.

### 7. Copy the project's address and public key

Open **Project Settings → API Keys** and note:

- the **Project URL** (`https://<project-ref>.supabase.co`), and
- the **Publishable key** (starts with `sb_publishable_`).

Both are safe to put in the app. **Never put the secret key (`sb_secret_…`) or the old `service_role` key in the app or in GitHub variables**: it bypasses all access rules.

Send me the URL and the publishable key when you have them; the sign-in release needs them.

## Part 2: Google sign-in and the deployed site

Part 1 must be finished first (the project exists, the migrations are applied, your email is on the invite list). Part 2 is about 25 minutes, most of it in Google Cloud Console.

Steps 1 to 4 only configure Google and Supabase, so they can be done at any time. Steps 5 and 6 connect the app and need the release that adds the **Sync** section to Settings.

You will handle two kinds of value. Know which is which:

| Value | Where it comes from | Where it goes | Secret? |
|---|---|---|---|
| **Project URL** (`https://<project-ref>.supabase.co`) | Supabase → Project Settings → API | the app, GitHub variable | No |
| **Publishable key** (`sb_publishable_…`) | Supabase → Project Settings → API Keys | the app, GitHub variable | No, public by design |
| **Google Client ID** | Google Cloud, step 1 | Supabase only | No, but only Supabase needs it |
| **Google Client secret** | Google Cloud, step 1 | **Supabase only** | **Yes. Never in the app, this repository, GitHub or a chat.** |

`<project-ref>` is the part of your project URL before `.supabase.co`. Wherever it appears below, substitute yours.

### 1. Create a Google login key

Supabase signs people in with Google, so it needs a "client" registered with Google. Google's console has been reorganised more than once; if a menu name differs, look for the same word (Branding, Audience, Data Access, Clients).

**a. A Google Cloud project**

1. Open <https://console.cloud.google.com/> and sign in with the Google account you want to own this (it does not have to be the one you will sign in to the app with).
2. In the project picker at the top choose **New project**, name it `bdgt`, and create it. Make sure it is the selected project.

**b. The consent screen (Google Auth Platform)**

1. Open **Google Auth Platform** (search for it in the top bar). If it says it is not configured, choose **Get started**.
2. Open **Branding** and fill in only these three fields:
   - **App name**: `bdgt`. This is what people see on Google's "choose an account" screen.
   - **User support email**: your email.
   - **Developer contact information** (at the bottom): your email.
3. Under **Authorised domains** (further down, in the *App domain* section) press **Add domain** and add the two domains your sign-in uses. Google will not let you publish until the domains used by your OAuth client are listed here:
   - `pranjalagg.github.io` (the app's site)
   - `<project-ref>.supabase.co` (your Supabase project; this is where Google sends people back to). If Google says a domain is invalid, use `supabase.co` instead.

   `localhost` is not added: it needs no registration.
4. Leave everything else on the page **empty**: *App logo*, *Application home page*, *Application privacy policy link* and *Application terms of service link*.
5. **Do not upload a logo.** It is optional, and adding one makes Google require a verification review (days to weeks) before you can publish. Without a logo, Google shows a plain letter icon, which is fine for a personal app.
6. Press **Save** (the button turns grey once saved). If **Publish app** later says *To publish your app, you must complete your configuration on the Branding page*, a required field on this page is empty or the page was not saved: open it again, fill in the three fields above, and press **Save**. If it names a field I have not listed, tell me which.
7. Open **Audience**: choose **External** (this allows any Google account; the invite list then restricts who can sync). Add your email under **Contact information** if it asks, accept the policy checkbox and save.

**c. Scopes**

Google's newer console does not pre-select any scopes, so the Data Access page may look empty. Add the three basic sign-in scopes yourself:

1. Open **Data Access** and press **Add or remove scopes**.
2. In the table that slides in, tick these three (they are listed under *Google Account* or similar; use the filter box and search for `userinfo` and `openid` if the list is long):
   - `openid`
   - `.../auth/userinfo.email` (*See your primary Google Account email address*)
   - `.../auth/userinfo.profile` (*See your personal info*)
3. If one is missing from the table, scroll to **Manually add scopes**, type or paste it there (`openid`, `https://www.googleapis.com/auth/userinfo.email`, `https://www.googleapis.com/auth/userinfo.profile`) and press **Add to table**.
4. Press **Update**, then **Save** at the bottom of the Data Access page. The three scopes now appear under *Your non-sensitive scopes*.
5. Do **not** add any other scope. Anything beyond these three can trigger Google's verification process, which takes weeks.

(Basic sign-in usually works even if these are not listed, but listing them removes a source of confusing errors, and it costs nothing.)

**d. Publish the app**

1. Open **Audience**. The publishing status starts as **Testing**.
2. Choose **Publish app** and confirm, so the status becomes **In production**. With only the basic scopes above, Google does not require verification.
3. If you would rather stay in *Testing*: only the Google accounts listed under **Test users** can sign in (add yours), and Google may require you to sign in again every week.

**e. The client**

1. Open **Clients → Create client**.
2. **Application type**: **Web application**. Name it `bdgt web`.
3. **Authorized JavaScript origins**: add these two (an origin is the address with no path and no trailing slash):
   - `https://pranjalagg.github.io`
   - `http://localhost:5173`
4. **Authorized redirect URIs**: add exactly one:
   - `https://<project-ref>.supabase.co/auth/v1/callback`

   This is Supabase's address, not the app's. It must match character for character.
5. Choose **Create**. Google shows a **Client ID** (ends in `.apps.googleusercontent.com`) and a **Client secret**.
6. **Copy both now.** Google may show the secret only this once; if you lose it you can create a new secret on the client's page. Keep them in your password manager until step 2, then you will not need them again.

Changes to a Google client can take a few minutes (occasionally longer) to take effect.

### 2. Turn on Google in Supabase

1. Open your project in the Supabase dashboard → **Authentication → Sign In / Providers** (menu names move around; look for the list of providers).
2. Open **Google** and switch **Enable Sign in with Google** on.
3. Paste the **Client ID** into *Client IDs* and the **Client secret** into *Client Secret*.
4. Leave *Skip nonce checks* and *Allow users without an email* **off**.
5. Note the **Callback URL (for OAuth)** shown on the same screen. It must be exactly the redirect URI you gave Google in step 1e. If it differs, fix Google's, not Supabase's.
6. **Save.**

Check it from the outside: open this address in a browser. You should be sent to a Google sign-in page. If you instead see `Unsupported provider: provider is not enabled`, step 2 was not saved.

```
https://<project-ref>.supabase.co/auth/v1/authorize?provider=google
```

(Stop at Google's page: do not complete a sign-in from this address; the app does that part.)

The other sign-in methods stay **off** (part 1, step 6). Google is the only way in.

### 3. Allow the app's addresses

Open **Authentication → URL Configuration**:

- **Site URL**: `https://pranjalagg.github.io/bdgt/`
- **Redirect URLs**: add both of these (the `**` matches any path after it):
  - `https://pranjalagg.github.io/bdgt/**`
  - `http://localhost:5173/**`

Save. If an address the app uses is not on this list, signing in returns you to the Site URL instead of where you started, and you will look signed out.

### 4. Check what you have so far

Before going further, confirm these three things are true. Each is a common cause of a confusing failure later.

- [ ] Google's **Authorized redirect URI** equals the **Callback URL** Supabase shows (step 2.5).
- [ ] The Google app is **In production** (or your account is a test user).
- [ ] Your Google account's email, in lower case, is in `public.allowed_users` (part 1, step 3). Run `select email from public.allowed_users;` to look.

### 5. Tell the app about the project

The app does nothing with Supabase until it is given the project URL and the publishable key. With neither, it behaves exactly as before and shows no Sync section.

**Local development.** In the project folder create a file named `.env` (it is git-ignored, so it is never committed) with exactly two lines, using your values:

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Restart `npm run dev` after creating or changing it.

**The deployed site.**

1. In the GitHub repository open **Settings → Secrets and variables → Actions** and choose the **Variables** tab (not *Secrets*: these two values are public by design).
2. **New repository variable**: name `VITE_SUPABASE_URL`, value your project URL.
3. **New repository variable**: name `VITE_SUPABASE_PUBLISHABLE_KEY`, value your publishable key.
4. Open the **Actions** tab, choose **Deploy to GitHub Pages** in the list on the left, press **Run workflow** and confirm. The site is only rebuilt when you do this; adding the variables alone changes nothing.

Never put the Google Client secret, the Supabase secret key (`sb_secret_…`) or the old `service_role` key in the `.env` file or in a variable. The app refuses to use a secret key, but the right place for it is nowhere.

### 6. Try it

1. Open **Setup → Settings**. The **Sync** section is there, with **Sign in with Google**. Press it and choose the account whose email is on the invite list.
2. You are sent to Google, then back to Settings, now signed in. The first time, one of three things happens:
   - **This device has data and your account is empty:** the data uploads.
   - **This device is new and your account has data:** the account's data downloads.
   - **Both have data:** a dialog asks whether to replace this device's data with the account's. A backup file of this device's data downloads first. **Cancel** keeps this device's data and does not sync.
3. The status shows under the Sync heading and in the side bar (`Synced · 2 min ago`). Edits upload a couple of seconds after you make them, and changes from another device arrive when you return to the tab, when the network comes back, or within five minutes.
4. To check from the database side, in the Supabase SQL editor run `select count(*) from public.transactions where deleted_at is null;` and compare it with the app, or look at `select * from analytics.monthly_cashflow order by month desc limit 3;`.
5. **Sign out** clears the budget data on this device (it stays in your account) and, if anything has not synced yet, offers to download a backup first. Signing in again brings the data back.

### If something goes wrong

| What you see | What to check |
|---|---|
| Pressing Sign in shows *provider is not enabled* | Step 2: Google is switched on and the Client ID and secret are saved. |
| Google shows `Error 400: redirect_uri_mismatch` | The redirect URI in step 1e must be exactly `https://<project-ref>.supabase.co/auth/v1/callback`. No trailing slash, `https`, your real project ref. Wait a few minutes after changing it. |
| Google shows `Access blocked: bdgt has not completed the Google verification process` or `Error 403: access_denied` | The app is in *Testing* and your account is not a test user: publish it (step 1d) or add yourself as a test user. |
| You come back to the app but are not signed in, or land on the wrong page | Step 3: the address you started from is covered by a Redirect URL (`/bdgt/**` for the site, `http://localhost:5173/**` for local), and the Site URL is correct. |
| There is no Sync section | Step 5: both variables are set and you restarted `npm run dev` or re-ran the deploy workflow. |
| *Sync isn't enabled for this account* | The Google account's email, in lower case with no spaces, is on the invite list (part 1, step 3). It must be the email of the account you chose at Google. |
| *Database needs update* | A newer file in `supabase/migrations/` has not been applied yet (part 1, step 2). |
| *Sign in again* | The session ended. Press **Sign in with Google**. Nothing is lost: waiting changes are kept. |
| *N changes couldn't sync* | Press **Try again**, or **Stop trying** if the reason shown cannot be fixed. The changes stay on this device either way. |
| Anything else | Copy the exact message and tell me; do not retry repeatedly. |

### Privacy

Everything you sync is stored in the Supabase project, which you control and can read in the dashboard. The data of anyone you invite is equally readable by you. Browser-side encryption is not part of this release; the Sync section tells people this in one sentence.

## Looking at your data

The `analytics` views are for you, not the app. In the SQL editor:

```sql
select * from analytics.monthly_cashflow where user_id = (select user_id from analytics.users where email = 'you@gmail.com') order by month;
select * from analytics.monthly_bucket_spend order by month desc, spent_cents desc limit 20;
select * from analytics.transactions_enriched order by date desc limit 50;
```

They hide deleted rows and the sync bookkeeping columns, show amounts in currency units next to cents, and are readable only by the project owner. To copy them into BigQuery or another tool, connect it to the project's database with a read-only role and read the `analytics` schema.

## When the schema changes

Every change to the synced tables is a new numbered file in `supabase/migrations/` that you apply in the SQL editor, in order. The app checks the database's migration level (`select public.sync_schema_version()`) and pauses sync with a clear message if the database is behind, instead of failing row by row.
