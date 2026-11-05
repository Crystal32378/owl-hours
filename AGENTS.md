# AGENTS.md

Instructions for coding agents working on this repo. Humans: the pitch and
team plan live in `docs/HACKATHON.md`.

## What this is

Zukki is an AI assistant on WhatsApp that finds an open, nearby local business
(any category) and connects the customer with it. Two surfaces:

- **Customer**: plain WhatsApp chat with Zukki's number (Cloud API only).
- **Owner**: `apps/owner`, an Expo native shell whose screens are Astryx
  components inside Expo DOM components.

`apps/api` is the Hono backend (webhook, orchestrator, worker).
`packages/shared` owns the job state machine and schemas.
`packages/whatsapp` owns the Cloud API sender.

## Sources of truth

| Concern | Read this | Notes |
|---|---|---|
| UI scope, rules, build order | `handoff-ui/HANDOFF-UI.md` | Current (Oct 27 decisions) |
| Customer messages | `handoff-ui/whatsapp/MESSAGES.md` + `packages/whatsapp/src/payloads/` | Only what the Cloud API can send; 15 builders, one per message |
| Owner screens | `apps/owner` + `handoff-ui/owner-app/HANDOFF-RN-UI.md` | Every screen is live, so its HTML/PNG pair is retired; Astryx is truth for control look |
| Demo path | `handoff-ui/demo/` | 10 screens, build and rehearse first |
| Mascot | `apps/owner/assets/mascots/zukki/` | Canonical pack; `handoff-ui/` carries no mascot binaries |
| Demo numbers | `apps/owner/shared/data/mock.ts` | Keep identical everywhere (prices, ratings, countdown) |

`docs/HANDOFF.md` describes an older model and is not authoritative for UI work.
`design/` (root) holds the previous screen set; prefer `handoff-ui/`.

## App architecture (apps/owner)

Screaming structure: the tree names the business flows, not the framework.
`app/` holds thin Expo Router adapters (one import + one render per route).
Each business flow is one module under `features/` (`requests`, `chats`,
`jobs`, `content`, `business`), managed by four concerns:

- `components/` — what the user sees (DOM screens + native chrome).
- `copys/` — every visible string, typed; copy comes from the handoff design
  HTML, never invented in a component.
- `services/` — the only place that talks to APIs (`offersService.ts`:
  `getOffer`, `accept`, `decline`). Returns domain types from
  `shared/data/types`, never raw rows. Client singleton: `shared/infra/`.
- `hooks/` — state and data for screens. Consumes `services/` only, through
  injected dependencies (mock today, Supabase tomorrow).
- `lib/` — pure logic per feature (no React, no I/O); the unit-test surface.

Consumption rules: components never import services; routes never call
services (they wire the hook's result into the screen); hooks are the only
service consumers. Dependencies flow `app/` → `features/` → `shared/`;
nothing new enters `shared/` without two real callers. Expo DOM rules hold:
serializable props, top-level async callbacks only.

Work test-first: the coder writes the tests and shows them failing (RED),
the operator reviews and locks them, the coder implements to GREEN without
changing the locked tests, and the operator reviews each iteration.
Record every technical decision in `docs/DECISIONS.md`.

## Handoff retirement rule

`handoff-ui/` is scaffolding, not a second codebase. As the real UI lands,
delete the handoff artifact it replaces so there is never two of anything:

- A WhatsApp payload is live in `packages/whatsapp` → delete its
  `handoff-ui/whatsapp/payloads/*.json` (and its screen when nothing references it).
- An owner screen is live in `apps/owner` → delete its
  `handoff-ui/owner-app/design/{screens/*.png,html/*.html}` pair.
- The starter is fully absorbed into `apps/owner` → delete
  `handoff-ui/owner-app/starter/`.
- A demo step runs on real phones → delete its `handoff-ui/demo/{png,html}` piece.

Delete in the same PR that ships the replacement. A handoff file is either
still the truth (leave it byte-identical) or replaced (delete it); syncing
edits into handoff files creates the second source of truth this rule removes.

## Rules that must hold in code

- Human approves every job: no `customer_approved` without owner confirm +
  customer approval. Nothing is posted without owner approval.
- Off-topic messages get the `14` payload.
- Location privacy: approximate area only until the customer approves a visit.
- Tenant isolation: one business never sees another's data.
- Accept windows: 5 min urgent / 30 min otherwise, then the next business.
- Shared UI rules (`handoff-ui/HANDOFF-UI.md` §3): no AI slop, 48px buttons,
  body ≥ 16px, owl only at its listed moments.

## Checks and commits

```sh
npm test
npm run typecheck
```

Run both before reporting done. Commits follow Conventional Commits, with no
`Co-Authored-By` and no AI attribution lines. Push, PR creation and merge are
the human's decision unless asked.
