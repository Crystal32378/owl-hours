---
status: done
---

# Owner app on the live API: requests, chats, jobs, quote

Objective: with the public API and Supabase variables set, Requests, Chats and Jobs read and write `/v1/owner` instead of the fakes; without them the demo keeps the fakes. The Requests and Chats tabs become real lists.
Branch: `feat/live-owner-core`, stacked on `feat/live-accept-creates-job` (PR #65). Delivery: one commit per unit; PR after the seam check.
Test runner: `node --test` via `npm run test:owner`; `npm run typecheck`.

## Specs

Request (L1, L2 in `live-accept-creates-job.md`): "receiving the request, accepting it, sending a quote" on the owner side, against the live backend ("Is it connected to the live backend yet?").

- S1 Shared live access: `apps/owner/shared/infra/ownerApi.ts` (`createOwnerApi`, `OwnerApiError`, `resolveOwnerApiConfig`) and `ownerApiRuntime.ts` (`getOwnerLiveApi()`, null = demo). Live = `EXPO_PUBLIC_API_URL` + `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY`, https or localhost. Every call sends `Authorization: Bearer <Supabase access token>` from the shared session runtime.
- S2 Requests live: a live `OffersClient` over `GET /offers?status=…`, `POST /offers/:id/accept`, `POST /offers/:id/decline {reason}`; the offer's `conversationId` opens the chat after accept; `409 offer_expired` shows the existing expired outcome. Mapping: media `image` → `photo`, `durationMs` → seconds, nullable `suggestedQuote`.
- S3 Requests tab: the list of `handoff-ui/owner-app/HANDOFF-RN-UI.md:300-312` and `design/html/OwRequests.dc.html` ("Waiting for you" offer card → "Review request", "Earlier tonight" with Accepted / Missed / Declined, footnote, both empty states), copy verbatim from the HTML into `copys/`. Demo shows the mock offer.
- S4 Chats live: a live `ConversationsClient` over `GET /conversations`, `GET /conversations/:id/messages`, `POST /conversations/:id/messages {text}`, `POST /conversations/:id/drafts`, `POST /drafts/:id/send`, `GET /me` (business name); the quote suggestion comes from the conversation's `job` and its offer's `suggestedQuote`.
- S5 Chats tab: the list of `HANDOFF-RN-UI.md:420-422` and `design/html/OwChats.dc.html`, copy verbatim.
- S6 Jobs live: a live `JobsClient` over `GET /jobs`, `GET /jobs/:id`, `POST /jobs/:id/quote {lines:[{label,min,max}], arrivalFrom, arrivalTo, technicianId?, note?}`, `POST /jobs/:id/transition {to, reason}`. API `proposed` is the app's `quoted`; arrival display times become ISO instants on the job's day.
- S7 Composition: each feature's hook root uses the live client when `getOwnerLiveApi()` is not null and the demo service otherwise. Existing tests keep passing unchanged; demo behavior is unchanged.
- S8 Handoff retirement (AGENTS.md): when a list screen ships, delete its `handoff-ui/owner-app/design/{screens/*.png,html/*.html}` pair in the same change.

## Tasks

- [x] T1 S1 — inline — commit 4183df3. RED: missing module; GREEN: 5/5 `ownerApi.test.ts`.
- [x] T2 S2, S3, S7, S8 — delegated (writer reason: parallel units with disjoint surfaces `features/requests/**`, `app/(tabs)/requests.tsx`, `app/request/**`, OwRequests pair) — commit 1c9e2ef. RED: missing modules, `listOffers is not a function`; GREEN 18/18.
- [x] T3 S4, S5, S7, S8 — delegated (parallel: `features/chats/**`, `app/(tabs)/chats.tsx`, `app/chat/[id].tsx`, OwChats pair) — commit 54d3d5f. RED: missing modules; GREEN 37 new tests.
- [x] T4 S6, S7 — delegated (parallel: `features/jobs/**`, `app/job/**`, `app/chat/[id]/quote.tsx`, `app/(tabs)/jobs.tsx`) — commit d644ce7. RED: missing modules; GREEN 291/291 jobs tests. Draft seeded from the job total (parent decision).
- [x] T5 seam check: full `npm test` + `npm run typecheck` (done: owner 932, api 269, typecheck 5/5) + the owner app against a running API (web on the local stack: sign-in, Requests list, accept → chat verified; quote and approve through the UI verified with Maestro: `scripts/e2e/run-live.sh` PASS, commit 0e92d78).
- [x] T6 fixes found by the seam check — inline: seeded owners could not get a code (9d550e6); request title lost after a list-picked category (23a5d36); offers had no suggested range, so the chat hid the quote path (6a4d256, D25); push setup crashed the web app (6448b1e); live times shown in UTC and empty location bubbles (0d63914).

## Log

- L1 (2026-10-31) Map: services consume `OffersClient` (find/save/findConversationId), `ConversationsClient` (find/suggestion/businessName/list/save/polish), `JobsClient` (findByConversation/find/list/save); fakes picked in `useRequestOffer.ts:90`, `demoConversationsService.ts:7`, `demoJobsService.ts:21`. API returns `{success,data}`; accept returns no conversation or job id (the offer row has `conversationId`; the job comes from `GET /conversations` `job.id`). Field gaps listed in S2/S4/S6.
- L2 (2026-10-31) User answers: "Tienes permiso de todo"; owner web via Vercel (Expo web); demo owner `mario@northside.example`.
- L3 (2026-10-31) User: "haz una local mientras" → local stack: `npx supabase start` (`supabase/config.toml`, `supabase/templates/owner-code.html` with `{{ .Token }}`), API run locally against it, owner web with `apps/owner/.env.local`, sign-in code read from Mailpit. Backend flow verified locally with signed webhooks: hi → category → description → safety → location → Northside → accept (job opened) → quote → "Approve visit" → job `customer_approved`.
- L4 (2026-10-31) Customer wa_id is 5219984201311 (Mexican mobile `1`); sends to 529984201311 are accepted by Meta but never delivered. Open follow-ups: urgent label missing on the Requests card ("· 1.2 km"); media messages render without media; "Taking requests" switch display-only; finish details beyond the reason text have no API field.
- L5 (2026-10-31) User (via fork): "dile al main que lo haga con maestro". Maestro flows in `apps/owner/.maestro/live/` + `scripts/e2e/run-live.sh` + `scripts/local/up.sh` (8075679, 0e92d78). Fixes from the run: unquoted jobs out of the Jobs list, no empty technician in the card subtitle, visible "Urgent" label (be74e0c).
- L6 (2026-10-31) Independent verifier: S1–S5, S7, S8 pass; 2 blockers (past-midnight quote window stored ~23 h in the past; request title rewritten on every later message). One correction batch 9a25733; recheck: both fixed. Checks: owner 937, api 270, typecheck 5/5, `npm run test:db` passed. Advisories: `GET /offers` caps 50 per status (suggestion lookup); remaining handoff pages link to the deleted list pages. Next: live-owner-content (objective 3), then live-environment (blocked on the live DB migration).
