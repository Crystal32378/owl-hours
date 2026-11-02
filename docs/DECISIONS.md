# Decisions

Append-only log of technical decisions for the owner app. One entry per
decision: date, choice, why, consequences. Never edit a past entry; supersede
it with a new one.

## D1 — Supersedes nothing (2026-10-28)

- **Decision:** `apps/owner` keeps Expo DOM components (Astryx inside
  `'use dom'`) as the handoff prescribes; native shell owns navigation,
  tab bar, push, haptics, safe areas.
- **Why:** `@astryxdesign/core` is a web library; the handoff verified the
  DOM path on Expo SDK 58 (startup ≈3.1 MB bundle + 194 KB Astryx CSS,
  measured in this repo).
- **Consequences:** DOM rules are law (serializable props, top-level async
  callbacks, no children); chat keyboard needs a physical-device check.

## D2 — Screaming features (2026-10-28)

- **Decision:** feature modules (`requests`, `chats`, `jobs`, `content`,
  `business`), each managed by `components/`, `copys/`, `services/`,
  `hooks/`, `lib/`. `app/` holds thin route adapters. No new `shared/` entry
  without two real callers.
- **Why:** the tree must name the business, not the framework; deep modules
  keep interfaces small (one screen entry per feature).
- **Consequences:** a feature never imports another feature; shared state
  crosses via route props (matches the DOM serializable-props rule).

## D3 — Services seam (2026-10-28)

- **Decision:** `services/` is the only API layer; hooks are the only
  consumers; services return domain types, never raw rows. Client singleton
  under `shared/infra/` (mock today, Supabase tomorrow).
- **Why:** two real adapters exist (mock + Supabase), so the seam earns its
  place; components stay presentational and testable.
- **Consequences:** switching adapters touches no component; every service
  gets a fake-adapter test before the hook that consumes it.

## D4 — Delegation, no Claude plan (2026-10-28)

- **Decision:** coders are this session's subagents by default (tests first:
  coder shows RED, operator locks the reviewed tests, coder implements to
  GREEN, operator reviews each iteration). The operator (this session) runs
  git; committers never touch reviewed tests to make them pass.
- **Why:** the user declared no Claude subscription plan, so hybrid routing
  by subscription does not apply.
- **Consequences:** edit surfaces are declared per task in
  `docs/HANDOFF-OWNER-APP.md`; the user reviews tests after each iteration.

## D5 — Coder roster (2026-10-28, supersedes D4's default)

- **Decision:** coders are, for now, the **Muse Spark 1.3 contributor** (behavior slices with tests, T3 onward) and **agy (Antigravity, Gemini 3.8 Flash)** (mechanical sweeps and audits, T2). This session orchestrates, reviews every iteration, and runs git.
- **Why:** user directive (2026-10-28); no Claude subscription plan applies (D4).
- **Consequences:** each harness works only inside its declared edit surface in `docs/HANDOFF-OWNER-APP.md`; the operator re-runs the gates before accepting a diff.

## D6 — Requests slice contracts (2026-10-28)

- **Decision:** `createOffersService(client)` returns async `{ getOffer, accept, decline }`
  over a small `OffersClient` (`findOffer`, `saveOffer`); `createFakeOffersClient()`
  seeds a `structuredClone` of `mock.ts` offers per instance. Only an `offered`
  offer can be answered; any other status or unknown id resolves to `null`.
  Copys are a flat `as const` object `requestsCopys` (`acceptWithin`,
  `countdownLabel`, `ignoredNotice`, `urgent`, `approximateDistance`, `decline`,
  `acceptAndChat`). `useRequestOffer(id, deps?)` takes `{ service, clock,
  acceptWindowMin }`; the default clock starts at `DEMO_NOW` and advances with
  real time since mount, ticking once per second.
- **Why:** the demo offer expires in 2026, so a real `Date.now()` would render
  0:00; the service holds no clock (the backend owns the final expiry rule);
  the hook disables Accept and Decline at 0:00.
- **Consequences:** swapping the fake for Supabase means a new `OffersClient`
  only; `acceptWindowMin` is injected too (urgent 300 s, other 1800 s), so
  `maxSeconds` is not hardcoded in the screen.

## D7 — Chats slice contracts (2026-10-29)

- **Decision:** `createConversationsService(client)` returns async
  `{ getConversation, getMessages, sendMessage, sendPolishChoice }`.
  `sendMessage(convId, text, {polish})` returns `{sent}` or a `PolishPreview`
  (HANDOFF-RN-UI §9) and `null` for an unknown conversation; a preview appends
  nothing. `sendPolishChoice(convId, preview, "mine" | "zukki")` sends option A
  (`as_written`) or option B (`polished`, `ownerDraft` = original). The label
  under an option B bubble is the §8 string "Written with Zukki, approved by
  Northside" (no invented copy). The `c_ana` thread seeds from `anaMessages`
  (m1, m2), so the owner types `OWNER_TEXT` live in the demo.
  `useConversation(id, deps?)` is the only service consumer and owns the polish
  switch (default off, not persisted) and `composing → polishing → comparing →
  sent`. Default message ids come from a counter (no `crypto` on Hermes).
- **Why:** user-approved answers to the T4 RED review (L12).
- **Consequences:** the Settings default for polish and the metadata time are
  not wired; "You accepted at" formats device-local time.

## D8 — Accept opens the chat by offerId (2026-10-29)

- **Decision:** `OffersService.findChat(offerId)` returns the conversation id
  of an accepted offer (`null` otherwise); `useRequestOffer().accept()` returns
  that id and the route navigates with it.
- **Why:** the route built `c_${offerId}` (`c_req_ana`), but the conversation is
  `c_ana`; ids are not derivable by naming (`c_grace` belongs to `req_grace2`).
  A real backend creates the chat on accept and returns it.
- **Consequences:** `OffersClient` gains `findConversationId(offerId)`.

## D9 — Chat session and accept destinations (2026-10-29, T4.1)

- **Decision:** the chat composer is a pure reducer (`features/chats/lib/composerMachine.ts`)
  driven by a framework-free session (`features/chats/hooks/conversationSession.ts`);
  `useConversation` is a thin `useSyncExternalStore` adapter returning
  `loading | not_found | failed (retry) | ready (view)`. Sends are guarded while
  one is in flight; a sent message is appended from the service result (no
  reload); a rejected send restores the draft and shows "Something went wrong.";
  a failed load renders `ChatLoadError` (owl `failed`, "Try again"). After Accept,
  `destinationAfterAccept` (`features/requests/lib/acceptOutcome.ts`) maps
  `not-offered → stay`, `accepted + chat → /chat/[id]`, `accepted + no chat → /chats`.
- **Why:** the six non-blocking findings of the T4 review (L14); the owner app has
  no React test setup, so the logic moved into units `node --test` can pin.
- **Consequences:** `not_found` still renders nothing (no handoff copy for it);
  the session is created inside the effect so React strict mode cannot leave a
  disposed session in use.

## D10 — Request evidence and possible faults (2026-10-29, T3.1)

- **Decision:** the request detail shows the customer's evidence. That is:
  - an Astryx `Thumbnail` banner of the first media item, which opens a
    `Lightbox`;
  - the customer's quote in italics;
  - Zukki's summary with the owl tag;
  - a structured "Possible faults" list. Each fault is
    `{ label, likelihood: "likely" | "possible" }`; `sortLikelyFirst` puts
    likely faults first, and each one shows as a `Badge`.

  Decline / Accept and chat are a sticky bottom bar. Media frames are
  data-URI modules (`assets/img/`), like the owl.
- **Why:** HANDOFF-RN-UI §8 planned the media, quote and summary, and T3
  never built them. The user added the faults list (L27). The handoff's
  "Screen frame" makes the footer the bottom action bar.
- **Consequences:**
  - `RequestOffer.possibleFaults` is optional, and Zukki's pipeline must
    fill it.
  - The `Thumbnail` banner is a CSS override of Astryx's 64px square
    (`requestScreen.css`).
  - The demo Lightbox shows the video frame, not a video.

## D11 — Quote modal, job detail and the chat suggestion (2026-10-29, T5)

- **Decision:** the jobs feature owns the quote and the job.
  - `chat/[id]/quote` is a modal route (`presentation: "modal"` in the root
    Stack). The DOM screen edits the lines locally and recalculates the
    total live; the hook builds the `Quote` and sends it once.
  - The total is the sum of the line minimums and maximums, the invariant
    of `packages/shared` `quoteSchema`, written as a pure
    `features/jobs/lib` function: `apps/owner` takes no new dependency.
  - `job/[id]` shows the address only from `customer_approved` on. The
    primary button follows the status: "Start trip" → "I'm here" →
    "Finish" (disabled until T5.1). The footer is hidden before approval.
    `en_route` appends "On the way" to the timeline.
  - The demo fake client approves a sent quote for the customer, since the
    WhatsApp approval does not exist yet. The real service contract stops
    at `quoted`.
  - The chat learns its job id and suggested quote from its own service,
    so no feature imports another. A failed lookup means no suggestion.
  - Clock time, first name and money range text moved to `shared/lib/`
    (two callers each); the owner `test` script runs `shared/**`.
  - `Job` gains optional `approvedAt` and `distanceKm`.
- **Why:** the demo path reaches the quote from the chat, and "View job and
  evidence" needed a target (HANDOFF-RN-UI §7, §8). The user chose the
  simulated approval (L35).
- **Consequences:**
  - The quote message in the chat thread and the Jobs "Waiting for … to
    approve" line need a store shared by chats and jobs (T5.1). Today each
    jobs hook mounts its own demo service.
  - The jobs demo clock starts at 12:07 AM (OwQuote's status bar), so the
    timeline stays in order; the requests hook keeps its own clock.

## D12 — Content slice: drafts, post review, linked accounts (2026-10-29, T6a)

- **Decision:** `features/content` owns `OwContent`, `OwPostReview` and
  `OwAccounts`.
  - One module-level fake posts client (`defaultFakePostsClient`) backs every
    content hook, so an approval in post review shows in Content.
  - Content reloads on focus (`useFocusEffect`).
  - Approving moves a draft to `scheduled` when it has a future
    `scheduledFor`, otherwise to `published`.
  - Scheduled posts show in the Published list with their time
    ("Today, 6:00 PM") as the meta line.
  - `Content` is now a nested Stack (`(tabs)/content/_layout.tsx`), so
    `accounts` keeps the tab bar; the tab route in `shared/shell/TabBar.tsx` is
    `content`, not `content/index`.
- **Why:** HANDOFF-RN-UI §7–8 and the operator's answers in
  `odd/tasks/owner-content.md` L2: copy from the design HTML, data verbatim
  from `mock.ts`, no `shared/data` edits while T5 edits `mock.ts`.
- **Consequences:**
  - Instagram shows the mock name "@northsideplumbing (professional)", not
    the design's "· professional account".
  - "Regenerate" returns the draft unchanged until Zukki's generator exists.
  - The Published list has no empty state yet: the design has no copy for it.
  - Coded by agy (Gemini 3.8 Flash High) test-first; the operator locked the
    tests and reviewed one cleaner round.

## D13 — Business slice: profile, prices, settings (2026-10-29, T6b)

- **Decision:** `features/business` owns `OwBusiness`, `OwPrices` and
  `OwSettings`.
  - One module-level `demoBusinessService` backs the three hooks, so saved
    prices and toggled settings survive navigation.
  - The Business tab reloads on focus (`useFocusEffect`).
  - `BusinessSettings` (taking requests, urgent requests, ring on silent at
    night, polish by default) is feature-local in
    `services/businessService.ts` until chats consumes "Polish with Zukki by
    default".
  - Row values come from `mock.ts` verbatim: "Mon–Sat, 8 AM–8 PM", the first
    three prices with full labels. `importedServices: 12` and
    `areaLabel: "Northside"` are demo values in the fake client.
- **Why:** HANDOFF-RN-UI §7–8 and the operator's answers in
  `odd/tasks/owner-business.md` L2: copy from the design HTML, data from
  `mock.ts`, no `shared/data` edits while T5 edits `mock.ts`.
- **Consequences:**
  - The logo and the map strip are data-URI modules built from
    `handoff-ui/owner-app/assets/` (`assets/img/logoNorthside.ts`,
    `assets/img/mapCity.ts`).
  - "Test Zukki", "Sign out" and the Profile, Hours, Service area and
    Website rows do nothing until their screens land.
  - The added price row's label "Name" has no handoff source (operator
    accepted).

## D14 — Onboarding slice and its routes (2026-10-29, T7)

- **Decision:** `features/onboarding` owns the first run, from intro to live.
  - The routes live in a real folder, `app/onboarding/`
    (`/onboarding/intro` … `/onboarding/live`, then `/requests`), not in an
    `(onboarding)` group.
  - One module-level `demoOnboardingService` backs every step, so data
    entered on one step reaches the next.
  - Routes navigate with `resolveNext(route, "next" | "facebook" | "has-account")`.
  - The demo code is `482910`. An email is valid when the trimmed value holds
    one "@" with a "." in the domain part; Supabase validates the rest.
- **Why:** an `(onboarding)` group does not change the URL, so
  `(onboarding)/business.tsx` would resolve to `/business`, the same URL as
  the Business tab. The operator's answers are in
  `odd/tasks/owner-onboarding.md` L2.
- **Consequences:**
  - "Allow notifications" is `requestNotificationPermissionStub` until
    `expo-notifications` is added, which is a dependency decision.
  - "Link accounts" opens `/content/accounts`, which lands with the content
    slice.
  - The auth gate and the entry redirect (`app/_layout.tsx`,
    `app/index.tsx`) are not wired yet.
  - `PricesScreen` triggers an Expo CLI 58.1.16 defect: `expo export` fails
    with `Asset not found: …/__common-<hash>.js` unless
    `EXPO_NO_BUNDLE_SPLITTING=1` is set. `exportDomComponents.js` renames the
    DOM chunks to md5 names without updating `metadata.requires`.
    `expo export:embed` (native release) is not affected. The `build`
    script sets `EXPO_NO_BUNDLE_SPLITTING=1` (user's decision, 2026-10-30),
    so each DOM component ships as one unsplit bundle. Drop the variable
    once an Expo CLI release fixes the rename.
  - Coded by muse (Spark 1.3, effort xhigh) test-first; the operator locked
    the tests and reviewed one cleaner round.

## D15 — Owner authentication infrastructure (2026-10-30)

- Extract app-wide owner authentication into a separate PR. Keep the singleton,
  session contract, and encrypted persistence in `shared/infra`, consumed by the
  root provider and live feature services. Auth never imports Story Pack.
- The owner signs in by emailed 6-digit code through the handoff `OwSignUp` →
  `OwVerify` screens (user decision "mejor hazlo por email, no tenemos proveedor
  de sms", 2026-10-30), not an email magic link:
  `signInWithOtp({ email, options: { shouldCreateUser: true } })` on sign-up,
  then `verifyOtp({ email, token, type: 'email' })`. The `/auth` routes, the old
  email screen and the PKCE callback code are removed. Live mode needs the
  Supabase Email provider with the Magic Link and Confirm sign up templates carrying `{{ .Token }}`
  (`docs/OWNER-AUTH.md`).
- The sign-up/verify copy deviates from the handoff because there is no SMS
  provider: `emailLabel` "Email", `emailHelp` "We'll email you a code to confirm
  it." and `changeEmail` "Change email" replace the phone wording; every other
  handoff string stays byte-identical.
- The root provider owns the session controller and foreground refresh, and
  injects the emailed-code send/verify into onboarding; demo mode (no Supabase variables)
  keeps the `DEMO_CODE` fake with the onboarding demo-seed email. In live mode
  a signed-out owner outside `/onboarding/*` is redirected to `/onboarding/sign-up`.
- Store oversized native sessions as bounded encrypted SecureStore chunks with
  a write-last manifest. Surface persistence/cleanup failures and remove the
  manifest before sign-out cleanup to prevent resurrection of old credentials.
- Configure the API's external origin explicitly for TLS termination; do not
  infer trusted browser origins from client-controlled forwarded headers.
- Hosted Email provider settings and real Android sign-in acceptance remain
  separate from synthetic tests and bundle compilation; see `docs/OWNER-AUTH.md`.

## D16 — Story Pack data and review contract (2026-10-30)

- Keep Story photo purpose in `media.story_role`; preserve original evidence roles and first job assignment audit. Use shared SQL job/consent and original-photo predicates.
- SQL produces the single media revision; UUID snapshots use consistent C collation and API comparisons match fields by ID.
- Atomic approval owns eligibility. Review receipts do not promise fresh export availability; refresh and handoff recalculate it. Retain post-sign checks only across actual Storage I/O.
- Use `PT409` for stale displayed copy or photo conflicts. `40001` is reserved for actual serialization failures because PostgREST may retry it.
- Consolidate never-deployed Story migrations into a preceding enum addition and one data migration; preserve main migrations and T6 permissions.
- See `docs/STORY-PACK-DATA.md` for the contract and local verification boundary.

## D17 — Story Pack review and export boundary (2026-10-29; revised 2026-10-30)

- **Decision:** Story Pack organizes a completed job with current customer photo consent and owner-confirmed before/after images into three editable slides, owner approval and manual image/copy export. It is an opt-in workspace separate from T6's Content publishing flow (D19).
- **Why:** the day workflow can reuse completed night jobs without implying that a customer agreed to marketing, or that an approved/exported file was published.
- **Consequences:** the real adapter persists three slides and selected media under the owner's RLS session. Demo mode must be explicitly enabled and stays fictional/in-memory. Source reads, approval and delivery check consent and exact photo eligibility. Signed links expire after ten minutes; issued links and downloaded files cannot be recalled. No Meta account connection, scheduling or publishing call is added by Story Pack. Existing T6 scheduling rights remain intact.

## D18 — Reuse the supplied Zukki pack in Content (2026-10-29)

- **Decision:** use the existing shared `Owl` component and the canonical
  nine-action pack: `review` at the drafts headers, `idle` in empty states,
  and `failed` beside errors. Preserve uniform cell scaling and the static
  fallback for reduced motion.
- **Why:** the supplied `golden-owl-nine-actions.zip` already matches the repo's
  nine WebP animations and static frame byte for byte. Reusing these modules
  gives the day and night workflows the same mascot without duplicating assets
  or showing unrelated animations in Content.
- **Consequences:** only three animation states enter the Content screen's
  bundle. Generic reference leak photos are not added: this demo does not need
  them, and they do not establish a matched customer before/after story. The
  existing fictional job visuals and consent labels remain explicit.

## D19 — Preserve T6 and isolate Story Pack (2026-10-30)

- **Decision:** restore `features/content`, the Content tab route, and the four `OwContent`/`OwPostReview` handoff files byte for byte from `main`. Story Pack lives in `features/story-pack` at `/story-pack`, with no tab replacement. Its API source type is `story_pack`; the existing non-Story-Pack review/scheduling behavior is preserved.
- **Why:** maintainer review identified overlap with T6's in-progress publish/schedule flow. A manual export workspace is not its replacement and does not satisfy the handoff retirement rule.
- **Consequences:** the feature remains opt-in and the PR remains a draft. The team can review it without inheriting an unsolicited product switch. No claim is made that the native device flow or a platform publishing integration is accepted.

## D20 — Persisted review contract and portable export (2026-10-30)

- **Decision:** share the client/API schema; persist exactly three slides and selected media. Bind approval to the displayed `updatedAt` and each selected photo's ID, role and immutable-path revision. Use one SQL eligibility helper and target-job lookups instead of relying on the source-picker's 100-row window.
- **Why:** a replacement after-photo must not keep a stale draft eligible, and another tab must not change copy or swap photo roles after the owner reviewed it.
- **Consequences:** export authorizes twice, renders three 1080×1920 PNGs in the DOM, then packages them with `caption.txt` and `manifest.json`. Web downloads the ZIP; native receives bounded base64 through an async callback, saves a temporary file, awaits the share sheet and removes it. A share-sheet result does not prove recipient delivery. Text fitting preserves the full allowed copy. The separate local `deliveryReceipt` records opening the delivery UI; it is not part of `StoryPackStatus`. SQL remains `approved`.
- **Session boundary:** hooks accept injected dependencies. Live mode requires explicit API/Supabase settings and a persisted owner session; the existing-owner magic-link flow does not create accounts. Missing configuration never silently falls back to demo. Browser CORS is allowlisted only on owner routes. Native magic-link callback/device acceptance remains to be verified.
- **Migration boundary:** Supabase CLI 2.122.0 reproduced PostgreSQL `55P04` when the new enum value was used in the same migration transaction. Its addition is now a preceding migration; the local DB harness wraps each migration in a transaction so this regression is visible.

## D21 — Owner push, decline reason and Test Zukki sources (2026-10-30)

- Push scope is full remote push (user decision "Full remote push", confirmed
  "Sí, push remoto completo"). The app registers its Expo push token with
  `POST /v1/owner/push-tokens` (`{ expoToken, platform }`, upserted into
  `push_tokens` per user) after "Allow notifications" on onboarding `live`, and
  re-sends it on later launches with a session. Demo mode asks for permission
  and registers nothing. Remote push needs a development build, not Expo Go.
- `connectBusiness` sends the push after the offer stands, through `fetch` to
  the Expo Push Service (no SDK dependency). A push failure is logged and never
  blocks or rolls back the offer; tokens Expo reports as `DeviceNotRegistered`
  are deleted. Only owners of the offered business (`tenant_users`) receive it,
  and it carries the approximate distance, never the address.
- The Android channel id is `urgent-requests` (display name "Urgent requests");
  the push's `channelId` must be the id, because Android routes by id. The app
  registers the `request` category with the Open and Decline actions; Decline
  opens `request/[id]?decline=1`.
- Declining takes a reason (`busy`, `too_far`, `not_offered`, `other`) from the
  decline sheet; `offersService.decline(id, reason?)` stays compatible with the
  old single-argument call.
- `POST /v1/owner/test-zukki` keeps `businessId` and `reply` and adds
  `sources`: the price-rule items the price tool returned while answering,
  deduplicated in first-returned order (user decision "API returns sources").
  An empty `sources` renders "Not in your services".
- Amendment (2026-10-31, verifier blockers): one device belongs to one owner.
  Registering a token deletes the same `expo_token` for every other user
  (service-role client, scoped to that exact token); `DELETE
  /v1/owner/push-tokens` removes the caller's row; sign-out deletes this
  device's token before the session ends, best-effort (a failure never blocks
  sign-out). The Expo push `fetch` aborts after `EXPO_PUSH_TIMEOUT_MS` (5 s,
  `AbortSignal.timeout`); a timeout counts as a failure. `connectBusiness`
  logs a warning with the offer id and the `sent`/`failed`/`removed` counts
  when `failed > 0`. Clarified: `sources` records the items the price tool
  returned to the model, so a filtered call contributes only matching rules.

## D22 — Jobs list, finish and the shared jobs store (2026-10-30, T5.1)

- **Decision:** the jobs feature owns the list and the finish.
  - One module-level demo service (`hooks/demoJobsService.ts`) is shared by
    `useJobs`, `useJob`, the finish hook and `useQuoteDraft`, so a status
    change on one screen shows on the others. Hooks still accept an injected
    service; `createDemoJobsService()` keeps returning independent services.
  - `listJobs()` on the service (and a required `listJobs` on `JobsClient`)
    returns the seeded jobs in the store's order, as copies.
    `finishJob(id, { amounts, reason?, asksToSharePhotos })` from `on_site`
    marks `done` with `finalTotal` and `shareConsent` ("asked" when the
    switch is on, else "not_asked"), appends "Done" to the timeline, and
    stores a trimmed `finalPriceReason` only when the total falls outside
    the estimate. `updateJobStatus` keeps refusing `done`.
  - `Job` gains optional `scheduledFor` and `finalPriceReason`; `JobView`
    gains `canFinish` (true only on site); the overtime statuses read
    "On the way" (`en_route`, success), "On site" (`on_site`, success) and
    "Done · $145" (`done`, success, from `finalTotal`); a done card's
    subtitle reads its final total. A range line starts the finish form at
    its midpoint, rounded down.
  - `job/[id]/finish` is a plain stack push (no modal); "Mark as done"
    returns to the Jobs tab with `router.dismissTo`, where the job now sits
    under Done.
  - The Jobs tab and the job detail reload when they regain focus: each
    hook exposes `reload()`, and the thin routes wire it with
    `useFocusEffect`. Hooks stay free of expo-router.
- **Why:** the demo path ends the job from the list, and the "Upcoming · 3"
  design count cannot hold with two Tomorrow jobs in the seed: the counts
  are derived from the jobs ("Upcoming · 2" today), which the operator
  approved as a divergence from the design.
- **Consequences:**
  - The quote message in the chat thread moves to T5.2; the chats feature
    is untouched.
  - `demoClock` no longer writes fractional seconds, so `sharedDemoNow`
    matches the seed's shape (`2026-10-28T00:07:00-05:00`).
  - A rejected `getJob`/`listJobs` still leaves a blank screen (the L37
    gap): the new routes render null while loading and have no error state
    yet.

## D23 — The sent quote as a chat message and the shared thread store (2026-10-30, T5.2)

- **Decision:** a sent quote shows in the chat as an outgoing owner bubble that mirrors the WhatsApp
  message the customer receives (`handoff-ui/whatsapp/payloads/13-quote.json`); no design HTML draws it.
  - `shared/data/threadStore.ts` holds the conversations' messages: `createThreadStore()` (independent,
    seeded with Ana's thread), `sharedThreadStore()` and `resetSharedThreadStore()` (clears in place).
    The demo jobs client writes the quote message into it on `quoted`, as the backend will post it to the
    thread; the demo chats client reads and writes it. `sharedDemoJobsService()` and the new
    `sharedDemoConversationsService()` use the shared store; `createDemoJobsService()` and
    `createFakeConversationsClient()` stay independent. Neither feature imports the other.
  - `Message` gains an optional `quote?: Quote`; `text` holds the body as plain lines, so a chat list
    preview has something to read. The quote message carries no `delivery`.
  - `shared/lib/quoteMessage.ts` builds the body (`quoteMessageBody`, `quoteMessageText`) and owns the
    wording; the chats copys reference those constants. `arrivalWindowText` moved to `shared/lib/`.
  - Chats: `buildQuoteCard(quote, businessName)` is the serializable shape the bubble draws; the service
    gains `getBusinessName()`, and a failed lookup shows the quote as plain text. The bubble draws the
    total bold (no asterisks) and the two reply buttons as non-interactive labels (`data-testid`
    `quote-reply-label`, no role, no tab stop). Once the thread holds a quote message the SuggestionRow
    hides; the job link stays.
  - The chat reloads when it regains focus: the session gains `reload()`, `useConversation` returns
    `{ conversation, reload }`, and `app/chat/[id].tsx` wires `useFocusEffect` (the D22 pattern). A failed
    reload keeps the thread on screen.
- **Why:** the demo path returns from "Send quote" to the chat, and the owner needs to see what the
  customer received (HANDOFF-RN-UI §7). Two features needed the same messages, so the store sits in
  `shared/` (two real callers).
- **Consequences:**
  - The chat's default service is now module-level, so messages sent in one chat visit show in the next
    one within a session; the e2e suite is order-dependent (flow 11 stops Expo Go to start from the seed).
  - `13-quote.json` stays: it retires only when `packages/whatsapp` sends the message.
  - Out of T5.2: the real WhatsApp send, the customer pressing a button, the chat list preview line, an
    error state for a rejected load (L37 gap).

## D24 — Accepting an offer opens the job (2026-10-31)

- **Decision:** `private.accept_handoff` (migration `20261031120000_accept_opens_job.sql`) calls the new
  `private.open_job(handoff)` after an in-time accept. It inserts one job for the handoff's business and
  conversation in state `proposed`, titled from the conversation (fallback "Service request"), with the
  offer's suggested range, and logs a `job_events` row (`null → proposed`, actor `owner`). An expired
  accept and a decline open no job. The public `accept_handoff` wrapper and the API are unchanged.
- **Why:** no function created jobs, so `send_quote`, which needs a `proposed` or `owner_confirmed` job,
  only worked on the seeded one; a live request could be accepted but never quoted.
- **Consequences:** `proposed` matches the seeded demo job, so the quote and approve-visit paths run
  unchanged. Jobs keep the table's default currency (businesses have no currency column).
  Tests: `supabase/tests/accept_creates_job.test.sql`.

## D25 — Zukki suggests the quote range on the offer (2026-10-31)

- **Decision:** "Connect me" now creates the offer with a suggested range from the business's own price
  rules (`apps/api/src/services/suggested-quote.ts`): the `callout` visit, plus the cheapest
  `repair_range`, plus the `night_fee` when the business's local hour falls inside its window
  ("10 PM-7 AM"; an unreadable window never applies). The seeded Northside offer ($45 + $25 + $60–90 =
  $130–160) already followed this formula.
- **Why:** live offers had no `suggestedQuote`, so the owner chat hid "Zukki suggests sending the quote"
  and the quote had no starting range.
- **Consequences:** the accepted job inherits the range (D24), so the quote draft opens with it.

## D26 — Story Pack source-job deletion (2026-10-31)

- Following Crystal's explicit retention choice, a new forward migration deletes
  only linked Story Pack rows when the source job is deleted, including approved
  packs. Preserve the existing legacy FK semantics and historical tombstone guards.
- No deletion UI/API is added. A future surface or maintenance operation must
  show affected counts and obtain confirmation. Original photo records and Storage
  objects are retained by job deletion; broader conversation purges, Storage GC,
  backup erasure and recall of downloaded exports are outside this change.
- See `docs/STORY-PACK-DATA.md` for preflight and exact preservation boundaries.

## D27 — Story Pack write version and deletion notice (2026-10-31)

- Keep the current server pack separate from the version on which dirty edits
  began. Atomically reject stale saves, and preserve local text on conflict.
- Do not export dirty copy after remote approval; offer explicit discard to
  restore the authoritative saved pack. Detect a changed selected version during
  pending writes without rejecting the ordinary save-then-approve success path.
- Keep the team's existing component split and source-photo fetch dependency.
  Enforce exactly two selected photos at the frontend boundary as well.
- Record the user's Story-only draft deletion choice, but do not invent an owner
  delete feature. The existing workspace shows a scope notice; any actual future
  UI or maintenance deletion still needs explicit confirmation. Original photo
  files and unverified backup retention are separate concerns. See
  `docs/STORY-PACK-FOLLOWUP.md` for the data-follow-up dependency and scope.

## D28 — One job per accepted offer (2026-11-01)

- **Decision:** `private.resolve_handoff` opens the job on accept (hosted migration `20261029101127`, ported from `fix/issue-14`). `private.open_job` (D24) returns the job the handoff already has and only inserts when there is none (`20261101100000_accept_opens_one_job.sql`).
- **Why:** the hosted Supabase project already ran `20261029101127`; applying main's `20261031120000_accept_opens_job` on top would insert two jobs per accept, since `jobs.handoff_id` is not unique. Keeping the hosted versions byte-identical keeps the repo and hosted `schema_migrations` in step.
- **Consequences:** the accepted job carries the business currency and the request ticket. `accept_handoff` locks the handoff row, so concurrent accepts cannot both open a job. `supabase/tests/accept_creates_job.test.sql` pins one job per accept.

## D29 — Live Content shows the API's truth (2026-11-01)

- **Approve:** `PostsClient.savePost` returns the post as the store holds it, and `postsService.approve` answers that. In live mode the status is the API's (`approved` after `review_content_draft`), mapped one to one; the app no longer maps `approved` to `scheduled`, so an approved post never lands in the "Published" card. Only an API `published` shows as published. Nothing posts to Facebook or Instagram: there is no Meta publishing integration. The demo keeps its local scheduled/published approval.
- **Regenerate:** `apps/api` has no generator of post copy (the only LLM rewrite, `polish.ts`, rewrites owner chat messages). Live mode sets `canRegenerate: false` and the review screen hides the button instead of cloning the draft locally; the demo keeps it.
- **Linked accounts:** `GET /v1/owner/linked-accounts` reads `id, platform, display_name, mode` through the owner's client (RLS and column grants, pinned by `supabase/tests/rls.test.sql`). Live `useLinkedAccounts` and the Content "Connected" line use it; each returned row shows as connected.

## D30 — The live chat shows the sent quote, quotes without a suggestion, and the accept time (2026-11-01)

- **Decision:** `private.send_quote` (migration `20261101200000_quote_message_and_accepted_at.sql`) also
  writes an owner `messages` row linked by the new `messages.quote_id`. The row is stored as `sent`, so
  `claim_outbox` never picks it up: the customer still receives the quote as Zukki's notice 13.
  `owner_conversation_messages` returns the row's `quote` (`lines, total, arrivalFrom, arrivalTo, note,
  technician`, `delivery` null) and leaves out Zukki's notice for a quote the thread already shows.
  `owner_conversations` returns `acceptedAt` (the handoff's `resolved_at`).
  - The live chats client maps `quote` to `Message.quote` (arrival as device clock times), so the D23
    bubble draws it; `Conversation` gains optional `jobId` and `acceptedAt`.
  - The chat offers "Send a quote" (the quote modal's title) whenever its job has no sent quote and
    Zukki suggests nothing; the SuggestionRow still wins when there is a suggestion.
  - The chat's "You accepted at" reads `acceptedAt`; the demo, which has none, keeps its first message.
- **Why:** live quotes only showed in Jobs, a request without a suggested range could not be quoted
  from the chat, and the accept time was the oldest loaded message
  (`odd/tasks/owner-chat-live-fixes.md`, S1-S3).
- **Consequences:** quotes sent before this migration have no owner quote message; their Zukki notice
  still shows as a Zukki message. `supabase/tests/owner_chat_quote.test.sql` pins the outbox exclusion.

## D31 — Onboarding creates the business and saves through the owner API (2026-11-01)

- **Decision:** `POST /v1/owner/business` runs `public.owner_create_business` (`20261101240000_owner_create_business.sql`): a security-invoker entry point over a private definer that creates the tenant and the caller's owner membership in one transaction, or updates the business the caller already owns. The live onboarding client saves the profile there and the later steps through `PUT /business/prices` and `PUT /business/area` and `PATCH /business` (night jobs); fees and the hours summary read `GET /business`.
- **Why:** no migration created a business, so a newly signed-up owner had no tenant and every owner business route answered `404`. Owners have no insert grant or policy on `tenants`/`tenant_users`, so the insert needs definer rights; keeping it in `private` behind an invoker wrapper keeps `rls.test.sql`'s "no public definer" rule. An advisory lock per user makes two simultaneous first calls create one business; staff and anonymous callers are refused.
- **Derived columns:** `slug` is the name in slug form plus a 6-character random suffix; `short_name` is the first word of the name (the rule `20261028113954` used); `timezone` stays `UTC`; the membership `display_name` is the sign-up name, or the short name when the app no longer has it.
- **Location:** onboarding never asks for one, so a new business stores the placeholder point (0, 0) and starts with no service area. The area step saves the radius around the business's stored area centre, or (0, 0) when it has none; matching (`find_businesses`) needs the customer within reach of both `tenants.location` and the area, so such a business is matched with no real customer until a location step sets a real point (open follow-up). It also starts not taking requests.
- **Website import:** `apps/api` has no importer, so live mode imports nothing (`{ services: 0, prices: [] }`) and the prices step starts from the business's own prices; the demo keeps its imported prices.

## D32 — Onboarding takes the business location from the device (2026-11-01)

- **Decision:** `public.owner_save_area` (`20261102100000_owner_business_location.sql`) also sets `tenants.location` to the area centre, and `public.owner_business` (so `GET /v1/owner/business`) adds `hasLocation`, false while the business is still at the (0, 0) placeholder. In live mode the onboarding area step offers "Use my current location": the native route asks for foreground permission and reads one position with `expo-location` (`requestForegroundPermissionsAsync`, `getCurrentPositionAsync`, https://docs.expo.dev/versions/latest/sdk/location/), then saves the area at that point with the chosen radius (`PUT /business/area`). Finish stays disabled while `hasLocation` is false; a denied permission or an unreadable position shows a short message and keeps the step.
- **Why:** matching (`search_directory`/`find_businesses`) needs the customer within reach of both `tenants.location` and a service-area circle, so a business created at (0, 0) (D31) was never found. The owner chose the device location over a typed address, which needs no geocoding service.
- **Kept:** a business with a real location keeps it unless the owner uses the action again; a radius change saves around the stored area centre. The demo business has its location preset, so demo mode shows no action and finishes as before. The DOM screen gets only the derived props (whether to offer the action, the message, whether Finish is disabled) and an async callback; the permission and save outcomes are mapped in `features/onboarding/lib/areaLocation.ts`.
- **Delivery:** `expo-location` is a native module with a config plugin (`locationWhenInUsePermission` in `apps/owner/app.json`), so it ships in a new build; an EAS Update alone cannot add it.

## D33 — The area step draws a MapLibre map on OpenFreeMap tiles; dark mode keeps the blue readable (2026-11-01)

- **Decision:** the onboarding area step replaces the static map picture with a MapLibre GL JS map (`maplibre-gl` 5.x, https://maplibre.org/maplibre-gl-js/docs/) rendered inside the `'use dom'` screen (https://docs.expo.dev/guides/dom-components/). It loads the OpenFreeMap vector styles (https://openfreemap.org/quick_start/, no API key): `https://tiles.openfreemap.org/styles/liberty` in light mode and `https://tiles.openfreemap.org/styles/dark` in dark mode, picked from `prefers-color-scheme` (the same preference the Astryx `Theme` follows in system mode). It centres on the business's area centre (new `getCenter` on the onboarding service, read from `GET /business`), draws the radius as a 64-sided GeoJSON circle that follows the slider, keeps pan/zoom on, and shows the source attribution expanded ("OpenFreeMap © OpenMapTiles Data from OpenStreetMap"). The pin is draggable; the drop is saved as the business location through `PUT /business/area` with the current radius, exactly like "Use my current location". A missing location, or the (0, 0) placeholder (D31), shows a world overview with no pin and no circle.
- **Why 5.x, not 6.x:** maplibre-gl 6 ships ES modules only and loads its web worker from a separate `maplibre-gl-worker.mjs` found through `import.meta.url`. Metro's export does not emit that file, and on Android the DOM bundle is served from `file://`, where v6's worker auto-detection returns nothing. 5.x bundles the worker inline (blob URL), so it runs in Metro and in the DOM webview with no bundler change. `maplibre-gl.css` is a plain local stylesheet (no `@import`), so the export lists no `.css-external` asset (checked with `npx expo export --platform android --clear`).
- **Logic:** the circle, its bounds, the overview/centre choice, the dragged-point wrap and the style URL are pure functions in `features/onboarding/lib/areaMap.ts`; `AreaMap.tsx` only draws them.
- **Dark mode:** Astryx Neutral sets `--color-on-accent` to `#111` in dark mode because its dark accent is near-white; Zukki's accent is a fixed blue, so `zukki-theme.css` sets `--color-on-accent: var(--color-on-dark)` (white in both modes), the token Astryx's `Button` primary variant uses for its label. `.zukki-root` no longer forces `color-scheme: light`, so native controls follow the theme too. The prices step's owl says the prices came from the website only when there are prices; with none (live mode imports nothing, D31) it asks the owner to add them.
- **Not changed:** Business > service area keeps its static map strip: the business screen gets no area centre from its hook and route yet (follow-up).
- **Consequences:** the map needs network access to `tiles.openfreemap.org` (CORS `*`); offline it shows an empty map while the radius slider, location action and Finish keep working.

## D34 — Owners add, edit and remove extra fees (2026-11-02)

- **Decision:** `public.owner_save_fees(jsonb)` (`20261102110000_owner_save_fees.sql`, behind `PUT /v1/owner/business/fees`) replaces the caller's fee list the way `owner_save_prices` replaces the prices: security invoker, scoped by `private.caller_owned_business_id()`, a listed id of the caller's fees is updated, anything else is added, an unlisted fee is removed. `atNight` stores kind `night_fee`, otherwise `extra_fee`. `owner_business` lists each fee with `atNight`. The onboarding prices step and Business > Prices edit fees in `FeeEditor` (name, amount, "At night" switch, edit and remove, "Add a fee", and an empty state when there are none).
- **Why:** owners could see fees but not add any, and a business without fees showed an empty card with nothing telling the owner what fees are for (`odd/tasks/owner-area-map-fees-dark.md`, S2).
- **Night window:** the suggested quote adds a night fee only inside its window (`conditions`), so a night fee keeps its window, and a new or switched night fee gets `10 PM-7 AM`, the window the seed uses. A fee switched off night drops it. The owner cannot edit the window yet.
- **Kept apart:** fee saves never touch prices or the visit (callout); price saves never touch fees. "At cost" fees are not in the editable list: the save leaves them, and the screens show them read-only. Nothing creates them in live mode today.
- **Demo:** the shared demo seed (`shared/data/mock.ts`) has no `atNight`, so `ExtraFee.atNight` is optional and a fee with a window reads as a night fee; the demo clients store saved fees through `withSavedFees` (`features/business/lib/feeDraft.ts`), mirroring what the database answers.

## D35 — The Business tab draws the service area on the same MapLibre map, read-only (2026-11-01)

- **Decision:** the area step's map moves to `apps/owner/shared/map/` (`ServiceAreaMap.tsx`, geometry and styles in `areaMap.ts`), and the Business tab's Service area row draws it in place of the static city picture. It uses the same OpenFreeMap styles as D33 (light/dark from `prefers-color-scheme`) and keeps the attribution expanded. Without an `onMove` callback the map is read-only: MapLibre's `interactive: false` (https://maplibre.org/maplibre-gl-js/docs/API/type-aliases/MapOptions/) and a pin that is not draggable, so the row never catches the screen's scroll. The onboarding step passes `onMove` and keeps pan/zoom and the draggable pin.
- **Location:** the row centres on `area.center` from `GET /v1/owner/business` only when its `hasLocation` is true; while the business sits at the (0, 0) placeholder (D31) it shows the world overview, like the area step. The live client carries `hasLocation` in the row extras (`BusinessRowExtras`), since the shared `Business` type and its demo seed have no such field. The demo business sits at (0, 0), so demo mode shows the overview.

## D36 — Owners link Facebook and Instagram and "Approve and post" publishes (2026-11-02)

- **Decision:** owners link their Facebook Page, and the Instagram professional account connected to it, through the Facebook Login manual flow (https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow). `GET /v1/owner/meta/connect-url` signs a ten-minute `state` (HMAC-SHA256, key derived from `ZUKKI_SERVER_KEY`) that carries the caller's own business and user id; the public `GET /v1/meta/callback` validates it, exchanges the code, gets a long-lived user token (https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived) and the Page tokens, and stores each in Supabase Vault (https://supabase.com/docs/guides/database/vault) through `private.save_linked_account` (security definer, service_role only, owner checked from the state's user id). Graph API v26.0 by default (https://developers.facebook.com/docs/graph-api/changelog); every token call carries `appsecret_proof` (https://developers.facebook.com/docs/graph-api/securing-requests).
- **Publishing is its own route, not part of review:** `POST /v1/owner/content/drafts/:id/publish` runs after `review` approves. Review stays one locked database transition; posting is network work that can fail half way, so it must be retryable without a second review. Each platform's post id goes to `content_publications` (one row per draft and platform) and `record_content_publication` marks the draft `published` with the last one, so a failure leaves it `approved` and a retry posts only the platforms still missing, never twice. The Story Pack manual-delivery trigger now allows `published` only when every targeted platform has a post.
- **Posting:** Page: each photo uploaded with `published=false`, then one `/{page-id}/feed` post with `attached_media` (https://developers.facebook.com/docs/graph-api/reference/page/photos/). Instagram: a carousel container of the two photos, its `status_code`, then `media_publish` (https://developers.facebook.com/docs/instagram-platform/content-publishing), with the Page token. One account per platform: the earliest linked.
- **Permissions:** `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `instagram_basic`, `instagram_content_publish` (https://developers.facebook.com/docs/permissions), or a Facebook Login for Business `config_id` when `META_LOGIN_CONFIG_ID` is set (Meta recommends a configuration over `scope`: https://developers.facebook.com/docs/facebook-login/facebook-login-for-business).
- **Owner app:** the web app leaves for Facebook in the same tab and the callback returns it to `OWNER_WEB_URL/content/accounts?meta=...`. Native (user decision, 2026-11-02: login inside the app) asks for `GET /meta/connect-url?return=app` and opens the URL with `expo-web-browser` `openAuthSessionAsync(url, Linking.createURL('content/accounts'))` (https://docs.expo.dev/versions/latest/sdk/webbrowser/, https://docs.expo.dev/versions/latest/sdk/linking/); the signed state carries the return target, so the callback redirects to `zukki-owner://content/accounts?meta=...` and the session resolves with that URL. Only those two destinations exist; the client never sends a URL. `expo-web-browser` is a native module, so this ships in a new build, not an EAS Update. Each linked account has an Unlink action (`DELETE /linked-accounts/:id`; owner CORS allows `DELETE`).
- **Kept:** tokens never reach the owner: RLS and column grants on `linked_accounts` are unchanged, Vault is unreachable for `authenticated`, and the token functions are service_role only. The demo has no Connect action and posts nothing.
- **One link per state, one post per platform:** the callback consumes the state's nonce in `private.meta_oauth_nonces` (insert on conflict; purged an hour after expiry), so a replayed state with another code links nothing. Before posting, `/publish` claims every target platform in `private.content_publication_claims` (all or nothing; the draft row lock serializes claims with `record_content_publication`), so a second simultaneous request answers `409 publish_in_progress` without posting. A Graph error releases the platform for the retry; any other failure (timeout, lost connection, failed recording) keeps the claim, because Meta may have posted, until it expires after 15 minutes. `content_publications.external_id` accepts the same id shape as the Graph client, so a post Meta made is never refused on record.
- **Limits:** development mode only until App Review (a user step). Instagram takes JPEG only; photos are not converted. If a post succeeds on Meta but recording its id fails, the platform stays claimed for 15 minutes, then a retry can post it again.

## D37 — Spark reads the whole photo or video, then SAM marks the valve it names (2026-11-02)

- **Decision:** when the need may be a leak, `triageMedia` sends the customer's whole photo or video to Muse Spark over the Responses API with a JSON schema (https://dev.meta.ai/docs/video-understanding, https://dev.meta.ai/docs/structured-output). It answers the problem, its severity, whether closing the water helps, the valve's object name and the best second. SAM 3.1 runs on that frame with that name; SAM's docs say it locates what it is told and does not reason about a scene (https://dev.meta.ai/docs/sam/segmenting).
- **Why:** on the Drive test set SAM marked 0 of 12, including a photo of a valve, because "shut-off valve" and "water valve" return nothing while "valve" returns a box. Only one frame at 1 s reached the models, and Zukki told customers to close a valve for a roof leak.
- **Three answers, not two:** `wont_help` drops the valve advice for one plain message; `unclear` keeps the general advice, so doubt never silences it. A failed reading falls back to the earlier path.
- **`store: false`:** a customer's media stays out of stored responses, which also refuse requests of about 29 MB with a 413.
- **Limits:** Spark did not see the small drip in two faucet videos, at any `fps`. A reading adds about 10-20 s to the reply. SAM accepts MP4 and MOV, not WebM; WhatsApp sends MP4 or 3GPP, and a 3GPP clip falls back. Only "may be a leak" media is read, so other categories still send one frame.

## D38 — The customer always gets the reading, and valves are found by Spark's points (2026-11-02)

- **Decision:** after a photo or video that may be a leak, Zukki sends a quick notice, then Spark's `customerMessage` (what it sees and what to do now, in the customer's language), then the marked valve when one was found. Spark locates each valve on the chosen frame; SAM cuts each one out with a point prompt (https://dev.meta.ai/docs/sam/segmenting) and every valve is circled. Words are the fallback.
- **Why:** a real video of a leaking sink drain got only a location request: the need read as not urgent, so the safety step was skipped and the reading was thrown away. On that frame SAM found no valve for "valve", "handle" or "knob", but a box for each valve when pointed at it. Spark's points were accurate from the frame and far off from the whole video, so locating is a second call.
- **Marked valves are always shown:** when closing the valve would not stop the leak, the card says "If it gets worse", instead of "Let's stop the water first". Nothing is marked when nothing is wrong.
- **Limits:** a reading took 14-56 s in tests. Fixed copy stays in English; only Spark's message follows the customer's language.

