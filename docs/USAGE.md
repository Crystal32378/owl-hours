# Owl Hours (Zukki) — Running and Demo Tutorial

A task-oriented guide for developers and hackathon judges to run, test, and demo Owl Hours end to end.

---

## 1. What It Is

Owl Hours (Zukki) is an AI assistant for local service businesses that captures urgent customer requests on WhatsApp, provides emergency guidance to mitigate damage, and coordinates instant dispatch and quoting. Every job requires human approval before booking.

Two applications make up the system:
- **Customer Side (WhatsApp / Zukki Agent)**: Direct customer messaging interface on WhatsApp powered by the Cloud API and backend AI worker.
- **Owner App (`apps/owner`)**: Native mobile and web shell built with Expo and Astryx design system where business owners review inbound requests, chat, dispatch quotes, track jobs, and approve social proof content.

---

## 2. Prerequisites

Ensure your environment satisfies the following requirements before starting:
- **Node.js**: `v24` (or `v22+` as specified in `railpack.json`)
- **pnpm**: `v10+` (package manager for workspaces)
- **Docker**: Running Docker daemon (required for local Supabase and PostGIS database tests)
- **Supabase CLI**: Accessible via `npx supabase` (bundled in repo scripts)
- **Expo CLI**: Bundled via local npm scripts (`apps/owner/package.json`)

---

## 3. Run It With No Accounts (Judges Start Here)

One command runs everything on your machine: local Supabase with seed data, the API, a stand-in for WhatsApp, the owner app on the web, and one customer walked through the demo. No account, no key, and nothing reaches a real phone.

You need Docker running, Node 24, pnpm and ffmpeg. The ports 3000, 4010, 4011, 8081 and Supabase's 54321-54324 must be free.

```sh
pnpm install
bash scripts/local/judge.sh
```

When it finishes it prints where to look:

- **Customer's messages**: `http://127.0.0.1:4010` shows what Zukki sent, including the photo with the shut-off valve marked.
- **Owner app**: `http://localhost:8081`. Sign in with `mario@northside.example`; the code arrives in Mailpit at `http://127.0.0.1:54324`.

**Models: recorded or live.** Without a key, the models are answers recorded from real runs of `muse-spark-1.3` and `sam-3.1` (`scripts/local/recordings/demo.json`), and the API log says `not calling Meta`. They cover only the sample video and the demo script: any other request gets an error, never an invented answer. To call the real models, run it with your own key:

```sh
META_MODEL_API_KEY=your-key bash scripts/local/judge.sh
```

The sample video is made from a generated picture (`muse-image-1.0`), not a real home.

To check the replies come from the models, with a key: `node scripts/e2e/media-flow.mjs` needs `META_APP_SECRET`, `WHATSAPP_PHONE_NUMBER_ID` and the stand-ins running, sends two different media, and fails if they get the same reading.

---

## 4. Run Locally With Your Own WhatsApp and Meta Keys

The repository provides an automated script to bring up the entire local backing stack and configure local environment files.

### Step 1: Prepare the API secrets file
The local boot script expects base secrets (WhatsApp and Meta keys) in `apps/api/.env`. Create this file if not already present:
```sh
cp apps/api/.env.example apps/api/.env
```
*(Without valid WhatsApp values the webhook answers 503 and nothing is sent. For a run with no keys, use section 3.)*

### Step 2: Start the local stack
Run the local stack boot script:
```sh
bash scripts/local/up.sh
```
This script performs the following automatically:
- Executes `npx supabase start` to launch local Postgres, Supabase Auth, Storage, and Mailpit containers.
- Applies all migrations and executes `supabase/seed.sql`.
- Generates `apps/api/.env.local` pointing to the local Supabase container and port 3000.
- Generates `apps/owner/.env.local` configuring `EXPO_PUBLIC_API_URL=http://localhost:3000`, local Supabase credentials, and `EXPO_PUBLIC_STORY_PACK_MODE=live`.

### Step 3: Start the API server
In a separate terminal, start the Hono API server against the local stack:
```sh
npm run dev:api:local
```
The server listens on `http://localhost:3000`.

### Step 4: Start the Owner App
In another terminal, start the Expo web development server for the owner application:
```sh
npm run dev:owner
```
Open `http://localhost:8081` in your browser.

---

## 5. Sign In as the Demo Owner

The owner application supports both live authentication against Supabase Auth and an offline demo fallback mode.

### Live Mode (Local Stack)
When configured with `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` (set automatically by `scripts/local/up.sh`):
1. Navigate to `http://localhost:8081`. You will see the **Create your account** screen.
2. Enter the seeded demo owner information:
   - **Name**: `Mario`
   - **Email**: `mario@northside.example`
3. Accept terms and click **Send code**.
4. Open the local email viewer (Mailpit) in your browser:
   - URL: `http://127.0.0.1:54324`
5. Locate the verification email and copy the 6-digit one-time passcode.
6. Enter the 6-digit code on the owner verification screen to sign in.

### Demo Mode (Offline Fallback)
If running without `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`, the application operates in in-memory demo mode:
- Onboarding fields are prefilled for the demo owner (`mario@northside.example`).
- Enter the fixed demo verification code: **`482910`**.

---

## 6. Walk the Demo Flow

Walk through the full end-to-end lifecycle from customer WhatsApp conversation to completed job and content review:

### Step 1: Customer messages Zukki on WhatsApp
Simulate inbound customer WhatsApp interactions using the test runner script:
```sh
node scripts/e2e/wa-customer.mjs http://localhost:3000 text "hi"
```
Or execute turns with the helper script that waits for Zukki's database response:
```sh
scripts/e2e/step.sh http://localhost:3000 text "hi"
```

### Step 2: Emergency guidance, category, and evidence
The customer provides problem details and emergency location:
1. Select plumbing category:
   ```sh
   scripts/e2e/step.sh http://localhost:3000 list cat_plumbing Plumbing
   ```
2. Describe the emergency:
   ```sh
   scripts/e2e/step.sh http://localhost:3000 text "My kitchen sink is leaking under the cabinet, water is on the floor. Can someone come today?"
   ```
3. Confirm safety check:
   ```sh
   scripts/e2e/step.sh http://localhost:3000 button safety_done "Done, no cables"
   ```
4. Share location:
   ```sh
   scripts/e2e/step.sh http://localhost:3000 location 21.1619 -86.8515 "Av. Tulum, Cancún"
   ```
5. Connect with Mario's business (*Northside Emergency Plumbing*, ID `10000000-0000-4000-8000-000000000001`):
   ```sh
   scripts/e2e/step.sh http://localhost:3000 button "connect:10000000-0000-4000-8000-000000000001" "Connect me"
   ```

### Step 3: Owner reviews and accepts in Requests tab
1. In the Owner App, click on the **Requests** tab.
2. Under **Waiting for you**, tap **Review request** on the new request.
3. Tap **Accept and chat**. This accepts the offer, opens a proposed job and opens the chat with the customer.

### Step 4: Chat and send quote
1. Inside the conversation thread, notice Zukki's pricing suggestion row: *"Zukki suggests sending the quote"*.
2. Tap **Review** to open the quote composer seeded with suggested pricing ranges.
3. Tap **Send quote**. The quote card is delivered to the customer on WhatsApp.

### Step 5: Customer approves visit
Simulate customer approval from WhatsApp for the quote:
```sh
# The helper run-live.sh script reads the active quote id and triggers approval:
scripts/e2e/step.sh http://localhost:3000 button "quote_approve:<quote_id>" "Approve visit"
```
The job transitions to `customer_approved`.

### Step 6: Track in Jobs tab and finish work
1. Navigate to the **Jobs** tab in the Owner App.
2. The approved job appears in the active jobs list.
3. Open the job to advance the operational lifecycle: start the trip, arrive on site, and complete the job via **Finish job**.

### Step 7: Content tab draft review
The local seed has no finished job with photos yet. Run `scripts/local/seed-content-demo.sh` once on the running stack: it uploads a before/after photo pair and adds one finished Northside job and one Story Pack draft to review (safe to run twice).

1. Switch to the **Content** tab.
2. Zukki automatically drafts social marketing posts from finished, consented jobs and pricing rules.
3. Review the drafted before-and-after story/post, inspect generated copy, and approve or schedule publication.
4. To post for real, open **Content → Linked accounts → Connect Facebook and Instagram** and finish Facebook Login with a Page you manage (and the Instagram professional account connected to it). **Approve and post** then publishes to those accounts and shows **Published** only after the API confirms; a failure shows the API's message and the post stays approved, so tapping again retries.

### Facebook and Instagram setup (Meta app, development mode)
1. In Meta for Developers, add **Facebook Login for Business** to the app and add `<API_PUBLIC_URL>/v1/meta/callback` to **Valid OAuth Redirect URIs**.
2. Give every owner who will link a Page a role on the app (admin, developer or tester); in development mode only they can log in. App Review for `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `instagram_basic` and `instagram_content_publish` opens it to everyone else.
3. On the API host (Railway), set `META_APP_ID`, `META_APP_SECRET`, `API_PUBLIC_URL`, `OWNER_WEB_URL`, and optionally `META_GRAPH_VERSION` and `META_LOGIN_CONFIG_ID` (see [API configuration](API.md#configuration)).

---

## 7. Automated Live Flow and Verification Checks

### Automated End-to-End Live Runner
Run the automated end-to-end suite combining signed webhook execution and Maestro UI flows against the local stack:
```sh
bash scripts/e2e/run-live.sh
```
*Note: Requires openjdk@17 / Maestro installed for native UI validation.*

### Owner Screens Read the API
Check that the Business tab, Prices and Content show what the database holds, and that the Requests "Taking requests" switch writes it. Each check writes a unique value to the local database, waits for the screen to show it, and restores the value at exit:
```sh
bash scripts/e2e/run-live-owner.sh
```
*Note: Needs Expo Go signed in as the demo owner. From a worktree without `apps/api/.env.local`, pass the main checkout's env script: `E2E_ENV=<main checkout>/scripts/e2e/env.sh`.*

`apps/owner/shared/infra/liveClientsReadTheApi.test.ts` runs with the owner tests and fails if a live client's runtime imports reach `shared/data/mock.ts`.

### Suite Checks
Run the project's standard verification checks:
- **Unit and integration test suite**:
  ```sh
  npm test
  ```
- **TypeScript strict compilation**:
  ```sh
  npm run typecheck
  ```
- **Database migrations and RLS verification**:
  ```sh
  npm run test:db
  ```
  *(Requires Docker to spin up a clean PostGIS instance and execute all migration scripts and `.test.sql` assertions).*

---

## 8. Known Limits

Current architectural and deployment limits to keep in mind:
- **Hosted Deployment**: Full production cloud hosting is not pre-configured; local execution relies on the containerized Supabase stack.
- **Hosted Supabase Email Auth**: When deploying to a hosted Supabase project, you must enable the **Email** provider in *Authentication → Providers → Email* with "Confirm email" toggled on. Crucially, the **Magic Link** and **Confirm sign up** email templates must both include `{{ .Token }}` so Supabase emits the 6-digit numerical code rather than only an HTTP magic link.
- **Facebook and Instagram**: posting works for the Meta app's admins, developers and testers until App Review. Instagram takes JPEG photos only, so a PNG or WebP photo fails there with Meta's message. On native, Facebook Login opens in the system browser and returns to the owner web app; reopen the app's Linked accounts to see the new accounts.
- **Push Notifications on Real Devices**: Remote push notification registration in `apps/owner` requires adding `extra.eas.projectId` into `apps/owner/app.json` and generating a custom Expo development build (`eas build`). In standard Expo Go or Expo web without an EAS project ID, push tokens are omitted.

---

## 9. Run the Owner App on a Phone (Android APK, iOS)

App identifiers: `com.owlhours.zukki.owner` on both platforms (`apps/owner/app.json`). Build profiles live in `apps/owner/eas.json`.

A phone cannot reach `localhost`. Before any of the options below, point the app at an API and Supabase the phone can reach: either your laptop's LAN IP on the same Wi-Fi (edit `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_SUPABASE_URL` in `apps/owner/.env.local`, replacing `localhost`/`127.0.0.1`), or a deployed API and hosted Supabase.

### Option A: Expo Go (fastest, no build)
1. Install Expo Go on the phone ([docs](https://docs.expo.dev/get-started/expo-go/)).
2. From `apps/owner`, run `npx expo start` and scan the QR code.
Limit: remote push notifications do not work in Expo Go on Android.

### Option B: Android APK with EAS Build (cloud)
1. `npm install -g eas-cli`, then `eas login` with the team's Expo account.
2. From `apps/owner`, run `eas init` once. It writes `extra.eas.projectId` into `app.json`, which push notifications also need.
3. `eas build -p android --profile preview` builds an installable `.apk` (profile `preview` sets `"buildType": "apk"`) and prints a download link and QR code.
   The APK reads its `EXPO_PUBLIC_*` values from the EAS `preview` environment, not from `.env.local` (`eas env:list preview`); they point at the Railway API and the hosted Supabase project.
   Docs: [EAS environment variables](https://docs.expo.dev/eas/environment-variables/).
4. Later JavaScript changes reach installed preview APKs as EAS Updates (channel `preview`) without reinstalling; native changes (plugins, permissions, native dependencies) need a new build.

### Automatic deploys (EAS Workflows)
`apps/owner/.eas/workflows/deploy.yml` runs on every push to `main` that touches `apps/owner`, `packages` or the lockfile: it publishes the web app to https://zukki-owner.expo.app with the EAS `production` environment and sends an EAS Update to the Android preview builds. It needs the GitHub repository linked to the Expo project (expo.dev → project → GitHub, base directory `apps/owner`). Docs: [EAS Workflows](https://docs.expo.dev/eas/workflows/get-started/), [EAS Hosting](https://docs.expo.dev/eas/hosting/workflows/). The API redeploys on Railway from `main` on its own.
Docs: [Build APKs](https://docs.expo.dev/build-reference/apk/), [eas.json](https://docs.expo.dev/build/eas-json/).

### Option C: iOS
- Simulator, no Apple account: from `apps/owner`, `npx expo run:ios` (needs Xcode).
- Your own iPhone, free signing: `npx expo run:ios --device` with the iPhone connected; the install expires after 7 days.
- Other people's iPhones or TestFlight: needs the Apple Developer Program. Then `eas build -p ios --profile preview` (internal distribution, registered devices) or `--profile production` plus `eas submit -p ios`.
Docs: [Local app development](https://docs.expo.dev/guides/local-app-development/), [Internal distribution](https://docs.expo.dev/build/internal-distribution/).

### Development builds
The `development` profile builds a dev client with push support. It requires the `expo-dev-client` package (`npx expo install expo-dev-client` from `apps/owner`), which is not installed yet.
