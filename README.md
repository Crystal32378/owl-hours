# Owl Hours (Zukki)

AI agent for small local-service businesses (plumbers first) that takes
urgent requests on WhatsApp, helps the customer stop the damage, and
prepares the job ticket and quote from the owner's own rules.
A person confirms every job.

Full context: [docs/HANDOFF.md](docs/HANDOFF.md).
How to run and demo it: [docs/USAGE.md](docs/USAGE.md).

Try it with no accounts or keys (Docker, Node 24, pnpm and ffmpeg):

```sh
pnpm install
bash scripts/local/judge.sh
```

UI handoff (current, Oct 27 decisions): [handoff-ui/HANDOFF-UI.md](handoff-ui/HANDOFF-UI.md) — WhatsApp payloads, Expo + Astryx owner app, demo path.

## Hackathon

See [the hackathon guide](docs/HACKATHON.md) for event requirements, deadlines,
resources, and a proposed team plan (not yet agreed).

## Layout

- `apps/api` — Hono server (WhatsApp webhook, `/v1` owner and internal API, see [docs/API.md](docs/API.md)) + worker
- `apps/owner` — Expo app for the owner/technician (Expo web for judges)
- `packages/shared` — job state machine, zod schemas, types
- `packages/meta-models` — Meta Model API clients (Spark, SAM, voice, image)
- `packages/whatsapp` — WhatsApp Cloud API sender
- `handoff-ui` — UI handoff: customer WhatsApp messages, owner app (Expo + Astryx), demo screens
- `supabase` — Postgres schema, row-level security, functions and seed ([docs/DATA-MODEL.md](docs/DATA-MODEL.md)); the `/v1` API reads and writes it

## Checks

```sh
npm test            # everything, in dependency order
npm run test:api     # api (+ its deps)
npm run test:owner   # owner app
npm run test:shared  # shared package
npm run test:db      # Supabase migrations + RLS tests (needs Docker)
npm run typecheck    # everything
npm run typecheck:owner
npm run build:owner  # owner Android export
npm run dev          # api + owner together
npm run dev:api      # api watcher only (listens on PORT, default 3000; reads apps/api/.env)
npm run dev:owner    # Expo web only
```
