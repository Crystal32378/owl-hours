# Handoff: Zukki complete UI

Everything needed to build both sides of Zukki's UI. Hand this folder to the coding agents; each part has its own detailed brief.

| Surface | Who | Built with | Brief |
|---|---|---|---|
| **Zukki on WhatsApp** | Customers | WhatsApp Cloud API messages (no app) | `whatsapp/MESSAGES.md` + the builders in `packages/whatsapp/src/payloads/` |
| **Zukki for Business** | Business owners | Expo (SDK 58) native shell + **Astryx** components in Expo DOM components | `owner-app/HANDOFF-RN-UI.md` |

Product context, rules and architecture are in `docs/`: `01-PRODUCT.md`, `02-HANDOFF.md`, `03-ARCHITECTURE.md`. The decisions from Oct 27 are in `01-PRODUCT.md`, under "Decisions".

---

## 1. The product in one paragraph

Zukki is an AI assistant on WhatsApp that finds a local business that is open and nearby, in any category, and connects you with it.
- The customer sends a video, a voice note or a text.
- For urgent home problems, Zukki first helps stop the damage, marking the shut-off valve on a frame of the customer's own video.
- It asks for the location and suggests **one** business (no bidding).
- The owner gets a push and accepts in the Zukki for Business app: **5 minutes if urgent, 30 otherwise**. If they don't, Zukki offers the next business.
- The conversation continues **in the same WhatsApp chat**: the owner writes from the app, as written or polished by Zukki (the owner picks), and sends a quote the customer approves in WhatsApp.
- Later, Zukki drafts posts from the job, and the owner approves them for the Facebook Page and Instagram professional account.

---

## 2. End to end: which surface does what

| # | Customer (WhatsApp) | Owner (app) | Payload / screen |
|---|---|---|---|
| 1 | Sends video + voice note | — | typing indicator `03`, then disclosure `01` |
| 2 | Gets the marked valve, taps **Done, no cables** | — | `04-safety-marked-frame` |
| 3 | Gets a location request, taps **Send location** | — | `05-location-request` |
| 4 | Gets **one** suggested business, taps **Connect me** | — | `06`, `07-suggest-business` |
| 5 | "Request sent, up to 5 min" | Push notification → request detail → **Accept and chat** | `08`; `OwNotification`, `OwRequest` |
| 6 | "Northside accepted…" | Chat opens | `10`; `OwChat` |
| 7 | Gets the owner's message | Writes; with polish on, picks **Send Zukki's** | `11` or `12`; `OwChatPolish` |
| 8 | Gets the quote, taps **Approve visit** | Sends the quote Zukki filled from their prices | `13`; `OwQuote` |
| 9 | — | Job: Start trip → Finish → Mark as done | `OwJob`, `OwJobDone` |
| 10 | — | Next morning: reviews and approves a post | `OwContent`, `OwPostReview` |

Alternative and edge paths:
- the customer writes "Hi" without media → `02` list;
- no answer in time → `09` + the next `07`;
- "Show another option" → the next `07`;
- typing "Zukki" mid-chat → `15`;
- anything off-topic → `14`.

**The demo path** (`demo/`, 10 screens, about 2:30) is steps 1–8 plus step 10. Build and rehearse it first.

---

## 3. Shared rules (both surfaces)

1. **The customer side shows only what the WhatsApp Cloud API can send.** No custom cards, tables, colored names, system notices or verified badge (`whatsapp/MESSAGES.md`, Rules).
2. **The owner app uses Astryx components** with the Neutral theme plus Zukki's overrides: accent `#0074e2`, controls of 48/44px, light scheme only.
3. **No "AI slop":**
   - no pastel chips (never Badge's color variants);
   - no colored or tinted cards and no colored side stripes;
   - no `Banner` status boxes;
   - no gradients or emoji in UI copy.
4. **Users are 25–50 years old:**
   - body text ≥ 16px;
   - buttons 48px tall, hit areas ≥ 44px;
   - one primary action per screen;
   - works at 130% font size.
5. **The owl (Zukki's mascot)** appears only at the moments listed in `owner-app/HANDOFF-RN-UI.md` §6:
   - always scaled uniformly from its 192×208 cell;
   - the static frame when reduced motion is on.
6. **The human stays in control:**
   - the owner accepts every request and chooses every message;
   - nothing is booked until the customer approves;
   - nothing is posted until the owner approves.
7. **Privacy and tenancy:**
   - the business sees only an approximate area until the customer approves a visit;
   - one business never sees another's customers, chats or drafts;
   - Test Zukki answers only from the signed-in business's data.
8. **Demo numbers** (identical everywhere): Ana L., Northside Plumbing (4.9, 128 reviews, 1.2 km), visit $45, night fee +$25, repair $60–90, total $130–160, arrival 12:55–1:25 AM, countdown 4:32. They're all in `apps/owner/shared/data/mock.ts` and the payload builders.

---

## 4. Folder map

```
HANDOFF-UI.md                this file
whatsapp/
  MESSAGES.md                rules, catalog in order, reply routing
  screens/                   9 customer screens (2×)
owner-app/
  HANDOFF-RN-UI.md           stack, architecture, Astryx mapping, navigation, every screen and state
  design/                    27 owner screens: overview, 2× PNG, HTML (source of truth for copy and layout)
  starter/                   verified Expo + Astryx files, Owl component, types.ts, mock.ts, native-tokens.ts
  assets/                    owl animations, app icon, logos, illustrations
  tokens.json
demo/
  png/, html/                the 10-screen demo, also as a click-through (open html/index.html)
  extras/                    optional screens (timeout, list)
docs/
  01-PRODUCT.md, 02-HANDOFF.md, 03-ARCHITECTURE.md
```

---

## 5. Build order

1. **Day 1:**
   - Contracts: Supabase schema with `tenant_id` and RLS, handoff and job states, and the payload IDs in `_index.json`.
   - Owner app shell: Expo, `expo-router`, tabs, and the starter `RequestScreen` running on a phone.
   - Measure the DOM screen startup and the chat keyboard.
2. **Days 2–4:**
   - WhatsApp webhook → orchestrator → payloads `01`–`10`, with the models mocked at first.
   - Owner P0 screens: requests, request detail, chat with polish, quote, post review, business.
3. **Days 5–6:** the demo path end to end on real phones (test number + Expo app), then the real models.
4. **Days 7–9:** P1 screens, timeout and next business, Test Zukki, polish. Record a backup video of the demo.

---

## 6. Done when

- [ ] The demo path runs on a real Android phone and an iPhone, WhatsApp + app, with no dead ends.
- [ ] Every customer message is one of the 15 payloads (or a media message) and passes the documented limits.
- [x] Every owner screen exists in `apps/owner`, matched its HTML for copy and layout, built with Astryx components (the HTML/PNG pairs are retired).
- [ ] The accept windows (5 min urgent / 30 min other) expire correctly, and the next business is offered.
- [ ] Option A and option B both work, and the customer sees the right sender line and footer.
- [ ] Off-topic questions get `14`; no general chat.
- [ ] None of the shared rules in §3 are broken.
