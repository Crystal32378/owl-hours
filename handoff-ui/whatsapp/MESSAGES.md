# WhatsApp side: message catalog

The customer never installs anything: every customer "screen" is a WhatsApp conversation with Zukki's number, built only from message types the **WhatsApp Cloud API** can send.
- `packages/whatsapp/src/payloads/` has one builder function per message (01–15). POST its output to `/<API_VERSION>/<PHONE_NUMBER_ID>/messages`.
- `screens/` shows how each message looks on Android.

`{{…}}` are placeholders the orchestrator fills in. Every payload was checked against Meta's documented limits (character counts, button and row counts, header types).

## Rules

1. **Only these types:**
   - text (≤4096 chars, `*bold*`, `_italic_`);
   - image / video / audio;
   - **interactive reply buttons**: optional header (text ≤60, or image/video/document) + body ≤1024 + optional footer ≤60 + **1–3 buttons, ≤20 chars each**;
   - **interactive list**: text header ≤60, body ≤4096, footer ≤60, one button ≤20 that opens up to **10 rows** in up to 10 sections; section title ≤24, row title ≤24, row description ≤72;
   - **location request**: body ≤1024 + WhatsApp's own Send location button.
2. **What the API can't do, so the designs never show it:**
   - custom cards, tables or logos inside messages;
   - colored sender names;
   - system notices from the business;
   - a verified badge (the test number isn't Meta Verified).
3. **Sender line:** owner messages start with the business line in `*bold*`. A footer always means an interactive message with at least one button.
4. **Scope guard:** Zukki only finds and contacts local businesses. Anything else gets `14-off-topic`. This is required by WhatsApp's Jan 15, 2026 ban on general-purpose AI chatbots.
5. **24-hour window:** the customer always writes first, so free-form replies are allowed. Outside 24 h you'd need approved templates, which are out of scope.
6. **Webhooks:** answer `200` at once and process async. Use the typing indicator while the models run.

## Catalog (in conversation order)

| Payload | Sent when | Screen | Replies we handle |
|---|---|---|---|
| `disclosure()` | First message in any new conversation, before anything else | ZkWaStart, ZkWaRequest | — |
| `whatAreYouLookingFor()` | Customer wrote without a photo, video or a clear need | ZkWaStart, ZkWaStartList | list_reply.id = cat_* (cat_plumbing, cat_electrical, cat_locksmith, cat_food, cat_beauty, cat_auto, cat_pets, cat_other) |
| `typingIndicator()` | Right after a video or voice note arrives, while Muse Spark / SAM / Transcribe run (shows ≤25 s) | — | — |
| `safetyMarkedFrame()` | Urgent home problem detected and a frame shows the shut-off point | ZkWaRequest | button_reply.id = safety_done | safety_cant_find |
| `locationRequest()` | After the safety step (or right away when nothing is urgent) | ZkWaLocation | type = location (latitude, longitude; name/address only if the customer adds them) |
| `finding()` | Location received | ZkWaMatch | — |
| `suggestBusiness()` | Directory returned the best match (open now, in area, closest) | ZkWaMatch | button_reply.id = connect:<business_id> | another_option |
| `requestSent()` | Customer tapped Connect me (handoff offered) | ZkWaTimeout (top) | — |
| `nextBusiness()` | Offer expired or was declined | ZkWaTimeout | — |
| `accepted()` | Owner accepted in the app | ZkWaChatA/B | — |
| `ownerMessageAsWritten()` | Owner sent a message with polish off | ZkWaChatA | — |
| `ownerMessagePolished()` | Owner picked Zukki's version | ZkWaChatB, DmWaChatB | button_reply.id = reply_ok | reply_question (relayed to the owner's chat) |
| `quote()` | Owner sent the quote from the app | DmWaApprove | button_reply.id = quote_approve:<id> | quote_question:<id> |
| `offTopic()` | Customer asks something that isn't about finding or contacting a local business | — | — |
| `zukkiIsBack()` | Customer typed 'Zukki' during a business chat | — | — |

## Notes

- `typingIndicator()`: POST to /messages; marks the message read and shows 'typing…'
- `safetyMarkedFrame()`: The image is drawn by our code at SAM's box (circle, arrow, label) and served from a public URL
- `suggestBusiness()`: Demo values: Northside Plumbing · 4.9 (128) · 1.2 km · $45 · +$25 · from $60 · 40 min
- `requestSent()`: accept_minutes = 5 if urgent, 30 otherwise
- `nextBusiness()`: Followed by `suggestBusiness()` for the next match (footer: 'Your video and details go with the request')
- `ownerMessageAsWritten()`: Demo text: ok mario there 12:55, bringing the valve. 45 visit + 25 night, repair 60-90
- `ownerMessagePolished()`: Demo text: Hi Ana, Mario can be there at 12:55 AM and he's bringing a new fill valve. The visit is $45 plus a $25 night fee, and the repair should be $60–90. Footer must stay ≤60 chars: keep business_short_name short
- `quote()`: Demo values: Mario R. · 12:55–1:25 AM · $45 · +$25 · Fill valve repair $60–90 · $130–160
- `offTopic()`: Required by WhatsApp's ban on general-purpose AI chatbots (Jan 15, 2026)

## Routing replies (webhook → next step)

| Incoming | Next |
|---|---|
| text/image/video/audio, no open business chat | typing indicator → models → `04` if urgent and a shut-off point is visible, else `05` |
| text with no clear need | `01` (if new) → `02` |
| `list_reply cat_*` | ask for a photo/video or go to `05` |
| `button_reply safety_done` | `05` |
| `button_reply safety_cant_find` | text with simpler instructions (or "call emergency services" for gas/electric danger), then `05` |
| `location` | `06` → directory match → `07` |
| `button_reply connect:<id>` | `08` + create the handoff offer (5 min urgent / 30 min other) + push to the owner |
| `button_reply another_option` | `07` with the next match |
| offer expired or declined | `09` → `07` with the next match |
| owner accepts in the app | `10` |
| owner sends a message | `11` (polish off) or `12` (Zukki's version chosen) |
| owner sends a quote | `13` |
| `button_reply quote_approve:<id>` | job → `customer_approved`; reveal the exact address to the owner |
| `button_reply reply_ok/reply_question/quote_question:<id>` | relay to the owner's chat as the customer's message |
| text "Zukki" during a business chat | `15` (the business chat stays open) |
| anything off-topic | `14` |

## Screens

`screens/` has 2× PNGs:
- `00a` first contact with the list;
- `00b` the list open (drawn by WhatsApp, so it varies by version);
- `01` the safety reply;
- `01b` the location request;
- `02` the suggestion;
- `04` the next business;
- `06` / `08` owner messages A / B;
- `09` the quote.
