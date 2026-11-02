# Zukki API (v1)

Two audiences, two prefixes:

| Prefix | Caller | Auth |
|---|---|---|
| `/v1/owner` | Zukki for Business (owner app) | `Authorization: Bearer <Supabase access token>` from the owner's login. Every query runs as that user, so row-level security keeps each business to its own data. |
| `/v1/internal` | WhatsApp integration (server to server) | `x-zukki-key: <ZUKKI_SERVER_KEY>`. Never put this key in an app. |

The WhatsApp code can also skip HTTP and call the same functions in-process from `apps/api` (`src/services/whatsapp-service.ts`, `src/worker/process-message.ts`).

## Conventions

- JSON in and out, camelCase. Ids are uuids; times are ISO 8601 with an offset; money is whole currency units.
- Success: `{ "success": true, "data": ... }`. Failure: `{ "success": false, "error": { "code", "message" } }`.
- Bodies over 64 KB are rejected. Unknown fields are rejected.
- Rate limits per minute: 600 per IP, 120 per owner. Over the limit: `429` with `Retry-After`.

| Status | `error.code` | When |
|---|---|---|
| 400 | `invalid_body`, `invalid_query`, `invalid_id` | Input failed validation (message says which field) |
| 401 | `unauthorized` | Missing or wrong token or server key |
| 404 | `not_found` | Not found, or not yours |
| 409 | `conflict`, `changed_since_read`, `offer_expired` | Duplicate, changed by someone else, or accepted too late |
| 422 | `invalid_state`, `chat_closed`, `rule_violation` | The current state does not allow it |
| 429 | `rate_limited` | Too many requests |
| 503 | `model_unavailable`, `not_configured` | Model credits or server settings missing |

## Owner app (`/v1/owner`)

| Method and path | Body / query | Returns |
|---|---|---|
| `GET /me` | | `{ userId, businesses: [{ id, name, shortName, category, takingRequests, role, displayName }] }` |
| `GET /business` | | The caller's business (the first one `GET /me` lists): `id, name, shortName, category, logoUrl, website, rating {value, count}, technicians, prices [{id, label, amount, from}], fees [{id, label, amount (number\|"at_cost"), window?, atNight}], hours [{weekday (0 = Sunday), opens, closes}], nightJobs, area {lat, lng, radiusKm} (null without one), hasLocation (false while the business is still at the placeholder point (0, 0) a new business starts at), takingRequests, acceptWindowMin {urgent, other}, linkedAccounts [{kind, name}]`. `404 not_found` without a business. |
| `POST /business` | `{ name, category, website? ("" clears it), ownerName? }` | Onboarding's business step. Creates the caller's business (with the caller as its owner) when the account has none; otherwise updates the name, category and website of the business it already has, so a repeat never makes a second one. `category` is stored in key form (`"Water Heaters"` → `water_heaters`, 2-32 letters). The new business starts with no prices, hours or area and is not taking requests. Returns the business, as `GET /business`; `403 forbidden` for staff. |
| `PATCH /business` | `{ name?, shortName?, website? ("" clears it), takingRequests?, nightJobs? }` (at least one) | The business, as `GET /business`. Only an owner writes (`403 forbidden` for staff); the business always comes from the session, never from the body. |
| `PUT /business/prices` | `{ prices: [{ id?, label, amount }] }` (whole positive amounts) | Replaces the price list: a listed id is updated (a "from" range keeps its width), anything else is added as a fixed price, an unlisted price is removed. Extra fees stay. Returns the business. |
| `PUT /business/fees` | `{ fees: [{ id?, label (1-80), amount, atNight }] }` (whole positive amounts up to 1,000,000; at most 20) | Replaces the extra fees: `atNight` makes a night fee, otherwise an extra fee; a listed id is updated, anything else is added, an unlisted fee is removed. A night fee keeps its window, or gets `10 PM-7 AM`, the window the suggested quote reads; "at cost" fees, prices and the visit stay. Returns the business. |
| `PUT /business/hours` | `{ hours: [{ weekday: 0-6, opens: "HH:MM", closes: "HH:MM" }] }` | Replaces the opening hours (`closes` before `opens` runs past midnight). Returns the business. |
| `PUT /business/area` | `{ lat, lng, radiusKm (≤ 200) }` | Replaces the service area with one circle and moves the business location to its centre, where customers are matched from. Returns the business. |
| `GET /offers` | `?status=offered\|accepted\|declined\|expired\|closed&limit=` | Requests: `id, conversationId, status, urgent, title, customerName, approxLocation, distanceKm, zukkiSummary, customerQuote, suggestedQuote {min,max}, media [{kind, url, thumbUrl, durationMs}], offeredAt, expiresAt`. Media links expire after 10 minutes. |
| `POST /offers/:id/accept` | | `{ id, status, expiresAt }`. `409 offer_expired` if the window closed. |
| `POST /offers/:id/decline` | `{ reason: busy\|too_far\|not_offered\|other, note? }` | `{ id, status, declineReason }` |
| `GET /conversations` | `?limit=` | Chats: `id, offerId, title, customerName, chatOpen, acceptedAt, job {id, state, arrivalWindow}, lastMessage {from, text, sentAt}, unread`. `acceptedAt` is when the business accepted the offer. |
| `GET /conversations/:id/messages` | `?before=<sentAt>&limit=` | One page, oldest first: `id, from (customer\|zukki\|owner), kind, text, payload, sentAt, status, delivery (as_written\|polished), media, quote` |
| `POST /conversations/:id/messages` | `{ text }` | Option A, sent as written. `201 { id, sentAt, status: "queued" }`. `422 chat_closed` if not accepted. |
| `POST /conversations/:id/read` | | Clears the unread count |
| `POST /conversations/:id/drafts` | `{ text }` | Option B. `201 { draftId, original, polished, language }`. `polished` is null when the model is unavailable or changed a number. |
| `POST /drafts/:id/send` | `{ usePolished }` | Sends the owner's pick |
| `GET /jobs` | `?limit=` | Jobs: `id, title, state, customerName, technician, arrivalWindow, total, quote {id, status, lines, total, arrivalFrom, arrivalTo}, location (only after the customer approves), shareConsent, timeline` |
| `GET /jobs/:id` | | One job |
| `POST /jobs/:id/quote` | `{ lines: [{label, min, max}], arrivalFrom, arrivalTo, technicianId?, note? }` | `201 { id, total, arrivalFrom, arrivalTo }`. Totals are the sum of the lines; a new quote replaces the open one. The quote also lands in the chat as an owner message whose `quote` is `{id, lines, total, arrivalFrom, arrivalTo, note, technician}` and `delivery` is null; the customer receives it as Zukki's payload 13, whose copy the owner's thread leaves out. |
| `POST /jobs/:id/transition` | `{ to: en_route\|on_site\|done\|declined\|cancelled\|owner_confirmed, reason }` | `{ id, state }` |
| `GET /content/sources` | | Completed jobs for this owner's businesses with latest photo consent and before/after images linked to that exact job. Signed media links expire after 10 minutes; customer identity and raw storage paths are omitted. |
| `GET /content/drafts` | | Drafts and owner review state. Filters out logically deleted drafts (`deleted_at is null`). `canHandoff` is true only for an approved draft whose consent, job completion, and source photos remain eligible. |
| `POST /content/drafts` | `{ sourceJobId, sourceMediaIds: [beforeId, afterId], title, caption, slides: [{title, body}] (exactly 3), platforms: [facebook_page\|instagram] }` | `201` saved draft. Requires exactly two distinct photos (one before, one after). Tenant scope comes from the selected job and the owner's session, never from the request body. Enforces text limits (slideTitle 60, slideBody 280, title 80, caption 2200). |
| `PATCH /content/drafts/:id` | `{ title?, caption?, slides?, platforms? }` | Updates a draft only; scheduling fields are not writable from this API. Returns `404 not_found` if the draft is logically deleted. |
| `POST /content/drafts/:id/review` | `{ approve, expectedUpdatedAt?, expectedMedia?: [{id, role, revision}] }` | Approval requires the displayed draft version and selected photo snapshot with exactly two photos (one before, one after). SQL checks them atomically; rejection needs no snapshot. Returns `404 not_found` if the draft is logically deleted. The review receipt returns `canHandoff: false`; refresh drafts or request handoff for current export eligibility. |
| `POST /content/drafts/:id/handoff` | `{}` | `{ draft, source }` with fresh signed URLs for the approved selection only. Returns `404 not_found` if the draft is logically deleted. Rechecks current consent, exact job, photo roles and stable path revisions. Does not publish. |
| `GET /content/photo-jobs` | | Completed jobs with current consent state and candidate images. Missing consent or an ambiguous multi-business conversation returns no images. |
| `POST /content/photo-jobs/:id/assign` | `{ beforeMediaId, afterMediaId }` | Sets independent `media.story_role` values. Original `media.role`, job association and first assignment audit survive replacement, so customer evidence stays visible in requests. Never grants customer consent. |
| `POST /content/drafts/:id/publish` | | Posts an approved Story Pack (caption and its two selected photos) to each platform it targets, with the Page token stored at link time: unpublished Page photos then one `/{page-id}/feed` post with `attached_media`, and an Instagram carousel container then `media_publish`. Each post id is recorded in `content_publications`; the answer is the draft with `status: published` only when every platform posted. Before posting, each platform is claimed in the database, so two simultaneous requests never post it twice. Errors: `404 not_found`, `409 already_published`, `409 publish_in_progress` (another request is posting this draft; nothing is posted), `422 not_approved`, `422 account_not_linked` (a target has no linked account; nothing is posted), `502 publish_failed` (names each platform's result; the draft stays approved, the failed platforms are released and a retry posts only the platforms still missing), `503 not_configured` (META_* settings missing). Instagram accepts JPEG photos only. |
| `GET /linked-accounts` | | The owner's linked Facebook Pages and Instagram accounts: `[{ id, platform: facebook_page\|instagram, displayName, mode: live\|test }]`. Read as the owner, so RLS limits it to their own businesses; the vault `token_secret_id`, external id and tenant id are never returned. A row means the account is linked; there is no separate connected flag. |
| `DELETE /linked-accounts/:id` | | Unlinks one account as the owner (RLS: owners only, their business only); the Vault secret is deleted with the row. `{ id }`, or `404 not_found`. |
| `GET /meta/connect-url` | | `{ url }`: the Facebook Login dialog (`https://www.facebook.com/<META_GRAPH_VERSION>/dialog/oauth`) for the caller's own business, with `response_type=code`, the callback as `redirect_uri`, a signed ten-minute `state` (business and user, HMAC keyed from `ZUKKI_SERVER_KEY`) and `scope=pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish`, or `config_id` when `META_LOGIN_CONFIG_ID` is set. `403 forbidden` for staff, `503 not_configured` without the META_* settings. |
| `POST /test-zukki` | `{ question, history?, businessId? }` | `{ businessId, reply }`. Answers only from that business's profile and prices; sends nothing to customers. |

Story Pack supports an opt-in workspace separate from T6's Content publishing and scheduling screens. The persisted API status remains `approved`; a client may track a local delivery receipt separately, never as a server status or proof of publication. The shared schema in `packages/shared/src/story-pack.ts` defines the three slides, caption, exactly two selected photos (`sourceMediaIds` / `expectedMedia`: one before, one after) and platform representation. Text limits are defined by `STORY_PACK_LIMITS` (slideTitle 60, slideBody 280, title 80, caption 2200). Empty platform selection is allowed in an unfinished draft; approval requires at least one format. Legacy drafts without slides stay incomplete.

Deleting a source job removes its linked Story Pack rows from the active database, including approved packs, while preserving original photo records and Storage objects. Legacy job-derived draft retention is unchanged and may block deletion. There is no owner deletion API/UI; explicit preflight and confirmation are required for any future deletion surface or maintenance operation. Historical tombstones remain hidden from Story APIs. Backup retention is unverified and exported copies are not recalled. See [deletion scope and confirmation](STORY-PACK-DATA.md#source-job-deletion-active-database-photos-and-backups).

Eligibility uses the selected job and every selected photo, independent of the newest-100 source-picker limit. Approval binds the visible draft version and photo roles/revisions. Export authorizes before reading images and again after rendering, immediately before delivery. URLs last 10 minutes and already issued URLs/downloaded files cannot be recalled. Revisions hash immutable storage paths; current writers use UUID paths and `upsert: false`. Overwriting an object in place outside those writers is not supported by this revision model.

Owners explicitly classify already-ingested images in Story Pack. The existing inbound and marked-frame writers do not infer before/after roles or customer permission. Consent must already exist through the customer consent flow; this owner UI cannot create it. The original non-Story-Pack scheduling permissions remain available to T6.

Web builds need `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL`, and the public `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Set `OWNER_APP_ORIGINS` on the API to exact comma-separated owner-app origins and `OWNER_PUBLIC_ORIGIN` for its external HTTPS origin behind a proxy. Only owner routes accept browser CORS. Native uses `zukki-owner://auth/callback`; web uses `/auth/callback`. See [owner authentication](OWNER-AUTH.md) and [Story Pack data contract](STORY-PACK-DATA.md). No server key belongs in an app build.

PostgreSQL `42501` now maps to the generic permission message across API endpoints, not a content-specific message. This is an intentional shared error-contract change.

## Facebook Login callback (`GET /v1/meta/callback`)

Public (no owner token): Meta redirects the browser here after the login dialog. It checks the signed `state` and consumes its nonce through the service-role `consume_meta_oauth_nonce`, so a state links once (a replay answers `reason=invalid_state`), exchanges the `code` for a user token, swaps it for a long-lived one, lists the shared Pages with `instagram_business_account{id,username}` (every token call carries `appsecret_proof`), and stores each Page token in Supabase Vault through the service-role `save_linked_account` (a `facebook_page` row per Page and an `instagram` row per connected Instagram professional account, which posts with the same Page token). It always answers `302` to `<OWNER_WEB_URL>/content/accounts?meta=linked`, or `?meta=error&reason=invalid_state|denied|invalid_request|meta_error|no_pages|forbidden|failed`. Tokens are never returned or logged.

## WhatsApp webhook (`/webhooks/whatsapp`)

Set the Meta app's WhatsApp webhook to `https://<api host>/webhooks/whatsapp`, with the same verify token as `WHATSAPP_VERIFY_TOKEN`, and subscribe to the `messages` field.

| Method | What it does |
|---|---|
| `GET` | Meta's verification: returns `hub.challenge` when `hub.mode=subscribe` and `hub.verify_token` matches, else `403`. |
| `POST` | Checks `X-Hub-Signature-256` (HMAC-SHA256 of the raw body with `META_APP_SECRET`; `401` if wrong), then stores every event and answers `200 { received }`. If storing fails it answers `500` and Meta retries; every write is idempotent on WhatsApp's message id. |

What it stores:

- Text, button replies and list replies: `record_inbound_message` (same as `POST /v1/internal/inbound`). A tap on `quote_approve:<id>` also approves that quote.
- Location: `save_customer_location`.
- Image, video, voice note: a `media` row and the message first, then (after answering Meta) the file is downloaded from the Cloud API into the `media` bucket at `conversations/<conversationId>/<uuid>.<ext>`. Types the bucket does not accept (for example `audio/amr`, documents) are logged and skipped.
- Delivery receipts: `delivered`, `read`, `failed` update the outbound message.
- Anything else (stickers, reactions) is logged and skipped.

### Zukki's answer

After answering Meta, the server hands each new customer message to Zukki (`src/orchestrator/`), one message at a time per conversation, in arrival order. Zukki queues its replies in the outbox (`messages` rows with `sender = 'zukki'`, `delivery = 'queued'`), so the owner app sees them too.

The steps are fixed code; Muse Spark only reads what the customer needs (category, urgency, a title and summary for the request card) and answers free questions:

| Customer does | Zukki sends |
|---|---|
| First message of a conversation | 01 disclosure, then the step below |
| Unclear message ("hi") | 02 category list |
| Off-topic question | 14 |
| Urgent leak (text, photo or video) | 03 typing, then 04: the valve frame marked by SAM with Done, no cables / I can't find it (general advice and no picture when SAM is unsure). The marked frame is saved as a `marked_frame` media row linked to the video, so the owner's request card shows it next to the video; a voice note's transcript is the card's `customerQuote`. |
| Urgent electrical problem | safety advice, then 05 |
| Done, no cables / I can't find it | 05 location request (simpler steps first for I can't find it) |
| Picks a category | home categories: "what's going on?"; others: 05 |
| Shares the location | 06, then 07 for the best match |
| Show another option | 07 for the next match |
| Connect me | 08 (the offer is created) |
| Any other question | Spark's answer, with the directory and price tools |
| Types "Zukki" in a business chat | 15; everything else in a business chat goes to the owner only |

What changes on the owner's side is polled every 5 seconds: an accepted offer sends 10, an expired or declined one sends 09 then 07 for the next business, and a sent quote sends 13 (Approve visit / Ask a question). Each notice is sent once.

Voice notes are transcribed (saved in `media.transcript`); video frames need ffmpeg on the server (`railpack.json` installs it).

### Sending

The server sends queued owner and Zukki messages every `OUTBOX_POLL_MS` (default 2000, `0` turns it off, and also turns off Zukki's notices), in the formats of `handoff-ui/whatsapp/payloads`: owner text as payload 11 (`*Business · First name*` line), polished replies as payload 12 (footer and Sounds good / Ask a question buttons), and Zukki's text, list (02), button cards (04, 07, 13) and location request (05). Each message is recorded as `sent` with WhatsApp's id or as `failed`.

## WhatsApp integration (`/v1/internal`)

| Method and path | Body / query | Returns |
|---|---|---|
| `POST /inbound` | `{ waId, waMessageId, kind: text\|media\|button_reply\|list_reply, text?, payload?, mediaId?, profileName?, receivedAt? }` | `{ conversationId, messageId, duplicate, isNewConversation, businessChatOpen, businessId }`. If `duplicate`, Meta retried: do not reply again. Button and list replies need `payload.id`. |
| `POST /conversations/resolve` | `{ waId, profileName?, receivedAt? }` | The conversation id, for uploading media before `/inbound` |
| `POST /conversations/:id/location` | `{ waMessageId, latitude, longitude, address?, receivedAt? }` | `{ messageId, customerLocationId, duplicate }` |
| `GET /conversations/:id/matches` | `?category=plumbing&exclude=<id,id>` | Payload 07 cards: `businessId, name, shortName, rating, reviews, distanceKm, etaMinutes, openNow, takesNightJobs, visit, nightFee {amount, window}, repairFrom, repairLabel, currency`. Skips businesses already offered or shown in this chat. |
| `POST /conversations/:id/connect` | `{ businessId, suggestedMin?, suggestedMax? }` | `201 { offerId, attempt, expiresAt, distanceKm }` ("Connect me") |
| `POST /conversations/:id/assist` | `{ type: text\|audio\|image\|video, text?, caption?, mediaId?, firstInConversation? }` | One model pass without sending anything: `{ disclosure, reply, transcript, valve, markedFrameUrl }`. `mediaId` is the `media` row id; the file is read from the bucket. With the webhook pointed here you do not need it. |
| `POST /quotes/:id/approve` | | `{ quoteId, jobId, status }` for `quote_approve:<id>`. `422` for an old quote. |
| `POST /outbox/claim` | `{ limit? }` | Owner and Zukki messages to send, each claimed once: `id, waId, kind, body, payload, polished, businessShortName` |
| `POST /outbox/send` | `{ limit? }` | Sends what is queued now through the Cloud API: `{ sent, failed }`. `503 whatsapp_not_configured` without the WhatsApp settings. |
| `POST /whatsapp/send` | `{ to: waId, text }` | Test send: `{ waMessageId }`. Not stored in a conversation. WhatsApp delivers free text only within 24 hours of the customer's last message. |
| `POST /messages/:id/result` | `{ waMessageId }` or `{ waMessageId: null }` on failure | `{ id, status, waMessageId }` |
| `POST /delivery-status` | `{ waMessageId, status: delivered\|read\|failed }` | `{ updated }`. Receipts only move forward. |

### Typical inbound flow (if another service handles the webhook)

With `/webhooks/whatsapp` pointed at this API, every step happens here already (see "Zukki's answer").

1. Webhook arrives: answer 200 to Meta right away.
2. Media: `POST /conversations/resolve`, upload to the `media` bucket at `conversations/<conversationId>/<file>`, insert the `media` row, then `POST /inbound` with `mediaId`.
3. Otherwise `POST /inbound` (or `/location` for a location).
4. If `businessChatOpen`, the message is for the business (the owner app sees it in real time). Only the text "Zukki" goes to Zukki (payload 15).
5. Otherwise `POST /conversations/:id/assist` and send the result (payloads 01, 03, 04).
6. Location shared: `GET /matches`, send payload 07. "Connect me": `POST /connect`, send payload 08.
7. A loop drains `POST /outbox/claim`, sends each message, and reports `POST /messages/:id/result`; status webhooks go to `POST /delivery-status`.

## Configuration

`apps/api/.env` (see `.env.example`): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ZUKKI_SERVER_KEY` (32+ characters), `META_MODEL_API_KEY`. Without them `/v1` answers `503 not_configured` naming the missing variables.

WhatsApp (optional as a group; without it the webhook answers `503` and nothing is sent): `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN` (16+ characters, we choose it), `META_APP_SECRET`, optional `WHATSAPP_GRAPH_VERSION` (default `v23.0`). `WHATSAPP_BUSINESS_ACCOUNT_ID` is kept for reference; the code does not need it. Server: `PORT` (default 3000), `OUTBOX_POLL_MS`.

Facebook and Instagram posting (optional as a group; without it `/meta/connect-url`, the callback and `/publish` answer `503 not_configured`): `META_APP_ID`, `META_APP_SECRET`, `API_PUBLIC_URL` (the API's public https origin; the callback is `<API_PUBLIC_URL>/v1/meta/callback`), `OWNER_WEB_URL` (the owner web app's https origin), optional `META_GRAPH_VERSION` (default `v26.0`) and `META_LOGIN_CONFIG_ID` (a Facebook Login for Business configuration id, used instead of the scopes).

On a deployed server, set these in the host's environment settings instead of a file. Share the values through a password manager, never in chat or GitHub. A temporary access token from the API Setup page expires after about a day; use a System User token for anything longer.

## Not built yet

- Push notifications to the owner on a new request (Expo push from `push_tokens`).
- After "Zukki" in a business chat, only payload 15 is sent; the customer's next messages still go to the owner.
- Not yet tried against the real WhatsApp number or a real customer video (ffmpeg and SAM on the server).
